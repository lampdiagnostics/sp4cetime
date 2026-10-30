import * as Astronomy from 'astronomy-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLL,
  ECL_TO_GAL,
  ECLIPTIC_AXIS_TO_TRAVEL_DEG,
  eccentricAnomaly,
  heliocentricEcliptic,
  makeScale,
  makeTrack,
  mul,
  type Sample,
  viewMatrix,
} from './geometry';
import { PLANETS, planetById } from './planets';
import { fromCivil, toUnixMs } from './time';

const DEG = 180 / Math.PI;
const lonDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const centuries = (year: number, month: number, day: number): number => {
  const t = fromCivil(year, month, day);
  return (t.day + t.sec / 86_400 - 0.5) / 36_525;
};

const BODY: Record<string, Astronomy.Body> = {
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.EMB,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
};

describe('Planet positions', () => {
  it('match astronomy-engine to within 0.5° of longitude and latitude, 1800–2050', () => {
    for (const planet of PLANETS) {
      for (let year = 1800; year <= 2050; year += 25) {
        const t = fromCivil(year, 6, 1);
        const date = new Date(toUnixMs(t));
        // J2000 ecliptic on both sides (Astronomy.Ecliptic() would use the ecliptic of date).
        const eq = Astronomy.HelioVector(BODY[planet.id] as Astronomy.Body, date);
        const ref = Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECL(), eq);
        const refLon = ((Math.atan2(ref.y, ref.x) * DEG) + 360) % 360;
        const refLat = Math.asin(ref.z / ref.Length()) * DEG;
        const v = heliocentricEcliptic(planet, centuries(year, 6, 1));
        const lon = ((Math.atan2(v[1], v[0]) * DEG) + 360) % 360;
        const lat = Math.asin(v[2] / Math.hypot(...v)) * DEG;
        expect(lonDiff(lon, refLon), `${planet.name} lon ${year}`).toBeLessThan(0.5);
        expect(Math.abs(lat - refLat), `${planet.name} lat ${year}`).toBeLessThan(0.5);
        expect(Math.abs(Math.hypot(...v) - ref.Length()) / ref.Length()).toBeLessThan(0.01);
      }
    }
  });

  it('solves Kepler’s equation', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 0.3, noNaN: true }), (M, e) => {
        const E = eccentricAnomaly(M, e);
        const m = Math.atan2(Math.sin(M), Math.cos(M));
        const r = E - e * Math.sin(E) - m;
        expect(Math.abs(Math.atan2(Math.sin(r), Math.cos(r)))).toBeLessThan(1e-9);
      }),
    );
  });
});

describe('Orientation', () => {
  it('puts the north ecliptic pole at galactic l ≈ 96.4°, b ≈ 29.8°', () => {
    const [x, y, z] = mul(ECL_TO_GAL, [0, 0, 1]);
    expect(Math.atan2(y, x) * DEG).toBeCloseTo(96.38, 1);
    expect(Math.asin(z) * DEG).toBeCloseTo(29.81, 1);
  });

  it('tilts the orbits’ axis about 30° from the direction of travel', () => {
    expect(ECLIPTIC_AXIS_TO_TRAVEL_DEG).toBeGreaterThan(29);
    expect(ECLIPTIC_AXIS_TO_TRAVEL_DEG).toBeLessThan(32);
  });

  it('view matrices are rotations (preserve lengths) for any roll', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (roll, z) => {
        const v: [number, number, number] = [0.3, -0.7, z];
        expect(Math.hypot(...mul(viewMatrix(roll), v))).toBeCloseTo(Math.hypot(...v), 9);
      }),
    );
  });

  it('rolling never moves a point along the time axis', () => {
    const v: [number, number, number] = [0.2, 0.9, -0.4];
    const x0 = mul(viewMatrix(0), v)[0];
    for (const roll of [0.5, 1, 2, 3]) expect(mul(viewMatrix(roll), v)[0]).toBeCloseTo(x0, 12);
  });

  it('the default roll faces the orbits toward the viewer', () => {
    const n = mul(viewMatrix(DEFAULT_ROLL), [0, 0, 1]);
    expect(Math.abs(n[1])).toBeLessThan(1e-12);
    expect(n[2]).toBeGreaterThan(0.45);
  });
});

describe('Tracks', () => {
  const earth = planetById('earth');
  const view = viewMatrix(DEFAULT_ROLL);
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };

  it('return to the same place after one orbit', () => {
    const track = makeTrack(earth, 0.27, view, makeScale('fit', 150, 1.1, 1000, 230));
    const a = { ...track.at(0, s) };
    const b = track.at(track.period, { ...s });
    expect(b.sx).toBeCloseTo(a.sx, 6);
    expect(b.sy).toBeCloseTo(a.sy, 6);
  });

  it('true scale puts 1 AU at the distance the Sun travels in 7.5 days', () => {
    const spp = 86_400; // one day per pixel
    const scale = makeScale('true', 150, 1, spp, 230);
    expect(scale.factor(1)).toBeCloseTo(149_597_870.7 / (230 * 86_400), 9); // ≈ 7.53 px
  });

  it('fit scale puts the outermost orbit at the fit radius', () => {
    const scale = makeScale('fit', 200, 49.3, 1, 230);
    expect(49.3 * scale.factor(49.3)).toBeCloseTo(200, 9);
    expect(1 * scale.factor(1)).toBeCloseTo(200 * Math.sqrt(1 / 49.3), 9);
  });
});
