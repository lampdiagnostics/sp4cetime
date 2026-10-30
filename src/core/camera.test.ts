import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Camera, pan, timeToX, xToTime, zoomAt } from './camera';
import { MAX_SECONDS_PER_PIXEL, MAX_TIME, MIN_SECONDS_PER_PIXEL, MIN_TIME } from './constants';
import { compare, fromYearsApprox, makeTime } from './time';

const cam = (yearsFromNow: number, secondsPerPixel: number): Camera => ({
  center: fromYearsApprox(yearsFromNow),
  secondsPerPixel,
  width: 1200,
  height: 800,
});

describe('Camera', () => {
  it('maps x → time → x to within a hundredth of a pixel at any depth and zoom', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4.5e9, max: 4.9e9, noNaN: true }),
        fc.double({ min: Math.log10(MIN_SECONDS_PER_PIXEL), max: 15, noNaN: true }),
        fc.double({ min: 0, max: 1200, noNaN: true }),
        (years, logSpp, x) => {
          const c = cam(years, 10 ** logSpp);
          expect(Math.abs(timeToX(c, xToTime(c, x)) - x)).toBeLessThan(0.01);
        },
      ),
    );
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const c = cam(-66e6, 60);
    const before = xToTime(c, 300);
    const z = zoomAt(c, 300, 0.5);
    expect(timeToX(z, before)).toBeCloseTo(300, 3);
    expect(z.secondsPerPixel).toBe(30);
  });

  it('clamps zoom and centre to the Sun lifetime', () => {
    expect(zoomAt(cam(0, 1), 600, 1e-9).secondsPerPixel).toBe(MIN_SECONDS_PER_PIXEL);
    expect(zoomAt(cam(0, 1e14), 600, 1e9).secondsPerPixel).toBe(MAX_SECONDS_PER_PIXEL);
    const farLeft = pan(cam(-4.5e9, 1e14), 1e6);
    expect(compare(farLeft.center, MIN_TIME)).toBe(0);
    const farRight = pan(cam(4.9e9, 1e14), -1e6);
    expect(compare(farRight.center, MAX_TIME)).toBe(0);
  });

  it('pans by exactly dx pixels', () => {
    const c = { ...cam(0, 2), center: makeTime(-1.6e12, 100) };
    const p = pan(c, 50);
    expect(timeToX(p, c.center)).toBeCloseTo(c.width / 2 + 50, 6);
  });
});
