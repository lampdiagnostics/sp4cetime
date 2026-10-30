/**
 * Draws one frame. Everything on screen is a pure function of
 * (camera, theme, today, grid offset): no accumulated state, so the same
 * inputs always draw the same picture (docs/adr/0003-canvas-2d.md).
 */
import { type Camera, timeToX } from './camera';
import { EARTH_AGE_YEARS, MAX_TIME, MIN_TIME, SYNODIC_MONTH_SECONDS, TROPICAL_YEAR_SECONDS } from './constants';
import { bodyState, EARTH_ANGULAR_SPEED, galacticAngle, MOON_PHASE_SPEED } from './models';
import type { Theme } from './theme';
import { generateTicks } from './ticks';
import { fromYearsApprox, type Time } from './time';

export interface FrameInput {
  readonly cam: Camera;
  readonly theme: Theme;
  /** The real present moment, for the "Today" marker. */
  readonly now: Time;
  /** Horizontal drift of the background grid, in px. */
  readonly gridOffsetPx: number;
}

/** Geometry shared by the renderer and hit-testing. */
export function layout(cam: Camera): { cy: number; orbitR: number; moonR: number } {
  const cy = Math.round(cam.height * 0.47);
  const orbitR = Math.max(36, Math.min(cam.height * 0.22, cam.width * 0.2, 190));
  return { cy, orbitR, moonR: orbitR * 0.22 };
}

/** Below this many px per orbit the helix is drawn as a band (level of detail). */
const MIN_PX_PER_CYCLE = 5;

const EARTH_FORMS = fromYearsApprox(-EARTH_AGE_YEARS);

// --- Galactic background: deterministic star field, rotated by galacticAngle ---

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
    const a = inArm
      ? (i % 2) * Math.PI + 4.4 * r + (rand() - 0.5) * 0.55 * (1.2 - r)
      : rand() * Math.PI * 2;
    stars.push({ r, a, size: rand() < 0.08 ? 1.6 : 1, alpha: 0.25 + 0.75 * rand() });
  }
  return stars;
})();

