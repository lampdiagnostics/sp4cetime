import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addSeconds,
  compare,
  diffSeconds,
  EPOCH,
  formatTime,
  formatYear,
  fromCivil,
  fromUnixMs,
  makeTime,
  SECONDS_PER_DAY,
  toCivil,
  toUnixMs,
} from './time';

const DEEP = 5e9 * 366; // days, comfortably past ±5 Gyr

const anyTime = fc
  .tuple(fc.integer({ min: -DEEP, max: DEEP }), fc.double({ min: 0, max: SECONDS_PER_DAY, maxExcluded: true, noNaN: true }))
  .map(([day, sec]) => makeTime(day, sec));

describe('Time basics', () => {
  it('uses 2000-01-01 00:00 UTC as the epoch', () => {
    expect(fromCivil(2000, 1, 1)).toEqual(EPOCH);
    expect(toUnixMs(EPOCH)).toBe(Date.UTC(2000, 0, 1));
  });

  it('round-trips Unix milliseconds', () => {
    const ms = Date.UTC(2026, 9, 30, 5, 20, 13, 250);
    expect(toUnixMs(fromUnixMs(ms))).toBe(ms);
    expect(fromUnixMs(0)).toEqual({ day: -10_957, sec: 0 });
  });

  it('normalizes seconds into [0, 86400)', () => {
    expect(makeTime(0, -1)).toEqual({ day: -1, sec: 86_399 });
    expect(makeTime(0, 86_400)).toEqual({ day: 1, sec: 0 });
    expect(makeTime(1.5)).toEqual({ day: 1, sec: 43_200 });
    expect(addSeconds(EPOCH, -5e-324)).toEqual({ day: 0, sec: 0 });
    expect(Object.is(makeTime(0, -0).sec, 0)).toBe(true);
  });

  it('always keeps day an integer and sec in range', () => {
    fc.assert(
      fc.property(anyTime, fc.double({ min: -1e17, max: 1e17, noNaN: true }), (t, s) => {
        const r = addSeconds(t, s);
        expect(Number.isInteger(r.day)).toBe(true);
        expect(r.sec).toBeGreaterThanOrEqual(0);
        expect(r.sec).toBeLessThan(SECONDS_PER_DAY);
      }),
    );
  });

  it('adds and subtracts small offsets exactly, even in deep time', () => {
    fc.assert(
      fc.property(anyTime, fc.integer({ min: -1e9, max: 1e9 }), (t, s) => {
        expect(diffSeconds(addSeconds(t, s), t)).toBeCloseTo(s, 6);
      }),
    );
  });

  it('resolves one second 4.6 billion years ago', () => {
    const deep = makeTime(-4.6e9 * 365.25);
    const later = addSeconds(deep, 1);
    expect(compare(later, deep)).toBeGreaterThan(0);
    expect(diffSeconds(later, deep)).toBe(1);
  });
});

describe('Calendar', () => {
  it('matches the JavaScript Date for modern dates', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (days) => {
        const t = makeTime(days);
        const d = new Date(toUnixMs(t));
        expect(toCivil(t)).toEqual({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
      }),
    );
  });

  it('round-trips civil dates across the whole range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5e9, max: 5e9 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          expect(toCivil(fromCivil(year, month, day))).toEqual({ year, month, day });
        },
      ),
    );
  });

  it('uses astronomical years: year 0 is 1 BCE', () => {
    expect(formatYear(0)).toBe('1 BCE');
    expect(formatYear(-43)).toBe('44 BCE');
    expect(formatYear(2026)).toBe('2026');
  });

  it('labels deep time in Ma/Ga and the far future in Myr/Gyr', () => {
    expect(formatYear(2000 - 66e6)).toBe('66 Ma');
    expect(formatYear(2000 - 4.6e9)).toBe('4.6 Ga');
    expect(formatYear(2000 + 1.2e9)).toBe('+1.2 Gyr');
  });

  it('formats with detail suited to the zoom', () => {
    const t = fromCivil(2026, 10, 30, 5 * 3600 + 20 * 60);
    expect(formatTime(t, 10)).toBe('30 Oct 2026, 05:20 UTC');
    expect(formatTime(t, 3600)).toBe('30 Oct 2026');
    expect(formatTime(fromCivil(-43_123_861, 10, 3), 3600)).toBe('3 Oct 43123862 BCE');
    expect(formatTime(t, 1e8)).toBe('2026');
  });
});
