/**
 * Paths: presentations through time and space, Prezi-style (ADR-0017). A path is a list
 * of points; each point is exactly what was on screen when Return was pressed: the view,
 * the present and how time was running, the calendar's camera, the 3D camera, the look
 * (theme, window, what is drawn, which boxes show) and an optional caption.
 *
 * Pure data and maths only: the schema, its validation for `.sp4ce.json` files, point
 * names, and the curve a flight through time follows.
 */
import { BODIES, type BodyId } from './bodies';
import type { Vec3 } from './geometry';
import { PLANET_IDS, type PlanetId } from './planets';
import { addSeconds, diffSeconds, makeTime, type Time } from './time';
import { MAX_SECONDS_PER_PIXEL, MIN_SECONDS_PER_PIXEL } from './constants';

/** Limits a file's numbers must keep to (anything beyond them is not a view the app can show). */
const MAX_RATE = 3_155_760_000; // a century each second, the fastest speed offered
const MAX_DAYS = 2e12; // far beyond the Sun's life (±5 Gyr ≈ ±1.8e12 days)
const MAX_KM = 3e21; // beyond the nearby galaxies (about 100 Mpc; the catalogue reaches 7.6 Mpc, the view stands 16 Mpc out)
const clampNum = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export type PointView = 'calendar' | 'fly' | 'galaxy';

/** The calendar's camera: its offset from the present, zoom, turn, size and where the Sun sits. */
export interface CalendarView {
  /** View centre minus the present (an interval). */
  readonly offset: Time;
  readonly secondsPerPixel: number;
  readonly roll: number;
  readonly yaw: number;
  readonly spaceZoom: number;
  readonly panY: number;
}

/** The 3D camera, anchored on a body so it can be put back at any moment. */
export interface FlyState {
  readonly anchor: BodyId;
  readonly frame: 'inertial' | 'body';
  /** Offset from the anchor, km (in the anchor's axes when frame = 'body'). */
  readonly rel: Vec3;
  /** Orientation, as a quaternion x, y, z, w. */
  readonly quat: readonly [number, number, number, number];
  /** Vertical field of view, degrees. */
  readonly fov: number;
  /** Which way is up for flying (world, unit). */
  readonly up: Vec3;
}

/** How it looks: everything on screen that is not a camera. */
/** A Starsigns chart shown on the sky: a place's horizon and its 12 houses (0.4.0). */
export interface ChartLook {
  /** Degrees, north +. */
  readonly lat: number;
  /** Degrees, east +. */
  readonly lon: number;
  readonly system: 'whole' | 'equal';
  /** The place's name, for labels ("Winnipeg"). */
  readonly place: string;
  /**
   * Standing on the ground there (0.4.2): a field ringed by trees, a flat silhouette, drawn under the
   * viewer near the place (an illustration, not a map), fading out with height; with Earth
   * see-through it drops away from under the viewer's feet.
   */
  readonly ground?: boolean;
  /** The moment as the person entered it, local time ("14 July 1985, 3:20 pm"), for the place-and-time label (0.4.5). */
  readonly when?: string;
}

export interface PointLook {
  readonly themeId: string;
  readonly round: boolean;
  /** 0 everything showing; 1 no boxes; 2 no text at all (H or the eye). */
  readonly chrome: 0 | 1 | 2;
  readonly planets: readonly PlanetId[];
  readonly moon: boolean;
  readonly rings: boolean;
  readonly labels: boolean;
  readonly spirals: boolean;
  readonly timeGrid: boolean;
  readonly distanceGrid: boolean;
  readonly constellations: boolean;
  readonly zodiac: boolean;
  readonly galactic: boolean;
  /** Earth's line skin in 3D (coastlines, lakes, borders); 0.4.0, so older files take the default. */
  readonly coastlines: boolean;
  /** A Starsigns chart (horizon and houses) on the sky in 3D, or none; 0.4.0. */
  readonly chart: ChartLook | null;
  /** One body picked out (it pulses and its name stands out), or none; 0.4.0. */
  readonly highlight: BodyId | null;
  /** Earth see-through (Starsigns' last pose): standing at the place as if the planet were not there, the chart wheel around the sky overhead; 0.4.0. */
  readonly seeThrough: boolean;
  readonly strobe: boolean;
  readonly strobeSteps: number;
  readonly focus: 'sun' | PlanetId;
  readonly measure: 'near' | 'sun' | 'galaxy';
  /** The barycentre: the Sun's wobble around the solar system's centre of mass; 0.5.0, so older files take the default (off). */
  readonly barycentre: boolean;
  /** The galaxy web ruled in light years; 0.4.5, so older files take the default (on). */
  readonly galaxyWeb: boolean;
  /** The universe's expansion skin (ΛCDM); 0.4.5, default on. */
  readonly expansion: boolean;
  /** Teaching option: the matter-only universe in place of ΛCDM; 0.4.5, default off. */
  readonly massOnly: boolean;
}