function drawGalaxy(ctx: CanvasRenderingContext2D, f: FrameInput, cy: number): void {
  const { cam, theme } = f;
  const spin = galacticAngle(cam.center);
  const radius = Math.hypot(cam.width, cam.height) * 0.62;
  const cx = cam.width / 2;
  ctx.fillStyle = theme.galaxy;
  for (const s of STARS) {
    const a = s.a + spin;
    const x = cx + radius * s.r * Math.cos(a);
    const y = cy + radius * s.r * Math.sin(a) * 0.38;
    if (x < -2 || x > cam.width + 2 || y < -2 || y > cam.height + 2) continue;
    ctx.globalAlpha = theme.galaxyAlpha * s.alpha;
    ctx.fillRect(x, y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

function drawGrid(ctx: CanvasRenderingContext2D, f: FrameInput, cy: number): void {
  const { cam, theme } = f;
  const s = theme.gridSpacingPx;
  const start = -(((f.gridOffsetPx % s) + s) % s);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = start; x <= cam.width; x += s) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, cam.height);
  }
  for (let y = cy % s; y <= cam.height; y += s) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(cam.width, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

interface Helix {
  back: Path2D;
  front: Path2D;
  moon: Path2D | null;
}

/** Sample Earth's (and the Moon's) helix across the visible range, camera-relative. */
function buildHelix(f: FrameInput, xFrom: number, xTo: number, cy: number, orbitR: number, moonR: number): Helix {
  const { cam } = f;
  const spp = cam.secondsPerPixel;
  const centre = bodyState(cam.center);
  const pxPerOrbit = TROPICAL_YEAR_SECONDS / spp;
  const pxPerMonth = SYNODIC_MONTH_SECONDS / spp;
  const showMoon = pxPerMonth >= MIN_PX_PER_CYCLE;
  const stepPx = Math.min(2, pxPerOrbit / 36, showMoon ? pxPerMonth / 24 : Infinity);

  const back = new Path2D();
  const front = new Path2D();
  const moon = showMoon ? new Path2D() : null;
  let prevFront: boolean | null = null;
  let prevX = 0;
  let prevY = 0;

  for (let x = xFrom; x <= xTo + stepPx; x += stepPx) {
    const dt = (x - cam.width / 2) * spp;
    const theta = centre.earthLongitude + EARTH_ANGULAR_SPEED * dt;
    const y = cy - orbitR * Math.sin(theta);
    const isFront = Math.cos(theta) >= 0;
    if (prevFront === null) {
      (isFront ? front : back).moveTo(x, y);
    } else if (isFront !== prevFront) {
      (isFront ? front : back).moveTo(prevX, prevY);
      (isFront ? front : back).lineTo(x, y);
    } else {
      (isFront ? front : back).lineTo(x, y);
    }
    if (moon) {
      const phi = theta + Math.PI + centre.moonPhase + MOON_PHASE_SPEED * dt;
      const my = y - moonR * Math.sin(phi);
      if (prevFront === null) moon.moveTo(x, my);
      else moon.lineTo(x, my);
    }
    prevFront = isFront;
    prevX = x;
    prevY = y;
  }
  return { back, front, moon };
}

function withGlow(ctx: CanvasRenderingContext2D, theme: Theme, color: string, draw: () => void): void {
  if (theme.glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = theme.glow;
  }
  draw();
  ctx.shadowBlur = 0;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput): void {
  const { cam, theme } = f;
  const { cy, orbitR, moonR } = layout(cam);
  const W = cam.width;
  const H = cam.height;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  drawGalaxy(ctx, f, cy);
  drawGrid(ctx, f, cy);

  // Visible part of the Sun's life, and of Earth's.
  const sunStartX = Math.max(0, timeToX(cam, MIN_TIME));
  const sunEndX = Math.min(W, timeToX(cam, MAX_TIME));
  const earthStartX = Math.max(sunStartX, timeToX(cam, EARTH_FORMS));

  // Earth's helix (back half first, so the Sun line passes in front of it).
  const pxPerOrbit = TROPICAL_YEAR_SECONDS / cam.secondsPerPixel;
  let helix: Helix | null = null;
  if (earthStartX < sunEndX) {
    if (pxPerOrbit >= MIN_PX_PER_CYCLE) {
      helix = buildHelix(f, earthStartX, sunEndX, cy, orbitR, moonR);
      ctx.strokeStyle = theme.earthTrailBack;
      ctx.lineWidth = theme.earthTrailWidth;
      ctx.stroke(helix.back);
    } else {
      // Level of detail: too many orbits per pixel to draw, so show the envelope.
      ctx.fillStyle = theme.earthTrailBack;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(earthStartX, cy - orbitR, sunEndX - earthStartX, orbitR * 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.earthTrail;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(earthStartX, cy - orbitR);
      ctx.lineTo(sunEndX, cy - orbitR);
      ctx.moveTo(earthStartX, cy + orbitR);
      ctx.lineTo(sunEndX, cy + orbitR);
      ctx.stroke();
    }
  }

  // The Sun's galactic path: the straight central line.
  if (sunStartX < sunEndX) {
    withGlow(ctx, theme, theme.sunLine, () => {
      ctx.strokeStyle = theme.sunLine;
      ctx.lineWidth = theme.sunLineWidth;
      ctx.beginPath();
      ctx.moveTo(sunStartX, cy);
      ctx.lineTo(sunEndX, cy);
      ctx.stroke();
    });
  }

  if (helix) {
    const h = helix;
    withGlow(ctx, theme, theme.earthTrail, () => {
      ctx.strokeStyle = theme.earthTrail;
      ctx.lineWidth = theme.earthTrailWidth;
      ctx.stroke(h.front);
    });
    if (h.moon) {
      ctx.strokeStyle = theme.moonTrail;
      ctx.lineWidth = 1;
      ctx.stroke(h.moon);
    }
  }

  // Before the Sun formed / after it leaves the main sequence.
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  // Labels sit beside the line's end when there is room, otherwise above it.
  ctx.fillStyle = theme.tickText;
  const endLabel = (text: string, x: number, side: 'before' | 'after'): void => {
    const width = ctx.measureText(text).width;
    const room = side === 'before' ? x - 10 : W - x - 10;
    if (room >= width) {
      ctx.textAlign = side === 'before' ? 'right' : 'left';
      ctx.fillText(text, side === 'before' ? x - 10 : x + 10, cy);
    } else {
      ctx.textAlign = side === 'before' ? 'left' : 'right';
      ctx.fillText(text, side === 'before' ? Math.max(x, 8) : Math.min(x, W - 8), cy - 16);
    }
  };
  if (sunStartX > 0) endLabel('Sun forms', sunStartX, 'before');
  if (sunEndX < W) endLabel('Sun leaves the main sequence', sunEndX, 'after');

  // Adaptive ticks: a mark on the axis and a label along the bottom.
  const ticks = generateTicks(cam);
  ctx.strokeStyle = theme.tickLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of ticks) {
    const x = Math.round(t.x) + 0.5;
    ctx.moveTo(x, cy - 5);
    ctx.lineTo(x, cy + 5);
    ctx.moveTo(x, H - 40);
    ctx.lineTo(x, H - 32);
  }
  ctx.stroke();
  ctx.fillStyle = theme.tickText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const t of ticks) ctx.fillText(t.label, t.x, H - 16);

  // Today marker.
  const todayX = timeToX(cam, f.now);
  if (todayX >= 0 && todayX <= W) {
    ctx.strokeStyle = theme.today;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(Math.round(todayX) + 0.5, cy - orbitR - 28);
    ctx.lineTo(Math.round(todayX) + 0.5, H - 48);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.today;
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, cy - orbitR - 36);
  }

  // Scrub cursor and the bodies at the centre time.
  const cx = W / 2;
  ctx.strokeStyle = theme.cursor;
  ctx.beginPath();
  ctx.moveTo(Math.round(cx) + 0.5, cy - orbitR - 20);
  ctx.lineTo(Math.round(cx) + 0.5, cy + orbitR + 20);
  ctx.stroke();

  const state = bodyState(cam.center);
  withGlow(ctx, theme, theme.sun, () => disc(ctx, cx, cy, 7, theme.sun));
  const earthBorn = sunStartX <= cx && earthStartX <= cx;
  if (earthBorn) {
    const ey = cy - orbitR * Math.sin(state.earthLongitude);
    const phi = state.earthLongitude + Math.PI + state.moonPhase;
    withGlow(ctx, theme, theme.earth, () => disc(ctx, cx, ey, 5.5, theme.earth));
    disc(ctx, cx, ey - moonR * Math.sin(phi), 3, theme.moon);
  }
}
