/**
 * The solar system as solid bodies, for flying through it (docs/adr/0009-fly-mode.md).
 *
 * Frame: heliocentric, J2000 ecliptic axes, kilometres. Within ±3,000 years of
 * J2000, positions come from astronomy-engine (VSOP87 / ELP); beyond, from the
 * JPL mean elements used by the calendar, with a mean lunar orbit. Orientation
 * (pole and spin) follows the IAU rotation models via astronomy-engine.
 */
import * as Astronomy from 'astronomy-engine';
import { heliocentricEcliptic, KM_PER_AU, type Vec3 } from './geometry';
import { accuracyTier, moonPhaseMean } from './models';
import { planetById, type PlanetId } from './planets';
import { type Time, toDaysApprox } from './time';

export type BodyId = 'sun' | 'moon' | PlanetId;

export interface BodyInfo {
  readonly id: BodyId;
  readonly name: string;
  /** Mean radius, km. */
  readonly radiusKm: number;
  /** Equatorial radius of a ring system, km: [inner, outer]. */
  readonly rings?: readonly [number, number];
}

/** Mean radii (IAU WG on Cartographic Coordinates, 2015). */
export const BODIES: readonly BodyInfo[] = [
  { id: 'sun', name: 'Sun', radiusKm: 695_700 },
  { id: 'mercury', name: 'Mercury', radiusKm: 2_439.4 },
  { id: 'venus', name: 'Venus', radiusKm: 6_051.8 },
  { id: 'earth', name: 'Earth', radiusKm: 6_371.0 },
  { id: 'moon', name: 'Moon', radiusKm: 1_737.4 },
  { id: 'mars', name: 'Mars', radiusKm: 3_389.5 },
  { id: 'jupiter', name: 'Jupiter', radiusKm: 69_911 },
  // Saturn's main rings: inner C ring to outer A ring.
  { id: 'saturn', name: 'Saturn', radiusKm: 58_232, rings: [74_658, 136_775] },
  { id: 'uranus', name: 'Uranus', radiusKm: 25_362 },
  { id: 'neptune', name: 'Neptune', radiusKm: 24_622 },
  { id: 'pluto', name: 'Pluto', radiusKm: 1_188.3 },
];

export function bodyInfo(id: BodyId): BodyInfo {
  const b = BODIES.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown body ${id}`);
  return b;
}

/** Geostationary orbit radius from Earth's centre, km. */
export const GEO_RADIUS_KM = 42_164;
/** Mean Earth–Moon distance, km. */
export const MOON_MEAN_DISTANCE_KM = 384_400;

export interface BodyState {
  readonly info: BodyInfo;
  /** Heliocentric ecliptic position, km. */
  readonly pos: Vec3;
  /** Body-fixed axes in the ecliptic frame: x toward the prime meridian, z the north pole. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
}

const ASTRO: Record<BodyId, Astronomy.Body> = {
  sun: Astronomy.Body.Sun,
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.Earth,
  moon: Astronomy.Body.Moon,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
};

const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
const toEcl = (v: Astronomy.Vector): Vec3 => {
  const r = Astronomy.RotateVector(EQJ_TO_ECL, v);
  return [r.x, r.y, r.z];
};

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Body-fixed axes from the IAU pole (ra, dec) and spin angle W, in the ecliptic frame. */
function orientation(id: BodyId, date: Astronomy.AstroTime): readonly [Vec3, Vec3, Vec3] {
  const axis = Astronomy.RotationAxis(ASTRO[id], date);
  const DEG = Math.PI / 180;
  const a = axis.ra * 15 * DEG; // hours → radians
  const d = axis.dec * DEG;
  const pole: Vec3 = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const node: Vec3 = [-Math.sin(a), Math.cos(a), 0]; // ascending node of the body's equator (EQJ)
  const w = (axis.spin % 360) * DEG;
  const east = cross(pole, node);
  const meridian = add(scale(node, Math.cos(w)), scale(east, Math.sin(w)));
  const toE = (v: Vec3): Vec3 => toEcl(new Astronomy.Vector(v[0], v[1], v[2], axis.north.t));
  const z = toE(pole);
  const x = toE(meridian);
  return [x, cross(z, x), z];
}

/** Every body's position and orientation at a moment. */
export function solarSystemAt(t: Time): BodyState[] {
  // Days from J2000.0 (noon), which astronomy-engine accepts at any distance in time.
  const date = new Astronomy.AstroTime(toDaysApprox(t) - 0.5);
  const precise = accuracyTier(t) === 'ephemeris';
  const T = (toDaysApprox(t) - 0.5) / 36_525;

  let earthPos: Vec3;
  let moonPos: Vec3;
  if (precise) {
    earthPos = scale(toEcl(Astronomy.HelioVector(Astronomy.Body.Earth, date)), KM_PER_AU);
    moonPos = scale(toEcl(Astronomy.HelioVector(Astronomy.Body.Moon, date)), KM_PER_AU);
  } else {
    earthPos = scale(heliocentricEcliptic(planetById('earth'), T), KM_PER_AU);
    const earthLon = Math.atan2(earthPos[1], earthPos[0]);
    const lon = earthLon + Math.PI + moonPhaseMean(t);
    moonPos = add(earthPos, [MOON_MEAN_DISTANCE_KM * Math.cos(lon), MOON_MEAN_DISTANCE_KM * Math.sin(lon), 0]);
  }

  return BODIES.map((info) => {
    let pos: Vec3;
    if (info.id === 'sun') pos = [0, 0, 0];
    else if (info.id === 'earth') pos = earthPos;
    else if (info.id === 'moon') pos = moonPos;
    else if (precise) pos = scale(toEcl(Astronomy.HelioVector(ASTRO[info.id], date)), KM_PER_AU);
    else pos = scale(heliocentricEcliptic(planetById(info.id as PlanetId), T), KM_PER_AU);
    return { info, pos, axes: orientation(info.id, date) };
  });
}

/** The Moon's position relative to Earth, km (true within the ephemeris tier, else the mean Moon). */
export function moonGeocentric(t: Time): Vec3 {
  if (accuracyTier(t) === 'ephemeris') {
    return scale(toEcl(Astronomy.GeoMoon(new Astronomy.AstroTime(toDaysApprox(t) - 0.5))), KM_PER_AU);
  }
  const T = (toDaysApprox(t) - 0.5) / 36_525;
  const e = heliocentricEcliptic(planetById('earth'), T);
  const lon = Math.atan2(e[1], e[0]) + Math.PI + moonPhaseMean(t);
  return [MOON_MEAN_DISTANCE_KM * Math.cos(lon), MOON_MEAN_DISTANCE_KM * Math.sin(lon), 0];
}

/** Fraction of a body's disc lit by the Sun, as seen from a point (0 = new, 1 = full). */
export function litFraction(body: Vec3, viewer: Vec3): number {
  const toSun = scale(body, -1);
  const toViewer: Vec3 = [viewer[0] - body[0], viewer[1] - body[1], viewer[2] - body[2]];
  const c = (toSun[0] * toViewer[0] + toSun[1] * toViewer[1] + toSun[2] * toViewer[2]) /
    (Math.hypot(...toSun) * Math.hypot(...toViewer));
  return (1 + c) / 2;
}

