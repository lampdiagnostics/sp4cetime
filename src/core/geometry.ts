/**
 * Spatial maths: where each body sits in 3D around the Sun's line of travel,
 * and how that is projected to the screen (docs/adr/0006-spatial-model.md).
 *
 * Frames
 * - Ecliptic J2000: heliocentric, x toward the March equinox, z to the north ecliptic pole.
 * - Galactic: IAU galactic coordinates (x toward the galactic centre, z to the north galactic pole).
 * - Travel: X along the Sun's direction of galactic rotation (l = 90°, b = 0°),
 *   Y to the north galactic pole, Z toward the galactic centre. The time axis is X.
 * - View: the travel frame rolled by ψ about X. Rolling about the line of travel
 *   never moves the time axis, so ticks, zoom and panning are unaffected.
 *
 * Screen: x = timeToX(t) + offset.X, y = centreY − offset.Y; offset.Z > 0 faces the viewer.
 */
import { SECONDS_PER_DAY } from './time';
import { elementsAt, meanMotion, type Planet } from './planets';

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export const KM_PER_AU = 149_597_870.7;
export const KM_PER_LIGHT_YEAR = 9_460_730_472_580.8;
/** Moon's mean distance, km. */
export const MOON_DISTANCE_KM = 384_400;
/** Obliquity of the ecliptic at J2000, degrees. */
export const OBLIQUITY_J2000_DEG = 23.439_291_1;

