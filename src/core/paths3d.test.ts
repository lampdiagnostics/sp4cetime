import { describe, expect, it } from 'vitest';
import { SUN_GALACTIC_SPEED_KM_S as V } from './constants';
import { KM_PER_AU, type Vec3 } from './geometry';
import { helix, keplerKm, orbitLoop, pathSpan, spaceMarks, timeMarks, TRAVEL } from './paths3d';
import { addSeconds, fromCivil } from './time';

const now = fromCivil(2026, 10, 30, 12 * 3600);
const at = (a: Float64Array, i: number): Vec3 => [a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('3D paths', () => {
  const exact: Vec3 = [1.4e8, 4.9e7, 1000];

  it('a helix passes exactly through the body now, and its ends are a span away along the line of travel', () => {
    const K = 200;
    const h = helix('earth', now, exact, K);
    expect(dist(at(h, K), exact)).toBeLessThan(1e-6);
    const span = pathSpan('earth');
    const ahead = dot(at(h, 2 * K), TRAVEL) - dot(at(h, K), TRAVEL);
    // Along-track distance is the Sun's travel ± at most the orbit's size.
    expect(Math.abs(ahead - V * span)).toBeLessThan(2.1 * KM_PER_AU);
    expect(ahead).toBeGreaterThan(0);
  });

  it('a helix point τ ahead is the orbit position τ ahead plus 230 km/s × τ', () => {
    const K = 100;
    const h = helix('mars', now, keplerKm('mars', now), K);
    const s = pathSpan('mars') * (10 / K) ** 2;
    const p = keplerKm('mars', addSeconds(now, s));
    const want: Vec3 = [p[0] + V * s * TRAVEL[0], p[1] + V * s * TRAVEL[1], p[2] + V * s * TRAVEL[2]];
    expect(dist(at(h, K + 10), want)).toBeLessThan(1);
  });

  it('an orbit loop starts and ends at the body and stays near its distance from the Sun', () => {
    const e = keplerKm('earth', now);
    const o = orbitLoop('earth', now, e, 64);
    expect(dist(at(o, 0), e)).toBeLessThan(1e-6);
    expect(dist(at(o, 64), e)).toBeLessThan(1);
    for (let i = 0; i <= 64; i++) expect(Math.abs(Math.hypot(...at(o, i)) / KM_PER_AU - 1)).toBeLessThan(0.02);
  });
});

describe('3D grid marks', () => {
  it('time marks sit 230 km/s × (t − now) from the Sun and are at least the spacing apart', () => {
    const marks = timeMarks(now, 0, 2e7);
    expect(marks.length).toBeGreaterThan(10);
    for (let i = 1; i < marks.length; i++) expect(marks[i]!.s - marks[i - 1]!.s).toBeGreaterThanOrEqual(2e7);
    expect(marks.some((m) => m.s < 0) && marks.some((m) => m.s > 0)).toBe(true);
  });

  it('space marks are fixed in space: an hour later each mark is 828,000 km further behind', () => {
    const a = spaceMarks(now, 0, 1e8);
    const later = addSeconds(now, 3600);
    const b = spaceMarks(later, -V * 3600, 1e8);
    const step = a.step.km;
    expect(a.step.unit).toBe('km');
    // Every mark of the earlier set, moved back by an hour of travel, is a mark of the later set.
    for (const m of a.marks.slice(4, -4)) {
      const moved = m.s - V * 3600;
      expect(b.marks.some((x) => Math.abs(x.s - moved) < 1e-3 * step)).toBe(true);
    }
    expect(a.marks.every((m) => m.label === '')).toBe(true);
  });
});

describe('Reshaped and shortened paths', () => {
  it('a shape moves the coil around the Sun but not along the line of travel; a span limit shortens it', async () => {
    const { solarSystemAt } = await import('./bodies');
    const t = fromCivil(2026, 10, 30);
    const mars = solarSystemAt(t).find((b) => b.info.id === 'mars')!.pos;
    const plain = helix('mars', t, mars, 50);
    const half = helix('mars', t, mars, 50, undefined, (o) => [o[0] / 2, o[1] / 2, o[2] / 2]);
    // The middle point (now) is halved; the ends differ only by their halved offsets.
    expect(half[50 * 3]).toBeCloseTo(plain[50 * 3]! / 2, 3);
    const short = helix('mars', t, mars, 50, undefined, undefined, 86_400);
    const even = helix('mars', t, mars, 50, undefined, undefined, 86_400 * 10, 1);
    // Evenly spaced: equal steps along the line of travel.
    const along = (j: number): number => even[j * 3]! * TRAVEL[0] + even[j * 3 + 1]! * TRAVEL[1] + even[j * 3 + 2]! * TRAVEL[2];
    expect(Math.abs(along(60) - along(59) - (along(90) - along(89)))).toBeLessThan(2 * 86_400 * 10 / 50 * 230 * 0.2 + 3e5);
    const ends = Math.hypot(short[0]! - short[100 * 3]!, short[1]! - short[100 * 3 + 1]!, short[2]! - short[100 * 3 + 2]!);
    expect(ends).toBeLessThan(2 * 86_400 * 230 + 2 * 3e6);
  });
});

describe('Fly mode’s ruler along the Sun’s line', () => {
  it('divides into the zoom’s units (10 s at a minute) at a spacing you can see, and drifts with time', async () => {
    const { rulerTimeMarks, rulerScale } = await import('./paths3d');
    const t = fromCivil(2026, 10, 31, 12 * 3600);
    const gap = 5e7; // km on the ruler
    const r = rulerScale(gap, 10);
    expect(r.kmPerSecond * 10).toBeCloseTo(gap, 3);
    const m = rulerTimeMarks(t, 0, gap, 10, 12);
    const gaps = m.slice(1).map((x, i) => x.s - m[i]!.s);
    for (const g of gaps) expect(g).toBeCloseTo(gap, 0);
    // One second later every line is one second's worth of ruler closer to (or past) the Sun.
    const later = rulerTimeMarks(addSeconds(t, 1), 0, gap, 10, 12);
    const same = later.find((x) => x.label === m[6]!.label)!;
    expect(m[6]!.s - same.s).toBeCloseTo(r.kmPerSecond, 0);
    // A day's zoom: steps of hours, drifting far more slowly.
    expect(rulerScale(gap, 86_400 / 6).kmPerSecond).toBeLessThan(r.kmPerSecond / 1000);
  });
});
