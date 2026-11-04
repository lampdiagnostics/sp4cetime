/**
 * Draws one frame. Everything on screen is a pure function of
 * (camera, theme, now, view options): no accumulated state, so the same inputs
 * always draw the same picture (docs/adr/0003-canvas-2d.md).
 *
 * Paths (docs/adr/0008-simple-paths.md)
 * - Every coil is drawn at its true spacing: one turn per orbital period.
 * - Each coil is sampled at fixed points on its orbit (multiples of 2π/N, N a power
 *   of two), so the same points are used every frame and the shape cannot shimmer.
 * - When turns crowd closer than a few pixels, the coil fades into a shaded band
 *   whose brightness shows where the planet spends its time.
 */
import { type Camera, timeToX } from './camera';
import { EARTH_AGE_YEARS, MAX_TIME, MIN_TIME, SUN_GALACTIC_SPEED_KM_S, SYNODIC_MONTH_SECONDS } from './constants';
import {
  KM_PER_AU,
  makeScale,
  type Mat3,
  makeTrack,
  MOON_DISTANCE_KM,
  moonOffset,
  type Sample,
  type ScaleMode,
  type Track,
  viewMatrix,
  type Vec3,
  DEFAULT_ROLL,
  matMul,
  mul,
} from './geometry';
import { galacticAngle, moonPhase } from './models';
import { keplerKm } from './paths3d';
import { moonGeocentric } from './bodies';
import { lonOfDateFromVector, signOf, skyOfDate } from './houses';
import { orbitalPeriod, planetById, type PlanetId } from './planets';
import type { SkyStyle, Theme } from './theme';
import { focalFor } from './skymap';
import { distanceGrid, formatDistanceStep, generateTicks } from './ticks';
import { addSeconds, diffSeconds, fromYearsApprox, SECONDS_PER_DAY, SECONDS_PER_YEAR, type Time } from './time';
import { barycentreSmooth } from './barycentre';

export interface ViewOptions {
  /** Rotation about the line of travel, radians. */
  readonly roll: number;
  /** Rotation about the screen's vertical axis, radians (foreshortens the time axis). */
  readonly yaw: number;
  readonly scale: ScaleMode;
  readonly planets: readonly PlanetId[];
  readonly moon: boolean;
  /** Wireframe orbit circles around the Sun. */
  readonly rings: boolean;
  readonly labels: boolean;
  readonly round: boolean;
  /** Each body's path into past and future. */
  readonly spirals: boolean;
  readonly timeGrid: boolean;
  readonly distanceGrid: boolean;
  /** Magnification of space (orbit sizes), independent of the time zoom. 1 = fit. */
  readonly spaceZoom: number;
  /** The body the view is centred on. */
  readonly focus: 'sun' | PlanetId;
  /** Vertical position of the Sun's line, px from its default (the Sun can be dragged). */
  readonly panY: number;
  /** On the sky behind: constellation figures and names, the zodiac, the galaxy marks. */
  readonly constellations: boolean;
  readonly zodiac: boolean;
  readonly galactic: boolean;
  /** False: draw no text at all (names, time and space labels, the sky's names). */
  readonly text: boolean;
  /** Strobe: freeze the whole solar system's pose this many times a year (0 or absent: off). */
  readonly strobe?: number;
  /**
   * The barycentre (0.5.0 trial): the straight line is the solar system's centre of mass, and
   * the Sun and every path are offset by where the Sun sits from it at each moment. Sun-centred
   * only (seen from Earth the wobble cancels out, as it truly does).
   */
  readonly barycentre?: boolean;
}

/** What the sky shows, for the backdrop. */
export interface SkyOptions {
  readonly constellations: boolean;
  readonly zodiac: boolean;
  readonly galactic: boolean;
  /** Where the Sun and Moon are on the sky seen from Earth now, and which sign each is in. */
  readonly bodies?: ReadonlyArray<{ readonly dir: Vec3; readonly text: string; readonly glyph: string }>;
  /** Degrees the signs have slid from their J2000 places (precession and nutation to the viewed date). */
  readonly equinoxShift?: number;
}

export interface FrameInput {
  readonly cam: Camera;
  readonly theme: Theme;
  /** The real present moment. */
  readonly now: Time;
  readonly view: ViewOptions;
  /**
   * The real sky behind everything, once loaded (drawn by the app: it needs images).
   * `view` maps ecliptic directions into the view frame; the sky fills a disc of radius R.
   */
  readonly backdrop?: SkyBackdrop | null;
}

export interface SkyBackdrop {
  draw(
    ctx: CanvasRenderingContext2D,
    view: Mat3,
    cx: number,
    cy: number,
    focal: number,
    box: { x: number; y: number; w: number; h: number },
    style: SkyStyle,
    options: SkyOptions,
  ): void;
}

/** What the canvas needs back from a frame: where the Sun was drawn, for grabbing it. */
/** Bodies whose names can be clicked: the Sun, the planets, the Moon. */
export type LabelId = PlanetId | 'sun' | 'moon';

