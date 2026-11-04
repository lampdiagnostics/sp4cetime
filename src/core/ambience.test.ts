import { describe, expect, it } from 'vitest';
import { NOISE_RMS, noiseLoop } from './ambience';

describe('The white-noise bed', () => {
  const s = noiseLoop(48_000, 8);
  const rms = (a: Float32Array, from = 0, to = a.length): number => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i]! ** 2;
    return Math.sqrt(e / (to - from));
  };

  it('is a stereo loop of the length asked, quiet and never clipping', () => {
    expect(s.left).toHaveLength(8 * 48_000);
    expect(s.right).toHaveLength(8 * 48_000);
    for (const ch of [s.left, s.right]) {
      expect(rms(ch)).toBeCloseTo(NOISE_RMS, 3);
      for (const x of ch) expect(Math.abs(x)).toBeLessThan(0.06);
    }
  });

  it('is even all the way through, with no gaps', () => {
    for (let k = 0; k < 8; k++) expect(rms(s.left, k * 48_000, (k + 1) * 48_000)).toBeGreaterThan(NOISE_RMS * 0.9);
  });

  it('is white: neighbouring samples unrelated, left and right independent', () => {
    let lag = 0, lr = 0;
    for (let i = 1; i < s.left.length; i++) {
      lag += s.left[i]! * s.left[i - 1]!;
      lr += s.left[i]! * s.right[i]!;
    }
    const e = rms(s.left) ** 2 * s.left.length;
    expect(Math.abs(lag / e)).toBeLessThan(0.01);
    expect(Math.abs(lr / e)).toBeLessThan(0.01);
  });

  it('is the same every time (made from numbers, not recordings)', () => {
    expect(noiseLoop(48_000, 8).left[12345]).toBe(s.left[12345]);
  });
});
