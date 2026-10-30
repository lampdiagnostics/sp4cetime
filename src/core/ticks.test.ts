import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { MIN_SECONDS_PER_PIXEL } from './constants';
import { generateTicks } from './ticks';
import { fromCivil, fromYearsApprox } from './time';

const cam = (yearsFromNow: number, secondsPerPixel: number): Camera => ({
  center: fromYearsApprox(yearsFromNow),
  secondsPerPixel,
  width: 1200,
  height: 800,
});

describe('Adaptive ticks', () => {
  it('are ordered, labelled, spaced and bounded at every depth and zoom', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4.5e9, max: 4.9e9, noNaN: true }),
        fc.double({ min: Math.log10(MIN_SECONDS_PER_PIXEL), max: 14.5, noNaN: true }),
        (years, logSpp) => {
          const ticks = generateTicks(cam(years, 10 ** logSpp), 96);
          expect(ticks.length).toBeLessThan(500);
          for (const t of ticks) expect(t.label.length).toBeGreaterThan(0);
          for (let i = 1; i < ticks.length; i++) {
            const gap = (ticks[i]?.x ?? 0) - (ticks[i - 1]?.x ?? 0);
            expect(gap).toBeGreaterThanOrEqual(90);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('shows clock times when zoomed to minutes', () => {
    const c: Camera = { center: fromCivil(2026, 10, 30, 12 * 3600), secondsPerPixel: 1, width: 1200, height: 800 };
    const labels = generateTicks(c).map((t) => t.label);
    expect(labels).toContain('12:00');
  });

  it('shows round deep-time labels', () => {
    const labels = generateTicks(cam(-66e6, 1e5 * 3.15576e7 / 100)).map((t) => t.label);
    expect(labels).toContain('66 Ma');
  });

  it('never repeats a label in a single view', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4.5e9, max: 4.9e9, noNaN: true }),
        fc.double({ min: 3, max: 14.5, noNaN: true }),
        (years, logSpp) => {
          const labels = generateTicks(cam(years, 10 ** logSpp)).map((t) => t.label);
          expect(new Set(labels).size).toBe(labels.length);
        },
      ),
      { numRuns: 300 },
    );
  });
});