/** A body's name on screen, for clicking. */
export interface LabelBox {
  readonly id: LabelId;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A frozen pose's body on screen, and how long ago (seconds, negative) it was. */
export interface PoseHit {
  readonly x: number;
  readonly y: number;
  readonly dt: number;
}

export interface FrameResult {
  readonly labels: readonly LabelBox[];
  /** The strobe's frozen poses, for clicking: each body of each pose. */
  readonly poses: readonly PoseHit[];
  /** What the space grid says about itself ("Space grid · 2 million km between lines"), or ''. */
  readonly space: string;
  /** For the scale bar: the main lines' spacing, km (0: no grid), and how far apart they are, px. */
  readonly spaceKm: number;
  readonly spacePx: number;
  readonly sunX: number;
  readonly sunY: number;
}

export interface Layout {
  /** The viewed moment's x (screen centre) and the Sun line's y. */
  readonly cx: number;
  readonly cy: number;
  /** Radius the outermost chosen orbit is fitted to, px. */
  readonly fitR: number;
  /** Round window radius and centre, or null for full screen. */
  readonly clipR: number | null;
  readonly clipY: number;
  /** Baselines of the time labels (bottom) and the space-grid legend (top). */
  readonly labelY: number;
  readonly topY: number;
}

export function layout(cam: Camera, round: boolean, panY = 0): Layout {
  const W = cam.width;
  const H = cam.height;
  if (round) {
    const narrow = W < 600;
    const clipR = Math.max(60, Math.min(W, H) / 2 - (narrow ? 8 : 24));
    // Portrait phones: lift the window so the controls fit underneath it.
    const clipY = narrow ? Math.min(H / 2, 118 + clipR) : H / 2;
    return {
      cx: W / 2,
      cy: clipY + panY,
      fitR: clipR * 0.6,
      clipR,
      clipY,
      labelY: clipY + clipR * 0.76,
      topY: clipY - clipR * 0.72,
    };
  }
  const base = Math.round(H * 0.45);
  const fitR = Math.max(40, Math.min(H * 0.27, W * 0.3, 300));
  return {
    cx: W / 2,
    cy: base + panY,
    fitR,
    clipR: null,
    clipY: base,
    labelY: Math.min(H - 16, base + fitR + 40),
    topY: Math.max(24, base - fitR - 34),
  };
}

const TWO_PI = Math.PI * 2;
const PLANETS_FORM = fromYearsApprox(-EARTH_AGE_YEARS);

// --- When a coil is a coil, and when it is a band -----------------------------------

/** Below BAND_PX per turn a path is only a shaded band; above COIL_PX only a coil; between, both fade. */
const BAND_PX = 8;
const COIL_PX = 24;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How much of a path is drawn as a coil (1) versus a shaded band (0), from its px per turn. */
export function coilWeight(pxPerTurn: number): number {
  return smoothstep(BAND_PX, COIL_PX, pxPerTurn);
}

/** True when any chosen body's path is shown (partly) as a shaded band at this zoom. */
export function densePaths(planets: readonly PlanetId[], secondsPerPixel: number): boolean {
  return planets.some((id) => coilWeight(orbitalPeriod(planetById(id)) / secondsPerPixel) < 1);
}

/** Samples per turn: a power of two (so zooming only adds or removes in-between points). */
export function samplesPerTurn(pxPerTurn: number, radiusPx: number, min: number, max: number): number {
  const need = Math.max(min, pxPerTurn / 2, (TWO_PI * radiusPx) / 4);
  return Math.min(max, 2 ** Math.ceil(Math.log2(need)));
}

// --- Galactic background --------------------------------------------------------

interface Star {
  readonly r: number;
  readonly a: number;
  readonly size: number;
  readonly alpha: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const STARS: readonly Star[] = (() => {
  const rand = mulberry32(230);
  const stars: Star[] = [];
  for (let i = 0; i < 900; i++) {
    const inArm = i % 10 < 7;
    const r = inArm ? 0.06 + 0.94 * rand() ** 0.75 : rand();
    const a = inArm ? (i % 2) * Math.PI + 4.4 * r + (rand() - 0.5) * 0.55 * (1.2 - r) : rand() * TWO_PI;
    stars.push({ r, a, size: rand() < 0.08 ? 1.6 : 1, alpha: 0.25 + 0.75 * rand() });
  }
  return stars;
})();

function drawGalaxy(ctx: CanvasRenderingContext2D, f: FrameInput, L: Layout): void {
  const { cam, theme } = f;
  const spin = galacticAngle(cam.center);
  const radius = L.clipR ? L.clipR * 1.15 : Math.hypot(cam.width, cam.height) * 0.62;
  ctx.fillStyle = theme.galaxy;
  for (const s of STARS) {
    const a = s.a + spin;
    const x = L.cx + radius * s.r * Math.cos(a);
    const y = L.clipY + radius * s.r * Math.sin(a) * 0.38;
    if (x < -2 || x > cam.width + 2 || y < -2 || y > cam.height + 2) continue;
    ctx.globalAlpha = theme.galaxyAlpha * s.alpha;
    ctx.fillRect(x, y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

function verticals(ctx: CanvasRenderingContext2D, xs: readonly number[], H: number, color: string, dash: number[] = []): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (const x of xs) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, H);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- Paths ------------------------------------------------------------------------

/** A polyline split into the halves in front of and behind the line of travel. */
/**
 * A path as one continuous polyline, so it can be stroked once at a single,
 * even width and opacity. (Which side of the line of travel a point is on is
 * accepted for future use but no longer changes how the line is drawn.)
 */
class DepthPath {
  readonly all = new Path2D();
  private open = false;
  add(x: number, y: number, _isFront: boolean): void {
    if (this.open) this.all.lineTo(x, y);
    else this.all.moveTo(x, y);
    this.open = true;
  }
  break(): void {
    this.open = false;
  }
}

/** Margin around the screen, px: segments entirely beyond it are skipped. */
const KEEP = 40;
/** Upper bound on points evaluated per path per frame; beyond it sampling coarsens by powers of two. */
const MAX_POINTS = 200_000;

/** Is the segment a→b entirely outside the screen (plus margin)? */
export function segmentOff(ax: number, ay: number, bx: number, by: number, W: number, H: number): boolean {
  return (
    Math.max(ax, bx) < -KEEP || Math.min(ax, bx) > W + KEEP || Math.max(ay, by) < -KEEP || Math.min(ay, by) > H + KEEP
  );
}

/**
 * Walk k = kFrom..kTo, evaluating point(k), and add every segment that touches the
 * screen. A segment whose ends are both off screen but on opposite sides is kept,
 * so a curve crossing the whole screen between two samples is never dropped.
 */
function walk(kFrom: number, kTo: number, point: (k: number) => [number, number, boolean], W: number, H: number): DepthPath {
  const path = new DepthPath();
  if (kTo < kFrom) return path;
  let [px, py, pf] = point(kFrom);
  let open = false;
  for (let k = kFrom + 1; k <= kTo; k++) {
    const [x, y, front] = point(k);
    if (segmentOff(px, py, x, y, W, H)) {
      if (open) path.break();
      open = false;
    } else {
      if (!open) path.add(px, py, pf);
      path.add(x, y, front);
      open = true;
    }
    px = x;
    py = y;
    pf = front;
  }
  return path;
}

/**
 * A planet's coil. Sample k is the orbit point at mean anomaly 2πk/N (N a power of
 * two), placed at the base x of its true time, anchored at the Sun's x (`ax`).
 * Samples are close enough everywhere (≤ ~2 px along time, ≤ ~4 px around the orbit),
 * so the coil looks the same at every zoom and runs from edge to edge.
 */
/**
 * Seen from Earth (Centre: Earth): Earth's offset from the Sun at a base x, px, which every
 * path subtracts so that Earth's path is the straight line. Heliocentric: always zero.
 */
type Geo = (xBase: number) => readonly [number, number];
/** One of Jupiter's years, s: the barycentre's main beat. */
const JUPITER_YEAR = orbitalPeriod(planetById('jupiter'));
const HELIO: Geo = () => [0, 0];

function drawCoil(
  track: Track,
  pxPerTurn: number,
  ax: number,
  ay: number,
  x0: number,
  x1: number,
  W: number,
  H: number,
  geo: Geo = HELIO,
  /** Samples needed per turn of this path to follow Earth's yearly wiggle (geocentric). */
  geoSamples = 0,
): DepthPath {
  let N = samplesPerTurn(pxPerTurn, track.extent, 64, Infinity);
  while (N < geoSamples && N < 1 << 16) N *= 2;
  const toM = (x: number): number => track.M0 + (TWO_PI * (x - ax)) / pxPerTurn;
  const span = toM(x1) - toM(x0);
  while ((span / TWO_PI) * N > MAX_POINTS && N > 64) N /= 2;
  const dM = TWO_PI / N;
  const kFrom = Math.floor(toM(x0) / dM);
  const kTo = Math.ceil(toM(x1) / dM);
  const scale = pxPerTurn / TWO_PI;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  if (N <= 4096) {
    // One turn of points, reused for every turn.
    const table = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      track.atMean(i * dM, s);
      table[i * 3] = s.sx;
      table[i * 3 + 1] = s.sy;
      table[i * 3 + 2] = s.depth;
    }
    return walk(kFrom, kTo, (k) => {
      const i = (((k % N) + N) % N) * 3;
      const xb = ax + (k * dM - track.M0) * scale;
      const g = geo(xb);
      return [xb + (table[i] as number) - g[0], ay - (table[i + 1] as number) + g[1], (table[i + 2] as number) >= 0];
    }, W, H);
  }
  return walk(kFrom, kTo, (k) => {
    track.atMean(k * dM, s);
    const xb = ax + (k * dM - track.M0) * scale;
    const g = geo(xb);
    return [xb + s.sx - g[0], ay - s.sy + g[1], s.depth >= 0];
  }, W, H);
}

interface MoonCoil {
  readonly pxPerTurn: number;
  readonly phase0: number;
  readonly radiusPx: number;
}

/** The Moon's coil around Earth's, sampled at fixed Moon phases 2πk/N. */
function drawMoonCoil(
  earth: Track,
  earthPx: number,
  moon: MoonCoil,
  vm: ReturnType<typeof viewMatrix>,
  ax: number,
  ay: number,
  x0: number,
  x1: number,
  W: number,
  H: number,
  geo: Geo = HELIO,
): DepthPath {
  let N = samplesPerTurn(moon.pxPerTurn, moon.radiusPx, 32, Infinity);
  const toP = (x: number): number => moon.phase0 + (TWO_PI * (x - ax)) / moon.pxPerTurn;
  const span = toP(x1) - toP(x0);
  while ((span / TWO_PI) * N > MAX_POINTS / 4 && N > 32) N /= 2;
  const dP = TWO_PI / N;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  return walk(Math.floor(toP(x0) / dP), Math.ceil(toP(x1) / dP), (k) => {
    const phase = k * dP;
    const xBase = ax + ((phase - moon.phase0) * moon.pxPerTurn) / TWO_PI;
    earth.atMean(earth.M0 + (TWO_PI * (xBase - ax)) / earthPx, s);
    moonOffset(s.lon + Math.PI + phase, moon.radiusPx, vm, m);
    const g = geo(xBase);
    return [xBase + s.sx + m.sx - g[0], ay - s.sy - m.sy + g[1], s.depth + m.depth * 0.02 >= 0];
  }, W, H);
}

/**
 * Where a planet spends its time, projected onto the vertical: a gradient whose
 * brightness follows the time-weighted density of its height above the Sun line.
 */
function drawBand(
  ctx: CanvasRenderingContext2D,
  track: Track,
  ay: number,
  x0: number,
  x1: number,
  color: string,
  alpha: number,
  /** Mirror it about the line (the Sun's band, seen from Earth). */
  flip = false,
): void {
  if (x1 <= x0 || alpha <= 0) return;
  const BINS = 48;
  const SAMPLES = 360;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  let lo = Infinity, hi = -Infinity;
  const ys = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    track.atMean((i / SAMPLES) * TWO_PI, s);
    const y = flip ? -s.sy : s.sy;
    ys[i] = y;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  if (hi - lo < 1) {
    // Seen edge-on, the band is a line: still drawn, never dropped.
    ctx.save();
    ctx.globalAlpha = 0.8 * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, ay - (hi + lo) / 2);
    ctx.lineTo(x1, ay - (hi + lo) / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const hist = new Float64Array(BINS);
  for (const y of ys) hist[Math.min(BINS - 1, Math.floor(((y - lo) / (hi - lo)) * BINS))]! += 1;
  const peak = Math.max(...hist);
  const top = ay - hi, bottom = ay - lo;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  for (let i = 0; i < BINS; i++) {
    // Bin i (from low to high y offset) maps to screen from bottom to top.
    const u = 1 - (i + 0.5) / BINS;
    const a = (alpha * 0.5 * (hist[i] as number)) / peak;
    g.addColorStop(u, withAlpha(color, a));
  }
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x0, top, x1 - x0, bottom - top);
}

/**
 * A body beyond the window: a small arrow on the window's edge, on the line from the Sun
 * toward it, with its name. (At true scale and a close time zoom the orbits, drawn at the
 * path's km per pixel, reach far beyond any screen.)
 */
function drawEdgePointers(
  ctx: CanvasRenderingContext2D,
  list: ReadonlyArray<{ x: number; y: number; color: string; name: string; id: LabelId }>,
  ax: number,
  ay: number,
  L: Layout,
  W: number,
  H: number,
  font: string,
  labels: boolean,
  boxes: LabelBox[],
): void {
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const used: Array<[number, number]> = [];
  for (const b of list) {
    let dx = b.x - ax, dy = b.y - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    dx /= len;
    dy /= len;
    // Where the line from the Sun leaves the window, 16 px inside its edge.
    let t: number;
    if (L.clipR) {
      const ox = ax - L.cx, oy = ay - L.clipY, R = L.clipR - 16;
      const bq = ox * dx + oy * dy;
      t = -bq + Math.sqrt(Math.max(0, bq * bq - (ox * ox + oy * oy - R * R)));
    } else {
      const tx = dx > 0 ? (W - 16 - ax) / dx : dx < 0 ? (16 - ax) / dx : Infinity;
      const ty = dy > 0 ? (H - 16 - ay) / dy : dy < 0 ? (16 - ay) / dy : Infinity;
      t = Math.min(tx, ty);
    }
    if (!(t > 0)) continue;
    const px = ax + dx * t, py = ay + dy * t;
    if (used.some(([x, y]) => Math.hypot(x - px, y - py) < 14)) continue;
    used.push([px, py]);
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(px + dx * 7, py + dy * 7);
    ctx.lineTo(px - dx * 4 - dy * 5, py - dy * 4 + dx * 5);
    ctx.lineTo(px - dx * 4 + dy * 5, py - dy * 4 - dx * 5);
    ctx.closePath();
    ctx.fill();
    if (!labels) continue;
    const w = ctx.measureText(b.name).width;
    // The name sits on the window side of the arrow.
    const lx = px - dx * 14 - (dx > 0 ? w : 0), ly = py - dy * 14;
    ctx.textAlign = 'left';
    ctx.fillText(b.name, lx, ly);
    boxes.push({ id: b.id, x0: Math.min(lx, px) - 6, y0: Math.min(ly, py) - 10, x1: Math.max(lx + w, px) + 6, y1: Math.max(ly, py) + 10 });
  }
  ctx.restore();
}

/** A theme colour (#rrggbb or rgba()) at a given opacity. */
function withAlpha(color: string, a: number): string {
  const alpha = Math.max(0, Math.min(1, a)).toFixed(3);
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = color.match(/rgba?\(([^,]+),([^,]+),([^,)]+)/);
  return m ? `rgba(${m[1]},${m[2]},${m[3]}, ${alpha})` : color;
}

// --- Fuses: each body's glowing recent trail ---------------------------------------

/** Trail length along the base line: about a third of a turn, at most 170 px. */
const trailLength = (pxPerTurn: number): number => Math.min(0.33 * pxPerTurn, 170);

/** Points of a trail from oldest to newest, at fixed fractions of its length. */
/** At most this many poses are kept behind the present. */
const MAX_POSES = 720;

/**
 * Strobe: the solar system's worldline as a row of frozen poses, after Techartist's dancer
 * whose every held pose stays behind her as a sculpture. A pose is taken at fixed moments
 * (whole steps of the calendar, so poses stay put while time runs and new ones appear at
 * the present). Each pose is drawn as its bodies joined from the Sun outward; each body's
 * frozen positions are joined by straight lines. Those lines are what make the polygons:
 * at 5 steps a year, the Sun (seen from Earth) draws pentagons, each one turned a little
 * from the last when the count isn't whole, as a film's wagon wheel seems to turn.
 */
function drawStrobe(
  ctx: CanvasRenderingContext2D,
  o: {
    steps: number; now: Time; spp: number; ax: number; ay: number; left: number; W: number; H: number;
    geo: Geo; theme: Theme; pxPerTurn: ReadonlyMap<PlanetId, number>; tracks: readonly Track[];
  },
): PoseHit[] {
  const stepS = SECONDS_PER_YEAR / o.steps;
  const stepPx = stepS / o.spp;
  const nowS = o.now.day * SECONDS_PER_DAY + o.now.sec;
  const since = ((nowS % stepS) + stepS) % stepS; // seconds since the last pose
  const x0 = o.ax - since / o.spp;
  const K = Math.min(MAX_POSES, Math.floor((x0 - o.left) / stepPx) + 1);
  if (K < 1) return [];
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  // The bodies, the Sun first, then outward.
  const bodies: Array<{ color: string; width: number; r: number; at: (xb: number) => readonly [number, number] }> = [
    {
      color: o.theme.sun, width: o.theme.sunLineWidth, r: 3.2,
      at: (xb) => { const g = o.geo(xb); return [xb - g[0], o.ay + g[1]]; },
    },
    ...o.tracks.map((t) => {
      const px = o.pxPerTurn.get(t.planet.id) ?? t.period / o.spp;
      return {
        color: o.theme.planets[t.planet.id], width: o.theme.trailWidth * 1.3, r: 2.4,
        at: (xb: number): readonly [number, number] => {
          t.atMean(t.M0 + (TWO_PI * (xb - o.ax)) / px, s);
          const g = o.geo(xb);
          return [xb + s.sx - g[0], o.ay - s.sy + g[1]];
        },
      };
    }),
  ];
  const B = bodies.length;
  const xy = new Float64Array(B * K * 2);
  for (let k = 0; k < K; k++) {
    const xb = x0 - k * stepPx;
    for (let b = 0; b < B; b++) {
      const [x, y] = (bodies[b] as (typeof bodies)[number]).at(xb);
      xy[(k * B + b) * 2] = x;
      xy[(k * B + b) * 2 + 1] = y;
    }
  }
  const X = (k: number, b: number): number => xy[(k * B + b) * 2] as number;
  const Y = (k: number, b: number): number => xy[(k * B + b) * 2 + 1] as number;
  // Older poses fade, in a few steps (one stroke per step, not one per segment).
  const BUCKETS = 12;
  const fade = (c: number): number => 1 - 0.85 * (c / BUCKETS);
  const range = (c: number): [number, number] => [Math.floor((c * K) / BUCKETS), Math.floor(((c + 1) * K) / BUCKETS)];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let c = BUCKETS - 1; c >= 0; c--) {
    const [k0, k1] = range(c);
    if (k1 <= k0) continue;
    const a = fade(c);
    // The sculptures: each pose's bodies joined, Sun outward.
    if (B > 1) {
      ctx.globalAlpha = 0.28 * a;
      ctx.strokeStyle = o.theme.sun;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = k0; k < k1; k++) {
        ctx.moveTo(X(k, 0), Y(k, 0));
        for (let b = 1; b < B; b++) ctx.lineTo(X(k, b), Y(k, b));
      }
      ctx.stroke();
    }
    // The worldlines: each body's poses joined by straight lines.
    for (let b = 0; b < B; b++) {
      const body = bodies[b] as (typeof bodies)[number];
      ctx.globalAlpha = 0.9 * a;
      ctx.strokeStyle = body.color;
      ctx.lineWidth = body.width;
      ctx.beginPath();
      ctx.moveTo(X(k0, b), Y(k0, b));
      for (let k = k0 + 1; k <= Math.min(k1, K - 1); k++) ctx.lineTo(X(k, b), Y(k, b));
      ctx.stroke();
      ctx.fillStyle = body.color;
      ctx.beginPath();
      for (let k = k0; k < k1; k++) {
        ctx.moveTo(X(k, b) + body.r, Y(k, b));
        ctx.arc(X(k, b), Y(k, b), body.r, 0, TWO_PI);
      }
      ctx.fill();
    }
  }
  ctx.restore();
  const hits: PoseHit[] = [];
  for (let k = 0; k < K; k++)
    for (let b = 0; b < B; b++) {
      const x = X(k, b), y = Y(k, b);
      if (x >= 0 && x <= o.W && y >= 0 && y <= o.H) hits.push({ x, y, dt: -since - k * stepS });
    }
  return hits;
}

function trailPoints(x1: number, len: number, steps: number, at: (xBase: number) => [number, number]): Float64Array {
  const pts = new Float64Array(steps * 2);
  for (let i = 0; i < steps; i++) {
    const [x, y] = at(x1 - len + (len * i) / (steps - 1));
    pts[i * 2] = x;
    pts[i * 2 + 1] = y;
  }
  return pts;
}

/** Stroke a trail, oldest to newest: it brightens and thickens toward the body. */
function strokeFuse(ctx: CanvasRenderingContext2D, pts: Float64Array, color: string, width: number, additive: boolean): void {
  const n = pts.length / 2;
  if (n < 2) return;
  const CHUNKS = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  const pass = (w: number, alpha: number): void => {
    for (let c = 0; c < CHUNKS; c++) {
      const i0 = Math.floor((c * (n - 1)) / CHUNKS);
      const i1 = Math.floor(((c + 1) * (n - 1)) / CHUNKS);
      const u = (c + 1) / CHUNKS;
      ctx.globalAlpha = alpha * u * u;
      ctx.lineWidth = w * (0.4 + 0.6 * u);
      ctx.beginPath();
      ctx.moveTo(pts[i0 * 2] as number, pts[i0 * 2 + 1] as number);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i * 2] as number, pts[i * 2 + 1] as number);
      ctx.stroke();
    }
  };
  if (additive) {
    ctx.globalCompositeOperation = 'lighter';
    pass(width * 3.4, 0.14);
    ctx.globalCompositeOperation = 'source-over';
  }
  pass(width * 1.25, 0.95);
  ctx.restore();
}

