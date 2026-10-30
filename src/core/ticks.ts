/**
 * Axis ticks and the background grid's vertical lines (they are the same thing:
 * grid lines sit exactly on the axis ticks, and minor lines subdivide them).
 *
 * Two units:
 * - time: seconds to billions of years, calendar-aligned where the calendar applies.
 * - distance: how far the Sun travels along its galactic orbit at 230 km/s,
 *   measured from where it is now (km, AU, light years).
 */
import { type Camera, timeToX, visibleRange } from './camera';
import { SUN_GALACTIC_SPEED_KM_S } from './constants';
import { KM_PER_AU, KM_PER_LIGHT_YEAR } from './geometry';
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

export type AxisUnit = 'time' | 'distance';

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

function clockLabel(t: Time, withSeconds: boolean): string {
  const c = toCivil(t);
  if (t.sec === 0) return `${c.day} ${monthName(c.month)}`;
  const h = pad2(Math.floor(t.sec / 3600));
  const m = pad2(Math.floor((t.sec % 3600) / 60));
  return withSeconds ? `${h}:${m}:${pad2(Math.floor(t.sec % 60))}` : `${h}:${m}`;
}

/** Times of every tick of `step` in [start, end], with labels. */
function timeTicks(start: Time, end: Time, step: TickStep, labels: boolean): Array<[Time, string]> {
  const out: Array<[Time, string]> = [];
  const push = (t: Time, label: string): boolean => {
    out.push([t, labels ? label : '']);
    return out.length < MAX_TICKS;
  };
  switch (step.kind) {
    case 'seconds': {
      const s = step.n;
      let t = makeTime(start.day, Math.ceil(start.sec / s) * s);
      while (compare(t, end) <= 0) {
        if (!push(t, labels ? clockLabel(t, s < 60) : '')) break;
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

export interface DistanceStep {
  readonly unit: 'km' | 'AU' | 'ly';
  readonly n: number;
  readonly km: number;
}

function buildDistanceSteps(): DistanceStep[] {
  const steps: DistanceStep[] = [];
  const add = (unit: DistanceStep['unit'], size: number, from: number, to: number): void => {
    for (let exp = from; exp <= to; exp++) {
      for (const m of [1, 2, 5]) steps.push({ unit, n: m * 10 ** exp, km: m * 10 ** exp * size });
    }
  };
  add('km', 1, 0, 7); // 1 km … 50 million km
  add('AU', KM_PER_AU, 0, 4); // 1 AU … 50,000 AU
  add('ly', KM_PER_LIGHT_YEAR, 0, 7); // 1 ly … 50 million ly
  return steps;
}

export const DISTANCE_STEPS: readonly DistanceStep[] = buildDistanceSteps();

function formatDistance(count: number, unit: string): string {
  if (count === 0) return 'Now';
  const sign = count > 0 ? '+' : '−';
  return `${sign}${Math.abs(count).toLocaleString('en-US')} ${unit}`;
}

function distanceTicks(cam: Camera, now: Time, minSpacingPx: number): Ticks {
  const kmPerPx = SUN_GALACTIC_SPEED_KM_S * cam.secondsPerPixel;
  const pick = (minPx: number, from = 0): number => {
    for (let i = from; i < DISTANCE_STEPS.length; i++) {
      if ((DISTANCE_STEPS[i] as DistanceStep).km / kmPerPx >= minPx) return i;
    }
    return DISTANCE_STEPS.length - 1;
  };
  const mi = pick(minSpacingPx);
  const major = DISTANCE_STEPS[mi] as DistanceStep;
  // Minor: the coarsest same-unit step that divides the major and is far enough apart.
  let minorStep: DistanceStep | null = null;
  for (let j = mi - 1; j >= 0; j--) {
    const s = DISTANCE_STEPS[j] as DistanceStep;
    if (s.km / kmPerPx < MINOR_MIN_PX) break;
    if (s.unit === major.unit && major.n % s.n === 0 && major.n / s.n <= 10) {
      minorStep = s;
      break;
    }
  }

  const xNow = timeToX(cam, now);
  // Distance from now at the left and right edges, km.
  const d0 = (0 - xNow) * kmPerPx;
  const d1 = (cam.width - xNow) * kmPerPx;
  const along = (step: DistanceStep, labels: boolean): Array<[number, string]> => {
    const out: Array<[number, string]> = [];
    const first = Math.ceil(d0 / step.km);
    const last = Math.floor(d1 / step.km);
    for (let k = first; k <= last && out.length < MAX_TICKS; k++) {
      out.push([xNow + (k * step.km) / kmPerPx, labels ? formatDistance(k * step.n, step.unit) : '']);
    }
    return out;
  };
  return {
    major: along(major, true).map(([x, label]) => ({ x, label })),
    minor: minorStep ? along(minorStep, false).map(([x]) => x) : [],
  };
}

// ---------------------------------------------------------------------------

export function generateTicks(cam: Camera, unit: AxisUnit = 'time', now?: Time, minSpacingPx = 96): Ticks {
  if (unit === 'distance' && now) return distanceTicks(cam, now, minSpacingPx);
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
