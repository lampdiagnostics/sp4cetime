import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ECL_TO_GAL, type Vec3, viewMatrix } from './geometry';
import { applyT, projectSky, unprojectSky, viewToGalactic } from './skymap';

describe('Whole-sky disc', () => {
  it('puts straight ahead in the middle, the sides halfway out, and the direction of travel to the right', () => {
    expect(projectSky([0, 0, -1], 100)).toEqual({ x: 0, y: 0 });
    const right = projectSky([1, 0, 0], 100);
    expect(right.x).toBeCloseTo(50, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(projectSky([0, 1, 0], 100).y).toBeCloseTo(-50, 9); // up is up on screen
    const behind = projectSky([0.001, 0, 0.999_999_5], 100);
    expect(Math.hypot(behind.x, behind.y)).toBeGreaterThan(99.9);
  });

  it('round-trips every direction', () => {
    fc.assert(
      fc.property(fc.double({ min: -95, max: 95, noNaN: true }), fc.double({ min: -95, max: 95, noNaN: true }), (x, y) => {
        if (Math.hypot(x, y) > 99.9) return;
        const d = unprojectSky(x, y, 100)!;
        expect(Math.hypot(...d)).toBeCloseTo(1, 12);
        const p = projectSky(d, 100);
        expect(Math.abs(p.x - x)).toBeLessThan(1e-6);
        expect(Math.abs(p.y - y)).toBeLessThan(1e-6);
      }),
    );
  });

  it('turns with the view: the direction of travel is galactic longitude 90°', () => {
    for (const roll of [0, 0.7, -2]) {
      const g = viewToGalactic(viewMatrix(roll), [1, 0, 0]);
      expect((g.l * 180) / Math.PI).toBeCloseTo(90, 6);
      expect(g.b).toBeCloseTo(0, 9);
    }
    // And the galactic centre is always where the view puts galactic x.
    const vm = viewMatrix(0.4, 0.3);
    const gc: Vec3 = [ECL_TO_GAL[0][0], ECL_TO_GAL[0][1], ECL_TO_GAL[0][2]];
    const inView: Vec3 = [0, 1, 2].map((i) => vm[i]![0] * gc[0] + vm[i]![1] * gc[1] + vm[i]![2] * gc[2]) as unknown as Vec3;
    expect(viewToGalactic(vm, inView).l).toBeCloseTo(0, 9);
    expect(applyT(vm, inView)[0]).toBeCloseTo(gc[0], 9);
  });
});
