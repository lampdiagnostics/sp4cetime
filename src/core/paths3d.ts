/**
 * The calendar's paths and grids in true 3D, for Fly mode (docs/adr/0009-fly-mode.md).
 *
 * Coordinates are heliocentric ecliptic km relative to the Sun *now*. Like the
 * calendar, the Sun is the present moment: a moment τ seconds away sits
 * 230 km/s × τ along the Sun's line of galactic travel. Each body's path is its
 * orbit stretched along that line, a helix. Paths are sampled from the Keplerian
 * model and shifted so they pass exactly through each body's true position now,
 * with samples packed tightly around the present.
 */
import { SGR_A_L_DEG, SUN_GALACTIC_SPEED_KM_S, SUN_GALACTOCENTRIC_KM } from './constants';
import {
  DEFAULT_ROLL,
  eccentricAnomaly,
  ECL_TO_TRAVEL,
  heliocentricEcliptic,
  KM_PER_AU,
  MOON_DISTANCE_KM,
  orbitBasis,
  type Vec3,
  viewMatrix,
} from './geometry';
import { moonPhaseMean } from './models';
import { elementsAt, orbitalPeriod, planetById, type PlanetId } from './planets';
import { chooseStep, DISTANCE_STEPS, type DistanceStep, J2000, stepSeconds, type TickStep, timeTicks } from './ticks';
import { addSeconds, diffSeconds, type Time } from './time';

/** Unit vector of the Sun's galactic travel (the time axis), ecliptic frame. */
export const TRAVEL: Vec3 = ECL_TO_TRAVEL[0];
/** The calendar's default view axes in the ecliptic frame: right (future), up, toward the viewer. */
export const CALENDAR_AXES = viewMatrix(DEFAULT_ROLL);

const V = SUN_GALACTIC_SPEED_KM_S;
const DEG = Math.PI / 180;
const centuries = (t: Time): number => (t.day + t.sec / 86_400 - 0.5) / 36_525;

/** Keplerian heliocentric position, km. */
export function keplerKm(id: PlanetId, t: Time): Vec3 {
  const p = heliocentricEcliptic(planetById(id), centuries(t));
  return [p[0] * KM_PER_AU, p[1] * KM_PER_AU, p[2] * KM_PER_AU];
}

/** The mean Moon around the Keplerian Earth, km from the Sun. */
export function meanMoonKm(t: Time): Vec3 {
  const e = keplerKm('earth', t);
  const lon = Math.atan2(e[1], e[0]) + Math.PI + moonPhaseMean(t);
  return [e[0] + MOON_DISTANCE_KM * Math.cos(lon), e[1] + MOON_DISTANCE_KM * Math.sin(lon), e[2]];
}

export type PathBody = PlanetId | 'moon';

/** How far each path reaches into the past and the future, seconds. */
/** One turn of a body's coil (its orbital period), s. */
export function pathPeriod(id: PathBody): number {
  return id === 'moon' ? 27.32 * 86_400 : orbitalPeriod(planetById(id));
}

export function pathSpan(id: PathBody): number {
  if (id === 'moon') return 2 * 27.32 * 86_400;
  return 1.5 * orbitalPeriod(planetById(id));
}

const model = (id: PathBody, t: Time): Vec3 => (id === 'moon' ? meanMoonKm(t) : keplerKm(id, t));

/**
 * A body's helix: 2K+1 points (x, y, z, …) relative to the Sun now, from −span to +span.
 * Samples are spaced quadratically, so they are densest at the present, where the
 * path passes exactly through `exactNow` (the body's true position).
 */
