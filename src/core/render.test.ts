import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { orbitalPeriod, PLANETS, planetById } from './planets';
import { coilPitchPx, pitchExaggerated } from './render';

describe('Coil pitch', () => {
  it('is the true pitch whenever that is readable', () => {
    const earth = orbitalPeriod(planetById('earth'));
    const r = coilPitchPx(earth, earth / 600);
    expect(r.px).toBeCloseTo(600, 9);
    expect(r.exaggerated).toBe(false);
  });

  it('never drops below a readable minimum, and is continuous across it', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PLANETS), fc.double({ min: -1, max: 16, noNaN: true }), (planet, logSpp) => {
        const period = orbitalPeriod(planet);
        const spp = 10 ** logSpp;
        const a = coilPitchPx(period, spp).px;
        const b = coilPitchPx(period, spp * 1.0001).px;
        expect(a).toBeGreaterThanOrEqual(18);
        // Zooming a tiny bit changes the pitch by a tiny amount: no jumps.
        expect(Math.abs(a - b) / a).toBeLessThan(2e-4);
      }),
    );
  });

  it('keeps slower planets on wider coils', () => {
    const spp = 1e14;
    const widths = PLANETS.map((p) => coilPitchPx(orbitalPeriod(p), spp).px);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1] as number);
  });

  it('reports when the drawing is widened', () => {
    expect(pitchExaggerated(['earth'], 3.15576e7 * 1e6)).toBe(true);
    expect(pitchExaggerated(['earth'], 60)).toBe(false);
  });
});
