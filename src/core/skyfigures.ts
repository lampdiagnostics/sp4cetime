/**
 * What is marked on the sky, shared by the calendar and Fly mode: the twelve signs
 * of the zodiac, the four galactic marks, and directions on the sky sphere.
 */
import { ECL_TO_EQ, ECL_TO_GAL, type Vec3 } from './geometry';

const DEG = Math.PI / 180;

/** Galactic longitudes marked on the sky, with their names. */
export const GALACTIC_MARKS: ReadonlyArray<readonly [number, string]> = [
  [0, 'Galactic Centre · Sgr A*'],
  [90, 'l 90° · the Sun’s direction of travel'],
  [180, 'Galactic Anticentre'],
  [270, 'l 270° · behind the Sun'],
];

/** The twelve signs of the (tropical) zodiac, from the March equinox, 30° each. */
export const SIGNS = [
  ['♈︎', 'Aries'],
  ['♉︎', 'Taurus'],
  ['♊︎', 'Gemini'],
  ['♋︎', 'Cancer'],
  ['♌︎', 'Leo'],
  ['♍︎', 'Virgo'],
  ['♎︎', 'Libra'],
  ['♏︎', 'Scorpio'],
  ['♐︎', 'Sagittarius'],
  ['♑︎', 'Capricorn'],
  ['♒︎', 'Aquarius'],
  ['♓︎', 'Pisces'],
] as const;

/** Equatorial right ascension / declination (degrees) → unit vector, equatorial frame. */
export const eqDir = (ra: number, dec: number): Vec3 => {
  const a = ra * DEG, d = dec * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
/** Equatorial → ecliptic (J2000). */
export const toEcl = (v: Vec3): Vec3 => [
  ECL_TO_EQ[0][0] * v[0] + ECL_TO_EQ[1][0] * v[1] + ECL_TO_EQ[2][0] * v[2],
  ECL_TO_EQ[0][1] * v[0] + ECL_TO_EQ[1][1] * v[1] + ECL_TO_EQ[2][1] * v[2],
  ECL_TO_EQ[0][2] * v[0] + ECL_TO_EQ[1][2] * v[1] + ECL_TO_EQ[2][2] * v[2],
];
/** Ecliptic longitude / latitude (degrees) → unit vector, ecliptic frame. */
export const eclDir = (lon: number, lat: number): Vec3 => {
  const a = lon * DEG, b = lat * DEG;
  return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
};
/** Galactic longitude / latitude (degrees) → unit vector, galactic frame. */
export const galDir = (l: number, b: number): Vec3 => {
  const a = l * DEG, c = b * DEG;
  return [Math.cos(c) * Math.cos(a), Math.cos(c) * Math.sin(a), Math.sin(c)];
};
/** Galactic → ecliptic. */
export const galToEcl = (v: Vec3): Vec3 => [
  ECL_TO_GAL[0][0] * v[0] + ECL_TO_GAL[1][0] * v[1] + ECL_TO_GAL[2][0] * v[2],
  ECL_TO_GAL[0][1] * v[0] + ECL_TO_GAL[1][1] * v[1] + ECL_TO_GAL[2][1] * v[2],
  ECL_TO_GAL[0][2] * v[0] + ECL_TO_GAL[1][2] * v[1] + ECL_TO_GAL[2][2] * v[2],
];

/** Constellation data as in public/sky/sky.json. */
export interface FigureData {
  readonly constellations: ReadonlyArray<{
    id: string;
    name: string;
    ra: number;
    dec: number;
    zodiac: boolean;
    lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  }>;
  readonly names: ReadonlyArray<{ name: string; ra: number; dec: number; mag: number }>;
}

export type FigureKind = 'figures' | 'zodiacFigures' | 'ecliptic' | 'signs' | 'galactic';
export type MarkKind = 'star' | 'constellation' | 'zodiacFigure' | 'sign' | 'galactic';

/** Every line segment on the sky (ecliptic directions) with what it belongs to, and its strength. */
export function skySegments(data: FigureData): Array<{ a: Vec3; b: Vec3; kind: FigureKind; opacity: number }> {
  const out: Array<{ a: Vec3; b: Vec3; kind: FigureKind; opacity: number }> = [];
  for (const c of data.constellations) {
    for (const line of c.lines) {
      for (let i = 1; i < line.length; i++) {
        out.push({
          a: toEcl(eqDir(line[i - 1]![0], line[i - 1]![1])),
          b: toEcl(eqDir(line[i]![0], line[i]![1])),
          kind: c.zodiac ? 'zodiacFigures' : 'figures',
          opacity: c.zodiac ? 0.6 : 0.32,
        });
      }
    }
  }
  for (let l = 0; l < 360; l += 2) {
    out.push({ a: eclDir(l, 0), b: eclDir(l + 2, 0), kind: 'ecliptic', opacity: 0.55 });
    for (const lat of [8, -8]) out.push({ a: eclDir(l, lat), b: eclDir(l + 2, lat), kind: 'signs', opacity: 0.22 });
  }
  for (let k = 0; k < 12; k++) for (let b = -8; b < 8; b += 2) out.push({ a: eclDir(k * 30, b), b: eclDir(k * 30, b + 2), kind: 'signs', opacity: 0.22 });
  for (let l = 0; l < 360; l += 1.5) {
    if (Math.floor(l / 3) % 2 === 0) out.push({ a: galToEcl(galDir(l, 0)), b: galToEcl(galDir(l + 1.5, 0)), kind: 'galactic', opacity: 0.5 });
  }
  for (const l of [0, 90, 180, 270]) {
    for (const r of [1.6, l === 0 ? 3.2 : 0.6]) {
      for (let k = 0; k < 48; k++) {
        const a0 = (k / 48) * 2 * Math.PI, a1 = ((k + 1) / 48) * 2 * Math.PI;
        out.push({
          a: galToEcl(galDir(l + r * Math.cos(a0), r * Math.sin(a0))),
          b: galToEcl(galDir(l + r * Math.cos(a1), r * Math.sin(a1))),
          kind: 'galactic',
          opacity: 0.5,
        });
      }
    }
  }
  return out;
}

/** Every name on the sky (ecliptic directions). */
export function skyMarks(data: FigureData): Array<{ dir: Vec3; text: string; kind: MarkKind }> {
  return [
    ...data.names.map((s) => ({ dir: toEcl(eqDir(s.ra, s.dec)), text: s.name, kind: 'star' as const })),
    ...data.constellations.map((c) => ({ dir: toEcl(eqDir(c.ra, c.dec)), text: c.name, kind: c.zodiac ? ('zodiacFigure' as const) : ('constellation' as const) })),
    ...SIGNS.map(([glyph, name], k) => ({ dir: eclDir(k * 30 + 15, 9.5), text: `${glyph} ${name}`, kind: 'sign' as const })),
    ...GALACTIC_MARKS.map(([l, text]) => ({ dir: galToEcl(galDir(l, 3.5)), text, kind: 'galactic' as const })),
  ];
}

/** Which segments and names show for these toggles (the same rule in the calendar and Fly mode). */
export function figureShown(kind: FigureKind | MarkKind, o: { constellations: boolean; zodiac: boolean; galactic: boolean }): boolean {
  switch (kind) {
    case 'figures':
    case 'constellation':
    case 'star':
      return o.constellations;
    case 'zodiacFigures':
    case 'zodiacFigure':
      return o.constellations || o.zodiac;
    case 'ecliptic':
    case 'signs':
    case 'sign':
      return o.zodiac;
    case 'galactic':
      return o.galactic;
  }
}
