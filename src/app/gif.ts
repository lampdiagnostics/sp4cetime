/**
 * A small animated-GIF encoder (no dependency): one palette of up to 256 colours chosen by
 * median cut from the first frame, every frame mapped to its nearest colours, LZW-coded,
 * looping forever. Frames are encoded as they are added, so only the compressed bytes are kept.
 */

class Bytes {
  private buf = new Uint8Array(1 << 16);
  length = 0;
  private grow(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.length + n) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.length));
    this.buf = b;
  }
  byte(b: number): void {
    this.grow(1);
    this.buf[this.length++] = b & 255;
  }
  word(w: number): void {
    this.byte(w);
    this.byte(w >> 8);
  }
  text(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  bytes(a: ArrayLike<number>, from = 0, to = a.length): void {
    this.grow(to - from);
    for (let i = from; i < to; i++) this.buf[this.length++] = (a[i] as number) & 255;
  }
  result(): Uint8Array<ArrayBuffer> {
    return this.buf.slice(0, this.length);
  }
}

/** Up to 256 colours for these pixels (RGBA), by median cut on a sample of them. */
export function medianCut(rgba: Uint8ClampedArray, colours = 256): Uint8Array {
  const n = rgba.length / 4;
  const step = Math.max(1, Math.floor(n / 40_000));
  const px: number[] = [];
  for (let i = 0; i < n; i += step) px.push((rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]!);
  type Box = { items: number[]; ch: number; range: number };
  const measure = (items: number[]): Box => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const c of items) {
      for (let k = 0; k < 3; k++) {
        const v = (c >> (16 - 8 * k)) & 255;
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
    }
    const r = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
    const ch = r[0]! >= r[1]! && r[0]! >= r[2]! ? 0 : r[1]! >= r[2]! ? 1 : 2;
    return { items, ch, range: r[ch]! };
  };
  const boxes: Box[] = [measure(px)];
  while (boxes.length < colours) {
    let best = -1, score = 0;
    boxes.forEach((b, i) => {
      const s = b.range * Math.sqrt(b.items.length);
      if (b.items.length > 1 && b.range > 0 && s > score) (score = s), (best = i);
    });
    if (best < 0) break;
    const b = boxes[best]!;
    const sh = 16 - 8 * b.ch;
    b.items.sort((x, y) => ((x >> sh) & 255) - ((y >> sh) & 255));
    const mid = b.items.length >> 1;
    boxes.splice(best, 1, measure(b.items.slice(0, mid)), measure(b.items.slice(mid)));
  }
  const pal = new Uint8Array(colours * 3);
  boxes.forEach((b, i) => {
    let r = 0, g = 0, bl = 0;
    for (const c of b.items) (r += (c >> 16) & 255), (g += (c >> 8) & 255), (bl += c & 255);
    const m = Math.max(1, b.items.length);
    pal[i * 3] = Math.round(r / m);
    pal[i * 3 + 1] = Math.round(g / m);
    pal[i * 3 + 2] = Math.round(bl / m);
  });
  return pal;
}

/** A palette fitting worse than this (mean squared colour error) is made again for the frame. */
const REPALETTE = 180;

const stamp = new Int32Array(4096 * 256);
const code = new Uint16Array(4096 * 256);
let lzwGen = 0;

