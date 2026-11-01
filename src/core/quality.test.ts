import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGovernor } from './quality';

const feed = (g: ReturnType<typeof createGovernor>, ms: number, n: number): number[] => {
  const changes: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = g.sample(ms);
    if (c !== null) changes.push(c);
  }
  return changes;
};

describe('resolution governor', () => {
  it('keeps full sharpness while frames are fast', () => {
    const g = createGovernor({ max: 2 });
    expect(feed(g, 8, 2000)).toEqual([]);
    expect(g.scale).toBe(2);
  });

  it('steps down when frames are slow, never below the minimum', () => {
    const g = createGovernor({ max: 2, min: 0.75 });
    const c = feed(g, 40, 3000);
    expect(c.length).toBeGreaterThan(0);
    expect(g.scale).toBe(0.75);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeLessThan(c[i - 1]!);
  });

  it('leaves a browser that caps the rate at 30 frames a second alone', () => {
    const g = createGovernor({ max: 2 });
    expect(feed(g, 1000 / 30, 3000)).toEqual([]);
  });

  it('comes back up when there is room again', () => {
    const g = createGovernor({ max: 2 });
    feed(g, 40, 600);
    const low = g.scale;
    feed(g, 6, 5000);
    expect(g.scale).toBeGreaterThan(low);
    expect(g.scale).toBeLessThanOrEqual(2);
  });

  it('ignores gaps (a hidden tab) and stays within its range for any frame times', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -5, max: 2000, noNaN: true }), { maxLength: 800 }), (times) => {
        const g = createGovernor({ max: 1.5, min: 0.75 });
        for (const t of times) g.sample(t);
        expect(g.scale).toBeGreaterThanOrEqual(0.75);
        expect(g.scale).toBeLessThanOrEqual(1.5);
      }),
    );
    const g = createGovernor({ max: 2 });
    expect(feed(g, 1000, 500)).toEqual([]);
  });
});