export interface PathPoint {
  readonly view: PointView;
  /** The present (the Sun's moment) when the point was set. */
  readonly present: Time;
  /** Speed and direction of time (seconds per second), and whether it was running. */
  readonly speed: number;
  readonly playing: boolean;
  readonly calendar: CalendarView;
  /** The 3D camera (null if 3D had never been opened). */
  readonly fly: FlyState | null;
  readonly look: PointLook;
  readonly caption: string;
  /** Written when the point was set, for its box: where, and which way it faces. */
  readonly where: string;
  readonly facing: string;
  /** Seconds to stay here when the path plays by itself (Shift, ▶ Go); a default if not given. 0.4.0. */
  readonly pause?: number;
  /** What is heard at the point (0.4.2): silence, or a soft white-noise bed. */
  readonly sound?: PointSound;
  /** The clock caption's time zone, minutes ahead of UTC (0.4.5; Starsigns: the place's); absent: this device's. */
  readonly zone?: number;
}

export type PointSound = 'silence' | 'noise';

/** A point's sound from a file: 'field' (the first 0.4.2 build, crickets) is read as the noise bed that replaced it. */
function parseSound(x: unknown, where: string): PointSound | undefined {
  if (x === undefined || x === 'silence') return undefined;
  if (x === 'noise' || x === 'field') return 'noise';
  fail(where, 'sound must be "silence" or "noise"');
}

export interface Path {
  readonly id: string;
  readonly name: string;
  /** ISO date and time it was started. */
  readonly created: string;
  readonly points: readonly PathPoint[];
  /** Its last point is END. */
  readonly finished: boolean;
}

/**
 * The file format, `.sp4ce.json`: one format for downloads, uploads, the app's example
 * paths and (later) the Library. Version 2 is light and readable: a name and a list of
 * points (view, moment, place, mode), numbers rounded to what the eye can see, the look
 * only where it differs from the app's default, and a line of plain words per point.
 */
export const SP4CE_VERSION = 2;

/** The look a new visit opens with; a file lists only what differs from it. */
export const DEFAULT_LOOK: PointLook = {
  themeId: 'dark', round: true, chrome: 0, planets: ['mercury', 'venus', 'earth', 'mars'], moon: true, rings: true,
  labels: true, spirals: true, timeGrid: true, distanceGrid: true, constellations: true, zodiac: true, galactic: true, coastlines: true, chart: null, highlight: null, seeThrough: false,
  strobe: false, strobeSteps: 5.2, focus: 'sun', measure: 'near', barycentre: false, galaxyWeb: true, expansion: true, massOnly: false,
};