export function helix(
  id: PathBody,
  now: Time,
  exactNow: Vec3,
  K = 400,
  out = new Float64Array((2 * K + 1) * 3),
  /** Reshape each point's place around the Sun (e.g. the √ fit scale); the travel is left as it is. */
  shape?: (o: Vec3) => Vec3,
  /** How far into past and future to draw, s (default: one and a half turns). */
  span = pathSpan(id),
  /** Spacing of the samples: 2 crowds them toward now (for a short path), 1 spaces them evenly (for many turns). */
  power = 2,
): Float64Array {
  const m0 = model(id, now);
  const c: Vec3 = [exactNow[0] - m0[0], exactNow[1] - m0[1], exactNow[2] - m0[2]];
  for (let i = -K; i <= K; i++) {
    const s = Math.sign(i) * span * Math.abs(i / K) ** power;
    const p = i === 0 ? m0 : model(id, addSeconds(now, s));
    const j = (i + K) * 3;
    let o: Vec3 = [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
    if (shape) o = shape(o);
    out[j] = o[0] + V * s * TRAVEL[0];
    out[j + 1] = o[1] + V * s * TRAVEL[1];
    out[j + 2] = o[2] + V * s * TRAVEL[2];
  }
  return out;
}

/**
 * A path at the given moments (seconds from now, ascending), passing exactly through the
 * body's true place now. Like `helix`, but with the samples chosen by the caller.
 */
export function helixAt(
  id: PathBody,
  now: Time,
  exactNow: Vec3,
  times: ArrayLike<number>,
  n: number,
  out: Float64Array,
  shape?: (o: Vec3) => Vec3,
): Float64Array {
  const m0 = model(id, now);
  const c: Vec3 = [exactNow[0] - m0[0], exactNow[1] - m0[1], exactNow[2] - m0[2]];
  for (let i = 0; i < n; i++) {
    const s = times[i] as number;
    const p = s === 0 ? m0 : model(id, addSeconds(now, s));
    let o: Vec3 = [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
    if (shape) o = shape(o);
    out[i * 3] = o[0] + V * s * TRAVEL[0];
    out[i * 3 + 1] = o[1] + V * s * TRAVEL[1];
    out[i * 3 + 2] = o[2] + V * s * TRAVEL[2];
  }
  return out;
}

/** A planet's orbit now: a closed loop of N+1 points starting at its true position. */
export function orbitLoop(
  id: PlanetId,
  now: Time,
  exactNow: Vec3,
  N = 256,
  out = new Float64Array((N + 1) * 3),
  shape?: (o: Vec3) => Vec3,
): Float64Array {
  const el = elementsAt(planetById(id), centuries(now));
  const E0 = eccentricAnomaly((el.L - el.varpi) * DEG, el.e);
  const [P, Q] = orbitBasis((el.varpi - el.node) * DEG, el.node * DEG, el.I * DEG);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const at = (E: number): Vec3 => {
    const xp = el.a * (Math.cos(E) - el.e) * KM_PER_AU, yp = b * Math.sin(E) * KM_PER_AU;
    return [P[0] * xp + Q[0] * yp, P[1] * xp + Q[1] * yp, P[2] * xp + Q[2] * yp];
  };
  const p0 = at(E0);
  const c: Vec3 = [exactNow[0] - p0[0], exactNow[1] - p0[1], exactNow[2] - p0[2]];
  for (let i = 0; i <= N; i++) {
    const p = at(E0 + (2 * Math.PI * i) / N);
    let o: Vec3 = [p[0] + c[0], p[1] + c[1], p[2] + c[2]];
    if (shape) o = shape(o);
    out[i * 3] = o[0];
    out[i * 3 + 1] = o[1];
    out[i * 3 + 2] = o[2];
  }
  return out;
}

/**
 * The Moon's orbit now: a circle about Earth through the Moon, in the plane of its
 * motion (from its geocentric position now, `r`, and a few hours earlier, `r0`).
 */
export function moonLoop(earth: Vec3, r: Vec3, r0: Vec3, N = 128, out = new Float64Array((N + 1) * 3)): Float64Array {
  const R = Math.hypot(...r);
  const n = cross(r0, r);
  const u = scale(r, 1 / R);
  const w = scale(cross(scale(n, 1 / Math.hypot(...n)), u), R);
  for (let i = 0; i <= N; i++) {
    const a = (2 * Math.PI * i) / N;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = earth[k]! + r[k]! * Math.cos(a) + w[k]! * Math.sin(a);
  }
  return out;
}

export interface AxisMark {
  /** Distance along the line of travel from the Sun now, km (negative = past). */
  readonly s: number;
  readonly label: string;
}

/** Calendar ticks along the Sun's line, about `centreS` km from the Sun, at least `spacingKm` apart. */
export function timeMarks(now: Time, centreS: number, spacingKm: number, count = 12): AxisMark[] {
  const step = chooseStep(spacingKm / V, 1);
  const half = stepSeconds(step) * count;
  const centre = addSeconds(now, centreS / V);
  return timeTicks(addSeconds(centre, -half), addSeconds(centre, half), step, true).map(([t, label]) => ({
    s: V * diffSeconds(t, now),
    label,
  }));
}

/**
 * Fly mode's grids are a ruler along the Sun's line, not to scale with the bodies: its
 * lines keep a spacing you can see from where you are (`spacingKm`), and each gap stands
 * for one step of time chosen from the zoom (`targetSeconds`: a tenth of a minute at
 * "Minute", and so on). The ruler moves with real time: a line crosses the Sun when the
 * clock reads its label, so a finer step drifts by faster. Positions are along the line
 * from the Sun now, km on the ruler; `centreS` is the camera's place along the line.
 */
export function rulerScale(spacingKm: number, targetSeconds: number): { step: TickStep; kmPerSecond: number } {
  const step = chooseStep(Math.max(1e-3, targetSeconds) / 1.15, 1);
  return { step, kmPerSecond: spacingKm / stepSeconds(step) };
}

export function rulerTimeMarks(now: Time, centreS: number, spacingKm: number, targetSeconds: number, count = 12): AxisMark[] {
  const { step, kmPerSecond } = rulerScale(spacingKm, targetSeconds);
  const half = (stepSeconds(step) * count) / 2;
  const centre = addSeconds(now, centreS / kmPerSecond);
  return timeTicks(addSeconds(centre, -half), addSeconds(centre, half), step, true).map(([t, label]) => ({
    s: kmPerSecond * diffSeconds(t, now),
    label,
  }));
}

/** The space grid on the same ruler: marks of distance travelled, placed where the Sun passes them, and their step. */
export function rulerSpaceMarks(now: Time, centreS: number, spacingKm: number, targetSeconds: number, count = 12): { step: DistanceStep; marks: AxisMark[] } {
  const { step, kmPerSecond } = rulerScale(spacingKm, targetSeconds);
  const k = kmPerSecond / V; // ruler km per true km
  const r = spaceMarks(now, centreS / k, V * stepSeconds(step), count);
  return { step: r.step, marks: r.marks.map((m) => ({ s: m.s * k, label: '' })) };
}

/** Distance travelled by the Sun since J2000, km. */
export const travelledKm = (now: Time): number => V * diffSeconds(now, J2000);

/** The Sun's arc position on its galactic circle at J2000, seen from Sgr A* (galactic longitude), radians. */
export function galacticArcAt2000(): number {
  return (SGR_A_L_DEG - 180) * DEG;
}


/**
 * The Sun's arc position on its circle around Sgr A* (galactic longitude seen from
 * the galactic centre), radians. The Sun moves toward smaller longitudes.
 */
export function galacticArc(now: Time): number {
  return galacticArcAt2000() - travelledKm(now) / SUN_GALACTOCENTRIC_KM;
}

/**
 * Marks fixed in space along the Sun's path, every `step` km (the calendar's space grid).
 * They carry no labels: the grid says once how far apart its lines are.
 */
export function spaceMarks(now: Time, centreS: number, spacingKm: number, count = 12): { step: DistanceStep; marks: AxisMark[] } {
  const d = travelledKm(now);
  const finest = Math.max(1, (Math.abs(d) + Math.abs(centreS)) * 2e-12);
  const step = DISTANCE_STEPS.find((st) => st.km >= spacingKm && st.km >= finest) ?? (DISTANCE_STEPS[DISTANCE_STEPS.length - 1] as DistanceStep);
  // Work from the remainder so positions keep full precision far from J2000.
  const r = ((d % step.km) + step.km) % step.km;
  const kc = Math.round((centreS + r) / step.km);
  const marks: AxisMark[] = [];
  for (let k = kc - count; k <= kc + count; k++) {
    marks.push({ s: k * step.km - r, label: '' });
  }
  return { step, marks };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
