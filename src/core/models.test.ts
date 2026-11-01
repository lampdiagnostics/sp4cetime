import { describe, expect, it } from 'vitest';
import { THEMES } from '../../content/themes';
import {
  accuracyTier,
  earthLongitude,
  earthLongitudeMean,
  galacticAngle,
  moonIllumination,
  moonPhase,
  moonPhaseMean,
} from './models';
import { parseTheme } from './theme';
import { fromCivil, fromYearsApprox } from './time';

const deg = (rad: number): number => (rad * 180) / Math.PI;
/** Smallest angle between two angles, degrees. */
const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(deg(a) - deg(b)) % 360;
  return d > 180 ? 360 - d : d;
};

describe('Earth and Moon', () => {
  it('puts Earth at 0° heliocentric longitude at the September 2000 equinox', () => {
    // Equinox: 2000-09-22 17:27 UTC (Sun at 180°, so Earth at 0°).
    const t = fromCivil(2000, 9, 22, 17 * 3600 + 27 * 60);
    expect(angleDiff(earthLongitude(t), 0)).toBeLessThan(0.05);
  });

  it('has a new moon on 2000-01-06 18:14 UTC', () => {
    const t = fromCivil(2000, 1, 6, 18 * 3600 + 14 * 60);
    expect(angleDiff(moonPhase(t), 0)).toBeLessThan(1);
    expect(moonIllumination(moonPhase(t))).toBeLessThan(0.01);
  });

  it('mean models stay close to the ephemeris near today', () => {
    for (let year = 1900; year <= 2100; year += 7) {
      const t = fromCivil(year, 3, 15);
      expect(angleDiff(earthLongitudeMean(t), earthLongitude(t))).toBeLessThan(2.5);
      expect(angleDiff(moonPhaseMean(t), moonPhase(t))).toBeLessThan(15);
    }
  });

  it('labels accuracy honestly by distance from today', () => {
    expect(accuracyTier(fromCivil(2026, 10, 30))).toBe('ephemeris');
    expect(accuracyTier(fromYearsApprox(-6_000))).toBe('modelled');
    expect(accuracyTier(fromYearsApprox(-66e6))).toBe('schematic');
  });

  it('turns the galaxy once per galactic year', () => {
    expect(angleDiff(galacticAngle(fromYearsApprox(230e6)), 0)).toBeLessThan(1e-6);
    expect(angleDiff(galacticAngle(fromYearsApprox(115e6)), Math.PI)).toBeLessThan(1e-6);
  });
});

describe('Themes', () => {
  it('ships three valid themes with unique ids', () => {
    expect(THEMES).toHaveLength(3);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(3);
  });

  it('rejects malformed theme data with a readable error', () => {
    expect(() => parseTheme({ id: 'x' })).toThrow(/Theme "x": "name"/);
    expect(() => parseTheme({ ...THEMES[0], glow: -1 })).toThrow(/glow/);
  });
});

describe('themes: Dark, Bright and Colour', () => {
  it('are named as modes, and Bright draws a negative sky', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Dark Mode', 'Bright Mode', 'Colour Mode']);
    expect(THEMES.map((t) => t.sky.ink)).toEqual([false, true, false]);
  });
  it('rejects a theme without a valid sky', () => {
    const { sky: _sky, ...noSky } = THEMES[0]!;
    expect(() => parseTheme(noSky)).toThrow(/"sky"/);
    expect(() => parseTheme({ ...THEMES[0], sky: { ...THEMES[0]!.sky, ink: 'yes' } })).toThrow(/sky.ink/);
  });
});
