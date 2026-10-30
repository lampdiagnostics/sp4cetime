import { describe, expect, it } from 'vitest';
import { KM_PER_LIGHT_YEAR } from '../core/geometry';
import { galaxySphere } from '../core/spheres';
import { fromCivil } from '../core/time';
import { galaxyFade, galaxyVantage, KM_PER_KPC } from './galaxy';

const now = fromCivil(2026, 10, 30);

describe('The whole galaxy', () => {
  it('shows the outside view only far from the Sun, and the Sun\'s sky only near it', () => {
    expect(galaxyFade(0)).toBe(0);
    expect(galaxyFade(100 * KM_PER_LIGHT_YEAR)).toBe(0);
    expect(galaxyFade(10_000 * KM_PER_LIGHT_YEAR)).toBe(1);
  });

  it('looks down on Sgr A* from 40 kpc above the galactic plane', () => {
    const v = galaxyVantage(now);
    const c = galaxySphere(now).centre;
    const d = Math.hypot(v.pos[0] - c[0], v.pos[1] - c[1], v.pos[2] - c[2]);
    expect(d / KM_PER_KPC).toBeCloseTo(40, 6);
    expect(v.target).toEqual(c);
  });
});
