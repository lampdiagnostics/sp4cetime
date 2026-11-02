import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { readingAt } from './reading';
import { fromCivil, toUnixMs } from './time';

const dAng = (a: number, b: number): number => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

describe('A reading for a moment and a place', () => {
  const t = fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60); // 3:20 pm in Winnipeg (CDT)
  const r = readingAt(t, 49.883, -97.166, 'whole');

  it('lists the Sun, the Moon and the planets, each in a sign and a house', () => {
    expect(r.bodies.map((b) => b.id)).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
    for (const b of r.bodies) {
      expect(b.house).toBeGreaterThanOrEqual(1);
      expect(b.house).toBeLessThanOrEqual(12);
      expect(b.sign.deg).toBeLessThan(30);
    }
    expect(r.tier).toBe('ephemeris');
  });

  it('puts the Sun in Cancer in mid-July and agrees with astronomy-engine to under 1′', () => {
    const sun = r.bodies[0]!;
    expect(sun.sign.name).toBe('Cancer');
    const date = new Date(toUnixMs(t));
    for (const b of r.bodies) {
      if (b.id === 'pluto') continue;
      const body = (b.id[0]!.toUpperCase() + b.id.slice(1)) as keyof typeof Astronomy.Body;
      const theirs = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[body], date, false)).elon;
      expect(dAng(b.lon, theirs)).toBeLessThan(1 / 60);
    }
  });

  it('never calls the Sun or the Moon retrograde; finds Mercury retrograde when it is', () => {
    expect(r.bodies[0]!.retrograde).toBe(false);
    expect(r.bodies[1]!.retrograde).toBe(false);
    // Mercury was retrograde from 12 to 22 March 2026 (approximately), direct well before.
    expect(readingAt(fromCivil(2026, 3, 17, 12 * 3600), 0, 0).bodies[2]!.retrograde).toBe(true);
    expect(readingAt(fromCivil(2026, 2, 1, 12 * 3600), 0, 0).bodies[2]!.retrograde).toBe(false);
  });
});