export function mul(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function matMul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** Ecliptic → equatorial (rotation by the obliquity about the equinox direction). */
const ECL_TO_EQ: Mat3 = (() => {
  const e = OBLIQUITY_J2000_DEG * DEG;
  const c = Math.cos(e), s = Math.sin(e);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
})();

/** Equatorial J2000 → galactic (Hipparcos, ESA 1997, vol. 1 §1.5.3). */
const EQ_TO_GAL: Mat3 = [
  [-0.054_875_560_4, -0.873_437_090_2, -0.483_835_015_5],
  [0.494_109_427_9, -0.444_829_630_0, 0.746_982_244_5],
  [-0.867_666_149_0, -0.198_076_373_4, 0.455_983_776_2],
];

export const ECL_TO_GAL: Mat3 = matMul(EQ_TO_GAL, ECL_TO_EQ);

/** Ecliptic → travel frame: X = galactic y, Y = galactic z, Z = galactic x. */
export const ECL_TO_TRAVEL: Mat3 = [ECL_TO_GAL[1], ECL_TO_GAL[2], ECL_TO_GAL[0]];

/** North ecliptic pole expressed in the travel frame. */
export const ECLIPTIC_POLE_TRAVEL: Vec3 = mul(ECL_TO_TRAVEL, [0, 0, 1]);

/** Angle between the orbital plane's axis and the direction of travel, degrees (~30°). */
export const ECLIPTIC_AXIS_TO_TRAVEL_DEG = Math.acos(ECLIPTIC_POLE_TRAVEL[0]) / DEG;

/** Roll that shows the orbits most open (their axis lies in the screen plane's horizontal). */
export const DEFAULT_ROLL = Math.atan2(ECLIPTIC_POLE_TRAVEL[1], ECLIPTIC_POLE_TRAVEL[2]);

export function rollMatrix(psi: number): Mat3 {
  const c = Math.cos(psi), s = Math.sin(psi);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

/** Ecliptic → view for a given roll about the line of travel. */
export function viewMatrix(roll: number): Mat3 {
  return matMul(rollMatrix(roll), ECL_TO_TRAVEL);
}

// ---------------------------------------------------------------------------
// Orbits
// ---------------------------------------------------------------------------

/** Solve Kepler's equation M = E − e sin E (Newton; e < 0.3 converges in ≤ 4 steps). */
export function eccentricAnomaly(M: number, e: number): number {
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  else if (m < -Math.PI) m += TWO_PI;
  let E = m + e * Math.sin(m);
  for (let i = 0; i < 5; i++) {
    const f = E - e * Math.sin(E) - m;
    E -= f / (1 - e * Math.cos(E));
  }
  return E;
}

/** Columns of the perifocal → ecliptic rotation (unit vectors along perihelion and 90° ahead). */
export function orbitBasis(argPeri: number, node: number, incl: number): [Vec3, Vec3] {
  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const cO = Math.cos(node), sO = Math.sin(node);
  const ci = Math.cos(incl), si = Math.sin(incl);
  return [
    [cw * cO - sw * sO * ci, cw * sO + sw * cO * ci, sw * si],
    [-sw * cO - cw * sO * ci, -sw * sO + cw * cO * ci, cw * si],
  ];
}

/** Heliocentric ecliptic position (AU) at T Julian centuries from J2000. */
export function heliocentricEcliptic(planet: Planet, T: number): Vec3 {
  const el = elementsAt(planet, T);
  const E = eccentricAnomaly((el.L - el.varpi) * DEG, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const [P, Q] = orbitBasis((el.varpi - el.node) * DEG, el.node * DEG, el.I * DEG);
  return [P[0] * xp + Q[0] * yp, P[1] * xp + Q[1] * yp, P[2] * xp + Q[2] * yp];
}

// ---------------------------------------------------------------------------
// Scaling: how orbit sizes map to pixels
// ---------------------------------------------------------------------------

/**
 * - fit:    √-compressed so every chosen orbit fits the window (shape kept, sizes compressed).
 * - linear: true proportions between orbits, fitted to the window.
 * - true:   true to scale against the distance travelled (230 km/s), so it changes with zoom.
 */
export type ScaleMode = 'fit' | 'linear' | 'true';

export interface Scale {
  readonly mode: ScaleMode;
  /** Pixels per AU at radius r (AU): offset_px = r_vec_AU × factor(r). */
  factor(rAU: number): number;
}

export function makeScale(
  mode: ScaleMode,
  fitRadiusPx: number,
  fitAU: number,
  secondsPerPixel: number,
  speedKmS: number,
): Scale {
  switch (mode) {
    case 'fit':
      return { mode, factor: (r) => (r > 0 ? (fitRadiusPx * Math.sqrt(r / fitAU)) / r : 0) };
    case 'linear':
      return { mode, factor: () => fitRadiusPx / fitAU };
    case 'true': {
      const pxPerAU = KM_PER_AU / (speedKmS * secondsPerPixel);
      return { mode, factor: () => pxPerAU };
    }
  }
}

// ---------------------------------------------------------------------------
// A planet's track for one frame
// ---------------------------------------------------------------------------

/** Mutable sample, reused to avoid allocation in the hot loop. */
export interface Sample {
  /** Screen offset from the Sun line, px (Y up). */
  sx: number;
  sy: number;
  /** > 0: in front of the line of travel. */
  depth: number;
  /** Heliocentric ecliptic longitude, radians. */
  lon: number;
}

export interface Track {
  readonly planet: Planet;
  /** Seconds per orbit. */
  readonly period: number;
  /** Mean motion, radians per second. */
  readonly n: number;
  /** Mean anomaly at the camera centre, radians in [0, 2π). */
  readonly M0: number;
  /** Position dt seconds after the camera centre. */
  at(dt: number, out: Sample): Sample;
  /** Position at mean anomaly M (radians, any value). */
  atMean(M: number, out: Sample): Sample;
  /** Point on the orbit at eccentric anomaly E, for drawing the orbit ring. */
  ringAt(E: number, out: Sample): Sample;
  /** Largest on-screen offset of the orbit from the Sun, px. */
  readonly extent: number;
}

/** x mod 2π into [0, 2π). */
export function wrap2pi(x: number): number {
  const r = x % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

/**
 * Mean anomaly at a moment, computed from the day and second separately so it
 * stays smooth to a tiny fraction of a degree even billions of years away.
 */
export function meanAnomalyAt(planet: Planet, day: number, sec: number, varpiDeg: number): number {
  const ratePerDay = (planet.rate.L * DEG) / 36_525;
  const base = (planet.el.L - varpiDeg) * DEG;
  return wrap2pi(base + wrap2pi(ratePerDay * day) + ratePerDay * (sec / 86_400 - 0.5));
}

/**
 * Build a planet's track for one frame. Slow elements are evaluated once at the
 * camera centre; positions advance by mean motion from the precise centre anomaly.
 */
export function makeTrack(planet: Planet, center: { day: number; sec: number }, view: Mat3, scale: Scale): Track {
  const T = centuriesFromDays(center.day + center.sec / 86_400);
  const el = elementsAt(planet, T);
  const e = el.e;
  const a = el.a;
  const b = a * Math.sqrt(1 - e * e);
  const n = meanMotion(planet);
  const M0 = meanAnomalyAt(planet, center.day, center.sec, el.varpi);
  const [P, Q] = orbitBasis((el.varpi - el.node) * DEG, el.node * DEG, el.I * DEG);
  const U = mul(view, P);
  const W = mul(view, Q);

  const place = (E: number, out: Sample): Sample => {
    const cE = Math.cos(E), sE = Math.sin(E);
    const xp = a * (cE - e);
    const yp = b * sE;
    const k = scale.factor(a * (1 - e * cE));
    out.sx = (U[0] * xp + W[0] * yp) * k;
    out.sy = (U[1] * xp + W[1] * yp) * k;
    out.depth = U[2] * xp + W[2] * yp;
    out.lon = Math.atan2(P[1] * xp + Q[1] * yp, P[0] * xp + Q[0] * yp);
    return out;
  };

  let extent = 0;
  const tmp: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  for (let i = 0; i < 64; i++) {
    place((i / 64) * TWO_PI, tmp);
    extent = Math.max(extent, Math.abs(tmp.sx), Math.abs(tmp.sy));
  }

  const atMean = (M: number, out: Sample): Sample => place(eccentricAnomaly(M, e), out);
  return {
    planet,
    period: TWO_PI / n,
    n,
    M0,
    extent,
    at: (dt, out) => atMean(M0 + n * dt, out),
    atMean,
    ringAt: place,
  };
}

/** Moon offset from Earth, px: geocentric ecliptic longitude λ, mean distance, ecliptic plane. */
export function moonOffset(lon: number, radiusPx: number, view: Mat3, out: Sample): Sample {
  const c = Math.cos(lon), s = Math.sin(lon);
  out.sx = (view[0][0] * c + view[0][1] * s) * radiusPx;
  out.sy = (view[1][0] * c + view[1][1] * s) * radiusPx;
  out.depth = view[2][0] * c + view[2][1] * s;
  out.lon = lon;
  return out;
}

/** Julian centuries from J2000.0 for a day count since 2000-01-01 00:00. */
export function centuriesFromDays(days: number): number {
  return (days - 0.5) / 36_525;
}

export { SECONDS_PER_DAY };
