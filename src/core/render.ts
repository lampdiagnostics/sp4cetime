/**
 * Draws one frame. Everything on screen is a pure function of
 * (camera, theme, now, view options): no accumulated state, so the same inputs
 * always draw the same picture (docs/adr/0003-canvas-2d.md).
 *
 * Coils are sampled at fixed points on each orbit (fixed steps of mean anomaly),
 * not at fixed screen pixels, so a coil keeps its exact shape as the camera
 * moves: no shimmer, no moiré. When true coils would be narrower than a readable
 * pitch, they are drawn at that minimum pitch instead (docs/adr/0007-coils-and-fuses.md),
 * continuous with the true pitch, and the screen says so.
 */
import { type Camera, timeToX } from './camera';
import { EARTH_AGE_YEARS, MAX_TIME, MIN_TIME, SUN_GALACTIC_SPEED_KM_S, SYNODIC_MONTH_SECONDS } from './constants';
import {
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
  readonly rings: boolean;
  readonly labels: boolean;
  readonly round: boolean;
  /** Draw each body's full coil into past and future. */
  readonly spirals: boolean;
  readonly timeGrid: boolean;
  readonly distanceGrid: boolean;
}

export interface FrameInput {
  readonly cam: Camera;
  readonly theme: Theme;
  /** The real present moment. */
  readonly now: Time;
  readonly view: ViewOptions;
}

export interface Layout {
  /** Sun position on screen (the camera centre). */
  readonly cx: number;
  readonly cy: number;
  /** Radius the outermost chosen orbit is fitted to, px. */
  readonly fitR: number;
  /** Round window radius, or null for full screen. */
  readonly clipR: number | null;
  /** Baselines of the time labels (bottom) and the space-grid legend (top). */
  readonly labelY: number;
  readonly topY: number;
}

export function layout(cam: Camera, round: boolean): Layout {
  const W = cam.width;
  const H = cam.height;
  if (round) {
    const narrow = W < 600;
    const clipR = Math.max(60, Math.min(W, H) / 2 - (narrow ? 8 : 24));
    // Portrait phones: lift the window so the controls fit underneath it.
    const cy = narrow ? Math.min(H / 2, 118 + clipR) : H / 2;
    return { cx: W / 2, cy, fitR: clipR * 0.6, clipR, labelY: cy + clipR * 0.76, topY: cy - clipR * 0.72 };
  }
  const cy = Math.round(H * 0.45);
  const fitR = Math.max(40, Math.min(H * 0.27, W * 0.3, 300));
  return { cx: W / 2, cy, fitR, clipR: null, labelY: Math.min(H - 16, cy + fitR + 40), topY: Math.max(24, cy - fitR - 34) };
}

const TWO_PI = Math.PI * 2;
const PLANETS_FORM = fromYearsApprox(-EARTH_AGE_YEARS);

// --- Coil pitch -----------------------------------------------------------------

/** Narrowest coil drawn, px per orbit, for Mercury; slower planets get wider minimums. */
const MIN_COIL_PX = 18;
const MERCURY_PERIOD = orbitalPeriod(planetById('mercury'));
const MIN_MOON_COIL_PX = 9;

/** Pixels per orbit as drawn: the true pitch, or a readable minimum if that is narrower. */
export function coilPitchPx(period: number, secondsPerPixel: number): { px: number; exaggerated: boolean } {
  const truePx = period / secondsPerPixel;
  const floor = MIN_COIL_PX * Math.cbrt(period / MERCURY_PERIOD);
  return truePx >= floor ? { px: truePx, exaggerated: false } : { px: floor, exaggerated: true };
}

