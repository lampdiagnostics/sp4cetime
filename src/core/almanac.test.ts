import { describe, expect, it } from 'vitest';
import { almanacMonth, daysInMonth, weekday } from './almanac';
import { calendarPdf, moonLitPolygon } from './calendarPdf';
import { readingAt } from './reading';
import { fromCivil } from './time';

describe('calendar arithmetic', () => {
  it('counts days and weekdays', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(weekday(2000, 1, 1)).toBe(6); // Saturday
    expect(weekday(2026, 11, 2)).toBe(1); // Monday
    expect(weekday(1969, 7, 20)).toBe(0); // Sunday
  });
});

describe('almanac', () => {
  it('finds the main phases of the Moon on their GMT days', () => {
    // Published (USNO): full Moon 2026-11-24 14:53 UTC; new Moon 2026-11-09 07:02 UTC.
    const nov = almanacMonth(2026, 11);
    expect(nov.find((d) => d.mainPhase === 'Full Moon')?.day).toBe(24);
    expect(nov.find((d) => d.mainPhase === 'New Moon')?.day).toBe(9);
    // About four main phases a month, never two on one day.
    const n = nov.filter((d) => d.mainPhase).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('finds the Sun entering each sign once a year, on the right days', () => {
    let count = 0;
    for (let m = 1; m <= 12; m++) for (const d of almanacMonth(2026, m)) if (d.events.some((e) => e.startsWith('Sun enters'))) count++;
    expect(count).toBe(12);
    // March equinox 2026: 20 March 14:46 UTC.
    expect(almanacMonth(2026, 3).find((d) => d.events.includes('Sun enters Aries'))?.day).toBe(20);
  });

  it('finds Mercury’s stations (three or four a year, each followed by the other)', () => {
    const turns: string[] = [];
    for (let m = 1; m <= 12; m++) for (const d of almanacMonth(2026, m)) for (const e of d.events) if (e.startsWith('Mercury turns')) turns.push(e);
    expect(turns.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < turns.length; i++) expect(turns[i]).not.toBe(turns[i - 1]);
  });
});

describe('calendar PDF', () => {
  it('draws the Moon’s lit part from nothing to everything', () => {
    const area = (pts: Array<[number, number]>): number => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i]!, [x1, y1] = pts[(i + 1) % pts.length]!;
        a += x0 * y1 - x1 * y0;
      }
      return Math.abs(a) / 2;
    };
    const disc = Math.PI;
    expect(area(moonLitPolygon(0, 0, 1, 0))).toBeLessThan(0.01);
    expect(area(moonLitPolygon(0, 0, 1, Math.PI)) / disc).toBeCloseTo(1, 1);
    expect(area(moonLitPolygon(0, 0, 1, Math.PI / 2)) / disc).toBeCloseTo(0.5, 1);
    expect(area(moonLitPolygon(0, 0, 1, (3 * Math.PI) / 2)) / disc).toBeCloseTo(0.5, 1);
  });

  it('makes 13 pages (a cover and twelve months), or 2 in the preview', () => {
    const natal = readingAt(fromCivil(1985, 7, 14, 73_200), 49.88, -97.15);
    const o = { paper: 'letter' as const, startYear: 2027, startMonth: 1, title: 'Ada’s year in the sky', names: 'Ada', whenText: '14 July 1985', placeText: 'Winnipeg', noTime: false, dayLabel: 'Ada’s birthday', preview: false };
    const full = new TextDecoder('latin1').decode(calendarPdf(natal, o));
    expect(full.startsWith('%PDF-1.4')).toBe(true);
    expect(full).toContain('/Count 13');
    expect(full).toContain('Ada');
    const pre = new TextDecoder('latin1').decode(calendarPdf(natal, { ...o, preview: true }));
    expect(pre).toContain('/Count 2');
    expect(pre).toContain('PREVIEW');
  });
});