/** One point as written in a file (version 2). */
export interface FilePoint {
  readonly view: PointView;
  /** Plain words: when, where, which way (written for people; ignored on reading). */
  readonly when?: string;
  readonly where?: string;
  readonly facing?: string;
  readonly caption?: string;
  /** Seconds to stay when playing by itself. */
  readonly pause?: number;
  /** What is heard (absent: silence). */
  readonly sound?: PointSound;
  /** The clock caption's time zone, minutes ahead of UTC (absent: the viewer's own). */
  readonly zone?: number;
  /** The present: [whole days since 2000-01-01 00:00 UTC, seconds into the day]. */
  readonly t: readonly [number, number];
  /** Time running: seconds per second (0 = paused). */
  readonly rate: number;
  /** The calendar: offset of the view from the present [days, s], seconds per pixel, roll, yaw (radians), size, the Sun's vertical offset (px). */
  readonly cal: { readonly off: readonly [number, number]; readonly spp: number; readonly roll: number; readonly yaw: number; readonly size: number; readonly y: number };
  /** The 3D camera (Fly and galaxy points only): anchor body, frame, offset (km), orientation (quaternion), view width (°), up. */
  readonly cam?: { readonly on: string; readonly frame: 'inertial' | 'body'; readonly km: readonly number[]; readonly q: readonly number[]; readonly fov: number; readonly up: readonly number[] };
  /** Only what differs from DEFAULT_LOOK. */
  readonly look?: Partial<PointLook>;
}
export interface Sp4ceFile {
  readonly sp4ce: 'path';
  readonly version: typeof SP4CE_VERSION;
  readonly name: string;
  readonly created?: string;
  readonly finished: boolean;
  readonly points: readonly FilePoint[];
}

/** START, POINT 1, POINT 2 … and END (the last point of a finished path). */
export function pointLabel(i: number, n: number, finished: boolean): string {
  if (i === 0) return finished && n === 1 ? 'START · END' : 'START';
  if (finished && i === n - 1) return 'END';
  return `POINT ${i}`;
}

// --- Validation -------------------------------------------------------------------