/** True when any chosen body's coil is drawn wider than true at this zoom. */
export function pitchExaggerated(planets: readonly PlanetId[], secondsPerPixel: number): boolean {
  return planets.some((id) => coilPitchPx(orbitalPeriod(planetById(id)), secondsPerPixel).exaggerated);
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
    const y = L.cy + radius * s.r * Math.sin(a) * 0.38;
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

// --- Coils ------------------------------------------------------------------------

/** Accumulates a polyline split into the halves in front of and behind the line of travel. */
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

const MAX_SAMPLES = 12_000;

/**
 * A planet's coil between base positions xFrom..xTo. Sample k sits at mean anomaly
 * 2πk/N, so the same orbit points are used every frame and the shape never shimmers.
 */
function drawCoilPath(track: Track, pitchPx: number, L: Layout, xFrom: number, xTo: number): DepthPath {
  const path = new DepthPath();
  if (xTo <= xFrom) return path;
  const N = Math.max(64, Math.ceil(pitchPx / 2));
  const dM = TWO_PI / N;
  const toM = (x: number): number => track.M0 + (TWO_PI * (x - L.cx)) / pitchPx;
  const kFrom = Math.ceil(toM(xFrom) / dM);
  const kTo = Math.min(Math.floor(toM(xTo) / dM), kFrom + MAX_SAMPLES);
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  // One orbit's worth of points, looked up by k mod N, when that table is small.
  const table = N <= 4096 ? new Float64Array(N * 3) : null;
  if (table) {
    for (let i = 0; i < N; i++) {
      track.atMean(i * dM, s);
      table[i * 3] = s.sx;
      table[i * 3 + 1] = s.sy;
      table[i * 3 + 2] = s.depth;
    }
  }
  for (let k = kFrom; k <= kTo; k++) {
    const M = k * dM;
    const xBase = L.cx + ((M - track.M0) * pitchPx) / TWO_PI;
    let sx: number, sy: number, depth: number;
    if (table) {
      const i = (((k % N) + N) % N) * 3;
      sx = table[i] as number;
      sy = table[i + 1] as number;
      depth = table[i + 2] as number;
    } else {
      track.atMean(M, s);
      sx = s.sx;
      sy = s.sy;
      depth = s.depth;
    }
    path.add(xBase + sx, L.cy - sy, depth >= 0);
  }
  return path;
}

interface MoonCoil {
  readonly pitchPx: number;
  readonly phase0: number;
  readonly radiusPx: number;
}

/** The Moon's coil around Earth's, anchored to fixed Moon phases. */
function drawMoonPath(earth: Track, earthPitch: number, moon: MoonCoil, f: FrameInput, L: Layout, xFrom: number, xTo: number): DepthPath {
  const path = new DepthPath();
  if (xTo <= xFrom) return path;
  const vm = viewMatrix(f.view.roll);
  const N = Math.max(32, Math.ceil(moon.pitchPx / 2));
  const dP = TWO_PI / N;
  const toP = (x: number): number => moon.phase0 + (TWO_PI * (x - L.cx)) / moon.pitchPx;
  const kFrom = Math.ceil(toP(xFrom) / dP);
  const kTo = Math.min(Math.floor(toP(xTo) / dP), kFrom + MAX_SAMPLES);
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  for (let k = kFrom; k <= kTo; k++) {
    const phase = k * dP;
    const xBase = L.cx + ((phase - moon.phase0) * moon.pitchPx) / TWO_PI;
    earth.atMean(earth.M0 + (TWO_PI * (xBase - L.cx)) / earthPitch, s);
    const ex = xBase + s.sx;
    const ey = L.cy - s.sy;
    moonOffset(s.lon + Math.PI + phase, moon.radiusPx, vm, m);
    path.add(ex + m.sx, ey - m.sy, s.depth + m.depth * 0.02 >= 0);
  }
  return path;
}

// --- Fuses: each body's glowing recent trail ---------------------------------------

/** Trail length along the base line, px: about a third of a turn, capped. */
const trailLength = (pitchPx: number): number => Math.min(0.33 * pitchPx, 170);
const TRAIL_STEPS = 40;

/**
 * Stroke a trail given as points from oldest to newest: it brightens and thickens
 * toward the body. Drawn in a few overlapping-free chunks so colours stay true.
 */
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
    // Soft light around the trail.
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
}

