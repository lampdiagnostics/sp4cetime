/**
 * The solar system's barycentre (its centre of mass) and the Sun's wobble around it.
 *
 * The 230 km/s straight line belongs, strictly, to the barycentre: the Sun circles it,
 * pulled mostly by Jupiter (about 1 solar radius) and Saturn, and with Uranus and Neptune
 * swings between almost nothing and about 2.2 solar radii over roughly 20-year beats.
 * Everything that orbits the Sun closely (the inner planets, the Moon) rides along with it,
 * so heliocentric positions are kept as they are and the whole heliocentric system is
 * shifted by the Sun's offset from the barycentre at each moment.
 *
 * Model: the four giant planets on the JPL mean elements (planets.ts), with their masses
 * (constants.ts). The inner planets and Pluto move the barycentre by under 1,000 km and are
 * left out. Within the ephemeris tier it agrees with astronomy-engine's barycentre to a few
 * thousand km (under 1% of the Sun's radius); beyond, it is modelled like the paths.
 */
import { SUN_PLANET_MASS_RATIO } from './constants';
import { heliocentricEcliptic, KM_PER_AU, type Vec3 } from './geometry';
import { planetById } from './planets';
import { addSeconds, type Time } from './time';

const GIANTS = (['jupiter', 'saturn', 'uranus', 'neptune'] as const).map((id) => ({
  planet: planetById(id),
  mu: 1 / SUN_PLANET_MASS_RATIO[id],
}));
const TOTAL = 1 + GIANTS.reduce((s, g) => s + g.mu, 0);

/** The barycentre relative to the Sun, heliocentric ecliptic km, at T Julian centuries from J2000.0. */
export function barycentreAtCenturies(T: number): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const g of GIANTS) {
    const r = heliocentricEcliptic(g.planet, T);
    x += g.mu * r[0];
    y += g.mu * r[1];
    z += g.mu * r[2];
  }
  const k = KM_PER_AU / TOTAL;
  return [x * k, y * k, z * k];
}

/** The barycentre relative to the Sun at a moment, km. */
export function barycentreKm(t: Time): Vec3 {
  return barycentreAtCenturies((t.day + t.sec / 86_400 - 0.5) / 36_525);
}

/**
 * The same, read from a table of moments every 1/96 of Jupiter's year (about 45 days) and
 * joined by straight lines: within a few hundred km of `barycentreKm`, and cheap enough to
 * evaluate for every point of every path, every frame. The table is filled as it is asked
 * for (a cache of a pure function; frames stay pure functions of their inputs).
 */
const STEP_DAYS = 4_332.59 / 96;
const table = new Map<number, Vec3>();
function node(i: number): Vec3 {
  let v = table.get(i);
  if (!v) {
    if (table.size > 200_000) table.clear();
    v = barycentreAtCenturies((i * STEP_DAYS - 0.5) / 36_525);
    table.set(i, v);
  }
  return v;
}
export function barycentreSmooth(t: Time): Vec3 {
  const d = (t.day + t.sec / 86_400) / STEP_DAYS;
  const i = Math.floor(d);
  const f = d - i;
  const a = node(i), b = node(i + 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * How far the Sun (and everything riding with it) sits off its straight line `s` seconds from
 * now, km: the barycentre's place now less its place then, so the Sun now stays at the origin
 * and the straight line runs through the barycentre.
 */
export function sunWobble(now: Time, s: number): Vec3 {
  const b0 = barycentreSmooth(now);
  const b = barycentreSmooth(addSeconds(now, s));
  return [b0[0] - b[0], b0[1] - b[1], b0[2] - b[2]];
}
