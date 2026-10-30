/**
 * Axis ticks and the background grid's vertical lines (they are the same thing:
 * grid lines sit exactly on the axis ticks, and minor lines subdivide them).
 *
 * Time ticks run from seconds to billions of years, calendar-aligned where the
 * calendar applies. The distance grid (below) is a second, independent overlay.
 */
import { type Camera, timeToX, visibleRange } from './camera';
import { SUN_GALACTIC_SPEED_KM_S, SUN_GALACTOCENTRIC_KM } from './constants';
import {
  addSeconds,
  compare,
  diffSeconds,
  formatCalendarYear,
  formatYear,
  fromCivil,
  makeTime,
  monthName,
  SECONDS_PER_DAY,
  SECONDS_PER_YEAR,
  type Time,
  toCivil,
} from './time';

export type TickStep =
  | { readonly kind: 'seconds'; readonly n: number }
  | { readonly kind: 'days'; readonly n: number }
  | { readonly kind: 'months'; readonly n: number }
  | { readonly kind: 'years'; readonly n: number };

export interface Tick {
  readonly x: number;
  readonly label: string;
}

export interface Ticks {
  readonly major: readonly Tick[];
  /** x positions of minor grid lines (may coincide with majors). */
  readonly minor: readonly number[];
}

const MAX_TICKS = 600;
const MINOR_MIN_PX = 14;

function buildSteps(): TickStep[] {
  const steps: TickStep[] = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200].map(
    (n) => ({ kind: 'seconds', n }),
  );
  for (const n of [1, 2, 5, 10]) steps.push({ kind: 'days', n });
  for (const n of [1, 2, 3, 6]) steps.push({ kind: 'months', n });
  for (let exp = 0; exp <= 9; exp++) {
    for (const m of [1, 2, 5]) {
      const n = m * 10 ** exp;
      if (n <= 5e9) steps.push({ kind: 'years', n });
    }
  }
  return steps;
}

export const TICK_STEPS: readonly TickStep[] = buildSteps();

export function stepSeconds(step: TickStep): number {
  switch (step.kind) {
    case 'seconds':
      return step.n;
    case 'days':
      return step.n * SECONDS_PER_DAY;
    case 'months':
      return (step.n * SECONDS_PER_YEAR) / 12;
    case 'years':
      return step.n * SECONDS_PER_YEAR;
  }
}

/** Year ticks of n ≥ 5000 count from 2000 ("66 Ma"); smaller ones from year 0 ("1950"). */
const yearBase = (n: number): number => (n >= 5000 ? 2000 : 0);

/** Does every tick of `major` fall on a tick of `minor`? */
export function nests(minor: TickStep, major: TickStep): boolean {
  if (minor.kind === major.kind) {
    if (major.n % minor.n !== 0) return false;
    if (minor.kind === 'years') return (yearBase(major.n) - yearBase(minor.n)) % minor.n === 0;
    return true;
  }
  if (minor.kind === 'seconds' && major.kind === 'days') return SECONDS_PER_DAY % minor.n === 0;
  if (minor.kind === 'months' && major.kind === 'years') return (major.n * 12) % minor.n === 0;
  return false;
}

/** The finest step whose ticks sit at least `minSpacingPx` apart. */
export function chooseStep(secondsPerPixel: number, minSpacingPx: number): TickStep {
  for (const step of TICK_STEPS) {
    // Months and years vary in length; a 15% margin keeps the shortest apart.
    if (stepSeconds(step) / secondsPerPixel >= minSpacingPx * 1.15) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1] as TickStep;
}