/** GIF LZW of palette indices (8-bit codes), written as sub-blocks. */
function lzw(indices: Uint8Array, out: Bytes): void {
  const MIN = 8;
  const clear = 1 << MIN, eoi = clear + 1;
  let size = MIN + 1, next = eoi + 1;
  // The code table (shared by every frame): key = prefix * 256 + k; an entry is valid while its stamp is the current generation.
  let gen = ++lzwGen;
  const block = new Uint8Array(255);
  let blen = 0;
  let acc = 0, bits = 0;
  out.byte(MIN);
  const flushByte = (b: number): void => {
    block[blen++] = b;
    if (blen === 255) {
      out.byte(255);
      out.bytes(block, 0, 255);
      blen = 0;
    }
  };
  const emit = (c: number): void => {
    acc |= c << bits;
    bits += size;
    while (bits >= 8) {
      flushByte(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let cur = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = cur * 256 + k;
    if (stamp[key] === gen) {
      cur = code[key]!;
      continue;
    }
    emit(cur);
    if (next === 4096) {
      emit(clear);
      next = eoi + 1;
      size = MIN + 1;
      gen = ++lzwGen;
    } else {
      if (next >= 1 << size) size++;
      stamp[key] = gen;
      code[key] = next++;
    }
    cur = k;
  }
  emit(cur);
  emit(eoi);
  if (bits > 0) flushByte(acc & 255);
  if (blen > 0) {
    out.byte(blen);
    out.bytes(block, 0, blen);
  }
  out.byte(0);
}

export class GifEncoder {
  private out = new Bytes();
  private pal: Uint8Array | null = null;
  /** The first frame's palette, written as the file's global colour table. */
  private globalPal: Uint8Array | null = null;
  private cache = new Int16Array(1 << 15).fill(-1);
  private indices: Uint8Array;
  frames = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    /** Time per frame, hundredths of a second. */
    readonly delayCs: number,
  ) {
    this.indices = new Uint8Array(width * height);
  }

  private nearest(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = this.cache[key]!;
    if (c >= 0) return c;
    const pal = this.pal as Uint8Array;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 256; i++) {
      const dr = pal[i * 3]! - r, dg = pal[i * 3 + 1]! - g, db = pal[i * 3 + 2]! - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bd) (bd = d), (best = i);
    }
    this.cache[key] = best;
    return best;
  }

  /** How badly the palette fits these pixels: mean squared error of a sample of them. */
  private misfit(rgba: Uint8ClampedArray): number {
    const n = rgba.length / 4;
    const step = Math.max(1, Math.floor(n / 4000));
    let e = 0, m = 0;
    const pal = this.pal as Uint8Array;
    for (let i = 0; i < n; i += step) {
      const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!;
      const k = this.nearest(r, g, b);
      const dr = pal[k * 3]! - r, dg = pal[k * 3 + 1]! - g, db = pal[k * 3 + 2]! - b;
      e += dr * dr + dg * dg + db * db;
      m++;
    }
    return e / Math.max(1, m);
  }

  /**
   * Add a frame (RGBA, width × height), shown for `delayCs` hundredths of a second (the
   * encoder's own delay if not given). The first frame sets the palette; when the picture
   * has changed so much that its colours fit badly (a new view, a new look), the frame
   * gets a palette of its own, which the frames after it share.
   */
  add(rgba: Uint8ClampedArray, delayCs = this.delayCs): void {
    const o = this.out;
    if (this.pal && this.misfit(rgba) > REPALETTE) {
      this.pal = medianCut(rgba);
      this.cache.fill(-1);
    }
    if (!this.pal) {
      this.pal = medianCut(rgba);
      this.globalPal = this.pal;
      o.text('GIF89a');
      o.word(this.width);
      o.word(this.height);
      o.byte(0xf7); // global colour table, 8 bits, 256 colours
      o.byte(0);
      o.byte(0);
      o.bytes(this.pal);
      // Loop forever.
      o.bytes([0x21, 0xff, 11]);
      o.text('NETSCAPE2.0');
      o.bytes([3, 1, 0, 0, 0]);
    }
    const idx = this.indices;
    for (let i = 0, n = idx.length; i < n; i++) idx[i] = this.nearest(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
    o.bytes([0x21, 0xf9, 4, 0]);
    o.word(Math.max(2, Math.min(65535, Math.round(delayCs))));
    o.bytes([0, 0]);
    o.byte(0x2c);
    o.word(0);
    o.word(0);
    o.word(this.width);
    o.word(this.height);
    if (this.pal !== this.globalPal) {
      // A local colour table of 256 colours (this frame's palette is not the first one).
      o.byte(0x87);
      o.bytes(this.pal as Uint8Array);
    } else o.byte(0);
    lzw(idx, o);
    this.frames++;
  }

  finish(): Blob {
    this.out.byte(0x3b);
    return new Blob([this.out.result() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
  }
}