/** The burning tip: a soft glow and a bright core, breathing gently with real time. */
function spark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, pulse: number, additive: boolean): void {
  ctx.save();
  if (additive) ctx.globalCompositeOperation = 'lighter';
  const R = r * (3.2 + 0.35 * pulse);
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = additive ? 0.55 : 0.35;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TWO_PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
  if (additive) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

// --- Scene -------------------------------------------------------------------------

export interface Scene {
  readonly tracks: readonly Track[];
  readonly moonPx: number | null;
  readonly focus: Track | null;
  /** Pixels per AU (true scale: the same at every radius). */
  readonly pxPerAU: number;
}

/** Bodies' tracks, evaluated at the anchor time (the present when it is in view). */
export function buildScene(f: FrameInput, L: Layout, anchor: Time): Scene {
  const { cam, view } = f;
  const chosen = view.planets.map(planetById);
  const fitAU = Math.max(0.5, ...chosen.map((p) => p.el.a * (1 + p.el.e)));
  // Scroll or pinch shrinks the solar system as well as enlarging it; it always zooms about the Sun.
  const z = Math.max(0.05, view.spaceZoom);
  const scale = makeScale(view.scale, L.fitR * z, fitAU, cam.secondsPerPixel / z, SUN_GALACTIC_SPEED_KM_S);
  const vm = viewMatrix(view.roll, view.yaw);
  const tracks = chosen.map((p) => makeTrack(p, anchor, vm, scale));
  let focus: Track | null = null;
  if (view.focus !== 'sun') {
    focus = tracks.find((t) => t.planet.id === view.focus) ?? makeTrack(planetById(view.focus), anchor, vm, scale);
  }
  let moonPx: number | null = null;
  if (view.moon && view.planets.includes('earth')) {
    const real = scale.factor(1) * (MOON_DISTANCE_KM / KM_PER_AU);
    // A readable stand-in distance, or the real one (384,400 km) once that is larger.
    moonPx = view.scale === 'true' ? real : Math.max(Math.min(36, Math.max(7, (scale.factor(1) / z) * 0.26)), real);
  }
  return { tracks, moonPx, focus, pxPerAU: scale.factor(1) };
}

/**
 * How the sky behind the calendar is turned. The zodiac is painted on the inside of the
 * sky sphere and never moves; the calendar's window onto it turns as the view turns.
 * In the default view it looks the way you see the Sun from Earth now, so the Sun's
 * current zodiac sign is behind it (ecliptic north up); turning the solar system turns
 * the sky with it from there.
 */
export function skyMatrix(roll: number, yaw: number, now: Time): Mat3 {
  const e = keplerKm('earth', now);
  const n = Math.hypot(e[0], e[1]) || 1;
  // Toward the viewer: from the Sun toward Earth, in the ecliptic; up: ecliptic north.
  const z: Vec3 = [e[0] / n, e[1] / n, 0];
  const y: Vec3 = [0, 0, 1];
  const x: Vec3 = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  const home: Mat3 = [x, y, z];
  // The turn from the default view to this one, applied to the sky's home.
  const v0 = viewMatrix(DEFAULT_ROLL);
  const v = viewMatrix(roll, yaw);
  const t = (m: Mat3): Mat3 => [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
  return matMul(matMul(v, t(v0)), home);
}

/**
 * The Sun's and the Moon's signs as seen from Earth now. The Sun's is written on the sky
 * under the Sun; the Moon's goes into the Moon's own label on its path (owner, 4 Nov 2026:
 * a mark on the sky raced across the screen with time sped up), so only the Sun's is drawn.
 */
export function skyBodies(now: Time): Array<{ dir: Vec3; text: string; glyph: string }> {
  // Signs from the equinox of this date, not of 2000.
  const sky = skyOfDate(now);
  const sign = (d: Vec3): string => {
    const s = signOf(lonOfDateFromVector(d, sky));
    return `${s.glyph} ${s.name}`;
  };
  const e = keplerKm('earth', now);
  const sun: Vec3 = [-e[0], -e[1], -e[2]];
  const m = moonGeocentric(now);
  const unitV = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  return [
    { dir: unitV(sun), text: `Sun in ${sign(sun)}`, glyph: '☉' },
    { dir: unitV(m), text: `Moon in ${sign(m)}`, glyph: '☾' },
  ];
}

/** The Moon's sign as seen from Earth now, e.g. "♑︎ Capricorn" (for its label in the calendar). */
export function moonSign(now: Time): string {
  const s = signOf(lonOfDateFromVector(moonGeocentric(now), skyOfDate(now)));
  return `${s.glyph} ${s.name}`;
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput): FrameResult {
  if (f.view.text) return drawScene(ctx, f);
  // No text: every fillText (here and in the sky behind) does nothing for this frame.
  const silent = ctx as CanvasRenderingContext2D & { fillText: CanvasRenderingContext2D['fillText'] };
  silent.fillText = () => {};
  try {
    return { ...drawScene(ctx, f), labels: [] };
  } finally {
    delete (silent as { fillText?: unknown }).fillText;
  }
}

function drawScene(ctx: CanvasRenderingContext2D, f: FrameInput): FrameResult {
  const { theme, view } = f;
  // Turning the system sideways (yaw) foreshortens the line of travel, and with it
  // the time axis: one screen pixel then spans more time.
  const cam: Camera = { ...f.cam, secondsPerPixel: f.cam.secondsPerPixel / Math.max(0.05, Math.cos(view.yaw)) };
  const L = layout(cam, view.round, view.panY);
  const W = cam.width;
  const H = cam.height;
  const additive = theme.ui === 'dark';
  const pulse = Math.sin(((f.now.sec % 1.6) / 1.6) * TWO_PI);

  // The Sun is always the present. Paths are anchored where "now" falls on the axis.
  const xNow = timeToX(cam, f.now);
  const nowInView = xNow > -W && xNow < 2 * W;
  const anchorTime = nowInView ? f.now : cam.center;
  const ax0 = nowInView ? xNow : L.cx;
  const scene = buildScene(f, L, anchorTime);

  // Centre: Earth. The view is geocentric: Earth sits where the Sun was and its path is the
  // straight line; every other path (the Sun's included) has Earth's offset taken away at
  // each moment, so the Sun coils around Earth and the planets loop back (retrograde).
  const ox = 0;
  const ax = ax0; // the centre's x: the Sun's, or (geocentric) Earth's
  const ay = L.cy; // the straight line's y
  const earthTrack = view.focus === 'earth' ? scene.focus : null;
  let geo: Geo = HELIO;
  /** Earth's offset followed at any zoom (for the strobe, whose few samples must stay true). */
  let geoTrue: Geo = HELIO;
  let earthPx = Infinity;
  if (earthTrack) {
    earthPx = earthTrack.period / cam.secondsPerPixel;
    const NE = 1024;
    const tab = new Float64Array(NE * 2);
    const es: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
    for (let i = 0; i < NE; i++) {
      earthTrack.atMean((i / NE) * TWO_PI, es);
      tab[i * 2] = es.sx;
      tab[i * 2 + 1] = es.sy;
    }
    const at = (M: number): readonly [number, number] => {
      const u = ((((M / TWO_PI) % 1) + 1) % 1) * NE;
      const i0 = Math.floor(u) % NE, i1 = (i0 + 1) % NE, t = u - Math.floor(u);
      return [tab[i0 * 2]! + (tab[i1 * 2]! - tab[i0 * 2]!) * t, tab[i0 * 2 + 1]! + (tab[i1 * 2 + 1]! - tab[i0 * 2 + 1]!) * t];
    };
    const e0 = at(earthTrack.M0);
    // Earth's yearly wiggle can only be followed while a year spans several pixels; beyond
    // that the view just keeps Earth at the centre.
    geoTrue = (xb) => at(earthTrack.M0 + (TWO_PI * (xb - ax)) / earthPx);
    geo = earthPx >= 8 ? geoTrue : () => e0;
  }
  const geocentric = earthTrack !== null;
  // Barycentre: the same idea with the solar system's centre of mass in place of Earth. The
  // barycentre travels the straight line; the Sun and everything that orbits it are offset by
  // the Sun's place relative to it (mostly Jupiter's and Saturn's pull). The Sun now stays where
  // it is (it is the present, and zoom holds it in place): the barycentre's line is drawn off it,
  // and the Sun's path wobbles by how far the barycentre has moved since, followed while one of
  // Jupiter's years spans several pixels.
  const bary = !geocentric && !!view.barycentre;
  let jupPx = Infinity;
  /** The barycentre now, px from the Sun (screen x right, y up). */
  let bNow: readonly [number, number] = [0, 0];
  if (bary) {
    jupPx = JUPITER_YEAR / cam.secondsPerPixel;
    const k = scene.pxPerAU / KM_PER_AU;
    const vmB = viewMatrix(view.roll, view.yaw);
    const proj = (t: Time): readonly [number, number] => {
      const b = mul(vmB, barycentreSmooth(t));
      return [b[0] * k, b[1] * k];
    };
    bNow = proj(anchorTime);
    const at: Geo = (xb) => {
      const b = proj(addSeconds(anchorTime, (xb - ax) * cam.secondsPerPixel));
      return [b[0] - bNow[0], b[1] - bNow[1]];
    };
    geoTrue = at;
    if (jupPx >= 8) geo = at;
  }
  const g0 = geo(ax);
  /** Where the Sun is now on screen (geocentric: off Earth's line). */
  const sunX = ax - g0[0], sunY = ay + g0[1];

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  if (L.clipR) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L.cx, L.clipY, L.clipR, 0, TWO_PI);
    ctx.clip();
  }

  if (f.backdrop) {
    // The sky as Fly mode's camera sees it (60° from top to bottom), turning with the
    // solar system. In the round window, the window's radius spans 30°.
    const half = L.clipR ?? H / 2;
    const box = L.clipR ? { x: L.cx - L.clipR, y: L.clipY - L.clipR, w: 2 * L.clipR, h: 2 * L.clipR } : { x: 0, y: 0, w: W, h: H };
    f.backdrop.draw(
      ctx,
      skyMatrix(view.roll, view.yaw, f.now),
      L.cx,
      L.clipY,
      focalFor(half),
      box,
      theme.sky,
      {
        constellations: view.constellations,
        zodiac: view.zodiac,
        galactic: view.galactic,
        ...(view.zodiac && { bodies: skyBodies(f.now).filter((b) => b.glyph === '☉'), equinoxShift: skyOfDate(f.now).lonShift }),
      },
    );
  } else {
    drawGalaxy(ctx, f, L);
  }

  // Horizontal guide lines, centred on the Sun line wherever it is dragged.
  const gs = theme.gridSpacingPx;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = ((ay % gs) + gs) % gs; y <= H; y += gs) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // Time grid and space grid, both fixed to the world and shifted with the Sun.
  // The grids are centred on the body the view is centred on: the Sun, or the
  // chosen planet, which then sits on "now" exactly as the Sun otherwise does.
  const gridCam: Camera = cam;
  const ticks = view.timeGrid ? generateTicks(gridCam) : null;
  if (ticks) {
    verticals(ctx, ticks.minor, H, theme.grid);
    verticals(ctx, ticks.major.map((t) => t.x), H, theme.gridMajor);
  }
  const space = view.distanceGrid ? distanceGrid(gridCam) : null;
  if (space) {
    verticals(ctx, space.minor, H, theme.distanceGrid, [1, 5]);
    verticals(ctx, space.major, H, theme.distanceGrid, [6, 4]);
  }

  // Ends of the Sun's life and the planets' formation (in Sun-relative screen x).
  // Unclamped: paths may start or end far off screen yet still reach into it.
  const startRaw = timeToX(cam, MIN_TIME) + ox;
  const endRaw = timeToX(cam, MAX_TIME) + ox;
  const formRaw = Math.max(startRaw, timeToX(cam, PLANETS_FORM) + ox);
  // Clamped to the screen, for drawing the Sun's line and labels.
  const sunStartX = Math.max(-KEEP, startRaw);
  const sunEndX = Math.min(W + KEEP, endRaw);
  const bodiesFromX = Math.max(sunStartX, formRaw);
  const nowBorn = nowInView && formRaw <= ax && ax <= endRaw;

  // Paths: coils where turns are distinct, shaded bands where they crowd together.
  const maxExtent = 1e6;
  const pxPerTurn = new Map<PlanetId, number>();
  const coils: Array<{ id: PlanetId; path: DepthPath; alpha: number }> = [];
  for (const track of scene.tracks) {
    const px = track.period / cam.secondsPerPixel;
    pxPerTurn.set(track.planet.id, px);
    if (!view.spirals || track.extent > maxExtent || formRaw >= endRaw) continue;
    // Seen from Earth, Earth's own path is the straight line.
    if (geocentric && track.planet.id === 'earth') continue;
    // Seen from Earth, while Earth's yearly wiggle is followed, a band (which can't follow it)
    // would sit off the planet; there every path stays a coil.
    const w = geocentric && earthPx >= 8 ? 1 : coilWeight(px);
    if (w < 1) {
      drawBand(ctx, track, ay, Math.max(0, bodiesFromX), Math.min(W, sunEndX), theme.planets[track.planet.id], 1 - w);
    }
    if (w > 0) {
      // A point sits up to `extent` px sideways of its base x, so sample that much beyond each edge.
      const reach = track.extent + (geocentric ? (earthTrack as Track).extent : 0) + KEEP;
      const need = geocentric && earthPx >= 8 ? 48 * (track.period / (earthTrack as Track).period) : bary && jupPx >= 8 ? 48 * (track.period / JUPITER_YEAR) : 0;
      const path = drawCoil(track, px, ax, ay, Math.max(formRaw, -reach), Math.min(endRaw, W + reach), W, H, geo, need);
      coils.push({ id: track.planet.id, path, alpha: w });
    }
  }
  const earth = scene.tracks.find((t) => t.planet.id === 'earth');
  let moonCoil: MoonCoil | null = null;
  let moonPath: DepthPath | null = null;
  let moonAlpha = 0;
  if (earth && scene.moonPx !== null && scene.moonPx < maxExtent) {
    moonCoil = {
      pxPerTurn: SYNODIC_MONTH_SECONDS / cam.secondsPerPixel,
      phase0: moonPhase(anchorTime),
      radiusPx: scene.moonPx,
    };
    moonAlpha = coilWeight(moonCoil.pxPerTurn);
    if (view.spirals && moonAlpha > 0 && formRaw < endRaw) {
      const reach = earth.extent + moonCoil.radiusPx + KEEP;
      moonPath = drawMoonCoil(
        earth,
        pxPerTurn.get('earth') as number,
        moonCoil,
        viewMatrix(view.roll, view.yaw),
        ax,
        ay,
        Math.max(formRaw, -reach),
        Math.min(endRaw, W + reach),
        W,
        H,
        geo,
      );
    }
  }

  // Paths and orbit circles: each stroked once, at one even width and opacity,
  // with the width snapped to whole device pixels so it renders cleanly.
  const dpr = ctx.getTransform().a || 1;
  const crisp = (w: number): number => Math.max(1, Math.round(w * dpr)) / dpr;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Orbit circles are around the Sun, wherever it is on screen.
  const rings = view.rings && nowBorn ? scene.tracks.map((t) => ringPath(t, sunX, sunY, maxExtent)) : [];
  ctx.lineWidth = crisp(1);
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha;
    ctx.stroke(r.path.all);
  }
  ctx.lineWidth = crisp(theme.trailWidth);
  for (const c of coils) {
    ctx.globalAlpha = 0.8 * c.alpha;
    ctx.strokeStyle = theme.planets[c.id];
    ctx.stroke(c.path.all);
  }
  if (moonPath) {
    ctx.globalAlpha = 0.8 * moonAlpha;
    ctx.strokeStyle = theme.moonTrail;
    ctx.lineWidth = crisp(1);
    ctx.stroke(moonPath.all);
  }
  ctx.restore();

  // The Sun's line, then its fuse. Seen from Earth, the straight line is Earth's path and
  // the Sun's path coils around it.
  if (sunStartX < sunEndX) {
    ctx.strokeStyle = geocentric ? theme.planets.earth : theme.sunLine;
    ctx.lineWidth = crisp(geocentric ? Math.max(theme.trailWidth * 1.6, theme.sunLineWidth * 0.8) : bary ? 1 : theme.sunLineWidth);
    ctx.globalAlpha = bary ? 0.5 : 0.75;
    if (bary) ctx.setLineDash([6, 4]);
    // With the barycentre, this straight line is the barycentre's, beside the Sun.
    const lineY = bary ? ay - bNow[1] : ay;
    ctx.beginPath();
    ctx.moveTo(sunStartX, lineY);
    ctx.lineTo(sunEndX, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (bary) {
      // The Sun's own path, wobbling around the barycentre's straight line.
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = theme.sunLine;
      ctx.lineWidth = crisp(theme.sunLineWidth);
      ctx.beginPath();
      if (jupPx >= 8) {
        const step = Math.max(1, Math.min(4, jupPx / 64));
        const x0 = Math.max(sunStartX, -KEEP), x1 = Math.min(sunEndX, W + KEEP);
        for (let x = x0, first = true; x <= x1 + step; x += step, first = false) {
          const xx = Math.min(x, x1), g = geo(xx);
          if (first) ctx.moveTo(xx - g[0], ay + g[1]);
          else ctx.lineTo(xx - g[0], ay + g[1]);
        }
      } else {
        ctx.moveTo(sunStartX, ay);
        ctx.lineTo(sunEndX, ay);
      }
      ctx.stroke();
    }
    if (geocentric && view.spirals) {
      const e = earthTrack as Track;
      if (earthPx >= 8) {
        // The Sun's path from Earth: Earth's coil turned inside out.
        ctx.strokeStyle = theme.sunLine;
        ctx.lineWidth = crisp(theme.sunLineWidth);
        const step = Math.max(1, Math.min(4, earthPx / 64));
        const x0 = Math.max(sunStartX, -e.extent - KEEP), x1 = Math.min(sunEndX, W + e.extent + KEEP);
        ctx.beginPath();
        for (let x = x0, first = true; x <= x1 + step; x += step, first = false) {
          const xx = Math.min(x, x1), g = geo(xx);
          if (first) ctx.moveTo(xx - g[0], ay + g[1]);
          else ctx.lineTo(xx - g[0], ay + g[1]);
        }
        ctx.stroke();
      } else {
        drawBand(ctx, e, ay, Math.max(0, sunStartX), Math.min(W, sunEndX), theme.sun, 1 - coilWeight(earthPx), true);
      }
    }
    ctx.globalAlpha = 1;
    if (nowInView && sunStartX <= ax && ax <= sunEndX) {
      const len = Math.min(ax - sunStartX, L.clipR ? L.clipR * 0.55 : 260);
      // Enough points to follow the Sun around Earth (geocentric) at any zoom; the polygons
      // too few points made are now the Strobe's, on purpose.
      const n = geocentric && earthPx >= 8 ? Math.min(2000, Math.max(24, Math.ceil((len / earthPx) * 48)))
        : bary && jupPx >= 8 ? Math.min(2000, Math.max(24, Math.ceil((len / jupPx) * 48))) : 24;
      const pts = trailPoints(ax, len, n, (x) => {
        const g = geo(x);
        return [x - g[0], ay + g[1]];
      });
      strokeFuse(ctx, pts, theme.sun, theme.sunLineWidth * 1.6, additive);
    }
  }

  // Fuses: each body's recent path glowing behind it, then the burning tips.
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const vm = viewMatrix(view.roll, view.yaw);
  const tips: Array<{ x: number; y: number; r: number; color: string; name: string; id?: LabelId }> = [];
  const labelBoxes: LabelBox[] = [];
  /** Bodies beyond the window: shown as a pointer at its edge, with their name. */
  const offscreen: Array<{ x: number; y: number; color: string; name: string; id: LabelId }> = [];
  if (nowBorn) {
    for (const track of scene.tracks) {
      if (track.extent > maxExtent) {
        // Too far out to draw at this zoom (true scale, zoomed into time): point to it instead.
        track.at(0, s);
        if (!(geocentric && track.planet.id === 'earth'))
          offscreen.push({ x: ax + s.sx - g0[0], y: ay - s.sy + g0[1], color: theme.planets[track.planet.id], name: track.planet.name, id: track.planet.id });
        continue;
      }
      const px = pxPerTurn.get(track.planet.id) as number;
      const color = theme.planets[track.planet.id];
      const len = Math.min(trailLength(px), ax - bodiesFromX);
      if (len > 2) {
        const steps = Math.min(400, Math.max(24, Math.ceil(((len / px) * TWO_PI * track.extent) / 3)));
        const pts = trailPoints(ax, len, steps, (xBase) => {
          track.atMean(track.M0 + (TWO_PI * (xBase - ax)) / px, s);
          const g = geo(xBase);
          return [xBase + s.sx - g[0], ay - s.sy + g[1]];
        });
        if (!(geocentric && track.planet.id === 'earth')) strokeFuse(ctx, pts, color, theme.trailWidth * 1.4, additive);
      }
      track.at(0, s);
      const here = geocentric && track.planet.id === 'earth';
      tips.push({ x: here ? ax : ax + s.sx - g0[0], y: here ? ay : ay - s.sy + g0[1], r: track.planet.id === 'earth' ? 3.6 : 3, color, name: track.planet.name, id: track.planet.id });

      if (track === earth && moonCoil) {
        const mc = moonCoil;
        const mlen = Math.min(trailLength(mc.pxPerTurn), ax - bodiesFromX);
        const at = (xBase: number): [number, number] => {
          earth.atMean(earth.M0 + (TWO_PI * (xBase - ax)) / px, s);
          moonOffset(s.lon + Math.PI + mc.phase0 + (TWO_PI * (xBase - ax)) / mc.pxPerTurn, mc.radiusPx, vm, m);
          const g = geo(xBase);
          return [xBase + s.sx + m.sx - g[0], ay - s.sy - m.sy + g[1]];
        };
        if (mlen > 2) strokeFuse(ctx, trailPoints(ax, mlen, 48, at), theme.moon, 1.2, additive);
        const [mx, my] = at(ax);
        tips.push({ x: mx, y: my, r: 2, color: theme.moon, name: view.zodiac ? `Moon in ${moonSign(f.now)}` : 'Moon', id: 'moon' });
      }
    }
  }
  const poses = view.strobe && view.strobe > 0 && nowBorn
    ? drawStrobe(ctx, {
        steps: view.strobe, now: f.now, spp: cam.secondsPerPixel, ax, ay, left: Math.max(bodiesFromX, -W), W, H,
        geo: geoTrue, theme, pxPerTurn, tracks: scene.tracks.filter((t) => t.extent <= maxExtent),
      })
    : [];
  if (bary && nowInView && sunStartX <= ax && ax <= sunEndX) {
    // The barycentre now: a small cross on its straight line, named when names are shown.
    ctx.save();
    ctx.strokeStyle = theme.sunLine;
    ctx.lineWidth = crisp(1);
    const bx = ax + bNow[0], by = ay - bNow[1];
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.lineTo(bx + 5, by);
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx, by + 5);
    ctx.stroke();
    if (view.labels && view.text) {
      ctx.font = theme.font;
      ctx.fillStyle = theme.sunLine;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Barycentre · modelled', bx + 8, by + 6);
    }
    ctx.restore();
  }
  if (nowInView && sunStartX <= ax && ax <= sunEndX) spark(ctx, sunX, sunY, 5.5, theme.sun, pulse, additive);
  for (const t of tips) spark(ctx, t.x, t.y, t.r, t.color, pulse, additive);
  // Anything outside the window (round, or the whole screen) gets a pointer at the edge.
  const inside = (x: number, y: number): boolean =>
    L.clipR ? Math.hypot(x - L.cx, y - L.clipY) <= L.clipR - 4 : x >= 0 && x <= W && y >= 0 && y <= H;
  for (const t of tips) if (t.id && t.id !== 'moon' && !inside(t.x, t.y)) offscreen.push({ x: t.x, y: t.y, color: t.color, name: t.name, id: t.id });

  // Names, Earth first so it wins when labels would overlap.
  if (view.labels) {
    ctx.font = theme.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const placed: Array<[number, number, number]> = [];
    // The Sun first, then Earth, so they win when names would overlap.
    const sunTip = nowInView && sunStartX <= ax && ax <= sunEndX ? [{ x: sunX, y: sunY, r: 5.5, color: theme.sun, name: 'Sun', id: 'sun' as const }] : [];
    const ordered = [...sunTip, ...tips.filter((t) => t.name).sort((a, b) => Number(b.name === 'Earth') - Number(a.name === 'Earth'))];
    for (const t of ordered) {
      const w = ctx.measureText(t.name).width;
      const lx = t.x + 9, ly = t.y - 10;
      if (placed.some(([px, py, pw]) => lx < px + pw + 4 && px < lx + w + 4 && Math.abs(py - ly) < 16)) continue;
      ctx.fillStyle = t.color;
      ctx.fillText(t.name, lx, ly);
      placed.push([lx, ly, w]);
      if (t.id) labelBoxes.push({ id: t.id, x0: lx - 4, y0: ly - 10, x1: lx + w + 4, y1: ly + 10 });
    }
  }
  if (nowBorn && offscreen.length > 0) drawEdgePointers(ctx, offscreen, ax, ay, L, W, H, theme.font, view.labels, labelBoxes);

  // Start and end of the Sun's main-sequence life.
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.tickText;
  const leftEdge = L.clipR ? L.cx - L.clipR : 0;
  const rightEdge = L.clipR ? L.cx + L.clipR : W;
  const endLabel = (text: string, x: number, side: 'before' | 'after'): void => {
    const width = ctx.measureText(text).width;
    const room = side === 'before' ? x - 10 - leftEdge : rightEdge - x - 10;
    if (room >= width) {
      ctx.textAlign = side === 'before' ? 'right' : 'left';
      ctx.fillText(text, side === 'before' ? x - 10 : x + 10, ay);
    } else {
      ctx.textAlign = side === 'before' ? 'left' : 'right';
      ctx.fillText(text, side === 'before' ? Math.max(x, leftEdge + 24) : Math.min(x, rightEdge - 24), ay - 16);
    }
  };
  if (sunStartX > 0) endLabel('Sun forms', sunStartX, 'before');
  if (sunEndX < W) endLabel('Sun leaves the main sequence', sunEndX, 'after');

  // Time labels along the bottom; the space grid's legend along the top.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const chord = (y: number): number => (L.clipR ? Math.sqrt(Math.max(0, L.clipR ** 2 - (y - L.clipY) ** 2)) : Infinity);
  if (ticks) {
    ctx.strokeStyle = theme.tickLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of ticks.major) {
      const x = Math.round(t.x) + 0.5;
      ctx.moveTo(x, ay - 6);
      ctx.lineTo(x, ay + 6);
    }
    ctx.stroke();
    ctx.fillStyle = theme.tickText;
    const half = chord(L.labelY);
    for (const t of ticks.major) {
      const x = t.x;
      const w = ctx.measureText(t.label).width / 2;
      if (Math.abs(x - L.cx) + w > half - 6) continue;
      ctx.fillText(t.label, x, L.labelY);
    }
  }
  if (space) {
    ctx.fillStyle = theme.distanceText;
  }

  if (L.clipR) {
    ctx.restore();
    drawBezel(ctx, f, L);
  }
  return {
    labels: labelBoxes,
    poses,
    sunX: nowInView ? ax : NaN,
    sunY: ay,
    space: space ? `Space grid · ${formatDistanceStep(space.step)} between lines` : '',
    spaceKm: space ? space.step.km : 0,
    spacePx: space ? space.step.km / (SUN_GALACTIC_SPEED_KM_S * gridCam.secondsPerPixel) : 0,
  };
}

