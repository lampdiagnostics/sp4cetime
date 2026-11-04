/**
 * The nearest galaxies (0.4.5; docs/SPHERES.md §9, ADR-0021): about 500 from the Updated
 * Nearby Galaxy Catalog (public/sky/galaxies.json, built by scripts/build_galaxies.py),
 * each a sphere carried on the universe's orbit skin: a track (direction and distance)
 * from the Milky Way's centre, scaled by the universe's expansion skin (cosmology.ts)
 * between groups that gravity does not hold together.
 *
 * Pure: reading the file, positions, groups, the web ruled in light years, expansion.
 */
import { KM_PER_PARSEC } from './constants';
import { type Cosmology, scaleFactor } from './cosmology';
import { KM_PER_LIGHT_YEAR, type Vec3 } from './geometry';
import { eqDir, toEcl } from './skyfigures';

export const KM_PER_MPC = KM_PER_PARSEC * 1e6;
const LY_PER_MPC = (KM_PER_MPC / KM_PER_LIGHT_YEAR);

export interface Galaxy {
  readonly name: string;
  readonly ra: number;
  readonly dec: number;
  readonly distMpc: number;
  /** How the distance was measured (the catalogue's code: TRGB, Cep, SBF, TF, h …). */
  readonly method: string;
  readonly diameterKpc: number | null;
  /** RC3 T-type: −5 elliptical … 0 lenticular … 1–8 spiral … 9–10 irregular. */
  readonly type: number | null;
  readonly absB: number | null;
  /** Tidal index Θ1: above 0, inside the main neighbour's sphere of influence (a group member). */
  readonly theta1: number | null;
  readonly neighbour: string | null;
  /** Heliocentric position today, ecliptic J2000, km. */
  readonly pos: Vec3;
}

export class GalaxyFileError extends Error {}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const numOrNull = (x: unknown): number | null => (isNum(x) ? x : null);

/** Read public/sky/galaxies.json (validated like a theme or a path). */
export function parseGalaxies(x: unknown): Galaxy[] {
  if (typeof x !== 'object' || x === null) throw new GalaxyFileError('not a galaxy file');
  const rows = (x as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) throw new GalaxyFileError('no rows');
  const out: Galaxy[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 10) continue;
    const [name, ra, dec, d, method, diam, type, absB, theta1, neighbour] = r as unknown[];
    if (typeof name !== 'string' || !isNum(ra) || !isNum(dec) || !isNum(d) || d <= 0 || d > 100) continue;
    if (Math.abs(dec) > 90 || ra < 0 || ra >= 360) continue;
    const dir = toEcl(eqDir(ra, dec));
    const km = d * KM_PER_MPC;
    out.push({
      name: name.slice(0, 40),
      ra,
      dec,
      distMpc: d,
      method: typeof method === 'string' ? method.slice(0, 12) : '',
      diameterKpc: numOrNull(diam) !== null && (diam as number) > 0 ? (diam as number) : null,
      type: numOrNull(type),
      absB: numOrNull(absB),
      theta1: numOrNull(theta1),
      neighbour: typeof neighbour === 'string' && neighbour ? neighbour.slice(0, 40) : null,
      pos: [dir[0] * km, dir[1] * km, dir[2] * km],
    });
  }
  return out;
}

/** The six Local Group galaxies drawn with their own looks (localGroup.ts), by catalogue name. */
const HAND_DRAWN = new Set(['messier031', 'messier032', 'messier033', 'ngc0205', 'lmc', 'smc']);
export const isHandDrawn = (name: string): boolean => HAND_DRAWN.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
const isMilkyWay = (name: string | null): boolean => !!name && /^(milky ?way|mw|galaxy)$/i.test(name.trim());

/** Everything within this distance of the Milky Way is the Local Group, held together by gravity (its zero-velocity surface is ~1 Mpc). */
export const LOCAL_GROUP_MPC = 1.0;

export interface GalaxyWeb {
  /** Each galaxy's group: the index of its lead (the brightest member), or −1 for the Local Group (the Milky Way's). */
  readonly lead: readonly number[];
  /** Group lines: each member to its main neighbour (indices). */
  readonly members: ReadonlyArray<readonly [number, number]>;
  /** Bridges: the shortest lines joining every group into one web (a minimum spanning tree over the leads; −1 is the Milky Way). */
  readonly bridges: ReadonlyArray<readonly [number, number]>;
}

