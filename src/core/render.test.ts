import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { orbitalPeriod, planetById } from './planets';
import { coilWeight, densePaths, samplesPerTurn } from './render';

describe('Coil or band', () => {
  it('is a pure coil when turns are well apart, and a pure band when they crowd', () => {
    expect(coilWeight(40)).toBe(1);
    expect(coilWeight(8)).toBe(0);
    expect(coilWeight(2)).toBe(0);
  });

  it('fades smoothly between the two as you zoom: no jumps', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1000, noNaN: true }), (px) => {
        expect(Math.abs(coilWeight(px * 1.001) - coilWeight(px))).toBeLessThan(0.002);
        expect(coilWeight(px * 1.001)).toBeGreaterThanOrEqual(coilWeight(px));
      }),
    );
  });

  it('reports when paths are shown as bands', () => {
    const earth = orbitalPeriod(planetById('earth'));
    expect(densePaths(['earth'], earth / 2)).toBe(true);
    expect(densePaths(['earth'], earth / 100)).toBe(false);
  });
});

describe('Sampling', () => {
  it('uses a power of two per turn, so zooming only adds or removes in-between points', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e5, noNaN: true }), fc.double({ min: 0, max: 1e5, noNaN: true }), (px, r) => {
        const n = samplesPerTurn(px, r, 64, 4096);
        expect(Number.isInteger(Math.log2(n))).toBe(true);
        expect(n).toBeGreaterThanOrEqual(64);
        expect(n).toBeLessThanOrEqual(4096);
      }),
    );
  });

  it('keeps on-screen steps small for ordinary sizes', () => {
    const n = samplesPerTurn(600, 300, 64, 4096);
    expect(600 / n).toBeLessThanOrEqual(2);
    expect((2 * Math.PI * 300) / n).toBeLessThanOrEqual(4);
  });
});
