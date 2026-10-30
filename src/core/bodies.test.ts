import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { bodyInfo, litFraction, solarSystemAt } from './bodies';
import { fromCivil, fromYearsApprox, toUnixMs } from './time';

const sub = (a: readonly number[], b: readonly number[]): number[] => a.map((v, i) => v - (b[i] as number));
const len = (v: readonly number[]): number => Math.hypot(...v);
const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * (b[i] as number), 0);
const DEG = 180 / Math.PI;

describe('Solar system for flying', () => {
  const t = fromCivil(2026, 10, 30, 12 * 3600);
  const bodies = solarSystemAt(t);
  const get = (id: string) => bodies.find((b) => b.info.id === id)!;

  it('puts the Moon at a real Earth–Moon distance', () => {
    const d = len(sub(get('moon').pos, get('earth').pos));
    expect(d).toBeGreaterThan(356_000);
    expect(d).toBeLessThan(407_000);
  });

  it('gives the Moon the phase astronomy-engine gives it, seen from Earth', () => {
    for (const day of [1, 8, 15, 22, 29]) {
      const tt = fromCivil(2026, 11, day);
      const s = solarSystemAt(tt);
      const lit = litFraction(s.find((b) => b.info.id === 'moon')!.pos, s.find((b) => b.info.id === 'earth')!.pos);
      const ref = Astronomy.Illumination(Astronomy.Body.Moon, new Date(toUnixMs(tt))).phase_fraction;
      expect(Math.abs(lit - ref)).toBeLessThan(0.01);
    }
  });

  it('tilts Earth’s pole 23.4° from the ecliptic pole', () => {
    const z = get('earth').axes[2];
    expect(Math.acos(z[2]) * DEG).toBeCloseTo(23.44, 1);
  });

  it('turns Earth once per sidereal day', () => {
    const a = solarSystemAt(t).find((b) => b.info.id === 'earth')!.axes[0];
    const b = solarSystemAt(fromCivil(2026, 10, 30, 12 * 3600 + 86_164.09)).find((x) => x.info.id === 'earth')!.axes[0];
    expect(Math.acos(Math.min(1, dot(a, b))) * DEG).toBeLessThan(0.05);
  });

  it('keeps body axes orthonormal', () => {
    for (const b of bodies) {
      const [x, y, z] = b.axes;
      expect(len(x)).toBeCloseTo(1, 9);
      expect(len(z)).toBeCloseTo(1, 9);
      expect(Math.abs(dot(x, z))).toBeLessThan(1e-9);
      expect(Math.abs(dot(y, z))).toBeLessThan(1e-9);
    }
  });

  it('still places every body in deep time', () => {
    const deep = solarSystemAt(fromYearsApprox(-66e6));
    for (const b of deep) for (const c of b.pos) expect(Number.isFinite(c)).toBe(true);
    expect(bodyInfo('saturn').rings).toBeDefined();
  });
});