/** The coarsest step that nests inside `major` and is at least MINOR_MIN_PX apart. */
export function chooseMinor(major: TickStep, secondsPerPixel: number): TickStep | null {
  const i = TICK_STEPS.indexOf(major);
  for (let j = i - 1; j >= 0; j--) {
    const s = TICK_STEPS[j] as TickStep;
    if (stepSeconds(s) / secondsPerPixel < MINOR_MIN_PX * 1.15) break;
    if (nests(s, major) && stepSeconds(major) / stepSeconds(s) <= 10) return s;
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Clock-time label; adds the date when the view spans more than one day so labels stay unique. */
function clockLabel(t: Time, withSeconds: boolean, withDate: boolean): string {
  const c = toCivil(t);
  const date = `${c.day} ${monthName(c.month)}`;
  if (t.sec === 0) return date;
  const h = pad2(Math.floor(t.sec / 3600));
  const m = pad2(Math.floor((t.sec % 3600) / 60));
  const clock = withSeconds ? `${h}:${m}:${pad2(Math.floor(t.sec % 60))}` : `${h}:${m}`;
  return withDate ? `${date} ${clock}` : clock;
}

/** Times of every tick of `step` in [start, end], with labels. */
export function timeTicks(start: Time, end: Time, step: TickStep, labels: boolean): Array<[Time, string]> {
  const out: Array<[Time, string]> = [];
  const push = (t: Time, label: string): boolean => {
    out.push([t, labels ? label : '']);
    return out.length < MAX_TICKS;
  };
  switch (step.kind) {
    case 'seconds': {
      const s = step.n;
      const multiDay = diffSeconds(end, start) >= SECONDS_PER_DAY * 0.9;
      let t = makeTime(start.day, Math.ceil(start.sec / s) * s);
      while (compare(t, end) <= 0) {
        if (!push(t, labels ? clockLabel(t, s < 60, multiDay) : '')) break;
        t = addSeconds(t, s);
      }
      break;
    }
    case 'days': {
      const n = step.n;
      const firstDay = start.sec > 0 ? start.day + 1 : start.day;
      for (let d = Math.ceil(firstDay / n) * n; d <= end.day; d += n) {
        const t = makeTime(d);
        const c = toCivil(t);
        if (!push(t, `${c.day} ${monthName(c.month)}`)) break;
      }
      break;
    }
    case 'months': {
      const k = step.n;
      const c0 = toCivil(start);
      for (let index = Math.ceil((c0.year * 12 + (c0.month - 1)) / k) * k - k; ; index += k) {
        const year = Math.floor(index / 12);
        const month = index - year * 12 + 1;
        const t = fromCivil(year, month, 1);
        if (compare(t, start) < 0) continue;
        if (compare(t, end) > 0) break;
        const y = formatCalendarYear(year);
        if (!push(t, month === 1 ? y : `${monthName(month)} ${y}`)) break;
      }
      break;
    }
    case 'years': {
      const k = step.n;
      const base = yearBase(k);
      const y0 = toCivil(start).year;
      let year = base + Math.ceil((y0 - base) / k) * k;
      if (compare(fromCivil(year), start) < 0) year += k;
      const significant = (y: number): number =>
        Math.max(3, Math.floor(Math.log10(Math.max(Math.abs(2000 - y), 1))) - Math.floor(Math.log10(k)) + 1);
      for (; ; year += k) {
        const t = fromCivil(year);
        if (compare(t, end) > 0) break;
        if (!push(t, formatYear(year, significant(year)))) break;
      }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Distance ticks
// ---------------------------------------------------------------------------

/**
 * Space-grid steps are arcs of the Sun's circle around the galactic centre
 * (docs/adr/0010-spheres.md): seconds, minutes and degrees of arc, with the
 * length in km that each spans at the Sun's distance from Sgr A*.
 */
export interface DistanceStep {
  readonly unit: 'arcsec' | 'arcmin' | 'deg';
  readonly n: number;
  /** The arc, radians. */
  readonly rad: number;
  /** Its length along the Sun's path, km. */
  readonly km: number;
}

function buildDistanceSteps(): DistanceStep[] {
  const steps: DistanceStep[] = [];
  const add = (unit: DistanceStep['unit'], n: number, perUnitRad: number): void => {
    const rad = n * perUnitRad;
    steps.push({ unit, n, rad, km: rad * SUN_GALACTOCENTRIC_KM });
  };
  const ARCSEC = Math.PI / 180 / 3600;
  for (let exp = -9; exp <= 1; exp++) for (const m of [1, 2, 5]) add('arcsec', Number((m * 10 ** exp).toPrecision(1)), ARCSEC);
  for (const n of [1, 2, 5, 10, 15, 30]) add('arcmin', n, ARCSEC * 60);
  for (const n of [1, 2, 5, 10, 15, 30, 45, 90, 180, 360, 720, 1800, 3600, 7200, 18_000, 36_000]) add('deg', n, Math.PI / 180);
  return steps;
}

export const DISTANCE_STEPS: readonly DistanceStep[] = buildDistanceSteps();

export interface DistanceGrid {
  /** x positions of the main and finer space-grid lines. */
  readonly major: readonly number[];
  readonly minor: readonly number[];
  /** Spacing of the main lines. */
  readonly step: DistanceStep;
}

/** The fixed point in space the distance grid is measured from: the Sun's position at J2000.0. */
export const J2000: Time = makeTime(0, 43_200);

/**
 * A grid fixed in space along the Sun's galactic path. The Sun crosses it at
 * 230 km/s, so in live mode the lines sweep past exactly like the time grid.
 * Steps too fine for double precision at this distance from J2000 are skipped,
 * so lines never jitter.
 */
export function distanceGrid(cam: Camera, minSpacingPx = 96): DistanceGrid {
  const kmPerPx = SUN_GALACTIC_SPEED_KM_S * cam.secondsPerPixel;
  const dCentre = SUN_GALACTIC_SPEED_KM_S * diffSeconds(cam.center, J2000);
  const finest = Math.max(1, Math.abs(dCentre) * 2e-12);
  const pick = (minPx: number): number => {
    for (let i = 0; i < DISTANCE_STEPS.length; i++) {
      const st = DISTANCE_STEPS[i] as DistanceStep;
      if (st.km / kmPerPx >= minPx && st.km >= finest) return i;
    }
    return DISTANCE_STEPS.length - 1;
  };
  const mi = pick(minSpacingPx);
  const major = DISTANCE_STEPS[mi] as DistanceStep;
  let minorStep: DistanceStep | null = null;
  for (let j = mi - 1; j >= 0; j--) {
    const st = DISTANCE_STEPS[j] as DistanceStep;
    if (st.km / kmPerPx < MINOR_MIN_PX || st.km < finest) break;
    const ratio = major.rad / st.rad;
    if (Math.abs(ratio - Math.round(ratio)) < 1e-6 && ratio <= 10.5) {
      minorStep = st;
      break;
    }
  }
  const cx = cam.width / 2;
  const d0 = dCentre - cx * kmPerPx;
  const d1 = dCentre + (cam.width - cx) * kmPerPx;
  const lines = (step: DistanceStep): number[] => {
    const out: number[] = [];
    // Offset of the first line from the centre, computed as a remainder to keep precision.
    const r = ((dCentre % step.km) + step.km) % step.km;
    const first = Math.ceil((d0 - dCentre + r) / step.km);
    const last = Math.floor((d1 - dCentre + r) / step.km);
    for (let k = first; k <= last && out.length < MAX_TICKS; k++) out.push(cx + (k * step.km - r) / kmPerPx);
    return out;
  };
  return { major: lines(major), minor: minorStep ? lines(minorStep) : [], step: major };
}

/** Seconds of arc with their decimals grouped: "0.000 001". */
export function formatArcseconds(n: number, decimals = Math.max(0, Math.ceil(-Math.log10(n) - 1e-9))): string {
  const [whole, frac] = n.toFixed(decimals).split('.');
  return frac ? `${whole}.${frac.replace(/(\d{3})(?=\d)/g, '$1\u2009')}` : (whole as string);
}

/** "0.001″", "5′", "2°" of the Sun's galactic circle. */
export function formatDistanceStep(step: DistanceStep): string {
  if (step.unit === 'arcsec') return `${formatArcseconds(step.n)}″`;
  return step.unit === 'arcmin' ? `${step.n}′` : `${step.n.toLocaleString('en-US')}°`;
}

// ---------------------------------------------------------------------------

export function generateTicks(cam: Camera, minSpacingPx = 96): Ticks {
  const [start, end] = visibleRange(cam);
  const step = chooseStep(cam.secondsPerPixel, minSpacingPx);
  const minorStep = chooseMinor(step, cam.secondsPerPixel);
  return {
    major: timeTicks(start, end, step, true).map(([t, label]) => ({ x: timeToX(cam, t), label })),
    minor: minorStep ? timeTicks(start, end, minorStep, false).map(([t]) => timeToX(cam, t)) : [],
  };
}

/** Seconds from `a` to `b` (exported for the HUD's distance read-out). */
export function distanceKm(a: Time, b: Time): number {
  return SUN_GALACTIC_SPEED_KM_S * diffSeconds(b, a);
}