/** Bodies' tracks, evaluated at the anchor time (the present when it is in view). */
export function buildScene(f: FrameInput, L: Layout, anchor: Time): Scene {
  const { cam, view } = f;
  const chosen = view.planets.map(planetById);
  const fitAU = Math.max(0.5, ...chosen.map((p) => p.el.a * (1 + p.el.e)));
  const scale = makeScale(view.scale, L.fitR, fitAU, cam.secondsPerPixel, SUN_GALACTIC_SPEED_KM_S);
  const vm = viewMatrix(view.roll);
  const tracks = chosen.map((p) => makeTrack(p, anchor, vm, scale));
  let moonPx: number | null = null;
  if (view.moon && view.planets.includes('earth')) {
    moonPx =
      view.scale === 'true'
        ? MOON_DISTANCE_KM / (SUN_GALACTIC_SPEED_KM_S * cam.secondsPerPixel)
        : Math.min(36, Math.max(7, scale.factor(1) * 0.26));
  }
  return { tracks, moonPx };
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput): void {
  const { cam, theme, view } = f;
  const L = layout(cam, view.round);
  const W = cam.width;
  const H = cam.height;
  // The Sun is always the present. Its screen position is where "now" falls on
  // the axis; coils are anchored there so every body's fuse sits exactly at now.
  const xNow = timeToX(cam, f.now);
  const nowInView = xNow > -W && xNow < 2 * W;
  const anchorTime = nowInView ? f.now : cam.center;
  const A: Layout = { ...L, cx: nowInView ? xNow : L.cx };
  const scene = buildScene(f, L, anchorTime);
  const viewingAway = Math.abs(xNow - L.cx) > 1.5;
  const additive = theme.ui === 'dark';
  const pulse = Math.sin((f.now.sec % 1.6) / 1.6 * TWO_PI);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  if (L.clipR) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.clipR, 0, TWO_PI);
    ctx.clip();
  }

  drawGalaxy(ctx, f, L);

  // Horizontal guide lines: distance from the line of travel, fixed.
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = L.cy % theme.gridSpacingPx; y <= H; y += theme.gridSpacingPx) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // Overlays: the time grid and the space grid. Both are fixed to the world, so in
  // live mode both sweep past the Sun at the same real rate.
  const ticks = view.timeGrid ? generateTicks(cam) : null;
  if (ticks) {
    verticals(ctx, ticks.minor, H, theme.grid);
    verticals(ctx, ticks.major.map((t) => t.x), H, theme.gridMajor);
  }
  const space = view.distanceGrid ? distanceGrid(cam) : null;
  if (space) {
    verticals(ctx, space.minor, H, theme.distanceGrid, [1, 5]);
    verticals(ctx, space.major, H, theme.distanceGrid, [6, 4]);
  }

  const sunStartX = Math.max(0, timeToX(cam, MIN_TIME));
  const sunEndX = Math.min(W, timeToX(cam, MAX_TIME));
  const bodiesFromX = Math.max(sunStartX, timeToX(cam, PLANETS_FORM));
  const nowBorn = nowInView && bodiesFromX <= A.cx && A.cx <= sunEndX;

  // Coils and fuse trails.
  const maxExtent = 4 * Math.max(W, H);
  const pitches = new Map<PlanetId, number>();
  const coils: Array<{ id: PlanetId; path: DepthPath }> = [];
  let moonCoil: MoonCoil | null = null;
  let moonPath: DepthPath | null = null;
  for (const track of scene.tracks) {
    const pitch = coilPitchPx(track.period, cam.secondsPerPixel).px;
    pitches.set(track.planet.id, pitch);
    if (!view.spirals || track.extent < 0.5 || track.extent > maxExtent || bodiesFromX >= sunEndX) continue;
    const from = Math.max(bodiesFromX, -track.extent);
    const to = Math.min(sunEndX, W + track.extent);
    coils.push({ id: track.planet.id, path: drawCoilPath(track, pitch, A, from, to) });
  }
  const earth = scene.tracks.find((t) => t.planet.id === 'earth');
  if (earth && scene.moonPx !== null && scene.moonPx < maxExtent) {
    moonCoil = {
      pitchPx: Math.max(SYNODIC_MONTH_SECONDS / cam.secondsPerPixel, MIN_MOON_COIL_PX),
      phase0: moonPhase(anchorTime),
      radiusPx: scene.moonPx,
    };
    if (view.spirals && bodiesFromX < sunEndX) {
      moonPath = drawMoonPath(earth, pitches.get('earth') as number, moonCoil, f, A, Math.max(bodiesFromX, -earth.extent), Math.min(sunEndX, W + earth.extent));
    }
  }

  // Back halves, rings, Sun line, front halves.
  ctx.lineWidth = theme.trailWidth;
  ctx.globalAlpha = theme.trailBackAlpha;
  for (const c of coils) {
    ctx.strokeStyle = theme.planets[c.id];
    ctx.stroke(c.path.back);
  }
  if (moonPath) {
    ctx.strokeStyle = theme.moonTrail;
    ctx.lineWidth = 1;
    ctx.stroke(moonPath.back);
  }
  ctx.globalAlpha = 1;

  const rings = view.rings && nowBorn ? scene.tracks.map((t) => ringPaths(t, A, maxExtent)) : [];
  ctx.lineWidth = 1;
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha * 0.45;
    ctx.stroke(r.path.back);
  }
  ctx.globalAlpha = 1;

  // The Sun's path: the line itself, then the Sun's own fuse burning along it.
  if (sunStartX < sunEndX) {
    ctx.strokeStyle = theme.sunLine;
    ctx.lineWidth = theme.sunLineWidth;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(sunStartX, L.cy);
    ctx.lineTo(sunEndX, L.cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (nowInView && sunStartX <= A.cx && A.cx <= sunEndX) {
      const len = Math.min(A.cx - sunStartX, L.clipR ? L.clipR * 0.55 : 260);
      const pts = new Float64Array(TRAIL_STEPS * 2);
      for (let i = 0; i < TRAIL_STEPS; i++) {
        pts[i * 2] = A.cx - len + (len * i) / (TRAIL_STEPS - 1);
        pts[i * 2 + 1] = L.cy;
      }
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
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = theme.trailWidth;
  for (const c of coils) {
    ctx.strokeStyle = theme.planets[c.id];
    ctx.stroke(c.path.front);
  }
  if (moonPath) {
    ctx.strokeStyle = theme.moonTrail;
    ctx.lineWidth = 1;
    ctx.stroke(moonPath.front);
  }
  ctx.globalAlpha = 1;

  // Fuse trails behind each body, then the burning tips.
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const vm = viewMatrix(view.roll);
  const tips: Array<{ x: number; y: number; r: number; color: string; name: string; front: boolean }> = [];
  if (nowBorn) {
    for (const track of scene.tracks) {
      if (track.extent > maxExtent) continue;
      const pitch = pitches.get(track.planet.id) as number;
      const len = Math.min(trailLength(pitch), A.cx - bodiesFromX);
      const pts = new Float64Array(TRAIL_STEPS * 2);
      for (let i = 0; i < TRAIL_STEPS; i++) {
        const xBase = A.cx - len + (len * i) / (TRAIL_STEPS - 1);
        track.atMean(track.M0 + (TWO_PI * (xBase - A.cx)) / pitch, s);
        pts[i * 2] = xBase + s.sx;
        pts[i * 2 + 1] = L.cy - s.sy;
      }
      const color = theme.planets[track.planet.id];
      strokeFuse(ctx, pts, color, theme.trailWidth * 1.4, additive);
      track.at(0, s);
      tips.push({ x: A.cx + s.sx, y: L.cy - s.sy, r: track.planet.id === 'earth' ? 3.6 : 3, color, name: track.planet.name, front: s.depth >= 0 });

      if (track === earth && moonCoil) {
        const mlen = Math.min(trailLength(moonCoil.pitchPx), A.cx - bodiesFromX);
        const mp = new Float64Array(TRAIL_STEPS * 2);
        for (let i = 0; i < TRAIL_STEPS; i++) {
          const xBase = A.cx - mlen + (mlen * i) / (TRAIL_STEPS - 1);
          earth.atMean(earth.M0 + (TWO_PI * (xBase - A.cx)) / pitch, s);
          const phase = moonCoil.phase0 + (TWO_PI * (xBase - A.cx)) / moonCoil.pitchPx;
          moonOffset(s.lon + Math.PI + phase, moonCoil.radiusPx, vm, m);
          mp[i * 2] = xBase + s.sx + m.sx;
          mp[i * 2 + 1] = L.cy - s.sy - m.sy;
        }
        strokeFuse(ctx, mp, theme.moon, 1.2, additive);
        const n = TRAIL_STEPS - 1;
        tips.push({ x: mp[n * 2] as number, y: mp[n * 2 + 1] as number, r: 2, color: theme.moon, name: '', front: true });
      }
    }
  }

  if (nowInView && sunStartX <= A.cx && A.cx <= sunEndX) spark(ctx, A.cx, L.cy, 5.5, theme.sun, pulse, additive);

  // Looking ahead or back: a cursor at the viewed moment, with hollow markers
  // where each body is on its coil then.
  if (viewingAway) {
    const top = L.topY + 12, bottom = L.labelY - 18;
    ctx.strokeStyle = theme.cursor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(L.cx) + 0.5, top);
    ctx.lineTo(Math.round(L.cx) + 0.5, bottom);
    ctx.stroke();
    if (bodiesFromX <= L.cx && L.cx <= sunEndX) {
      for (const track of scene.tracks) {
        if (track.extent > maxExtent) continue;
        const pitch = pitches.get(track.planet.id) as number;
        track.atMean(track.M0 + (TWO_PI * (L.cx - A.cx)) / pitch, s);
        ctx.strokeStyle = theme.planets[track.planet.id];
        ctx.beginPath();
        ctx.arc(L.cx + s.sx, L.cy - s.sy, 4, 0, TWO_PI);
        ctx.stroke();
      }
    }
    if (sunStartX <= L.cx && L.cx <= sunEndX) {
      ctx.strokeStyle = theme.sun;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, 5, 0, TWO_PI);
      ctx.stroke();
    }
  }
  for (const t of tips) spark(ctx, t.x, t.y, t.r, t.color, pulse, additive);

  // Names, Earth first so it wins when labels would overlap.
  if (view.labels) {
    ctx.font = theme.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const placed: Array<[number, number, number]> = [];
    const ordered = [...tips].filter((t) => t.name).sort((a, b) => Number(b.name === 'Earth') - Number(a.name === 'Earth'));
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
  // Edges of the visible area along the line of travel (the window's chord in round mode).
  const leftEdge = L.clipR ? L.cx - L.clipR : 0;
  const rightEdge = L.clipR ? L.cx + L.clipR : W;
  const endLabel = (text: string, x: number, side: 'before' | 'after'): void => {
    const width = ctx.measureText(text).width;
    const room = side === 'before' ? x - 10 - leftEdge : rightEdge - x - 10;
    if (room >= width) {
      ctx.textAlign = side === 'before' ? 'right' : 'left';
      ctx.fillText(text, side === 'before' ? x - 10 : x + 10, L.cy);
    } else {
      ctx.textAlign = side === 'before' ? 'left' : 'right';
      ctx.fillText(text, side === 'before' ? Math.max(x, leftEdge + 24) : Math.min(x, rightEdge - 24), L.cy - 16);
    }
  };
  if (sunStartX > 0) endLabel('Sun forms', sunStartX, 'before');
  if (sunEndX < W) endLabel('Sun leaves the main sequence', sunEndX, 'after');

  // Time labels along the bottom; the space grid's legend along the top.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const chord = (y: number): number => (L.clipR ? Math.sqrt(Math.max(0, L.clipR ** 2 - (y - L.cy) ** 2)) : Infinity);
  if (ticks) {
    ctx.strokeStyle = theme.tickLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of ticks.major) {
      const x = Math.round(t.x) + 0.5;
      ctx.moveTo(x, L.cy - 6);
      ctx.lineTo(x, L.cy + 6);
    }
    ctx.stroke();
    ctx.fillStyle = theme.tickText;
    const half = chord(L.labelY);
    for (const t of ticks.major) {
      const w = ctx.measureText(t.label).width / 2;
      if (Math.abs(t.x - L.cx) + w > half - 6) continue;
      ctx.fillText(t.label, t.x, L.labelY);
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
}

function ringPaths(track: Track, L: Layout, maxExtent: number): { id: PlanetId; path: DepthPath } | null {
  if (track.extent > maxExtent) return null;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const path = new DepthPath();
  const N = 120;
  for (let i = 0; i <= N; i++) {
    track.ringAt((i / N) * TWO_PI, s);
    path.add(L.cx + s.sx, L.cy - s.sy, s.depth >= 0);
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
  ctx.arc(L.cx, L.cy, r, 0, TWO_PI);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TWO_PI;
    const len = i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 3;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(L.cx + c * (r + 4), L.cy + s * (r + 4));
    ctx.lineTo(L.cx + c * (r + 4 + len), L.cy + s * (r + 4 + len));
  }
  ctx.stroke();
}

/** How far the Sun travels between two moments, km (positive = later). */
export function travelKm(from: Time, to: Time): number {
  return SUN_GALACTIC_SPEED_KM_S * diffSeconds(to, from);
}
