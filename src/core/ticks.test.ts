import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { MIN_SECONDS_PER_PIXEL } from './constants';
import { chooseMinor, distanceGrid, formatDistanceStep, formatKm, generateTicks, nests, stepSeconds, TICK_STEPS } from './ticks';
import { addSeconds, fromCivil, fromYearsApprox } from './time';

const cam = (yearsFromNow: number, secondsPerPixel: number): Camera => ({
  center: fromYearsApprox(yearsFromNow),
  secondsPerPixel,
  width: 1200,
  height: 800,
});

const anyView = fc.tuple(
  fc.double({ min: -4.5e9, max: 4.9e9, noNaN: true }),
  fc.double({ min: Math.log10(MIN_SECONDS_PER_PIXEL), max: 14.5, noNaN: true }),
);

describe('Time ticks', () => {
  it('are ordered, labelled, spaced and bounded at every depth and zoom', () => {
    fc.assert(
      fc.property(anyView, ([years, logSpp]) => {
        const { major } = generateTicks(cam(years, 10 ** logSpp));
        expect(major.length).toBeLessThan(600);
        for (const t of major) expect(t.label.length).toBeGreaterThan(0);
        for (let i = 1; i < major.length; i++) {
          expect((major[i]?.x ?? 0) - (major[i - 1]?.x ?? 0)).toBeGreaterThanOrEqual(90);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('never repeats a label in one view', () => {
    fc.assert(
      fc.property(anyView, ([years, logSpp]) => {
        const labels = generateTicks(cam(years, 10 ** logSpp)).major.map((t) => t.label);
        expect(new Set(labels).size).toBe(labels.length);
      }),
      { numRuns: 300 },
    );
  });

  it('puts a minor grid line under every major tick', () => {
    fc.assert(
      fc.property(anyView, ([years, logSpp]) => {
        const { major, minor } = generateTicks(cam(years, 10 ** logSpp));
        if (minor.length === 0) return;
        for (const t of major) {
          expect(minor.some((x) => Math.abs(x - t.x) < 0.01)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('only nests steps that really divide', () => {
    for (const major of TICK_STEPS) {
      const minor = chooseMinor(major, 1e-6);
      if (minor) {
        expect(nests(minor, major)).toBe(true);
        expect(stepSeconds(minor)).toBeLessThan(stepSeconds(major));
      }
    }
  });

  it('keeps clock labels unique when more than a day is in view', () => {
    const c: Camera = { center: fromCivil(2000, 1, 1), secondsPerPixel: 72, width: 1200, height: 800 };
    const labels = generateTicks(c).major.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows seconds when zoomed right in', () => {
    const c: Camera = { center: fromCivil(2026, 10, 30, 12 * 3600 + 30), secondsPerPixel: 0.05, width: 1200, height: 800 };
    const labels = generateTicks(c).major.map((t) => t.label);
    expect(labels).toContain('12:00:30');
  });

  it('shows round deep-time labels', () => {
    const labels = generateTicks(cam(-66e6, (1e5 * 3.15576e7) / 100)).major.map((t) => t.label);
    expect(labels).toContain('66 Ma');
  });
});

describe('Distance grid', () => {
  const now = fromCivil(2026, 10, 30);

  it('is fixed in space: a second later every line has moved by exactly 230 km of travel', () => {
    const spp = 0.05;
    const c: Camera = { center: now, secondsPerPixel: spp, width: 1200, height: 800 };
    const later: Camera = { ...c, center: addSeconds(now, 1) };
    const a = distanceGrid(c).major;
    const b = distanceGrid(later).major;
    const shift = 1 / spp; // px per second
    const moved = b.map((x) => x + shift);
    for (const x of moved) {
      if (x > 50 && x < 1150) expect(a.some((y) => Math.abs(y - x) < 1e-3)).toBe(true);
    }
  });

  it('steps in km, 1, 2 and 5 × a power of ten, and says so once', () => {
    const c: Camera = { center: now, secondsPerPixel: 3600, width: 1200, height: 800 };
    const g = distanceGrid(c);
    expect(g.step.unit).toBe('km');
    expect(String(g.step.km)).toMatch(/^[125]0*$/);
    expect(g.major.length).toBeGreaterThan(2);
    expect(formatDistanceStep(g.step)).toMatch(/ km$/);
  });

  it('reads distances as people say them', () => {
    expect(formatKm(500)).toBe('500 km');
    expect(formatKm(20_000)).toBe('20,000 km');
    expect(formatKm(2e6)).toBe('2 million km');
    expect(formatKm(5e9)).toBe('5 billion km');
    expect(formatKm(1e12)).toBe('1 trillion km');
    expect(formatKm(2e15)).toBe('2 × 10¹⁵ km');
    expect(formatKm(1e18)).toBe('10¹⁸ km');
  });

  it('never draws lines finer than double precision allows in deep time', () => {
    const c: Camera = { center: fromYearsApprox(-4e9), secondsPerPixel: 0.05, width: 1200, height: 800 };
    const g = distanceGrid(c);
    expect(g.step.km).toBeGreaterThanOrEqual(Math.abs(230 * 4e9 * 3.15576e7) * 2e-12 * 0.9);
  });
});
