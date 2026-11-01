import { describe, expect, it } from 'vitest';
import { KM_PER_PARSEC } from '../core/constants';
import { ECL_TO_GAL } from '../core/geometry';
import { LOCAL_GROUP, placeGalaxy, SGR_A_RS_KM, SGR_A_SHADOW_KM } from './localGroup';

const KPC = KM_PER_PARSEC * 1000;
const gal = (v: readonly number[]): { l: number; b: number } => {
  const g = [0, 1, 2].map((i) => ECL_TO_GAL[i]![0] * v[0]! + ECL_TO_GAL[i]![1] * v[1]! + ECL_TO_GAL[i]![2] * v[2]!);
  const r = Math.hypot(...g);
  return { l: ((Math.atan2(g[1]!, g[0]!) * 180) / Math.PI + 360) % 360, b: (Math.asin(g[2]! / r) * 180) / Math.PI };
};

describe('The Local Group', () => {
  it('puts Andromeda 765 kpc away at galactic l 121.2°, b −21.6°, and the LMC at l 280.5°, b −32.9°', () => {
    const m31 = placeGalaxy(LOCAL_GROUP.find((g) => g.name.includes('M31'))!);
    expect(Math.hypot(...m31.pos) / KPC).toBeCloseTo(765, 3);
    const a = gal(m31.pos);
    expect(a.l).toBeCloseTo(121.2, 0);
    expect(a.b).toBeCloseTo(-21.6, 0);
    const lmc = gal(placeGalaxy(LOCAL_GROUP.find((g) => g.name.includes('Large'))!).pos);
    expect(lmc.l).toBeCloseTo(280.5, 0);
    expect(lmc.b).toBeCloseTo(-32.9, 0);
  });

  it('tilts Andromeda’s disc 77° to our line of sight', () => {
    const m31 = placeGalaxy(LOCAL_GROUP.find((g) => g.name.includes('M31'))!);
    const los = m31.pos.map((x) => x / Math.hypot(...m31.pos));
    const cos = Math.abs(los[0]! * m31.n[0] + los[1]! * m31.n[1] + los[2]! * m31.n[2]);
    expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(77, 6);
  });

  it('gives Sgr A* (4.15 million suns) a 12 million km horizon and a shadow 2.6 times that', () => {
    expect(SGR_A_RS_KM / 1e6).toBeCloseTo(12.3, 1);
    expect(SGR_A_SHADOW_KM / SGR_A_RS_KM).toBeCloseTo(2.598, 3);
  });
});
