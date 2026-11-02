/**
 * Signs and houses: the sky over one place at one moment (0.4.0 "Stand here").
 *
 * Signs are tropical: 30° slices of the ecliptic counted from the equinox *of the date*
 * (where the Sun crosses the equator in March that year). The app's positions are in the
 * J2000 ecliptic frame, so a longitude is moved to the date by general precession (about
 * 50″ a year) and nutation (±17″). Houses come from the local sidereal time and latitude:
 * the Ascendant is where the eastern horizon cuts the ecliptic, the Midheaven (MC) where
 * the meridian does. Whole Sign and Equal houses here; Placidus later.
 *
 * Formulas: IAU 2006 precession (Capitaine et al. 2003; obliquity ε_A and general
 * precession in longitude p_A), the IAU 1982 sidereal time (Meeus, Astronomical
 * Algorithms, 2nd ed., 12.4) and the short nutation series (Meeus 22, good to 0.5″).
 * Our own code, so no Swiss Ephemeris (AGPL). Times are UTC, taken as UT1 (within 0.9 s),
 * and TT − UT (about 69 s now) is ignored in precession: both far below a sign's degree.
 *
 * Beyond ±10,000 years the precession polynomial is continued at its rate there
 * (a model: the equinox circles the ecliptic in about 25,800 years); houses beyond the
 * ephemeris tier assume today's length of day, which is not true in deep time (rule 5:
 * the view labels them by the accuracy tier).
 *
 * Pure: no DOM, no Date (rule 3).
 */

import { SIGNS } from './skyfigures';
import { SECONDS_PER_DAY, type Time } from './time';

const DEG = Math.PI / 180;
const ARCSEC = 1 / 3600;

/** Normalise degrees to [0, 360). */
export const norm360 = (d: number): number => {
  const x = d % 360;
  return x < 0 ? x + 360 : x === 360 ? 0 : x;
};

/** Julian centuries from J2000.0 (2000-01-01 12:00), from a Time (UTC). */
export function centuries(t: Time): number {
  return (t.day - 0.5 + t.sec / SECONDS_PER_DAY) / 36_525;
}

/** Where the polynomials stop being used as they are (±10,000 years). */
const T_LIMIT = 100;

/** Mean obliquity of the ecliptic of date, degrees (IAU 2006). */
export function meanObliquityDeg(T: number): number {
  const t = Math.max(-T_LIMIT, Math.min(T_LIMIT, T));
  const arcsec = 84_381.406 + t * (-46.836_769 + t * (-0.000_183_1 + t * (0.002_003_40 + t * (-0.000_000_576 + t * -0.000_000_043_4))));
  return arcsec * ARCSEC;
}

/** General precession in longitude since J2000, degrees (IAU 2006 p_A), continued linearly past ±10,000 years. */
export function precessionDeg(T: number): number {
  const p = (t: number): number => (t * (5_028.796_195 + t * (1.105_434_8 + t * (0.000_079_64 + t * (-0.000_023_857 + t * -0.000_000_038_3))))) * ARCSEC;
  if (Math.abs(T) <= T_LIMIT) return p(T);
  const edge = Math.sign(T) * T_LIMIT;
  const h = 1e-3;
  const rate = (p(edge + h) - p(edge - h)) / (2 * h);
  return p(edge) + rate * (T - edge);
}

/** Nutation in longitude and obliquity, degrees (Meeus 22, the four largest terms). Zero outside ±10,000 years. */
export function nutationDeg(T: number): { dPsi: number; dEps: number } {
  if (Math.abs(T) > T_LIMIT) return { dPsi: 0, dEps: 0 };
  const om = (125.044_52 - 1_934.136_261 * T) * DEG;
  const L = (280.466_5 + 36_000.769_8 * T) * DEG;
  const Lm = (218.316_5 + 481_267.881_3 * T) * DEG;
  const dPsi = -17.2 * Math.sin(om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * om);
  const dEps = 9.2 * Math.cos(om) + 0.57 * Math.cos(2 * L) + 0.1 * Math.cos(2 * Lm) - 0.09 * Math.cos(2 * om);
  return { dPsi: dPsi * ARCSEC, dEps: dEps * ARCSEC };
}

/**
 * Greenwich mean sidereal time, degrees [0, 360) (IAU 1982). Whole days and seconds are
 * kept apart so it stays exact far from 2000 (each whole day turns 360.9856…°).
 */
export function gmstDeg(t: Time): number {
  const d = t.day - 0.5; // days from J2000.0 at the start of this UTC day
  const T = centuries(t);
  // 360.985 647 366 29 × days, with the whole turns (360 × d, d − 0.5 a half-integer) taken out first.
  const turns = norm360(0.985_647_366_29 * d + 180);
  const ofDay = (360.985_647_366_29 * t.sec) / SECONDS_PER_DAY;
  const Tc = Math.max(-T_LIMIT, Math.min(T_LIMIT, T));
  return norm360(280.460_618_37 + turns + ofDay + 0.000_387_933 * Tc * Tc - (Tc * Tc * Tc) / 38_710_000);
}

/** The sky's frame on a date: true obliquity, apparent sidereal time at Greenwich, and the shift from J2000 longitudes. */
export interface SkyOfDate {
  /** True obliquity, degrees. */
  readonly obliquity: number;
  /** Greenwich apparent sidereal time, degrees. */
  readonly gast: number;
  /** Add to a J2000 ecliptic longitude to get the longitude from the true equinox of date, degrees. */
  readonly lonShift: number;
}

