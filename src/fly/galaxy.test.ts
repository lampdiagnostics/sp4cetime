import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ECL_TO_GAL, KM_PER_LIGHT_YEAR } from '../core/geometry';
import { galaxySphere } from '../core/spheres';
import { fromCivil, SECONDS_PER_YEAR } from '../core/time';
import { BUBBLE_H_KPC, GAL_NORTH, GALAXY_VIEW_KPC, galaxyDiscDistanceKm, galaxyFade, galaxyStars, scaleHeightKpc, galaxyVantage, KM_PER_KPC, orbitRadPerYear, sunPathPoint, warpOutVantage } from './galaxy';

const now = fromCivil(2026, 10, 30);

describe('The whole galaxy', () => {
  it('shows the outside view only far from the Sun, and the Sun\'s sky only near it', () => {
    expect(galaxyFade(0)).toBe(0);
    expect(galaxyFade(100 * KM_PER_LIGHT_YEAR)).toBe(0);
    expect(galaxyFade(10_000 * KM_PER_LIGHT_YEAR)).toBe(1);
  });

  it('looks at Sgr A* from 42 kpc, 25° above the plane on the Sun’s side', () => {
    const v = galaxyVantage(now);
    const c = galaxySphere(now).centre;
    const r = [v.pos[0] - c[0], v.pos[1] - c[1], v.pos[2] - c[2]];
    expect(Math.hypot(...r) / KM_PER_KPC).toBeCloseTo(42, 6);
    const n = [ECL_TO_GAL[2][0], ECL_TO_GAL[2][1], ECL_TO_GAL[2][2]];
    expect((Math.asin((r[0]! * n[0]! + r[1]! * n[1]! + r[2]! * n[2]!) / Math.hypot(...r)) * 180) / Math.PI).toBeCloseTo(25, 6);
    expect(v.target).toEqual(c);
  });
});

describe('The Sun’s path around the galaxy', () => {
  const c = galaxySphere(now).centre;
  const R = Math.hypot(...c);
  const N: number[] = [ECL_TO_GAL[2][0], ECL_TO_GAL[2][1], ECL_TO_GAL[2][2]];

  it('passes through the Sun now and stays between ~8.0 and ~9.3 kpc from Sgr A* over its whole life', () => {
    expect(Math.hypot(...sunPathPoint(c, 0, now)) / KM_PER_KPC).toBeLessThan(1e-9);
    fc.assert(
      fc.property(fc.double({ min: -4.6e9, max: 5e9, noNaN: true }), (y) => {
        const p = sunPathPoint(c, y, now);
        const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / KM_PER_KPC;
        expect(d).toBeGreaterThan(8.0 * (R / KM_PER_KPC / 8.178));
        expect(d).toBeLessThan(9.3 * (R / KM_PER_KPC / 8.178));
      }),
    );
  });

  it('heads toward galactic longitude 90° at ~242 km/s, a little inward, rising out of the disc', () => {
    const dt = 1000; // years
    const p = sunPathPoint(c, dt, now);
    const v = Math.hypot(...p) / (dt * SECONDS_PER_YEAR);
    expect(Math.abs(v - 242.6)).toBeLessThan(2.5); // 230 + 12.24 around, 11.1 in, 7.25 up (first-order epicycle)
    const toL90: number[] = [ECL_TO_GAL[1][0], ECL_TO_GAL[1][1], ECL_TO_GAL[1][2]];
    expect((p[0] * toL90[0]! + p[1] * toL90[1]! + p[2] * toL90[2]!) / Math.hypot(...p)).toBeGreaterThan(0.99);
    const toCentre = c.map((x) => x / R);
    expect((p[0] * toCentre[0]! + p[1] * toCentre[1]! + p[2] * toCentre[2]!) / (dt * SECONDS_PER_YEAR)).toBeCloseTo(11.1, 0);
    expect((p[0] * N[0]! + p[1] * N[1]! + p[2] * N[2]!) / (dt * SECONDS_PER_YEAR)).toBeCloseTo(7.25, 1);
  });

  it('does not close on itself: a turn later the Sun is somewhere else', () => {
    const a = sunPathPoint(c, 230e6, now);
    expect(Math.hypot(...a) / KM_PER_KPC).toBeGreaterThan(0.3);
  });
});