/** Groups from the catalogue's neighbours and tidal index; bridges by Prim's minimum spanning tree. */
export function galaxyWeb(gs: readonly Galaxy[], milkyWay: Vec3): GalaxyWeb {
  const n = gs.length;
  const byName = new Map(gs.map((g, i) => [g.name.toLowerCase(), i]));
  const parent = Array.from({ length: n + 1 }, (_, i) => i); // index n is the Milky Way
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const members: Array<[number, number]> = [];
  gs.forEach((g, i) => {
    const near = Math.hypot(g.pos[0] - milkyWay[0], g.pos[1] - milkyWay[1], g.pos[2] - milkyWay[2]) / KM_PER_MPC < LOCAL_GROUP_MPC;
    if (near || (isMilkyWay(g.neighbour) && (g.theta1 ?? 0) > 0)) join(i, n);
    if (g.neighbour && !isMilkyWay(g.neighbour) && (g.theta1 ?? -1) > 0) {
      const j = byName.get(g.neighbour.toLowerCase());
      if (j !== undefined) {
        join(i, j);
        members.push([i, j]);
      }
    }
  });
  // Leads: the brightest member (lowest absolute magnitude; else the largest; else the first).
  const score = (g: Galaxy): number => (g.absB ?? 0) - (g.diameterKpc ?? 0) * 1e-3;
  const bestOf = new Map<number, number>();
  gs.forEach((g, i) => {
    const r = find(i);
    const b = bestOf.get(r);
    if (b === undefined || score(g) < score(gs[b]!)) bestOf.set(r, i);
  });
  const mwRoot = find(n);
  const lead = gs.map((_, i) => (find(i) === mwRoot ? -1 : bestOf.get(find(i))!));
  // Bridges: Prim's tree over the leads, starting from the Milky Way.
  const nodes = [-1, ...[...new Set(lead.filter((l) => l >= 0))]];
  const at = (k: number): Vec3 => (k < 0 ? milkyWay : gs[k]!.pos);
  const inTree = new Set<number>([-1]);
  const best = new Map<number, { d: number; from: number }>();
  const dist = (a: number, b: number): number => {
    const p = at(a), q = at(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  for (const k of nodes) if (k !== -1) best.set(k, { d: dist(-1, k), from: -1 });
  const bridges: Array<[number, number]> = [];
  while (best.size) {
    let pick = -2, bd = Infinity;
    for (const [k, v] of best) if (v.d < bd) (bd = v.d), (pick = k);
    const from = best.get(pick)!.from;
    best.delete(pick);
    inTree.add(pick);
    bridges.push([from, pick]);
    for (const [k, v] of best) {
      const d = dist(pick, k);
      if (d < v.d) best.set(k, { d, from: pick });
    }
  }
  return { lead, members, bridges };
}

/**
 * Where each galaxy is at a moment, heliocentric km: today's place, with the space between
 * groups stretched by a(t) about the Milky Way's centre (`milkyWay`) and each group kept
 * whole around its lead; the Local Group never stretches. `cosmology` null: today's places.
 */
export function placesAt(gs: readonly Galaxy[], web: GalaxyWeb, milkyWay: Vec3, years: number, cosmology: Cosmology | null): Vec3[] {
  const a = cosmology ? scaleFactor(cosmology, years) : 1;
  if (a === 1) return gs.map((g) => g.pos);
  return gs.map((g, i) => {
    const l = web.lead[i]!;
    if (l < 0) return g.pos;
    const lp = gs[l]!.pos;
    // The lead's distance from the Milky Way's centre scales by a; the member keeps its offset from the lead.
    return [0, 1, 2].map((k) => milkyWay[k]! + (lp[k]! - milkyWay[k]!) * a + (g.pos[k]! - lp[k]!)) as unknown as Vec3;
  });
}

/** A round step for marks along the web: 1, 2 or 5 × a power of ten light years, about `target` apart. */
export function markStepLy(target: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, target))));
  const m = target / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Marks every `stepLy` along a line from p to q (not at the ends), km positions. */
export function marksAlong(p: Vec3, q: Vec3, stepLy: number, max = 60): Vec3[] {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const step = stepLy * KM_PER_LIGHT_YEAR;
  const n = Math.min(max, Math.floor(len / step - 1e-9));
  return Array.from({ length: Math.max(0, n) }, (_, k) => {
    const f = ((k + 1) * step) / len;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f] as Vec3;
  });
}

/** "2.4 million light years" (for a length in km). */
export function formatLy(km: number): string {
  const ly = km / KM_PER_LIGHT_YEAR;
  if (ly >= 1e6) return `${(ly / 1e6).toLocaleString('en-US', { maximumSignificantDigits: 2 })} million light years`;
  return `${ly.toLocaleString('en-US', { maximumSignificantDigits: 2 })} light years`;
}

/** The kind of disc to draw for a type. */
export function galaxyKind(type: number | null): 'spiral' | 'elliptical' | 'irregular' {
  if (type === null) return 'irregular';
  if (type <= -1) return 'elliptical';
  if (type >= 9) return 'irregular';
  return 'spiral';
}

/** Distance methods measured star by star (good to 5–10%), as against estimates from speed or brightness. */
const PRECISE = /trgb|cep|rr|sbf|mem|sn|maser|eb|hb|pnlf|bs|rgb/i;

/** A catalogue name as people write it: MESSIER081 → M81, NGC0253 → NGC 253, IC0342 → IC 342. */
export function displayName(name: string): string {
  const m = /^(MESSIER|NGC|IC|UGC|ESO|PGC)0*(\d.*)$/.exec(name.trim());
  if (!m) return name;
  return m[1] === 'MESSIER' ? `M${m[2]}` : `${m[1]} ${m[2]}`;
}

/** The galaxy's honest label: where its distance came from, and that we see it as it was. */
export function galaxyText(g: Galaxy): string {
  const ly = g.distMpc * LY_PER_MPC;
  const how = PRECISE.test(g.method) ? `distance ${g.method || 'measured'}, ±5–10%` : g.method === 'h' || g.method === 'v' ? 'distance from its speed: rough' : `distance ${g.method || 'estimated'}: rough`;
  return `${displayName(g.name)} · ${(ly / 1e6).toLocaleString('en-US', { maximumSignificantDigits: 2 })} million light years · seen as it was ${(ly / 1e6).toLocaleString('en-US', { maximumSignificantDigits: 2 })} million years ago · ${how}`;
}
