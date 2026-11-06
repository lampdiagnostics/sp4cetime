/**
 * QR codes (ISO/IEC 18004), our own small encoder (5 Nov 2026, for the e-card's back: a link to
 * the card's own tour). Byte mode, error correction level M (about 15% of a code can be damaged
 * and it still reads), versions 1–20 (up to 666 bytes), the mask chosen by the standard's penalty
 * rules. No dependency, like the PDF and MP4 writers. After Project Nayuki's reference design.
 */

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
export const QR_MAX_VERSION = 20;

/** Modules of a code: `true` is dark. `size` = 17 + 4 × version. */
export interface QrCode {
  readonly version: number;
  readonly size: number;
  readonly mask: number;
  readonly modules: readonly (readonly boolean[])[];
}

/** Data modules (all but the fixed patterns) in a version. */
export function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

/** Data codewords (bytes) a version holds at level M. */
export const dataCodewords = (ver: number): number => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!;

/** Centres of the alignment patterns along each axis. */
export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// --- Reed–Solomon over GF(2⁸), polynomial 0x11D ---
const gfMul = (x: number, y: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};
export function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j]!, root);
      if (j + 1 < r.length) r[j]! ^= r[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift()!;
    r.push(0);
    divisor.forEach((c, i) => (r[i]! ^= gfMul(c, f)));
  }
  return r;
}

/** The 15 format bits for level M and a mask (error-corrected, then masked with 0x5412). */
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
/** The 18 version bits (versions 7 and up). */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

const bit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0;

/** Encode bytes (or text, as UTF-8) as a QR code; throws if it needs more than version 20. */
export function qrEncode(input: string | Uint8Array): QrCode {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let ver = 1;
  const need = (v: number): number => 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
  while (ver <= QR_MAX_VERSION && need(ver) > dataCodewords(ver) * 8) ver++;
  if (ver > QR_MAX_VERSION) throw new Error(`Too long for a QR code here (${bytes.length} bytes)`);

  // The bit stream: mode 0100 (bytes), the count, the bytes, a terminator, then pad bytes.
  const bits: boolean[] = [];
  const put = (v: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) bits.push(bit(v, i));
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));

  // Split into blocks, add each block's error correction, interleave.
  const nBlocks = BLOCKS_M[ver]!, eccLen = ECC_PER_BLOCK_M[ver]!;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const nShort = nBlocks - (raw % nBlocks);
  const shortLen = Math.floor(raw / nBlocks);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= nShort) codewords.push(b[i]!);
    });

  // The fixed patterns.
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean): void => {
    m[y]![x] = dark;
    fixed[y]![x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (x: number, y: number): void => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const al = alignmentPositions(ver);
  al.forEach((a, i) =>
    al.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  const drawFormat = (mask: number): void => {
    const f = formatBits(mask);
    for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
    set(8, 7, bit(f, 6));
    set(8, 8, bit(f, 7));
    set(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserves the area
  if (ver >= 7) {
    const v = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit(v, i));
      set(b, a, bit(v, i));
    }
  }

  // The codewords, in the zigzag from the bottom right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fixed[y]![x] && i < codewords.length * 8) {
          m[y]![x] = bit(codewords[i >>> 3]!, 7 - (i & 7));
          i++;
        }
      }
  }

  // Try the eight masks; keep the one with the lowest penalty.
  const inv = (k: number, x: number, y: number): boolean =>
    [
      (x + y) % 2 === 0,
      y % 2 === 0,
      x % 3 === 0,
      (x + y) % 3 === 0,
      (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      ((x * y) % 2) + ((x * y) % 3) === 0,
      (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][k]!;
  const applyMask = (k: number): void => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y]![x] && inv(k, x, y)) m[y]![x] = !m[y]![x];
  };
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    applyMask(k);
    drawFormat(k);
    const s = penalty(m);
    if (s < bestScore) (best = k), (bestScore = s);
    applyMask(k); // undo (xor)
  }
  applyMask(best);
  drawFormat(best);
  return { version: ver, size, mask: best, modules: m };
}

/** The standard's four penalty rules (lower is easier to read). */
export function penalty(m: readonly (readonly boolean[])[]): number {
  const n = m.length;
  let s = 0, dark = 0;
  const runs = (get: (i: number) => boolean): void => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) s += 3 + (run - 5);
        run = 1;
      }
    }
    // Finder-like 1:1:3:1:1 with four light either side.
    for (let i = 0; i + 11 <= n; i++) {
      const p = [1, 0, 1, 1, 1, 0, 1].map((v, k) => get(i + 4 + k) === (v === 1));
      if (!p.every(Boolean)) continue;
      const before = [0, 1, 2, 3].every((k) => !get(i + k));
      const after = i + 15 <= n && [0, 1, 2, 3].every((k) => !get(i + 11 + k));
      if (before || after) s += 40;
    }
  };
  for (let y = 0; y < n; y++) runs((x) => m[y]![x]!);
  for (let x = 0; x < n; x++) runs((y) => m[y]![x]!);
  for (let y = 0; y + 1 < n; y++)
    for (let x = 0; x + 1 < n; x++) {
      const c = m[y]![x];
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) s += 3;
    }
  for (const row of m) for (const v of row) if (v) dark++;
  s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return s;
}

/** A code as an SVG (with the standard quiet zone of 4 modules), dark on light. */
export function qrSvg(q: QrCode, opts: { dark?: string; light?: string; quiet?: number } = {}): string {
  const quiet = opts.quiet ?? 4, w = q.size + quiet * 2;
  let d = '';
  q.modules.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="${opts.light ?? '#fff'}"/><path d="${d}" fill="${opts.dark ?? '#000'}"/></svg>`;
}