export function skyOfDate(t: Time): SkyOfDate {
  const T = centuries(t);
  const n = nutationDeg(T);
  const obliquity = meanObliquityDeg(T) + n.dEps;
  return { obliquity, gast: norm360(gmstDeg(t) + n.dPsi * Math.cos(obliquity * DEG)), lonShift: precessionDeg(T) + n.dPsi };
}

/** A J2000 ecliptic longitude (degrees) measured instead from the true equinox of the date. */
export function lonOfDate(lonJ2000: number, sky: SkyOfDate): number {
  return norm360(lonJ2000 + sky.lonShift);
}

/** A direction or position in the J2000 ecliptic frame → its ecliptic longitude of date, degrees. */
export function lonOfDateFromVector(v: readonly [number, number, number], sky: SkyOfDate): number {
  return lonOfDate(Math.atan2(v[1], v[0]) / DEG, sky);
}

export interface SignPlace {
  /** 0 = Aries … 11 = Pisces. */
  readonly index: number;
  readonly glyph: string;
  readonly name: string;
  /** Degrees into the sign, [0, 30). */
  readonly deg: number;
}

/** The tropical sign a longitude of date falls in. */
export function signOf(lon: number): SignPlace {
  const l = norm360(lon);
  const index = Math.min(11, Math.floor(l / 30));
  const [glyph, name] = SIGNS[index]!;
  return { index, glyph, name, deg: l - index * 30 };
}

/** "14° Leo" (whole degrees, floored: a body at 14.9° is still in its 14th degree… shown as 14°). */
export function formatSignDeg(lon: number): string {
  const s = signOf(lon);
  return `${Math.floor(s.deg)}° ${s.name}`;
}

/**
 * The Ascendant: the ecliptic longitude rising on the eastern horizon, degrees.
 * lst: local sidereal time (degrees); lat: latitude (degrees, north +); eps: obliquity.
 */
export function ascendantDeg(lst: number, lat: number, eps: number): number {
  const th = lst * DEG, e = eps * DEG, f = lat * DEG;
  return norm360(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(e) + Math.tan(f) * Math.sin(e))) / DEG);
}

/** The Midheaven (MC): the ecliptic longitude on the upper meridian, degrees. */
export function midheavenDeg(lst: number, eps: number): number {
  const th = lst * DEG, e = eps * DEG;
  return norm360(Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(e)) / DEG);
}

export type HouseSystem = 'whole' | 'equal';
export const HOUSE_SYSTEMS: readonly { id: HouseSystem; name: string }[] = [
  { id: 'whole', name: 'Whole Sign' },
  { id: 'equal', name: 'Equal' },
];

/** The 12 house cusps (longitudes of date, degrees), house 1 first. */
export function houseCusps(system: HouseSystem, asc: number): number[] {
  const start = system === 'whole' ? Math.floor(norm360(asc) / 30) * 30 : norm360(asc);
  return Array.from({ length: 12 }, (_, i) => norm360(start + 30 * i));
}

/** Which house (1–12) a longitude of date falls in, given the cusps (in order, house 1 first). */
export function houseOf(lon: number, cusps: readonly number[]): number {
  const c0 = cusps[0] ?? 0;
  const l = norm360(lon - c0);
  for (let i = 11; i >= 0; i--) {
    if (l >= norm360((cusps[i] ?? 0) - c0)) return i + 1;
  }
  return 1;
}

export interface Chart {
  readonly sky: SkyOfDate;
  /** Local apparent sidereal time, degrees. */
  readonly lst: number;
  readonly asc: number;
  readonly mc: number;
  readonly system: HouseSystem;
  readonly cusps: readonly number[];
  /** Inside a polar circle the MC can sit below the horizon and the ecliptic can lie along it: say so. */
  readonly polar: boolean;
}

/** Signs and houses for a moment and a place (longitude east +). */
export function chartAt(t: Time, lat: number, lonEast: number, system: HouseSystem = 'whole'): Chart {
  const sky = skyOfDate(t);
  const lst = norm360(sky.gast + lonEast);
  const asc = ascendantDeg(lst, lat, sky.obliquity);
  const mc = midheavenDeg(lst, sky.obliquity);
  return { sky, lst, asc, mc, system, cusps: houseCusps(system, asc), polar: Math.abs(lat) > 90 - sky.obliquity };
}

/** A direction (unit) in the app's J2000 ecliptic frame for a longitude and latitude of date, degrees. */
export function eclipticDirOfDate(lonDate: number, latDeg: number, sky: SkyOfDate): [number, number, number] {
  const l = (lonDate - sky.lonShift) * DEG, b = latDeg * DEG;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

/**
 * Straight up at a place (its zenith) as a direction in the J2000 ecliptic frame: the
 * pole of its horizon. From the local sidereal time and latitude, through the equator
 * and ecliptic of date (the ecliptic's own slow tilt, ≈47″ a century, is left out).
 */
export function zenithDir(t: Time, lat: number, lonEast: number): [number, number, number] {
  const sky = skyOfDate(t);
  const lst = (sky.gast + lonEast) * DEG, f = lat * DEG, e = sky.obliquity * DEG;
  const x = Math.cos(f) * Math.cos(lst), y = Math.cos(f) * Math.sin(lst), z = Math.sin(f);
  // Equator of date → ecliptic of date (about x by the obliquity), then back to the J2000 equinox.
  const ye = y * Math.cos(e) + z * Math.sin(e), ze = -y * Math.sin(e) + z * Math.cos(e);
  const s = -sky.lonShift * DEG;
  return [x * Math.cos(s) - ye * Math.sin(s), x * Math.sin(s) + ye * Math.cos(s), ze];
}
