import { describe, expect, it } from 'vitest';
import { KM_PER_PARSEC } from './constants';
import { bobKm, bobKmAt, SUN_PATH_TILT, SUN_Z_AMPLITUDE_KM, sunHeightKm } from './bob';
import { addSeconds, fromCivil, SECONDS_PER_YEAR } from './time';

const now = fromCivil(2026, 10, 31);
const pc = (km: number): number => km / KM_PER_PARSEC;
const yr = SECONDS_PER_YEAR;

describe('The Sun bobbing through the galactic disc', () => {
  it('is about 20.8 pc above the midplane now, rising at 7.25 km/s', () => {
    expect(pc(sunHeightKm(now))).toBeCloseTo(20.8, 1);
    const dt = 1000 * yr;
    const v = (sunHeightKm(addSeconds(now, dt)) - sunHeightKm(addSeconds(now, -dt))) / (2 * dt);
    expect(v).toBeCloseTo(7.25, 2);
  });

  it('swings about ±102 pc with an 85 Myr period: crossed going up ~2.8 Myr ago, highest in ~18 Myr', () => {
    expect(pc(SUN_Z_AMPLITUDE_KM)).toBeGreaterThan(95);
    expect(pc(SUN_Z_AMPLITUDE_KM)).toBeLessThan(110);
    expect(Math.abs(pc(sunHeightKm(addSeconds(now, -2.8e6 * yr))))).toBeLessThan(1.5);
    expect(pc(sunHeightKm(addSeconds(now, 18.5e6 * yr)))).toBeCloseTo(pc(SUN_Z_AMPLITUDE_KM), 0);
    expect(sunHeightKm(addSeconds(now, 85e6 * yr)) / sunHeightKm(now)).toBeCloseTo(1, 6);
  });

  it('measures the bob from now, both ways agreeing', () => {
    const s = 3e6 * yr;
    expect(bobKm(now, now)).toBe(0);
    expect(bobKmAt(now, s) / bobKm(addSeconds(now, s), now)).toBeCloseTo(1, 9);
    expect((SUN_PATH_TILT * 180) / Math.PI).toBeCloseTo(1.8, 1);
  });
});
