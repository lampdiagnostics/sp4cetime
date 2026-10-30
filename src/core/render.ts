/**
 * Draws one frame. Everything on screen is a pure function of
 * (camera, theme, now, view options): no accumulated state, so the same inputs
 * always draw the same picture (docs/adr/0003-canvas-2d.md).
 *
 * Cost per frame is bounded by the screen, not by time: each helix is sampled
 * at most once per pixel, and collapses to a band once orbits get denser than
 * a few pixels (level of detail).
 */
import { type Camera, timeToX, xToTime } from './camera';
import { EARTH_AGE_YEARS, MAX_TIME, MIN_TIME, SUN_GALACTIC_SPEED_KM_S, SYNODIC_MONTH_SECONDS } from './constants';
import {
  centuriesFromDays,
  makeScale,
  makeTrack,
  MOON_DISTANCE_KM,
  KM_PER_AU,
  moonOffset,
  type Sample,
  type ScaleMode,
  type Track,
  viewMatrix,
} from './geometry';
import { galacticAngle, MOON_PHASE_SPEED, moonPhase } from './models';
import { planetById, type PlanetId } from './planets';
import type { Theme } from './theme';
import { type AxisUnit, generateTicks } from './ticks';
import { diffSeconds, fromYearsApprox, type Time, toDaysApprox } from './time';

export interface ViewOptions {
  /** Rotation about the line of travel, radians. */
  readonly roll: number;
  readonly scale: ScaleMode;
  readonly planets: readonly PlanetId[];
  readonly moon: boolean;
  readonly rings: boolean;
  readonly labels: boolean;
  readonly round: boolean;
  readonly axis: AxisUnit;
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
  /** Baseline of the axis labels. */
  readonly labelY: number;
}

export function layout(cam: Camera, round: boolean): Layout {
  const W = cam.width;
  const H = cam.height;
  if (round) {
    const narrow = W < 600;
    const clipR = Math.max(60, Math.min(W, H) / 2 - (narrow ? 8 : 24));
    // Portrait phones: lift the window so the controls fit underneath it.
    const cy = narrow ? Math.min(H / 2, 118 + clipR) : H / 2;
    return { cx: W / 2, cy, fitR: clipR * 0.6, clipR, labelY: cy + clipR * 0.76 };
  }
  const cy = Math.round(H * 0.45);
  const fitR = Math.max(40, Math.min(H * 0.27, W * 0.3, 300));
  // Labels sit just below the orbits, clear of the bottom corner panels.
  return { cx: W / 2, cy, fitR, clipR: null, labelY: Math.min(H - 16, cy + fitR + 40) };
}

/** Below this many px per orbit a helix is drawn as a band (level of detail). */
const MIN_PX_PER_ORBIT = 4;
const PLANETS_FORM = fromYearsApprox(-EARTH_AGE_YEARS);
const TWO_PI = Math.PI * 2;

// --- Galactic background: deterministic star field, turned by galacticAngle ---

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

function drawGrid(ctx: CanvasRenderingContext2D, f: FrameInput, L: Layout, majors: readonly number[], minors: readonly number[]): void {
  const { cam, theme } = f;
  const s = theme.gridSpacingPx;
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.grid;
  ctx.beginPath();
  for (const x of minors) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, cam.height);
  }
  // Horizontal lines are fixed: they mark distance from the line of travel, not time.
  for (let y = L.cy % s; y <= cam.height; y += s) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(cam.width, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = theme.gridMajor;
  ctx.beginPath();
  for (const x of majors) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, cam.height);
  }
  ctx.stroke();
}

// --- Planet helices ----------------------------------------------------------

interface Helix {
  readonly id: PlanetId;
  readonly back: Path2D;
  readonly front: Path2D;
  readonly moonBack: Path2D | null;
  readonly moonFront: Path2D | null;
}

