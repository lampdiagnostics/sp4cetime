/**
 * Nested spheres (docs/adr/0010-spheres.md). Every place is measured as an arc
 * position on a sphere: a longitude and latitude in degrees, minutes and seconds,
 * seen from the sphere's centre, plus how many of that sphere's radii away it is.
 *
 * - The galaxy sphere is centred on Sagittarius A*, the central black hole, with
 *   the IAU galactic axes (north = north galactic pole).
 * - The Sun's sphere is centred on the Sun, with the ecliptic axes (north = ecliptic north).
 * - Each planet's and the Moon's sphere is centred on the body and turns with it:
 *   longitude east from its prime meridian, north = its north pole.
 *
 * Spheres are perfect. Real shapes vary from them (flattening, in bodies.ts).
 * Positions are kept as x, y, z km internally; angles are derived from them.
 */
import { type BodyId, type BodyState, bodyInfo } from './bodies';
import {
  GALAXY_RADIUS_LY,
  SGR_A_B_DEG,
  SGR_A_L_DEG,
  SUN_GALACTIC_SPEED_KM_S,
  SUN_GALACTOCENTRIC_KM,
} from './constants';
import { ECL_TO_GAL, ECL_TO_TRAVEL, KM_PER_LIGHT_YEAR, type Vec3 } from './geometry';
import { J2000 } from './ticks';
import { diffSeconds, type Time } from './time';

export type SphereId = BodyId | 'galaxy';

export interface Sphere {
  readonly id: SphereId;
  readonly name: string;
  /** Centre, heliocentric ecliptic km (Sun now at 0). */
  readonly centre: Vec3;
  /** The sphere's x, y, z axes (x = longitude 0, z = north) in the ecliptic frame. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly radiusKm: number;
}

export interface ArcPosition {
  /** East longitude, radians, −π … π. */
  readonly lon: number;
  /** Latitude, radians, −π/2 … π/2. */
  readonly lat: number;
  /** Distance from the centre, km. */
  readonly r: number;
  /** Distance from the centre in radii of the sphere. */
  readonly radii: number;
  /** Position along the sphere's own axes, km. */
  readonly xyz: Vec3;
}

const DEG = Math.PI / 180;
const ECLIPTIC_AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** The galactic axes in the ecliptic frame. */
const GALACTIC_AXES: readonly [Vec3, Vec3, Vec3] = [ECL_TO_GAL[0], ECL_TO_GAL[1], ECL_TO_GAL[2]];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Sgr A* from the Sun at J2000, ecliptic km. */
const SGR_A_FROM_SUN_2000: Vec3 = (() => {
  const l = SGR_A_L_DEG * DEG, b = SGR_A_B_DEG * DEG;
  const g: Vec3 = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  // Galactic → ecliptic is the transpose of ECL_TO_GAL.
  const e: Vec3 = [0, 1, 2].map((i) => ECL_TO_GAL[0][i]! * g[0] + ECL_TO_GAL[1][i]! * g[1] + ECL_TO_GAL[2][i]! * g[2]) as unknown as Vec3;
  return [e[0] * SUN_GALACTOCENTRIC_KM, e[1] * SUN_GALACTOCENTRIC_KM, e[2] * SUN_GALACTOCENTRIC_KM];
})();

/** The galaxy sphere at a moment: the Sun has moved on along its path since J2000. */
export function galaxySphere(now: Time): Sphere {
  const moved = SUN_GALACTIC_SPEED_KM_S * diffSeconds(now, J2000);
  const T = ECL_TO_TRAVEL[0];
  return {
    id: 'galaxy',
    name: 'Galaxy (Sgr A*)',
    centre: [SGR_A_FROM_SUN_2000[0] - moved * T[0], SGR_A_FROM_SUN_2000[1] - moved * T[1], SGR_A_FROM_SUN_2000[2] - moved * T[2]],
    axes: GALACTIC_AXES,
    radiusKm: GALAXY_RADIUS_LY * KM_PER_LIGHT_YEAR,
  };
}

/** A body's sphere. The Sun's uses ecliptic axes; planets and the Moon turn with the body. */
export function bodySphere(b: BodyState): Sphere {
  return {
    id: b.info.id,
    name: b.info.name,
    centre: b.pos,
    axes: b.info.id === 'sun' ? ECLIPTIC_AXES : b.axes,
    radiusKm: b.info.radiusKm,
  };
}

export function sphereOf(id: SphereId, bodies: readonly BodyState[], now: Time): Sphere {
  if (id === 'galaxy') return galaxySphere(now);
  const b = bodies.find((x) => x.info.id === id);
  if (!b) throw new Error(`No body ${id}`);
  return bodySphere(b);
}

