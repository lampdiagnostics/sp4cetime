/**
 * Adaptive tick marks: minutes when zoomed in, billions of years when zoomed
 * out. Calendar-aligned (midnight, the 1st of the month, 1 January) where the
 * calendar applies; aligned to round "years before 2000" in deep time.
 */
import { type Camera, timeToX, visibleRange } from './camera';
import {
  addSeconds,
  compare,
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
  | { readonly kind: 'seconds'; readonly seconds: number }
  | { readonly kind: 'days'; readonly days: number }
  | { readonly kind: 'months'; readonly months: number }
  | { readonly kind: 'years'; readonly years: number };

export interface Tick {
  readonly x: number;
  readonly label: string;
}

const MAX_TICKS = 500;

function buildSteps(): TickStep[] {
  const steps: TickStep[] = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600].map(
    (seconds) => ({ kind: 'seconds', seconds }),
  );
  for (const days of [1, 2, 5, 10]) steps.push({ kind: 'days', days });
  for (const months of [1, 3, 6]) steps.push({ kind: 'months', months });
  for (let exp = 0; exp <= 9; exp++) {
    for (const m of [1, 2, 5]) {
      const years = m * 10 ** exp;
      if (years <= 5e9) steps.push({ kind: 'years', years });
    }
  }
  return steps;
}

export const TICK_STEPS: readonly TickStep[] = buildSteps();

export function stepSeconds(step: TickStep): number {
  switch (step.kind) {
    case 'seconds':
      return step.seconds;
    case 'days':
      return step.days * SECONDS_PER_DAY;
    case 'months':
      return (step.months * SECONDS_PER_YEAR) / 12;
    case 'years':
      return step.years * SECONDS_PER_YEAR;
  }
}

/** The finest step whose ticks sit at least `minSpacingPx` apart. */
export function chooseStep(secondsPerPixel: number, minSpacingPx: number): TickStep {
  for (const step of TICK_STEPS) {
    // Months and years vary in length; require a 15% margin so the shortest still fits.
    if (stepSeconds(step) / secondsPerPixel >= minSpacingPx * 1.15) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1] as TickStep;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function generateTicks(cam: Camera, minSpacingPx = 96): Tick[] {
  const step = chooseStep(cam.secondsPerPixel, minSpacingPx);
  const [start, end] = visibleRange(cam);
  const ticks: Tick[] = [];
  const push = (t: Time, label: string): boolean => {
    ticks.push({ x: timeToX(cam, t), label });
    return ticks.length < MAX_TICKS;
  };

  switch (step.kind) {
    case 'seconds': {
      const s = step.seconds;
      let t = makeTime(start.day, Math.ceil(start.sec / s) * s);
      while (compare(t, end) <= 0) {
        const c = toCivil(t);
        const label =
          t.sec === 0
            ? `${c.day} ${monthName(c.month)}`
            : `${pad2(Math.floor(t.sec / 3600))}:${pad2(Math.floor((t.sec % 3600) / 60))}`;
        if (!push(t, label)) break;
        t = addSeconds(t, s);
      }
      break;
    }
    case 'days': {
      const n = step.days;
      const firstDay = start.sec > 0 ? start.day + 1 : start.day;
      for (let d = Math.ceil(firstDay / n) * n; d <= end.day; d += n) {
        const t = makeTime(d);
        const c = toCivil(t);
        if (!push(t, `${c.day} ${monthName(c.month)}`)) break;
      }
      break;
    }
    case 'months': {
      const k = step.months;
      const c0 = toCivil(start);
      let index = Math.ceil((c0.year * 12 + (c0.month - 1)) / k) * k;
      for (;;) {
        const year = Math.floor(index / 12);
        const month = index - year * 12 + 1;
        const t = fromCivil(year, month, 1);
        if (compare(t, start) < 0) {
          index += k;
          continue;
        }
        if (compare(t, end) > 0) break;
        const y = formatCalendarYear(year);
        if (!push(t, month === 1 ? y : `${monthName(month)} ${y}`)) break;
        index += k;
      }
      break;
    }
    case 'years': {
      const k = step.years;
      // Small steps: multiples of k (calendar-friendly: 1900, 1950, 2000).
      // Large steps: round distances from 2000 (66 Ma, 4.6 Ga).
      const base = k >= 10_000 ? 2000 : 0;
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
  return ticks;
}
