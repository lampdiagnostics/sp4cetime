import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ECL_TO_GAL, type Vec3, viewMatrix } from './geometry';
import { applyT, focalFor, projectSky, unprojectSky, viewToGalactic } from './skymap';

describe('Sky behind the calendar', () => {
  it('is a perspective view: ahead in the middle, 30° away at the window\'s edge, behind the viewer hidden', () => {
    const f = focalFor(300);
    const c = projectSky([0, 0, -1], f)!;
    expect(Math.abs(c.x) + Math.abs(c.y)).toBe(0);
    const a = (30 * Math.PI) / 180;
    const right = projectSky([Math.sin(a), 0, -Math.cos(a)], f)!;
    expect(right.x).toBeCloseTo(300, 9);
    expect(projectSky([0, Math.sin(a), -Math.cos(a)], f)!.y).toBeCloseTo(-300, 9); // up is up on screen
    expect(projectSky([0, 0, 1], f)).toBeNull();
  });

  it('round-trips every point on screen', () => {
    fc.assert(
      fc.property(fc.double({ min: -2000, max: 2000, noNaN: true }), fc.double({ min: -2000, max: 2000, noNaN: true }), (x, y) => {
        const d = unprojectSky(x, y, 500);
        expect(Math.hypot(...d)).toBeCloseTo(1, 12);
        const p = projectSky(d, 500)!;
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
    const vm = viewMatrix(0.4, 0.3);
    const gc: Vec3 = [ECL_TO_GAL[0][0], ECL_TO_GAL[0][1], ECL_TO_GAL[0][2]];
    const inView: Vec3 = [0, 1, 2].map((i) => vm[i]![0] * gc[0] + vm[i]![1] * gc[1] + vm[i]![2] * gc[2]) as unknown as Vec3;
    expect(viewToGalactic(vm, inView).l).toBeCloseTo(0, 9);
    expect(applyT(vm, inView)[0]).toBeCloseTo(gc[0], 9);
  });
});
