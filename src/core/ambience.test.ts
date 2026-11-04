import { describe, expect, it } from 'vitest';
import { fieldSound, fitPeriod } from './ambience';

describe('The field at night', () => {
  const s = fieldSound(48_000, 16);
  const rms = (a: Float32Array, from = 0, to = a.length): number => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i]! ** 2;
    return Math.sqrt(e / (to - from));
  };

  it('is a stereo loop of the length asked, never clipping', () => {
    expect(s.left).toHaveLength(16 * 48_000);
    expect(s.right).toHaveLength(16 * 48_000);
    let peak = 0;
    for (const ch of [s.left, s.right]) for (const x of ch) peak = Math.max(peak, Math.abs(x));
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(0.5);
    expect(peak).toBeGreaterThan(0.02);
  });

  it('is heard all the way through (crickets and traffic, no gaps of silence)', () => {
    for (let k = 0; k < 16; k++) expect(rms(s.left, k * 48_000, (k + 1) * 48_000)).toBeGreaterThan(0.003);
  });

  it('repeats without a seam: the end runs into the start as smoothly as anywhere else', () => {
    const n = s.left.length;
    let worst = 0;
    for (let i = 1; i < n; i++) worst = Math.max(worst, Math.abs(s.left[i]! - s.left[i - 1]!));
    expect(Math.abs(s.left[0]! - s.left[n - 1]!)).toBeLessThanOrEqual(worst);
  });

  it('is the same every time (made from numbers, not recordings)', () => {
    const again = fieldSound(48_000, 16);
    expect(again.left[12345]).toBe(s.left[12345]);
  });

  it('fits every rhythm a whole number of times into the loop', () => {
    for (const p of [0.42, 0.55, 0.62, 0.71, 0.83]) {
      const q = fitPeriod(p, 16);
      expect(Math.abs(16 / q - Math.round(16 / q))).toBeLessThan(1e-9);
      expect(Math.abs(q - p) / p).toBeLessThan(0.05);
    }
  });
});
