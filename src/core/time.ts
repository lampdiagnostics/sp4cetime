/**
 * Deep-time representation (see docs/adr/0001-time-model.md).
 *
 * A Time is a whole number of days since the epoch (2000-01-01 00:00 UTC)
 * plus seconds within that day. Integers are exact in a double up to 9e15,
 * and the Sun's whole main-sequence life is about 4e12 days, so `day` never
 * loses precision. `sec` stays in [0, 86400), so sub-second detail survives
 * even 4.6 billion years ago.
 *
 * Never convert a Time to one big "seconds" number for screen maths:
 * subtract the camera time first (diffSeconds), then scale.
 */

export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_JULIAN_YEAR = 365.25;
export const SECONDS_PER_YEAR = SECONDS_PER_DAY * DAYS_PER_JULIAN_YEAR;

/** Days from 1970-01-01 to the epoch 2000-01-01. */
const UNIX_EPOCH_OFFSET_DAYS = 10_957;

export interface Time {
  /** Whole days since 2000-01-01 00:00 UTC. Always an integer. */
  readonly day: number;
  /** Seconds into the day, 0 <= sec < 86400. */
  readonly sec: number;
}

export const EPOCH: Time = { day: 0, sec: 0 };

/** Build a normalized Time from any day count and second offset. */
export function makeTime(day: number, sec = 0): Time {
  const wholeDay = Math.floor(day);
  let s = sec + (day - wholeDay) * SECONDS_PER_DAY;
  const carry = Math.floor(s / SECONDS_PER_DAY);
  s -= carry * SECONDS_PER_DAY;
  // A subnormal negative (e.g. -5e-324) underflows s / 86400 to -0, so no
  // carry happens; treat it, and -0, as zero.
  if (!(s > 0)) s = 0;
  // Guard against s === 86400 from floating-point rounding.
  if (s >= SECONDS_PER_DAY) {
    return { day: wholeDay + carry + 1, sec: 0 };
  }
  return { day: wholeDay + carry, sec: s };
}

/** Add seconds (any magnitude, any sign). Exact for |seconds| < 2^53. */
export function addSeconds(t: Time, seconds: number): Time {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  return makeTime(t.day + days, t.sec + (seconds - days * SECONDS_PER_DAY));
}

/** Add whole or fractional days. */
export function addDays(t: Time, days: number): Time {
  return makeTime(t.day + days, t.sec);
}

/** a − b in seconds. Exact when a and b are close; approximate when far apart. */
export function diffSeconds(a: Time, b: Time): number {
  return (a.day - b.day) * SECONDS_PER_DAY + (a.sec - b.sec);
}

export function compare(a: Time, b: Time): number {
  return a.day !== b.day ? a.day - b.day : a.sec - b.sec;
}

export function clampTime(t: Time, lo: Time, hi: Time): Time {
  if (compare(t, lo) < 0) return lo;
  if (compare(t, hi) > 0) return hi;
  return t;
}

/** Days since epoch as a single (approximate) number, for slow-varying models. */
export function toDaysApprox(t: Time): number {
  return t.day + t.sec / SECONDS_PER_DAY;
}

/** Julian years since the epoch, approximate. */
export function toYearsApprox(t: Time): number {
  return toDaysApprox(t) / DAYS_PER_JULIAN_YEAR;
}

export function fromYearsApprox(years: number): Time {
  return makeTime(years * DAYS_PER_JULIAN_YEAR);
}

export function fromUnixMs(ms: number): Time {
  const days = Math.floor(ms / 86_400_000);
  return makeTime(days - UNIX_EPOCH_OFFSET_DAYS, (ms - days * 86_400_000) / 1000);
}

export function toUnixMs(t: Time): number {
  return (t.day + UNIX_EPOCH_OFFSET_DAYS) * 86_400_000 + t.sec * 1000;
}

// ---------------------------------------------------------------------------
// Proleptic Gregorian calendar with astronomical year numbering
// (year 0 = 1 BCE, year −1 = 2 BCE). Valid for any integer year.
// Algorithm: Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms".
// ---------------------------------------------------------------------------

export interface CivilDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

function daysFromCivilUnix(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function civilFromDaysUnix(z0: number): CivilDate {
  const z = z0 + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function fromCivil(year: number, month = 1, day = 1, sec = 0): Time {
  return makeTime(daysFromCivilUnix(year, month, day) - UNIX_EPOCH_OFFSET_DAYS, sec);
}

export function toCivil(t: Time): CivilDate {
  return civilFromDaysUnix(t.day + UNIX_EPOCH_OFFSET_DAYS);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? '?';
}

/** Calendar years within this range are shown as dates; beyond, as "66 Ma" etc. */
export const CALENDAR_YEAR_LIMIT = 9_999;

/** "2026", "44 BCE", "66 Ma", "4.6 Ga", "+1.2 Gyr". `year` is astronomical. */
export function formatYear(year: number, significant = 3): string {
  if (Math.abs(year) <= CALENDAR_YEAR_LIMIT) {
    return year <= 0 ? `${1 - year} BCE` : `${year}`;
  }
  const yearsAgo = 2000 - year;
  if (yearsAgo > 0) return `${formatMagnitude(yearsAgo, significant, ['ka', 'Ma', 'Ga'])}`;
  return `+${formatMagnitude(-yearsAgo, significant, ['kyr', 'Myr', 'Gyr'])}`;
}

/** Always calendar style, for labels finer than a year: "12001 BCE", "2026". */
export function formatCalendarYear(year: number): string {
  return year <= 0 ? `${1 - year} BCE` : `${year}`;
}

function formatMagnitude(years: number, significant: number, units: [string, string, string]): string {
  const [k, m, g] = units;
  if (years >= 1e9) return `${trim(years / 1e9, significant)} ${g}`;
  if (years >= 1e6) return `${trim(years / 1e6, significant)} ${m}`;
  return `${trim(years / 1e3, significant)} ${k}`;
}

function trim(value: number, significant: number): string {
  return String(Number(value.toPrecision(significant)));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Human label for a moment, with detail suited to the zoom level
 * (`secondsPerPixel`).
 */
export function formatTime(t: Time, secondsPerPixel: number): string {
  const c = toCivil(t);
  if (secondsPerPixel > SECONDS_PER_DAY * 20) {
    if (Math.abs(c.year) <= CALENDAR_YEAR_LIMIT) return formatYear(c.year);
    const digits = secondsPerPixel < SECONDS_PER_YEAR * 1e3 ? 6 : 4;
    return formatYear(c.year, digits);
  }
  const yearLabel = formatCalendarYear(c.year);
  const date = `${c.day} ${monthName(c.month)} ${yearLabel}`;
  if (secondsPerPixel > 600) return date;
  const h = Math.floor(t.sec / 3600);
  const m = Math.floor((t.sec % 3600) / 60);
  return `${date}, ${pad2(h)}:${pad2(m)} GMT`;
}

/** "1 px ≈ 3.2 days" style description of a zoom level. */
export function formatDuration(seconds: number): string {
  const units: Array<[number, string]> = [
    [SECONDS_PER_YEAR * 1e9, 'Gyr'],
    [SECONDS_PER_YEAR * 1e6, 'Myr'],
    [SECONDS_PER_YEAR * 1e3, 'kyr'],
    [SECONDS_PER_YEAR, 'yr'],
    [SECONDS_PER_DAY, 'days'],
    [3600, 'h'],
    [60, 'min'],
    [1, 's'],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) return `${trim(seconds / size, 2)} ${name}`;
  }
  return `${trim(seconds, 2)} s`;
}
