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
} from './geometry';
import { galacticAngle, moonPhase } from './models';
import { orbitalPeriod, planetById, type PlanetId } from './planets';
import type { Theme } from './theme';
import { focalFor } from './skymap';
import { distanceGrid, formatDistanceStep, generateTicks } from './ticks';
import { diffSeconds, fromYearsApprox, type Time } from './time';

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
    ink: 'light' | 'dark',
    strength: number,
  ): void;
}

/** What the canvas needs back from a frame: where the Sun was drawn, for grabbing it. */
export interface FrameResult {
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
function drawCoil(track: Track, pxPerTurn: number, ax: number, ay: number, x0: number, x1: number, W: number, H: number): DepthPath {
  let N = samplesPerTurn(pxPerTurn, track.extent, 64, Infinity);
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
      return [ax + (k * dM - track.M0) * scale + (table[i] as number), ay - (table[i + 1] as number), (table[i + 2] as number) >= 0];
    }, W, H);
  }
  return walk(kFrom, kTo, (k) => {
    track.atMean(k * dM, s);
    return [ax + (k * dM - track.M0) * scale + s.sx, ay - s.sy, s.depth >= 0];
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
    return [xBase + s.sx + m.sx, ay - s.sy - m.sy, s.depth + m.depth * 0.02 >= 0];
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
): void {
  if (x1 <= x0 || alpha <= 0) return;
  const BINS = 48;
  const SAMPLES = 360;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  let lo = Infinity, hi = -Infinity;
  const ys = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    track.atMean((i / SAMPLES) * TWO_PI, s);
    ys[i] = s.sy;
    lo = Math.min(lo, s.sy);
    hi = Math.max(hi, s.sy);
  }
  if (hi - lo < 1) return;
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
}

/** Bodies' tracks, evaluated at the anchor time (the present when it is in view). */
export function buildScene(f: FrameInput, L: Layout, anchor: Time): Scene {
  const { cam, view } = f;
  const chosen = view.planets.map(planetById);
  const fitAU = Math.max(0.5, ...chosen.map((p) => p.el.a * (1 + p.el.e)));
  const z = Math.max(1, view.spaceZoom);
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
  return { tracks, moonPx, focus };
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput): FrameResult {
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

  // Centring on a planet shifts everything in space so it sits where the Sun was.
  let ox = 0, oy = 0;
  if (scene.focus) {
    const fs: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
    scene.focus.at(0, fs);
    ox = -fs.sx;
    oy = fs.sy;
  }
  const ax = ax0 + ox; // the Sun's x
  const ay = L.cy + oy; // the Sun line's y

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
      viewMatrix(view.roll, view.yaw),
      L.cx,
      L.clipY,
      focalFor(half),
      box,
      theme.ui === 'dark' ? 'dark' : 'light',
      Math.min(1, theme.galaxyAlpha * 2),
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
    if (!view.spirals || track.extent < 0.5 || track.extent > maxExtent || formRaw >= endRaw) continue;
    const w = coilWeight(px);
    if (w < 1) {
      drawBand(ctx, track, ay, Math.max(0, bodiesFromX), Math.min(W, sunEndX), theme.planets[track.planet.id], 1 - w);
    }
    if (w > 0) {
      // A point sits up to `extent` px sideways of its base x, so sample that much beyond each edge.
      const reach = track.extent + KEEP;
      const path = drawCoil(track, px, ax, ay, Math.max(formRaw, -reach), Math.min(endRaw, W + reach), W, H);
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
  const rings = view.rings && nowBorn ? scene.tracks.map((t) => ringPath(t, ax, ay, maxExtent)) : [];
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

  // The Sun's line, then its fuse.
  if (sunStartX < sunEndX) {
    ctx.strokeStyle = theme.sunLine;
    ctx.lineWidth = crisp(theme.sunLineWidth);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(sunStartX, ay);
    ctx.lineTo(sunEndX, ay);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (nowInView && sunStartX <= ax && ax <= sunEndX) {
      const len = Math.min(ax - sunStartX, L.clipR ? L.clipR * 0.55 : 260);
      const pts = trailPoints(ax, len, 24, (x) => [x, ay]);
      strokeFuse(ctx, pts, theme.sun, theme.sunLineWidth * 1.6, additive);
    }
  }

  // Fuses: each body's recent path glowing behind it, then the burning tips.
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const vm = viewMatrix(view.roll, view.yaw);
  const tips: Array<{ x: number; y: number; r: number; color: string; name: string }> = [];
  if (nowBorn) {
    for (const track of scene.tracks) {
      if (track.extent > maxExtent) continue;
      const px = pxPerTurn.get(track.planet.id) as number;
      const color = theme.planets[track.planet.id];
      const len = Math.min(trailLength(px), ax - bodiesFromX);
      if (len > 2) {
        const steps = Math.min(400, Math.max(24, Math.ceil(((len / px) * TWO_PI * track.extent) / 3)));
        const pts = trailPoints(ax, len, steps, (xBase) => {
          track.atMean(track.M0 + (TWO_PI * (xBase - ax)) / px, s);
          return [xBase + s.sx, ay - s.sy];
        });
        strokeFuse(ctx, pts, color, theme.trailWidth * 1.4, additive);
      }
      track.at(0, s);
      tips.push({ x: ax + s.sx, y: ay - s.sy, r: track.planet.id === 'earth' ? 3.6 : 3, color, name: track.planet.name });

      if (track === earth && moonCoil) {
        const mc = moonCoil;
        const mlen = Math.min(trailLength(mc.pxPerTurn), ax - bodiesFromX);
        const at = (xBase: number): [number, number] => {
          earth.atMean(earth.M0 + (TWO_PI * (xBase - ax)) / px, s);
          moonOffset(s.lon + Math.PI + mc.phase0 + (TWO_PI * (xBase - ax)) / mc.pxPerTurn, mc.radiusPx, vm, m);
          return [xBase + s.sx + m.sx, ay - s.sy - m.sy];
        };
        if (mlen > 2) strokeFuse(ctx, trailPoints(ax, mlen, 48, at), theme.moon, 1.2, additive);
        const [mx, my] = at(ax);
        tips.push({ x: mx, y: my, r: 2, color: theme.moon, name: '' });
      }
    }
  }
  if (nowInView && sunStartX <= ax && ax <= sunEndX) spark(ctx, ax, ay, 5.5, theme.sun, pulse, additive);
  for (const t of tips) spark(ctx, t.x, t.y, t.r, t.color, pulse, additive);

  // Names, Earth first so it wins when labels would overlap.
  if (view.labels) {
    ctx.font = theme.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const placed: Array<[number, number, number]> = [];
    const ordered = tips.filter((t) => t.name).sort((a, b) => Number(b.name === 'Earth') - Number(a.name === 'Earth'));
    for (const t of ordered) {
      const w = ctx.measureText(t.name).width;
      const lx = t.x + 9, ly = t.y - 10;
      if (placed.some(([px, py, pw]) => lx < px + pw + 4 && px < lx + w + 4 && Math.abs(py - ly) < 16)) continue;
      ctx.fillStyle = t.color;
      ctx.fillText(t.name, lx, ly);
      placed.push([lx, ly, w]);
    }
  }

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
    ctx.fillText(`Space grid · ${formatDistanceStep(space.step)} between lines`, L.cx, L.topY);
  }

  if (L.clipR) {
    ctx.restore();
    drawBezel(ctx, f, L);
  }
  return { sunX: nowInView ? ax : NaN, sunY: ay };
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
