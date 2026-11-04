import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HUBBLE_KM_S_MPC } from './constants';
import { ageNow, hubbleAt, redshift, scaleFactor, turnToAcceleration } from './cosmology';

const span = fc.double({ min: -4.6e9, max: 5e9, noNaN: true });

describe('The universe’s expansion skin', () => {
  it('is 1 now, expanding at H0 now, in both universes', () => {
    for (const c of ['lcdm', 'matter'] as const) {
      expect(scaleFactor(c, 0)).toBeCloseTo(1, 12);
      expect(hubbleAt(c, 0)).toBeCloseTo(HUBBLE_KM_S_MPC, 6);
      // ȧ/a by a finite difference agrees with H.
      const h = 1e6;
      const rate = (scaleFactor(c, h) - scaleFactor(c, -h)) / (2 * h);
      expect((rate * 977.79e9) / 1).toBeCloseTo(HUBBLE_KM_S_MPC, 2);
    }
  });

  it('gives the measured age (13.8 billion years) and the matter-only one (2/3 of a Hubble time, 9.7)', () => {
    expect(ageNow('lcdm') / 1e9).toBeCloseTo(13.8, 1);
    expect(ageNow('matter') / 1e9).toBeCloseTo(9.67, 1);
  });

  it('grows all the time across the calendar (−4.6 to +5 billion years), in both', () => {
    fc.assert(
      fc.property(span, span, (x, y) => {
        fc.pre(Math.abs(x - y) > 1e3);
        const [a, b] = x < y ? [x, y] : [y, x];
        for (const c of ['lcdm', 'matter'] as const) expect(scaleFactor(c, b)).toBeGreaterThan(scaleFactor(c, a));
      }),
    );
  });

  it('matches the plan: about 0.70 when the Sun formed and 1.38 in 5 billion years (ΛCDM)', () => {
    expect(scaleFactor('lcdm', -4.6e9)).toBeCloseTo(0.7, 1);
    expect(scaleFactor('lcdm', 5e9)).toBeCloseTo(1.38, 1);
  });

  it('turned from slowing to speeding up about 6 billion years ago (ΛCDM); matter only never does', () => {
    expect(turnToAcceleration() / 1e9).toBeGreaterThan(-7);
    expect(turnToAcceleration() / 1e9).toBeLessThan(-5);
    const accel = (c: 'lcdm' | 'matter', t: number): number => scaleFactor(c, t + 1e8) - 2 * scaleFactor(c, t) + scaleFactor(c, t - 1e8);
    expect(accel('lcdm', -9e9)).toBeLessThan(0);
    expect(accel('lcdm', 0)).toBeGreaterThan(0);
    for (const t of [-4e9, 0, 4e9]) expect(accel('matter', t)).toBeLessThan(0);
  });

  it('reddens light by the stretch it went through: 1 + z = a(received)/a(emitted)', () => {
    fc.assert(
      fc.property(span, span, (e, r) => {
        fc.pre(r > e);
        const z = redshift('lcdm', e, r);
        expect(1 + z).toBeCloseTo(scaleFactor('lcdm', r) / scaleFactor('lcdm', e), 9);
        expect(z).toBeGreaterThan(-1e-12);
      }),
    );
    // Light from 25 million light years away is stretched by about 0.2%.
    expect(redshift('lcdm', -25e6, 0)).toBeCloseTo(0.0017, 3);
  });
});
