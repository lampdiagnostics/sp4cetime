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
import { distanceGrid, formatDistanceStep, generateTicks } from './ticks';
import { diffSeconds, fromYearsApprox, type Time } from './time';

export interface ViewOptions {
  /** Rotation about the line of travel, radians. */
  readonly roll: number;
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
class DepthPath {
  readonly back = new Path2D();
  readonly front = new Path2D();
  private prev: boolean | null = null;
  private px = 0;
  private py = 0;
  add(x: number, y: number, isFront: boolean): void {
    if (this.prev === null) (isFront ? this.front : this.back).moveTo(x, y);
    else if (isFront !== this.prev) {
      const p = isFront ? this.front : this.back;
      p.moveTo(this.px, this.py);
      p.lineTo(x, y);
    } else (isFront ? this.front : this.back).lineTo(x, y);
    this.prev = isFront;
    this.px = x;
    this.py = y;
  }
  break(): void {
    this.prev = null;
  }
}

/** Points further than this outside the screen are skipped, px. */
const KEEP = 40;
/** Upper bound on samples looked at per path per frame. */
const MAX_LOOKUPS = 250_000;

/**
 * A planet's coil. Sample k is the orbit point at mean anomaly 2πk/N; its base x
 * follows from true time (one turn per period), anchored at the Sun's x (`ax`).
 * One turn of points is computed per frame and reused for every turn.
 */
function drawCoil(track: Track, pxPerTurn: number, ax: number, ay: number, x0: number, x1: number, W: number, H: number): DepthPath | null {
  const path = new DepthPath();
  const N = samplesPerTurn(pxPerTurn, track.extent, 64, 4096);
  const dM = TWO_PI / N;
  const toM = (x: number): number => track.M0 + (TWO_PI * (x - ax)) / pxPerTurn;
  const kFrom = Math.ceil(toM(x0) / dM);
  const kTo = Math.floor(toM(x1) / dM);
  if (kTo - kFrom > MAX_LOOKUPS) return null;
  const table = new Float64Array(N * 3);
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  for (let i = 0; i < N; i++) {
    track.atMean(i * dM, s);
    table[i * 3] = s.sx;
    table[i * 3 + 1] = s.sy;
    table[i * 3 + 2] = s.depth;
  }
  let off = false;
  for (let k = kFrom; k <= kTo; k++) {
    const i = (((k % N) + N) % N) * 3;
    const x = ax + (k * dM - track.M0) * (pxPerTurn / TWO_PI) + (table[i] as number);
    const y = ay - (table[i + 1] as number);
    if (x < -KEEP || x > W + KEEP || y < -KEEP || y > H + KEEP) {
      if (off) {
        path.break();
        continue;
      }
      off = true;
    } else off = false;
    path.add(x, y, (table[i + 2] as number) >= 0);
  }
  return path;
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
  roll: number,
  ax: number,
  ay: number,
  x0: number,
  x1: number,
  W: number,
  H: number,
): DepthPath | null {
  const path = new DepthPath();
  const N = samplesPerTurn(moon.pxPerTurn, moon.radiusPx, 32, 2048);
  const dP = TWO_PI / N;
  const toP = (x: number): number => moon.phase0 + (TWO_PI * (x - ax)) / moon.pxPerTurn;
  const kFrom = Math.ceil(toP(x0) / dP);
  const kTo = Math.floor(toP(x1) / dP);
  if (kTo - kFrom > MAX_LOOKUPS / 4) return null;
  const vm = viewMatrix(roll);
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  let off = false;
  for (let k = kFrom; k <= kTo; k++) {
    const phase = k * dP;
    const xBase = ax + ((phase - moon.phase0) * moon.pxPerTurn) / TWO_PI;
    earth.atMean(earth.M0 + (TWO_PI * (xBase - ax)) / earthPx, s);
    moonOffset(s.lon + Math.PI + phase, moon.radiusPx, vm, m);
    const x = xBase + s.sx + m.sx;
    const y = ay - s.sy - m.sy;
    if (x < -KEEP || x > W + KEEP || y < -KEEP || y > H + KEEP) {
      if (off) {
        path.break();
        continue;
      }
      off = true;
    } else off = false;
    path.add(x, y, s.depth + m.depth * 0.02 >= 0);
  }
  return path;
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
  const vm = viewMatrix(view.roll);
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
  const { cam, theme, view } = f;
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
  const viewingAway = Math.abs(xNow - L.cx) > 1.5;

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

  drawGalaxy(ctx, f, L);

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
  const ticks = view.timeGrid ? generateTicks(cam) : null;
  if (ticks) {
    verticals(ctx, ticks.minor.map((x) => x + ox), H, theme.grid);
    verticals(ctx, ticks.major.map((t) => t.x + ox), H, theme.gridMajor);
  }
  const space = view.distanceGrid ? distanceGrid(cam) : null;
  if (space) {
    verticals(ctx, space.minor.map((x) => x + ox), H, theme.distanceGrid, [1, 5]);
    verticals(ctx, space.major.map((x) => x + ox), H, theme.distanceGrid, [6, 4]);
  }

  // Ends of the Sun's life and the planets' formation (in Sun-relative screen x).
  const sunStartX = Math.max(-KEEP, timeToX(cam, MIN_TIME) + ox);
  const sunEndX = Math.min(W + KEEP, timeToX(cam, MAX_TIME) + ox);
  const bodiesFromX = Math.max(sunStartX, timeToX(cam, PLANETS_FORM) + ox);
  const nowBorn = nowInView && bodiesFromX <= ax && ax <= sunEndX;

  // Paths: coils where turns are distinct, shaded bands where they crowd together.
  const maxExtent = 60 * Math.max(W, H);
  const pxPerTurn = new Map<PlanetId, number>();
  const coils: Array<{ id: PlanetId; path: DepthPath; alpha: number }> = [];
  for (const track of scene.tracks) {
    const px = track.period / cam.secondsPerPixel;
    pxPerTurn.set(track.planet.id, px);
    if (!view.spirals || track.extent < 0.5 || track.extent > maxExtent || bodiesFromX >= sunEndX) continue;
    const w = coilWeight(px);
    if (w < 1) {
      drawBand(ctx, track, ay, Math.max(0, bodiesFromX), Math.min(W, sunEndX), theme.planets[track.planet.id], 1 - w);
    }
    if (w > 0) {
      const reach = Math.min(track.extent, 50 * W);
      const path = drawCoil(track, px, ax, ay, Math.max(bodiesFromX, -reach), Math.min(sunEndX, W + reach), W, H);
      if (path) coils.push({ id: track.planet.id, path, alpha: w });
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
    if (view.spirals && moonAlpha > 0 && bodiesFromX < sunEndX) {
      const reach = Math.min(earth.extent + moonCoil.radiusPx, 50 * W);
      moonPath = drawMoonCoil(
        earth,
        pxPerTurn.get('earth') as number,
        moonCoil,
        view.roll,
        ax,
        ay,
        Math.max(bodiesFromX, -reach),
        Math.min(sunEndX, W + reach),
        W,
        H,
      );
    }
  }

  // Back halves, orbit circles, the Sun line, front halves.
  ctx.lineWidth = theme.trailWidth;
  for (const c of coils) {
    ctx.globalAlpha = theme.trailBackAlpha * c.alpha;
    ctx.strokeStyle = theme.planets[c.id];
    ctx.stroke(c.path.back);
  }
  if (moonPath) {
    ctx.globalAlpha = theme.trailBackAlpha * moonAlpha;
    ctx.strokeStyle = theme.moonTrail;
    ctx.lineWidth = 1;
    ctx.stroke(moonPath.back);
  }
  ctx.globalAlpha = 1;

  const rings = view.rings && nowBorn ? scene.tracks.map((t) => ringPath(t, ax, ay, maxExtent)) : [];
  ctx.lineWidth = 1;
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha * 0.45;
    ctx.stroke(r.path.back);
  }
  ctx.globalAlpha = 1;

  if (sunStartX < sunEndX) {
    ctx.strokeStyle = theme.sunLine;
    ctx.lineWidth = theme.sunLineWidth;
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

  ctx.lineWidth = 1;
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha;
    ctx.stroke(r.path.front);
  }
  ctx.lineWidth = theme.trailWidth;
  for (const c of coils) {
    ctx.globalAlpha = 0.85 * c.alpha;
    ctx.strokeStyle = theme.planets[c.id];
    ctx.stroke(c.path.front);
  }
  if (moonPath) {
    ctx.globalAlpha = moonAlpha;
    ctx.strokeStyle = theme.moonTrail;
    ctx.lineWidth = 1;
    ctx.stroke(moonPath.front);
  }
  ctx.globalAlpha = 1;

  // Fuses: each body's recent path glowing behind it, then the burning tips.
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const vm = viewMatrix(view.roll);
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

  // Looking ahead or back: a cursor at the viewed moment, with hollow markers.
  if (viewingAway) {
    const xv = L.cx + ox;
    ctx.strokeStyle = theme.cursor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xv) + 0.5, L.topY + 12);
    ctx.lineTo(Math.round(xv) + 0.5, L.labelY - 18);
    ctx.stroke();
    if (bodiesFromX <= xv && xv <= sunEndX) {
      for (const track of scene.tracks) {
        if (track.extent > maxExtent) continue;
        const px = pxPerTurn.get(track.planet.id) as number;
        track.atMean(track.M0 + (TWO_PI * (xv - ax)) / px, s);
        ctx.strokeStyle = theme.planets[track.planet.id];
        ctx.beginPath();
        ctx.arc(xv + s.sx, ay - s.sy, 4, 0, TWO_PI);
        ctx.stroke();
      }
    }
    if (sunStartX <= xv && xv <= sunEndX) {
      ctx.strokeStyle = theme.sun;
      ctx.beginPath();
      ctx.arc(xv, ay, 5, 0, TWO_PI);
      ctx.stroke();
    }
  }

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
      const x = Math.round(t.x + ox) + 0.5;
      ctx.moveTo(x, ay - 6);
      ctx.lineTo(x, ay + 6);
    }
    ctx.stroke();
    ctx.fillStyle = theme.tickText;
    const half = chord(L.labelY);
    for (const t of ticks.major) {
      const x = t.x + ox;
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
  return nowInView ? { sunX: ax, sunY: ay } : { sunX: NaN, sunY: NaN };
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
