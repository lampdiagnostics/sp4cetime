import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from './geometry';
import { PLANISPHERE_ECLIPTIC_DEG, PLANISPHERE_K, SKY_WHEEL_DEG, planisphereDir } from './planisphere';

const DEG = Math.PI / 180;
const dir = (lon: number, lat: number): Vec3 => [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG)];
const lonOf = (d: Vec3): number => ((Math.atan2(d[1], d[0]) / DEG) % 360 + 360) % 360;
const fromSouthPole = (d: Vec3): number => Math.acos(-d[2] / Math.hypot(...d)) / DEG;
const lonArb = fc.double({ min: 0, max: 359.999, noNaN: true });
const latArb = fc.double({ min: -89.9, max: 89.9, noNaN: true });

describe('planisphere lens', () => {
  it('puts the ecliptic inside the wheel, in its band of signs', () => {
    expect(PLANISPHERE_ECLIPTIC_DEG).toBeGreaterThan(30);
    expect(PLANISPHERE_ECLIPTIC_DEG).toBeLessThan(SKY_WHEEL_DEG);
    for (let lon = 0; lon < 360; lon += 15) expect(fromSouthPole(planisphereDir(dir(lon, 0), 1))).toBeCloseTo(PLANISPHERE_ECLIPTIC_DEG, 9);
  });

  it('amount 0 is the true sky', () => {
    fc.assert(fc.property(lonArb, latArb, (lon, lat) => {
      const d = dir(lon, lat);
      expect(planisphereDir(d, 0)).toEqual(d);
    }));
  });

  it('keeps every longitude (signs and constellations stay together) and the length', () => {
    fc.assert(fc.property(lonArb, latArb, fc.double({ min: 0, max: 1, noNaN: true }), (lon, lat, a) => {
      const d = planisphereDir(dir(lon, lat), a);
      expect(Math.hypot(...d)).toBeCloseTo(1, 12);
      const dl = Math.abs(lonOf(d) - lon);
      expect(Math.min(dl, 360 - dl)).toBeLessThan(1e-6);
    }));
  });

  it('scales the angle from the south pole by K, and keeps the order of latitudes', () => {
    fc.assert(fc.property(lonArb, latArb, latArb, (lon, b1, b2) => {
      const p1 = fromSouthPole(planisphereDir(dir(lon, b1), 1));
      expect(p1).toBeCloseTo((90 + b1) * PLANISPHERE_K, 6);
      if (b2 - b1 > 1e-6) expect(p1).toBeLessThan(fromSouthPole(planisphereDir(dir(lon, b2), 1)));
    }));
  });

  it('eases smoothly from the true sky to the full lens', () => {
    const d = dir(123, 5);
    let last = fromSouthPole(d);
    for (let a = 0.1; a <= 1.0001; a += 0.1) {
      const now = fromSouthPole(planisphereDir(d, a));
      expect(now).toBeLessThan(last);
      last = now;
    }
  });
});
