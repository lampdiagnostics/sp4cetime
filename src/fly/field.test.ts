import { describe, expect, it } from 'vitest';
import { treeSpots } from './field';

describe('The field under a Starsigns place', () => {
  const spots = treeSpots(1234);

  it('rings the viewer with trees 30 to 160 m away, 12 to 30 m tall, the same every time', () => {
    expect(spots.length).toBeGreaterThan(150);
    for (const s of spots) {
      const d = Math.hypot(s.x, s.y);
      expect(d).toBeGreaterThanOrEqual(0.03);
      expect(d).toBeLessThanOrEqual(0.16 + 1e-9);
      expect(s.h).toBeGreaterThanOrEqual(0.012);
      expect(s.h).toBeLessThanOrEqual(0.03);
    }
    expect(treeSpots(1234)).toEqual(spots);
    expect(treeSpots(99)).not.toEqual(spots);
  });

  it('leaves gaps where the horizon shows, and hides only the low sky (trees at most about 45° up)', () => {
    const bearings = spots.map((s) => ((Math.atan2(s.y, s.x) * 180) / Math.PI + 360) % 360);
    const empty = Array.from({ length: 36 }, (_, k) => k * 10).filter((b) => !bearings.some((x) => x >= b && x < b + 10));
    expect(empty.length).toBeGreaterThan(0);
    for (const s of spots) expect((Math.atan2(s.h - 0.0017, Math.hypot(s.x, s.y)) * 180) / Math.PI).toBeLessThan(46);
  });
});