describe('Warping out to the whole galaxy', () => {
  const c = galaxySphere(now).centre;
  const unitV = (a: readonly number[]): number[] => a.map((x) => x / Math.hypot(...a));

  it('ends 42 kpc from Sgr A*, on the side you were heading, never edge-on', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (x, y, z) => {
        fc.pre(Math.hypot(x, y, z) > 0.1);
        const h = unitV([x, y, z]);
        const v = warpOutVantage(now, [h[0]!, h[1]!, h[2]!]);
        expect(Math.hypot(v.pos[0] - c[0], v.pos[1] - c[1], v.pos[2] - c[2]) / KM_PER_KPC).toBeCloseTo(GALAXY_VIEW_KPC, 6);
        const out = unitV(v.pos);
        // On the heading's side of the Sun, and at least 20° out of the plane.
        expect(out[0]! * h[0]! + out[1]! * h[1]! + out[2]! * h[2]!).toBeGreaterThan(0.3);
        const el = Math.asin(out[0]! * GAL_NORTH[0] + out[1]! * GAL_NORTH[1] + out[2]! * GAL_NORTH[2]);
        expect(Math.abs(el)).toBeGreaterThan((19.9 * Math.PI) / 180);
        expect(v.target).toEqual(c);
      }),
    );
  });

  it('keeps a heading that is already well out of the plane', () => {
    const v = warpOutVantage(now, GAL_NORTH);
    const out = unitV(v.pos);
    expect(out[0]! * GAL_NORTH[0] + out[1]! * GAL_NORTH[1] + out[2]! * GAL_NORTH[2]).toBeCloseTo(1, 9);
  });
});

describe('The galaxy in 3D', () => {
  const c = galaxySphere(now).centre;
  const N: number[] = [ECL_TO_GAL[2][0], ECL_TO_GAL[2][1], ECL_TO_GAL[2][2]];

  it('measures distance to the disc: straight down above it, to the rim beyond it', () => {
    expect(galaxyDiscDistanceKm(now, [0, 0, 0]) / KM_PER_KPC).toBeLessThan(0.05); // the Sun is in the disc
    const above = [0, 1, 2].map((i) => c[i]! + N[i]! * 10 * KM_PER_KPC) as [number, number, number];
    expect(galaxyDiscDistanceKm(now, above) / KM_PER_KPC).toBeCloseTo(10, 6);
  });

  it('has Fermi bubbles about 25,000 light years tall', () => {
    expect((BUBBLE_H_KPC * KM_PER_KPC) / KM_PER_LIGHT_YEAR).toBeGreaterThan(24_000);
    expect((BUBBLE_H_KPC * KM_PER_KPC) / KM_PER_LIGHT_YEAR).toBeLessThan(26_000);
  });
});

describe('The galaxy as stars', () => {
  // A toy map: bright centre fading outward.
  const toy = (x: number, y: number): readonly [number, number, number] => {
    const b = Math.exp(-Math.hypot(x, y) / 4);
    return [b, b, b];
  };
  const f = galaxyStars(toy, 20_000, 7);

  it('puts every star inside the galaxy, none out in intergalactic space', () => {
    expect(f.size.length).toBe(20_000);
    for (let i = 0; i < f.size.length; i++) {
      expect(Math.hypot(f.pos[i * 3]!, f.pos[i * 3 + 1]!)).toBeLessThanOrEqual(20);
      expect(Math.abs(f.pos[i * 3 + 2]!)).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the disc thin away from the centre and crowds stars where the map is bright', () => {
    let inner = 0, outerZ: number[] = [];
    for (let i = 0; i < f.size.length; i++) {
      const R = Math.hypot(f.pos[i * 3]!, f.pos[i * 3 + 1]!);
      if (R < 4) inner++;
      if (R > 5 && R < 10) outerZ.push(Math.abs(f.pos[i * 3 + 2]!));
    }
    expect(inner / f.size.length).toBeGreaterThan(0.4);
    outerZ = outerZ.sort((a, b) => a - b);
    expect(outerZ[Math.floor(outerZ.length / 2)]!).toBeLessThan(0.45); // median |z| ~ 0.69 h for an exponential
  });

  it('is the same every time', () => {
    expect(galaxyStars(toy, 100, 7).pos).toEqual(galaxyStars(toy, 100, 7).pos);
    expect(scaleHeightKpc(8)).toBeCloseTo(0.3, 6);
  });
});