function ringPath(track: Track, cx: number, cy: number, maxExtent: number): { id: PlanetId; path: DepthPath } | null {
  if (track.extent > maxExtent) return null;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const path = new DepthPath();
  const N = samplesPerTurn(0, track.extent, 120, 4096);
  for (let i = 0; i <= N; i++) {
    track.ringAt((i / N) * TWO_PI, s);
    path.add(cx + s.sx, cy - s.sy, s.depth >= 0);
  }
  return { id: track.planet.id, path };
}

/** Rim of the round window, with a fine scale like a watch bezel. */
function drawBezel(ctx: CanvasRenderingContext2D, f: FrameInput, L: Layout): void {
  const r = L.clipR as number;
  const { theme } = f;
  ctx.strokeStyle = theme.bezel;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(L.cx, L.clipY, r, 0, TWO_PI);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TWO_PI;
    const len = i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 3;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(L.cx + c * (r + 4), L.clipY + s * (r + 4));
    ctx.lineTo(L.cx + c * (r + 4 + len), L.clipY + s * (r + 4 + len));
  }
  ctx.stroke();
}

/** How far the Sun travels between two moments, km (positive = later). */
export function travelKm(from: Time, to: Time): number {
  return SUN_GALACTIC_SPEED_KM_S * diffSeconds(to, from);
}