export class PathError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
function fail(where: string, what: string): never {
  throw new PathError(`${where}: ${what}`);
}
function num(o: Obj, k: string, where: string, check: (x: number) => boolean = () => true): number {
  const x = o[k];
  if (typeof x !== 'number' || !Number.isFinite(x) || !check(x)) fail(where, `${k} must be a valid number`);
  return x;
}
function bool(o: Obj, k: string, where: string): boolean {
  const x = o[k];
  if (typeof x !== 'boolean') fail(where, `${k} must be true or false`);
  return x;
}
function str(o: Obj, k: string, where: string, max = 2000): string {
  const x = o[k];
  if (typeof x !== 'string' || x.length > max) fail(where, `${k} must be text (at most ${max} characters)`);
  // Control characters and lone surrogates are dropped: they cannot be shown, and they would break a capture's picture of the boxes.
  return x.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function oneOf<T extends string | number>(o: Obj, k: string, where: string, options: readonly T[]): T {
  const x = o[k];
  if (!options.includes(x as T)) fail(where, `${k} must be one of ${options.join(', ')}`);
  return x as T;
}
function obj(o: Obj, k: string, where: string): Obj {
  const x = o[k];
  if (!isObj(x)) fail(where, `${k} is missing`);
  return x;
}
function vec(x: unknown, n: number, where: string, k: string): number[] {
  if (!Array.isArray(x) || x.length !== n || !x.every((v) => typeof v === 'number' && Number.isFinite(v))) fail(where, `${k} must be ${n} numbers`);
  return x as number[];
}
function time(x: unknown, where: string, k: string): Time {
  if (!isObj(x)) fail(where, `${k} must be a time { day, sec }`);
  const day = num(x, 'day', `${where} ${k}`, (d) => Number.isInteger(d) && Math.abs(d) <= MAX_DAYS);
  const sec = num(x, 'sec', `${where} ${k}`);
  return makeTime(day, sec);
}
const BODY_IDS = BODIES.map((b) => b.id);

function parseCalendar(o: Obj, where: string): CalendarView {
  return {
    offset: time(o.offset, where, 'offset'),
    secondsPerPixel: clampNum(num(o, 'secondsPerPixel', where, (x) => x > 0), MIN_SECONDS_PER_PIXEL, MAX_SECONDS_PER_PIXEL),
    roll: num(o, 'roll', where),
    yaw: num(o, 'yaw', where),
    spaceZoom: clampNum(num(o, 'spaceZoom', where, (x) => x > 0), 0.1, 500),
    panY: clampNum(num(o, 'panY', where), -5000, 5000),
  };
}

function parseFly(o: Obj, where: string): FlyState {
  const q = vec(o.quat, 4, where, 'quat');
  const ql = Math.hypot(...q);
  if (ql < 1e-6) fail(where, 'quat must not be zero');
  return {
    anchor: oneOf(o, 'anchor', where, BODY_IDS),
    frame: oneOf(o, 'frame', where, ['inertial', 'body'] as const),
    rel: (() => {
      const r = vec(o.rel, 3, where, 'rel');
      if (Math.hypot(r[0]!, r[1]!, r[2]!) > MAX_KM) fail(where, 'rel is too far away');
      return r as unknown as Vec3;
    })(),
    quat: q.map((v) => v / ql) as unknown as FlyState['quat'],
    fov: num(o, 'fov', where, (x) => x > 0 && x < 180),
    up: (() => {
      const u = vec(o.up, 3, where, 'up');
      const l = Math.hypot(u[0]!, u[1]!, u[2]!);
      if (l < 1e-6) fail(where, 'up must not be zero');
      return u.map((v) => v / l) as unknown as Vec3;
    })(),
  };
}

function parseChart(o: Obj, where: string): ChartLook {
  return {
    lat: num(o, 'lat', where, (x) => Math.abs(x) <= 90),
    lon: num(o, 'lon', where, (x) => Math.abs(x) <= 180),
    system: oneOf(o, 'system', where, ['whole', 'equal'] as const),
    place: str(o, 'place', where, 80),
    ...(o.ground === true && { ground: true }),
    ...(typeof o.when === 'string' && o.when && { when: str(o, 'when', where, 80) }),
  };
}

function parseLook(o: Obj, where: string): PointLook {
  const planets = o.planets;
  if (!Array.isArray(planets) || !planets.every((p) => PLANET_IDS.includes(p as PlanetId))) fail(where, 'planets must be planet names');
  return {
    themeId: str(o, 'themeId', where, 40),
    round: bool(o, 'round', where),
    chrome: oneOf(o, 'chrome', where, [0, 1, 2] as const),
    planets: PLANET_IDS.filter((p) => planets.includes(p)),
    moon: bool(o, 'moon', where),
    rings: bool(o, 'rings', where),
    labels: bool(o, 'labels', where),
    spirals: bool(o, 'spirals', where),
    timeGrid: bool(o, 'timeGrid', where),
    distanceGrid: bool(o, 'distanceGrid', where),
    constellations: bool(o, 'constellations', where),
    zodiac: bool(o, 'zodiac', where),
    galactic: bool(o, 'galactic', where),
    // New in 0.4.0: files written before it take the default.
    coastlines: o.coastlines === undefined ? DEFAULT_LOOK.coastlines : bool(o, 'coastlines', where),
    chart: o.chart === undefined || o.chart === null ? null : parseChart(obj(o, 'chart', where), `${where} chart`),
    highlight: o.highlight === undefined || o.highlight === null ? null : oneOf(o, 'highlight', where, BODIES.map((b) => b.id)),
    seeThrough: o.seeThrough === undefined ? false : bool(o, 'seeThrough', where),
    strobe: bool(o, 'strobe', where),
    strobeSteps: num(o, 'strobeSteps', where, (x) => x >= 1 && x <= 24),
    focus: oneOf(o, 'focus', where, ['sun', ...PLANET_IDS] as const),
    measure: oneOf(o, 'measure', where, ['near', 'sun', 'galaxy'] as const),
    barycentre: o.barycentre === undefined ? DEFAULT_LOOK.barycentre : bool(o, 'barycentre', where),
    galaxyWeb: o.galaxyWeb === undefined ? DEFAULT_LOOK.galaxyWeb : bool(o, 'galaxyWeb', where),
    expansion: o.expansion === undefined ? DEFAULT_LOOK.expansion : bool(o, 'expansion', where),
    massOnly: o.massOnly === undefined ? DEFAULT_LOOK.massOnly : bool(o, 'massOnly', where),
  };
}

export function parsePoint(x: unknown, where = 'point'): PathPoint {
  if (!isObj(x)) fail(where, 'not a point');
  return {
    view: oneOf(x, 'view', where, ['calendar', 'fly', 'galaxy'] as const),
    present: time(x.present, where, 'present'),
    speed: clampNum(num(x, 'speed', where), -MAX_RATE, MAX_RATE),
    playing: bool(x, 'playing', where),
    calendar: parseCalendar(obj(x, 'calendar', where), `${where} calendar`),
    fly: x.fly === null || x.fly === undefined ? null : parseFly(obj(x, 'fly', where), `${where} 3D camera`),
    look: parseLook(obj(x, 'look', where), `${where} look`),
    caption: typeof x.caption === 'string' ? str(x, 'caption', where) : '',
    where: typeof x.where === 'string' ? str(x, 'where', where, 400) : '',
    facing: typeof x.facing === 'string' ? str(x, 'facing', where, 400) : '',
    ...(typeof x.pause === 'number' && Number.isFinite(x.pause) && x.pause >= 0 && x.pause <= 120 ? { pause: x.pause } : {}),
    ...(parseSound(x.sound, where) && { sound: parseSound(x.sound, where)! }),
    ...(typeof x.zone === 'number' && Number.isInteger(x.zone) && Math.abs(x.zone) <= 18 * 60 ? { zone: x.zone } : {}),
  };
}

export function parsePath(x: unknown): Path {
  if (!isObj(x)) fail('path', 'not a path');
  const points = x.points;
  if (!Array.isArray(points) || points.length === 0) fail('path', 'it has no points');
  if (points.length > 500) fail('path', 'too many points (at most 500)');
  const name = str(x, 'name', 'path', 120).trim();
  return {
    id: (() => {
      const id = str(x, 'id', 'path', 80);
      // Example paths are the app's own (read-only); a saved path can never claim to be one.
      return id && !id.startsWith('example:') ? id : newPathId();
    })(),
    name: name || 'Untitled path',
    created: typeof x.created === 'string' ? str(x, 'created', 'path', 40) : '',
    points: points.map((p, i) => parsePoint(p, i === 0 ? 'START' : `POINT ${i}`)),
    finished: typeof x.finished === 'boolean' ? x.finished : true,
  };
}

const sig = (x: number, n: number): number => (x === 0 ? 0 : Number(x.toPrecision(n)));
const dec = (x: number, n: number): number => Math.round(x * 10 ** n) / 10 ** n || 0;

/** A path as a light, readable file. `when` gives each point's moment in words (formatTime). */
export function toSp4ceFile(path: Path, when: (t: Time) => string = () => ''): Sp4ceFile {
  return {
    sp4ce: 'path',
    version: SP4CE_VERSION,
    name: path.name,
    ...(path.created && { created: path.created }),
    finished: path.finished,
    points: path.points.map((p): FilePoint => {
      const look: Record<string, unknown> = {};
      for (const k of Object.keys(DEFAULT_LOOK) as Array<keyof PointLook>) {
        if (JSON.stringify(p.look[k]) !== JSON.stringify(DEFAULT_LOOK[k])) look[k] = p.look[k];
      }
      const c = p.calendar;
      const f = p.fly;
      const w = when(p.present);
      return {
        view: p.view,
        ...(w && { when: w }),
        ...(p.where && { where: p.where }),
        ...(p.facing && { facing: p.facing }),
        ...(p.caption && { caption: p.caption }),
        ...(p.pause !== undefined && { pause: Math.round(p.pause * 10) / 10 }),
        ...(p.sound && p.sound !== 'silence' && { sound: p.sound }),
        ...(p.zone !== undefined && { zone: p.zone }),
        t: [p.present.day, dec(p.present.sec, 3)],
        rate: p.playing ? p.speed : 0,
        cal: { off: [c.offset.day, dec(c.offset.sec, 3)], spp: sig(c.secondsPerPixel, 6), roll: dec(c.roll, 6), yaw: dec(c.yaw, 6), size: sig(c.spaceZoom, 6), y: dec(c.panY, 1) },
        ...(p.view !== 'calendar' && f && {
          cam: { on: f.anchor, frame: f.frame, km: f.rel.map((v) => sig(v, 12)), q: f.quat.map((v) => dec(v, 7)), fov: dec(f.fov, 2), up: f.up.map((v) => dec(v, 6)) },
        }),
        ...(Object.keys(look).length > 0 && { look: look as Partial<PointLook> }),
      };
    }),
  };
}

/** A version 2 point back into a full point (validated as any point is). */
function fromFilePoint(x: unknown, where: string): PathPoint {
  if (!isObj(x)) fail(where, 'not a point');
  const t = vec(x.t, 2, where, 't');
  const cal = obj(x, 'cal', where);
  const off = vec(cal.off, 2, `${where} cal`, 'off');
  const rate = num(x, 'rate', where);
  const cam = isObj(x.cam) ? x.cam : null;
  const lookIn = isObj(x.look) ? x.look : {};
  return parsePoint(
    {
      view: x.view,
      present: { day: t[0], sec: t[1] },
      speed: rate === 0 ? 1 : rate,
      playing: rate !== 0,
      calendar: { offset: { day: off[0], sec: off[1] }, secondsPerPixel: cal.spp, roll: cal.roll, yaw: cal.yaw, spaceZoom: cal.size, panY: cal.y },
      fly: cam && { anchor: cam.on, frame: cam.frame, rel: cam.km, quat: cam.q, fov: cam.fov, up: cam.up },
      look: { ...DEFAULT_LOOK, ...lookIn },
      caption: typeof x.caption === 'string' ? x.caption : '',
      where: typeof x.where === 'string' ? x.where : '',
      facing: typeof x.facing === 'string' ? x.facing : '',
      pause: x.pause,
      ...(x.sound !== undefined && { sound: x.sound }),
      ...(x.zone !== undefined && { zone: x.zone }),
    },
    where,
  );
}

/** Read a `.sp4ce.json` file's contents (already JSON-parsed): version 2, or the first (0.3.0) layout. */
export function parseSp4ceFile(x: unknown): Path {
  if (!isObj(x)) throw new PathError('This is not a sp4cetime file.');
  if (x.format === 'sp4ce' && x.version === 1) {
    if (x.kind !== 'path') throw new PathError('This sp4cetime file does not hold a path.');
    // An uploaded path is always a new one: it never replaces a path already saved here.
    return { ...parsePath(x.path), id: newPathId() };
  }
  if (x.sp4ce === undefined) throw new PathError('This is not a sp4cetime file.');
  if (x.sp4ce !== 'path') throw new PathError('This sp4cetime file does not hold a path.');
  if (typeof x.version !== 'number' || x.version > SP4CE_VERSION) throw new PathError('This file was made by a newer version of sp4cetime.');
  const pts = x.points;
  if (!Array.isArray(pts) || pts.length === 0) fail('path', 'it has no points');
  if (pts.length > 500) fail('path', 'too many points (at most 500)');
  const name = typeof x.name === 'string' ? str(x, 'name', 'path', 100_000).trim().slice(0, 120) : '';
  return {
    id: newPathId(),
    name: name || 'Untitled path',
    created: typeof x.created === 'string' ? x.created.slice(0, 40) : '',
    points: pts.map((p, i) => fromFilePoint(p, i === 0 ? 'START' : `POINT ${i}`)),
    finished: typeof x.finished === 'boolean' ? x.finished : true,
  };
}

export function newPathId(): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `path-${Date.now().toString(36)}-${r}`;
}