interface Band {
  readonly id: PlanetId;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function sampleHelix(
  f: FrameInput,
  L: Layout,
  track: Track,
  xFrom: number,
  xTo: number,
  moonPx: number | null,
): Helix {
  const { cam, view } = f;
  const spp = cam.secondsPerPixel;
  const pxPerOrbit = track.period / spp;
  const pxPerMonth = SYNODIC_MONTH_SECONDS / spp;
  const withMoon = moonPx !== null && pxPerMonth >= MIN_PX_PER_ORBIT;
  let step = Math.min(2, Math.max(1, pxPerOrbit / 40));
  if (withMoon) step = Math.min(step, Math.max(0.5, pxPerMonth / 24));

  const back = new Path2D();
  const front = new Path2D();
  const moonBack = withMoon ? new Path2D() : null;
  const moonFront = withMoon ? new Path2D() : null;
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const vm = viewMatrix(view.roll);
  const phase0 = withMoon ? moonPhase(cam.center) : 0;

  let prevFront: boolean | null = null;
  let px = 0, py = 0;
  let prevMoonFront: boolean | null = null;
  let mx0 = 0, my0 = 0;
  for (let x = xFrom; x <= xTo + step; x += step) {
    const dt = (x - L.cx) * spp;
    track.at(dt, s);
    const X = x + s.sx;
    const Y = L.cy - s.sy;
    const isFront = s.depth >= 0;
    if (prevFront === null) (isFront ? front : back).moveTo(X, Y);
    else if (isFront !== prevFront) {
      const p = isFront ? front : back;
      p.moveTo(px, py);
      p.lineTo(X, Y);
    } else (isFront ? front : back).lineTo(X, Y);
    prevFront = isFront;
    px = X;
    py = Y;

    if (moonFront && moonBack && moonPx !== null) {
      const lon = s.lon + Math.PI + phase0 + MOON_PHASE_SPEED * dt;
      moonOffset(lon, moonPx, vm, m);
      const MX = X + m.sx;
      const MY = Y - m.sy;
      const mFront = s.depth + m.depth * 0.01 >= 0;
      if (prevMoonFront === null) (mFront ? moonFront : moonBack).moveTo(MX, MY);
      else if (mFront !== prevMoonFront) {
        const p = mFront ? moonFront : moonBack;
        p.moveTo(mx0, my0);
        p.lineTo(MX, MY);
      } else (mFront ? moonFront : moonBack).lineTo(MX, MY);
      prevMoonFront = mFront;
      mx0 = MX;
      my0 = MY;
    }
  }
  return { id: track.planet.id, back, front, moonBack, moonFront };
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.fill();
}

function withGlow(ctx: CanvasRenderingContext2D, theme: Theme, color: string, draw: () => void): void {
  if (theme.glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = theme.glow;
  }
  draw();
  ctx.shadowBlur = 0;
}

/** Everything the frame needs about the chosen bodies, computed once. */
export interface Scene {
  readonly tracks: readonly Track[];
  readonly moonPx: number | null;
}

export function buildScene(f: FrameInput, L: Layout): Scene {
  const { cam, view } = f;
  const T = centuriesFromDays(toDaysApprox(cam.center));
  const chosen = view.planets.map(planetById);
  const fitAU = Math.max(0.5, ...chosen.map((p) => p.el.a * (1 + p.el.e)));
  const scale = makeScale(view.scale, L.fitR, fitAU, cam.secondsPerPixel, SUN_GALACTIC_SPEED_KM_S);
  const vm = viewMatrix(view.roll);
  const tracks = chosen.map((p) => makeTrack(p, T, vm, scale));
  let moonPx: number | null = null;
  if (view.moon && view.planets.includes('earth')) {
    moonPx =
      view.scale === 'true'
        ? MOON_DISTANCE_KM / (SUN_GALACTIC_SPEED_KM_S * cam.secondsPerPixel)
        : Math.min(36, Math.max(7, scale.factor(1) * 0.26));
  }
  return { tracks, moonPx };
}

/** Largest on-screen offset of an orbit, px. */
function orbitExtent(track: Track): number {
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  let ext = 0;
  for (let i = 0; i < 32; i++) {
    track.ringAt((i / 32) * TWO_PI, s);
    ext = Math.max(ext, Math.abs(s.sx), Math.abs(s.sy));
  }
  return ext;
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput): void {
  const { cam, theme, view } = f;
  const L = layout(cam, view.round);
  const W = cam.width;
  const H = cam.height;
  const scene = buildScene(f, L);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  if (L.clipR) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.clipR, 0, TWO_PI);
    ctx.clip();
  }

  drawGalaxy(ctx, f, L);
  const ticks = generateTicks(cam, view.axis, f.now);
  drawGrid(ctx, f, L, ticks.major.map((t) => t.x), ticks.minor);

  const sunStartX = Math.max(0, timeToX(cam, MIN_TIME));
  const sunEndX = Math.min(W, timeToX(cam, MAX_TIME));
  const bodiesFromX = Math.max(sunStartX, timeToX(cam, PLANETS_FORM));

  // Helices and level-of-detail bands.
  const helices: Helix[] = [];
  const bands: Band[] = [];
  const maxExtent = 4 * Math.max(W, H);
  for (const track of scene.tracks) {
    if (bodiesFromX >= sunEndX) break;
    const ext = orbitExtent(track);
    if (ext < 0.5 || ext > maxExtent) continue;
    if (track.period / cam.secondsPerPixel < MIN_PX_PER_ORBIT) {
      bands.push({ id: track.planet.id, x0: bodiesFromX, x1: sunEndX, y0: L.cy - track.extentY[1], y1: L.cy - track.extentY[0] });
    } else {
      const from = Math.max(bodiesFromX, -ext);
      const to = Math.min(sunEndX, W + ext);
      const moonPx = track.planet.id === 'earth' ? scene.moonPx : null;
      helices.push(sampleHelix(f, L, track, from, to, moonPx));
    }
  }

  // Bands: outermost first so inner ones stay visible.
  for (const b of [...bands].reverse()) {
    const color = theme.planets[b.id];
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = color;
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x1, b.y0);
    ctx.moveTo(b.x0, b.y1);
    ctx.lineTo(b.x1, b.y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Back halves of the helices and orbit rings, then the Sun line, then the front halves.
  ctx.lineWidth = theme.trailWidth;
  ctx.globalAlpha = theme.trailBackAlpha;
  for (const h of helices) {
    ctx.strokeStyle = theme.planets[h.id];
    ctx.stroke(h.back);
    if (h.moonBack) {
      ctx.strokeStyle = theme.moonTrail;
      ctx.stroke(h.moonBack);
    }
  }
  ctx.globalAlpha = 1;

  const rings = view.rings ? scene.tracks.map((t) => ringPaths(t, L, maxExtent)) : [];
  ctx.lineWidth = 1;
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha * 0.45;
    ctx.stroke(r.back);
  }
  ctx.globalAlpha = 1;

  if (sunStartX < sunEndX) {
    withGlow(ctx, theme, theme.sunLine, () => {
      ctx.strokeStyle = theme.sunLine;
      ctx.lineWidth = theme.sunLineWidth;
      ctx.beginPath();
      ctx.moveTo(sunStartX, L.cy);
      ctx.lineTo(sunEndX, L.cy);
      ctx.stroke();
    });
  }

  ctx.lineWidth = 1;
  for (const r of rings) {
    if (!r) continue;
    ctx.strokeStyle = theme.planets[r.id];
    ctx.globalAlpha = theme.ringAlpha;
    ctx.stroke(r.front);
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = theme.trailWidth;
  for (const h of helices) {
    ctx.strokeStyle = theme.planets[h.id];
    ctx.stroke(h.front);
    if (h.moonFront) {
      ctx.strokeStyle = theme.moonTrail;
      ctx.lineWidth = 1;
      ctx.stroke(h.moonFront);
      ctx.lineWidth = theme.trailWidth;
    }
  }

  // Start and end of the Sun's main-sequence life.
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.tickText;
  const endLabel = (text: string, x: number, side: 'before' | 'after'): void => {
    const width = ctx.measureText(text).width;
    const room = side === 'before' ? x - 10 : W - x - 10;
    if (room >= width) {
      ctx.textAlign = side === 'before' ? 'right' : 'left';
      ctx.fillText(text, side === 'before' ? x - 10 : x + 10, L.cy);
    } else {
      ctx.textAlign = side === 'before' ? 'left' : 'right';
      ctx.fillText(text, side === 'before' ? Math.max(x, 8) : Math.min(x, W - 8), L.cy - 16);
    }
  };
  if (sunStartX > 0) endLabel('Sun forms', sunStartX, 'before');
  if (sunEndX < W) endLabel('Sun leaves the main sequence', sunEndX, 'after');

  // Axis: marks on the line of travel, labels along the bottom (inside the window).
  ctx.strokeStyle = theme.tickLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of ticks.major) {
    const x = Math.round(t.x) + 0.5;
    ctx.moveTo(x, L.cy - 6);
    ctx.lineTo(x, L.cy + 6);
  }
  for (const x of ticks.minor) {
    const xx = Math.round(x) + 0.5;
    ctx.moveTo(xx, L.cy - 2.5);
    ctx.lineTo(xx, L.cy + 2.5);
  }
  ctx.stroke();
  ctx.fillStyle = theme.tickText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const halfChord = L.clipR ? Math.sqrt(Math.max(0, L.clipR ** 2 - (L.labelY - L.cy) ** 2)) : Infinity;
  for (const t of ticks.major) {
    const w = ctx.measureText(t.label).width / 2;
    if (Math.abs(t.x - L.cx) + w > halfChord - 6) continue;
    ctx.fillText(t.label, t.x, L.labelY);
  }

  // The present moment.
  const nowX = timeToX(cam, f.now);
  const topY = L.clipR ? L.cy - L.clipR * 0.78 : L.cy - L.fitR - 32;
  if (nowX >= 0 && nowX <= W && Math.abs(diffSeconds(f.now, cam.center)) / cam.secondsPerPixel > 1.5) {
    ctx.strokeStyle = theme.today;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(Math.round(nowX) + 0.5, topY + 8);
    ctx.lineTo(Math.round(nowX) + 0.5, L.labelY - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.today;
    ctx.fillText('Now', nowX, topY);
  }

  // Scrub cursor: the centre time.
  ctx.strokeStyle = theme.cursor;
  ctx.beginPath();
  ctx.moveTo(Math.round(L.cx) + 0.5, topY + 8);
  ctx.lineTo(Math.round(L.cx) + 0.5, L.labelY - 18);
  ctx.stroke();

  // Bodies at the centre time.
  withGlow(ctx, theme, theme.sun, () => disc(ctx, L.cx, L.cy, 7, theme.sun));
  const centreBorn = timeToX(cam, PLANETS_FORM) <= L.cx;
  if (centreBorn) {
    const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
    const m: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
    const vm = viewMatrix(view.roll);
    ctx.font = theme.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Earth first so its name wins when labels would overlap.
    const ordered = [...scene.tracks].sort((a, b) => Number(b.planet.id === 'earth') - Number(a.planet.id === 'earth'));
    const placed: Array<[number, number, number]> = [];
    for (const track of ordered) {
      track.at(0, s);
      const x = L.cx + s.sx;
      const y = L.cy - s.sy;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const color = theme.planets[track.planet.id];
      withGlow(ctx, theme, color, () => disc(ctx, x, y, track.planet.id === 'earth' ? 5 : 4, color));
      if (track.planet.id === 'earth' && scene.moonPx !== null) {
        moonOffset(s.lon + Math.PI + moonPhase(cam.center), scene.moonPx, vm, m);
        disc(ctx, x + m.sx, y - m.sy, 2.5, theme.moon);
      }
      if (view.labels) {
        const w = ctx.measureText(track.planet.name).width;
        const lx = x + 9, ly = y - 9;
        const clash = placed.some(([px, py, pw]) => lx < px + pw + 4 && px < lx + w + 4 && Math.abs(py - ly) < 16);
        if (!clash) {
          ctx.fillStyle = color;
          ctx.fillText(track.planet.name, lx, ly);
          placed.push([lx, ly, w]);
        }
      }
    }
  }

  if (L.clipR) {
    ctx.restore();
    drawBezel(ctx, f, L);
  }
}

function ringPaths(track: Track, L: Layout, maxExtent: number): { id: PlanetId; back: Path2D; front: Path2D } | null {
  const s: Sample = { sx: 0, sy: 0, depth: 0, lon: 0 };
  const back = new Path2D();
  const front = new Path2D();
  const N = 120;
  let prev: boolean | null = null;
  let px = 0, py = 0;
  for (let i = 0; i <= N; i++) {
    track.ringAt((i / N) * TWO_PI, s);
    if (Math.abs(s.sx) > maxExtent || Math.abs(s.sy) > maxExtent) return null;
    const X = L.cx + s.sx;
    const Y = L.cy - s.sy;
    const isFront = s.depth >= 0;
    if (prev === null) (isFront ? front : back).moveTo(X, Y);
    else if (isFront !== prev) {
      const p = isFront ? front : back;
      p.moveTo(px, py);
      p.lineTo(X, Y);
    } else (isFront ? front : back).lineTo(X, Y);
    prev = isFront;
    px = X;
    py = Y;
  }
  return { id: track.planet.id, back, front };
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

export { KM_PER_AU, xToTime };
