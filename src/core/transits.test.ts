import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { aspectsTo, moonPhaseName, readout, readoutEmail, separation } from './transits';
import { readingAt } from './reading';
import { fromCivil } from './time';

describe('separation', () => {
  it('is symmetric, 0–180°, and ignores whole turns', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), fc.double({ min: -1e4, max: 1e4, noNaN: true }), fc.integer({ min: -5, max: 5 }), (a, b, k) => {
        const s = separation(a, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(180 + 1e-9);
        expect(separation(b, a)).toBeCloseTo(s, 6);
        expect(separation(a + 360 * k, b)).toBeCloseTo(s, 6);
      }),
    );
  });
  it('knows its angles', () => {
    expect(separation(10, 350)).toBeCloseTo(20);
    expect(separation(0, 180)).toBeCloseTo(180);
    expect(separation(90, 210)).toBeCloseTo(120);
  });
});

describe('readout', () => {
  const natal = readingAt(fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60), 49.88, -97.15);
  const now = readingAt(fromCivil(2026, 11, 2, 12 * 3600), 49.88, -97.15);

  it('finds a body conjunct itself (the same moment)', () => {
    const a = aspectsTo(natal, natal);
    expect(a.some((x) => x.now === 'Sun' && x.natal === 'Sun' && x.name === 'conjunction' && x.off < 1e-9)).toBe(true);
    // Never today's Moon (it moves too fast to matter by the time the mail is read).
    expect(a.every((x) => x.now !== 'Moon')).toBe(true);
  });

  it('puts every body in a house of the natal chart, and lists aspects closest first within orb', () => {
    const r = readout(now, natal);
    expect(r.lines).toHaveLength(10);
    for (const l of r.lines) expect(l.house).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < r.aspects.length; i++) expect(r.aspects[i]!.off).toBeGreaterThanOrEqual(r.aspects[i - 1]!.off);
    for (const a of r.aspects) expect(a.off).toBeLessThanOrEqual(3);
  });

  it('names the phases', () => {
    expect(moonPhaseName(0)).toBe('New Moon');
    expect(moonPhaseName(Math.PI)).toBe('Full Moon');
    expect(moonPhaseName(Math.PI / 2)).toBe('First quarter');
    expect(moonPhaseName((7 * Math.PI) / 4)).toBe('Waning crescent');
  });

  it('writes an email with text, HTML, a way to stop, and escapes what people type', () => {
    const e = readoutEmail(readout(now, natal), { dateText: '2 November 2026', whenText: '14 July 1985', placeText: 'Winnipeg', names: '<Ada>', natalHasTime: true, manageUrl: 'https://example.test/manage' });
    expect(e.subject).toContain('<Ada>');
    expect(e.html).toContain('&lt;Ada&gt;');
    expect(e.html).not.toContain('<Ada>');
    expect(e.text).toContain('https://example.test/manage');
    expect(e.html).toContain('chani.com');
  });
});
