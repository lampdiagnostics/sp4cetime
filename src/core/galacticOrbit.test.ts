import { describe, expect, it } from 'vitest';
import { KM_PER_PARSEC } from './constants';
import { GUIDING_RADIUS_KM, ORBIT_PERIOD_YEARS, RADIAL_AMPLITUDE_KM, RADIAL_PERIOD_YEARS, sunOrbitAt } from './galacticOrbit';

const kpc = (km: number): number => km / (KM_PER_PARSEC * 1000);

describe('The Sun’s galactic orbit: a rosette, not a circle', () => {
  it('is where the Sun is now, moving 11.1 km/s inward and ~242 km/s around', () => {
    const o = sunOrbitAt(0);
    expect(kpc(o.r)).toBeCloseTo(8.178, 6);
    expect(o.phi).toBe(0);
    const dt = 1e9; // s
    const a = sunOrbitAt(-dt), b = sunOrbitAt(dt);
    expect((b.r - a.r) / (2 * dt)).toBeCloseTo(-11.1, 1);
    // 230 + 12.24 km/s around; the epicycle approximation is first order, so within ~2 km/s.
    expect(Math.abs((o.r * (b.phi - a.phi)) / (2 * dt) - 242.24)).toBeLessThan(2.5);
  });

  it('swings between about 8.1 and 9.1 kpc around a guiding centre at 8.6 kpc', () => {
    expect(kpc(GUIDING_RADIUS_KM)).toBeCloseTo(8.61, 2);
    expect(kpc(RADIAL_AMPLITUDE_KM)).toBeCloseTo(0.52, 1);
    let lo = Infinity, hi = -Infinity;
    for (let y = -5e8; y <= 5e8; y += 1e6) {
      const r = kpc(sunOrbitAt(y * 3.15576e7).r);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(lo).toBeGreaterThan(8.0);
    expect(lo).toBeLessThan(8.178);
    expect(hi).toBeGreaterThan(9.0);
    expect(hi).toBeLessThan(9.3);
  });

  it('goes round in ~230 Myr and in and out in ~163 Myr, so the loops never close', () => {
    expect(ORBIT_PERIOD_YEARS / 1e6).toBeCloseTo(230, -1);
    expect(RADIAL_PERIOD_YEARS / 1e6).toBeCloseTo(163, -1);
    expect(ORBIT_PERIOD_YEARS / RADIAL_PERIOD_YEARS).toBeCloseTo(Math.SQRT2, 6);
  });
});