/** Where a point is on a sphere: arc position (longitude, latitude), distance, and x, y, z. */
export function arcPosition(p: Vec3, s: Sphere): ArcPosition {
  const d: Vec3 = [p[0] - s.centre[0], p[1] - s.centre[1], p[2] - s.centre[2]];
  const xyz: Vec3 = [dot(d, s.axes[0]), dot(d, s.axes[1]), dot(d, s.axes[2])];
  const r = Math.hypot(...xyz);
  return {
    lon: Math.atan2(xyz[1], xyz[0]),
    lat: r === 0 ? 0 : Math.asin(Math.max(-1, Math.min(1, xyz[2] / r))),
    r,
    radii: r / s.radiusKm,
    xyz,
  };
}

/** The point on a sphere at an arc position and distance (inverse of arcPosition). */
export function fromArc(s: Sphere, lon: number, lat: number, r: number): Vec3 {
  const x = r * Math.cos(lat) * Math.cos(lon), y = r * Math.cos(lat) * Math.sin(lon), z = r * Math.sin(lat);
  return [0, 1, 2].map((i) => s.centre[i]! + s.axes[0][i]! * x + s.axes[1][i]! * y + s.axes[2][i]! * z) as unknown as Vec3;
}

/** Angle between two points as seen from a sphere's centre (the arc between them), radians. */
export function arcBetween(a: Vec3, b: Vec3, s: Sphere): number {
  const u: Vec3 = [a[0] - s.centre[0], a[1] - s.centre[1], a[2] - s.centre[2]];
  const v: Vec3 = [b[0] - s.centre[0], b[1] - s.centre[1], b[2] - s.centre[2]];
  // atan2 of |u×v| and u·v stays exact for tiny angles.
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.atan2(Math.hypot(...c), dot(u, v));
}

/** Angle a sphere fills when seen from `distanceKm` away from its centre (its apparent diameter), radians. */
export function apparentDiameter(radiusKm: number, distanceKm: number): number {
  return 2 * Math.asin(Math.min(1, radiusKm / distanceKm));
}

/** Where a ray (unit direction) first meets a sphere, as a distance along the ray, or null. */
export function raySphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: number): number | null {
  const o: Vec3 = [origin[0] - centre[0], origin[1] - centre[1], origin[2] - centre[2]];
  const b = dot(o, dir);
  const c = dot(o, o) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

/**
 * Degrees, minutes and seconds: "23°26′21.4″". `decimals` sets the seconds' decimals.
 * With `compact`, leading zero units are dropped ("31′05″", "2.1″").
 */
export function formatDMS(rad: number, decimals = 1, compact = false): string {
  const sign = rad < 0 ? '−' : '';
  const scale = 10 ** decimals;
  // Round once, in units of the last decimal of a second, so carries are exact.
  let units = Math.round((Math.abs(rad) / DEG) * 3600 * scale);
  const perDeg = 3600 * scale, perMin = 60 * scale;
  const d = Math.floor(units / perDeg);
  units -= d * perDeg;
  const m = Math.floor(units / perMin);
  units -= m * perMin;
  const sec = units / scale;
  const secStr = (decimals > 0 ? sec.toFixed(decimals) : String(sec)).padStart(decimals > 0 ? decimals + 3 : 2, '0');
  const mm = String(m).padStart(2, '0');
  if (compact) {
    if (d === 0 && m === 0) return `${sign}${decimals > 0 ? sec.toFixed(decimals) : sec}″`;
    if (d === 0) return `${sign}${m}′${secStr}″`;
  }
  return `${sign}${d}°${mm}′${secStr}″`;
}

/** "49°53′42.0″ N" */
export function formatLat(rad: number, decimals = 1): string {
  return `${formatDMS(Math.abs(rad), decimals)} ${rad >= 0 ? 'N' : 'S'}`;
}

/** "97°08′15.0″ W" */
export function formatLon(rad: number, decimals = 1): string {
  return `${formatDMS(Math.abs(rad), decimals)} ${rad >= 0 ? 'E' : 'W'}`;
}

/** Arc length of a step along the Sun's galactic circle, km per radian. */
export const GALACTIC_ARC_KM_PER_RAD = SUN_GALACTOCENTRIC_KM;

/** The name of a sphere's north for the HUD. */
export function northOf(id: SphereId): string {
  if (id === 'galaxy') return 'north galactic pole';
  if (id === 'sun') return 'ecliptic north';
  return `${bodyInfo(id).name}’s north pole`;
}
