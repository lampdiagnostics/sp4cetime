import * as Astronomy from 'astronomy-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { barycentreKm, barycentreSmooth, sunWobble } from './barycentre';
import { BODIES } from './bodies';
import { KM_PER_AU, type Vec3 } from './geometry';
import { addSeconds, fromCivil, fromYearsApprox } from './time';

const SUN_R = BODIES[0]!.radiusKm;
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
/** astronomy-engine's barycentre relative to the Sun, ecliptic km. */
function engine(year: number): Vec3 {
  const t = fromCivil(year, 1, 1, 0);
  const v = Astronomy.RotateVector(EQJ_TO_ECL, Astronomy.HelioVector(Astronomy.Body.SSB, new Astronomy.AstroTime(t.day - 0.5)));
  return [v.x * KM_PER_AU, v.y * KM_PER_AU, v.z * KM_PER_AU];
}

describe('the barycentre', () => {
  it('matches astronomy-engine to within 1% of the Sun’s radius, 1800–2050', () => {
    for (let year = 1800; year <= 2050; year += 3) {
      const a = barycentreKm(fromCivil(year, 1, 1, 0));
      const b = engine(year);
      expect(len([a[0] - b[0], a[1] - b[1], a[2] - b[2]])).toBeLessThan(0.01 * SUN_R);
    }
  });

  it('swings between almost nothing and about 2.2 solar radii', () => {
    let lo = Infinity, hi = 0;
    for (let year = 1900; year <= 2100; year += 0.25) {
      const r = len(barycentreKm(fromYearsApprox(year - 2000)));
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(lo).toBeLessThan(0.2 * SUN_R);
    expect(hi).toBeGreaterThan(2.0 * SUN_R);
    expect(hi).toBeLessThan(2.3 * SUN_R);
  });

  it('stays within 2.4 solar radii of the Sun across the whole ±5 Gyr', () => {
    fc.assert(
      fc.property(fc.double({ min: -4.6e9, max: 5e9, noNaN: true }), (y) => {
        const r = len(barycentreKm(fromYearsApprox(y)));
        return Number.isFinite(r) && r < 2.4 * SUN_R;
      }),
    );
  });

  it('read from its table, is within 1,000 km of the exact model', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (y) => {
        const t = fromYearsApprox(y);
        const a = barycentreSmooth(t), b = barycentreKm(t);
        return len([a[0] - b[0], a[1] - b[1], a[2] - b[2]]) < 1_000;
      }),
    );
  });

  it('leaves the Sun now where it is, and moves it about a solar radius over half of Jupiter’s year', () => {
    const now = fromCivil(2026, 11, 4, 0);
    expect(len(sunWobble(now, 0))).toBe(0);
    let hi = 0;
    for (let k = 1; k <= 24; k++) hi = Math.max(hi, len(sunWobble(now, k * 0.25 * 365.25 * 86_400)));
    expect(hi).toBeGreaterThan(0.8 * SUN_R);
    // The wobble is the barycentre now less the barycentre then.
    const s = 3.3e8;
    const w = sunWobble(now, s), b0 = barycentreSmooth(now), b1 = barycentreSmooth(addSeconds(now, s));
    expect(len([w[0] - (b0[0] - b1[0]), w[1] - (b0[1] - b1[1]), w[2] - (b0[2] - b1[2])])).toBeLessThan(1e-6);
  });
});
