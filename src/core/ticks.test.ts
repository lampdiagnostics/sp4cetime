import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { MIN_SECONDS_PER_PIXEL } from './constants';
import { chooseMinor, generateTicks, nests, stepSeconds, TICK_STEPS } from './ticks';
import { fromCivil, fromYearsApprox } from './time';

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

describe('Distance ticks', () => {
  const now = fromCivil(2026, 10, 30);

  it('mark the present as zero and count outward', () => {
    const c: Camera = { center: now, secondsPerPixel: 1, width: 1200, height: 800 };
    const { major } = generateTicks(c, 'distance', now);
    const zero = major.find((t) => t.label === 'Now');
    expect(zero?.x).toBeCloseTo(600, 6);
    expect(major.some((t) => t.label.startsWith('+') && t.label.endsWith(' km'))).toBe(true);
  });

  it('switch to light years when zoomed out', () => {
    const c: Camera = { center: now, secondsPerPixel: 3.15576e7 * 1e4, width: 1200, height: 800 };
    const { major } = generateTicks(c, 'distance', now);
    expect(major.length).toBeGreaterThan(2);
    for (const t of major) expect(t.label === 'Now' || t.label.endsWith(' ly')).toBe(true);
  });

  it('space 1 light year ≈ 1,303 years of travel', () => {
    const spp = 3.15576e7; // 1 yr per px
    const c: Camera = { center: now, secondsPerPixel: spp, width: 30_000, height: 800 };
    const { major } = generateTicks(c, 'distance', now, 1100);
    const zero = major.findIndex((t) => t.label === 'Now');
    const next = major[zero + 1];
    expect(next?.label).toBe('+1 ly');
    expect((next?.x ?? 0) - (major[zero]?.x ?? 0)).toBeCloseTo(1303.3, 0);
  });
});