/** A file name for a path: "life-of-the-sun.sp4ce.json". */
export function pathFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'path'}.sp4ce.json`;
}

// --- Flights through time -----------------------------------------------------------

/**
 * Smooth and efficient zooming and panning (van Wijk and Nuij, 2003), along the line of
 * time: the view zooms out until both ends fit, glides, and zooms back in, so a jump of a
 * billion years reads as clearly as a jump of an hour. `w` is the span of time across the
 * view, seconds; `rho` sets how far it zooms out (√2 is the optimum they found).
 */
export interface ZoomPath {
  /** Length of the path in its own units; time to fly it is proportional. */
  readonly S: number;
  /** At s in [0, S]: the view centre and the span across. */
  at(s: number): { centre: Time; w: number };
}

const RHO = 1.4;

/** The 1-D path: distance from the start (signed toward the end) and width at s. */
function curve(d: number, w0: number, w1: number): { S: number; u: (s: number) => number; w: (s: number) => number } {
  const r2 = RHO * RHO;
  if (d < 1e-12 * Math.min(w0, w1)) {
    // Only a zoom (the time does not change, to well within the view): the width changes by equal factors.
    const k = Math.log(w1 / w0);
    const S = Math.abs(k) / RHO;
    return { S, u: (s) => (S === 0 ? 0 : (d * s) / S), w: (s) => (S === 0 ? w0 : w0 * Math.exp((k * s) / S)) };
  }
  // r_i = ln(−b_i + √(b_i² + 1)) = −asinh(b_i), which stays exact for huge b.
  const b0 = (w1 * w1 - w0 * w0 + r2 * r2 * d * d) / (2 * w0 * r2 * d);
  const b1 = (w1 * w1 - w0 * w0 - r2 * r2 * d * d) / (2 * w1 * r2 * d);
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / RHO;
  const c0 = Math.cosh(r0), s0 = Math.sinh(r0);
  return {
    S,
    u: (s) => (w0 / r2) * (c0 * Math.tanh(RHO * s + r0) - s0),
    w: (s) => (w0 * c0) / Math.cosh(RHO * s + r0),
  };
}

export function zoomPath(t0: Time, w0: number, t1: Time, w1: number): ZoomPath {
  const delta = diffSeconds(t1, t0);
  const d = Math.abs(delta);
  const sign = delta < 0 ? -1 : 1;
  const fwd = curve(d, w0, w1);
  // The same path flown backward, for the second half: positions near the end are then
  // measured from the end, so they keep their precision even after a jump of billions of years.
  const back = curve(d, w1, w0);
  const S = fwd.S;
  return {
    S,
    at(s) {
      const x = Math.max(0, Math.min(S, s));
      if (x <= S / 2) return { centre: addSeconds(t0, sign * fwd.u(x)), w: fwd.w(x) };
      const y = S - x;
      return { centre: addSeconds(t1, -sign * back.u(y)), w: back.w(y) };
    },
  };
}

/** How long a flight through time takes, ms: longer for longer paths, within reason. */
export function zoomPathMs(S: number): number {
  return S < 1e-6 ? 0 : Math.min(6500, Math.max(1100, 900 + 520 * S));
}

/** Smooth start and stop (sine ease in and out). */
export function easeInOut(k: number): number {
  const x = Math.max(0, Math.min(1, k));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** The shortest turn from angle a to b, radians (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Between two positive numbers by equal factors. */
export function logLerp(a: number, b: number, e: number): number {
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e);
}

/** The calendar's camera between two points, at e in [0, 1] (the offset, given separately). */
export function lerpCalendarTurn(a: CalendarView, b: CalendarView, e: number): Pick<CalendarView, 'roll' | 'yaw' | 'spaceZoom' | 'panY'> {
  return {
    roll: a.roll + angleDelta(a.roll, b.roll) * e,
    yaw: a.yaw + (b.yaw - a.yaw) * e,
    spaceZoom: logLerp(a.spaceZoom, b.spaceZoom, e),
    panY: a.panY + (b.panY - a.panY) * e,
  };
}

/** Is the jump in time between two moments big enough that 3D would blur (more than a month)? */
export const BIG_TIME_JUMP_S = 30 * 86_400;
export function isBigTimeJump(a: Time, b: Time): boolean {
  return Math.abs(diffSeconds(a, b)) > BIG_TIME_JUMP_S;
}
