import { describe, expect, it } from 'vitest';
import { GifEncoder, medianCut } from './gif';

/** A minimal GIF decoder (global or local palettes, full frames), to check the encoder round-trips. */
function decode(bytes: Uint8Array): { w: number; h: number; pal: Uint8Array; frames: Uint8Array[]; delays: number[]; pals: Uint8Array[] } {
  let p = 0;
  const u8 = (): number => bytes[p++]!;
  const u16 = (): number => u8() | (u8() << 8);
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
  p = 6;
  const w = u16(), h = u16();
  const flags = u8();
  p += 2;
  const pal = bytes.slice(p, p + 3 * (1 << ((flags & 7) + 1)));
  p += pal.length;
  const frames: Uint8Array[] = [];
  const delays: number[] = [];
  const pals: Uint8Array[] = [];
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8();
        u8();
        delays.push(u16());
        u8();
        u8();
      } else {
        for (let n = u8(); n > 0; n = u8()) p += n;
      }
      continue;
    }
    expect(b).toBe(0x2c);
    p += 8;
    const lf = u8();
    if (lf & 0x80) {
      const n = 3 * (1 << ((lf & 7) + 1));
      pals.push(bytes.slice(p, p + n));
      p += n;
    } else pals.push(pal);
    const min = u8();
    const data: number[] = [];
    for (let n = u8(); n > 0; n = u8()) for (let i = 0; i < n; i++) data.push(u8());
    // LZW decode.
    const clear = 1 << min, eoi = clear + 1;
    let size = min + 1;
    let dict: number[][] = [];
    const reset = (): void => {
      dict = [];
      for (let i = 0; i < clear; i++) dict.push([i]);
      dict.push([], []);
      size = min + 1;
    };
    reset();
    const out: number[] = [];
    let bitPos = 0;
    const read = (): number => {
      let v = 0;
      for (let i = 0; i < size; i++, bitPos++) v |= ((data[bitPos >> 3]! >> (bitPos & 7)) & 1) << i;
      return v;
    };
    let prev: number[] | null = null;
    for (;;) {
      const c = read();
      if (c === clear) {
        reset();
        prev = null;
        continue;
      }
      if (c === eoi) break;
      let entry: number[];
      if (c < dict.length) entry = dict[c]!;
      else entry = [...prev!, prev![0]!];
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0]!]);
      prev = entry;
      if (dict.length === 1 << size && size < 12) size++;
    }
    frames.push(Uint8Array.from(out));
  }
  return { w, h, pal, frames, delays, pals };
}

describe('GIF encoder', () => {
  it('round-trips frames through LZW, including long runs and table resets', () => {
    const w = 120, h = 90;
    const frame = (seed: number): Uint8ClampedArray => {
      const a = new Uint8ClampedArray(w * h * 4);
      let s = seed;
      for (let i = 0; i < w * h; i++) {
        // Noisy colours (many table entries) in one half, flat in the other.
        s = (s * 1103515245 + 12345) >>> 0;
        const noisy = i % w < w / 2;
        a[i * 4] = noisy ? s & 255 : 10;
        a[i * 4 + 1] = noisy ? (s >> 8) & 255 : 20;
        a[i * 4 + 2] = noisy ? (s >> 16) & 255 : 40;
        a[i * 4 + 3] = 255;
      }
      return a;
    };
    const enc = new GifEncoder(w, h, 7);
    const f0 = frame(1), f1 = frame(2);
    enc.add(f0);
    enc.add(f1);
    return enc
      .finish()
      .arrayBuffer()
      .then((buf) => {
        const g = decode(new Uint8Array(buf));
        expect(g.w).toBe(w);
        expect(g.h).toBe(h);
        expect(g.frames).toHaveLength(2);
        expect(g.delays).toEqual([7, 7]);
        for (const [k, f] of [f0, f1].entries()) {
          const idx = g.frames[k]!;
          expect(idx.length).toBe(w * h);
          // Every pixel decodes to a palette colour near the original.
          let err = 0;
          for (let i = 0; i < w * h; i++) {
            const c = idx[i]!;
            err += Math.abs(g.pal[c * 3]! - f[i * 4]!) + Math.abs(g.pal[c * 3 + 1]! - f[i * 4 + 1]!) + Math.abs(g.pal[c * 3 + 2]! - f[i * 4 + 2]!);
          }
          expect(err / (w * h)).toBeLessThan(60);
          // The flat half is (nearly) exact.
          const flat = idx[w - 1]!;
          expect(Math.abs(g.pal[flat * 3]! - 10) + Math.abs(g.pal[flat * 3 + 1]! - 20) + Math.abs(g.pal[flat * 3 + 2]! - 40)).toBeLessThan(12);
        }
      });
  });

  it('keeps each frame on screen as long as asked, and gives a new picture its own palette', () => {
    const w = 64, h = 32;
    const solid = (r: number, g: number, b: number): Uint8ClampedArray => {
      const a = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) a.set([r, g, b, 255], i * 4);
      return a;
    };
    const enc = new GifEncoder(w, h, 5);
    enc.add(solid(10, 10, 30), 4);
    enc.add(solid(12, 10, 30), 7);
    // A completely different picture (a new view): the first palette fits it badly.
    enc.add(solid(240, 200, 20), 6);
    enc.add(solid(238, 200, 22));
    return enc
      .finish()
      .arrayBuffer()
      .then((buf) => {
        const g = decode(new Uint8Array(buf));
        expect(g.delays).toEqual([4, 7, 6, 5]);
        expect(g.pals[0]).toBe(g.pal);
        expect(g.pals[1]).toBe(g.pal);
        expect(g.pals[2]).not.toBe(g.pal);
        for (const [k, want] of [[0, [10, 10, 30]], [2, [240, 200, 20]], [3, [238, 200, 22]]] as const) {
          const c = g.frames[k]![0]!;
          const pal = g.pals[k]!;
          expect(Math.abs(pal[c * 3]! - want[0]) + Math.abs(pal[c * 3 + 1]! - want[1]) + Math.abs(pal[c * 3 + 2]! - want[2])).toBeLessThan(12);
        }
      });
  });

  it('chooses up to 256 colours, including rare bright ones', () => {
    const a = new Uint8ClampedArray(1000 * 4);
    for (let i = 0; i < 1000; i++) a[i * 4 + 3] = 255;
    a.set([255, 240, 200, 255], 500 * 4);
    const pal = medianCut(a);
    expect(pal.length).toBe(768);
  });
});
