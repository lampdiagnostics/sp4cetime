import { describe, expect, it } from 'vitest';
import { SUN_GALACTIC_SPEED_KM_S as V } from './constants';
import { KM_PER_AU, type Vec3 } from './geometry';
import { formatDMS } from './spheres';
import { galacticArc, helix, keplerKm, orbitLoop, pathSpan, spaceMarks, timeMarks, TRAVEL } from './paths3d';
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
    const m = a.marks[12]!;
    const same = b.marks.find((x) => x.label === m.label)!;
    expect(same.s).toBeCloseTo(m.s - V * 3600, 0);
  });

  it('space mark labels are arc positions on the Sun\'s galactic circle, seen from Sgr A*', () => {
    const { step, marks } = spaceMarks(now, 0, 1e8);
    expect(step.unit).toBe('arcsec');
    // The mark nearest the Sun carries (almost) the Sun's own arc position.
    const nearest = marks.reduce((a, b) => (Math.abs(b.s) < Math.abs(a.s) ? b : a));
    expect(nearest.label.startsWith(formatDMS(galacticArc(now), 0).slice(0, 8))).toBe(true);
    expect(nearest.label).toMatch(/^179°56′/);
  });
});
