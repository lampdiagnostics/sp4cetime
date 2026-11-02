import { describe, expect, it } from 'vitest';
import { formatOffset, localToUtc, zoneOffsetMinutes } from './zones';

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

describe('Local birth time to UTC', () => {
  it('uses the zone’s offset on that date, daylight saving included', () => {
    expect(iso(localToUtc({ year: 1985, month: 7, day: 14, hour: 15, minute: 20 }, 'America/Winnipeg').utcMs)).toBe('1985-07-14T20:20');
    expect(iso(localToUtc({ year: 1985, month: 1, day: 14, hour: 15, minute: 20 }, 'America/Winnipeg').utcMs)).toBe('1985-01-14T21:20');
    expect(iso(localToUtc({ year: 2001, month: 3, day: 1, hour: 0, minute: 0 }, 'Asia/Kolkata').utcMs)).toBe('2001-02-28T18:30');
    expect(localToUtc({ year: 1985, month: 7, day: 14, hour: 15, minute: 20 }, 'America/Winnipeg').offset).toBe(-300);
  });

  it('says when a clock time never happened, or happened twice', () => {
    // 2026-03-08 02:30 in Winnipeg: clocks jumped from 02:00 to 03:00.
    expect(localToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/Winnipeg').note).toBe('gap');
    // 2026-11-01 01:30 in Chicago: once in daylight time, once in standard time; the first is taken.
    // (Not Winnipeg: the time zone database has Manitoba staying on UTC−5 from 2026.)
    const twice = localToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/Chicago');
    expect(twice.note).toBe('twice');
    expect(iso(twice.utcMs)).toBe('2026-11-01T06:30');
  });

  it('round-trips: the zone’s clock at the result reads the time asked for', () => {
    for (const zone of ['America/Winnipeg', 'Europe/London', 'Australia/Adelaide', 'Pacific/Chatham', 'America/St_Johns']) {
      for (const month of [1, 4, 7, 10]) {
        const r = localToUtc({ year: 1990, month, day: 15, hour: 9, minute: 45 }, zone);
        const back = new Date(r.utcMs + zoneOffsetMinutes(zone, r.utcMs) * 60_000);
        expect(back.getUTCHours()).toBe(9);
        expect(back.getUTCMinutes()).toBe(45);
      }
    }
  });

  it('formats offsets', () => {
    expect(formatOffset(-300)).toBe('UTC−5');
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(0)).toBe('UTC+0');
  });
});
