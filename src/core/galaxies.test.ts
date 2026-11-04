import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scaleFactor } from './cosmology';
import { displayName, galaxyKind, galaxyWeb, KM_PER_MPC, markStepLy, marksAlong, parseGalaxies, placesAt } from './galaxies';
import { KM_PER_LIGHT_YEAR, type Vec3 } from './geometry';
import catalogueFile from '../../public/sky/galaxies.json';

const MW: Vec3 = [-2.5e17, 1e16, 3e15]; // Sgr A*, about 8 kpc away
const row = fc.tuple(
  fc.double({ min: 0, max: 359.99, noNaN: true }),
  fc.double({ min: -89, max: 89, noNaN: true }),
  fc.double({ min: 0.05, max: 11, noNaN: true }),
  fc.double({ min: -22, max: -8, noNaN: true }),
  fc.double({ min: -2, max: 3, noNaN: true }),
  fc.nat(30),
);
const catalogue = fc.array(row, { minLength: 2, maxLength: 40 }).map((rs) =>
  parseGalaxies({
    rows: rs.map(([ra, dec, d, mb, th, nb], i) => [`G${i}`, ra, dec, d, 'TRGB', 5, 3, mb, th, nb < rs.length && nb !== i ? `G${nb}` : null]),
  }),
);
const d3 = (p: Vec3, q: Vec3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('The nearest galaxies', () => {
  it('reads the file, places each at its distance, and skips bad rows', () => {
    const gs = parseGalaxies({ rows: [['M81', 148.888, 69.065, 3.63, 'TRGB', 26.1, 2, -21.1, 0.5, 'M82'], ['bad', 'x', 0, 1], ['far', 10, 10, -1, '', null, null, null, null, null]] });
    expect(gs).toHaveLength(1);
    expect(Math.hypot(...gs[0]!.pos) / KM_PER_MPC).toBeCloseTo(3.63, 9);
    expect(() => parseGalaxies(null)).toThrow();
  });

  it('joins every group into one web: bridges reach every group from the Milky Way, members link real galaxies', () => {
    fc.assert(
      fc.property(catalogue, (gs) => {
        const w = galaxyWeb(gs, MW);
        const groups = new Set(w.lead.filter((l) => l >= 0));
        expect(w.bridges).toHaveLength(groups.size);
        const reached = new Set([-1]);
        for (const [a, b] of w.bridges) {
          expect(reached.has(a)).toBe(true);
          reached.add(b);
        }
        for (const g of groups) expect(reached.has(g)).toBe(true);
        for (const [a, b] of w.members) expect(w.lead[a]).toBe(w.lead[b]);
      }),
    );
  });

  it('stretches the space between groups by a(t), keeps each group whole and the Local Group still', () => {
    fc.assert(
      fc.property(catalogue, fc.double({ min: -4.6e9, max: 5e9, noNaN: true }), (gs, years) => {
        const w = galaxyWeb(gs, MW);
        const now = placesAt(gs, w, MW, 0, 'lcdm');
        now.forEach((p, i) => expect(p).toEqual(gs[i]!.pos));
        const a = scaleFactor('lcdm', years);
        const then = placesAt(gs, w, MW, years, 'lcdm');
        gs.forEach((g, i) => {
          const l = w.lead[i]!;
          if (l < 0) return expect(then[i]).toEqual(g.pos);
          // The lead is a times as far from the Milky Way's centre; a member keeps its offset.
          expect(d3(then[l]!, MW) / d3(g.pos === gs[l]!.pos ? g.pos : gs[l]!.pos, MW)).toBeCloseTo(a, 6);
          for (let k = 0; k < 3; k++) expect((then[i]![k]! - then[l]![k]!) / KM_PER_MPC).toBeCloseTo((g.pos[k]! - gs[l]!.pos[k]!) / KM_PER_MPC, 6);
        });
      }),
      { numRuns: 40 },
    );
  });

  it('rules the web in round steps of light years, mark by mark', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1e9, noNaN: true }), (t) => {
        const s = markStepLy(t);
        const m = s / Math.pow(10, Math.floor(Math.log10(s) + 1e-9));
        expect([1, 2, 5]).toContain(Math.round(m));
        expect(s / t).toBeGreaterThan(0.55);
        expect(s / t).toBeLessThan(1.6);
      }),
    );
    const p: Vec3 = [0, 0, 0], q: Vec3 = [3.5e6 * KM_PER_LIGHT_YEAR, 0, 0];
    const marks = marksAlong(p, q, 1e6);
    expect(marks).toHaveLength(3);
    marks.forEach((m, k) => expect(m[0] / KM_PER_LIGHT_YEAR).toBeCloseTo((k + 1) * 1e6, 3));
  });

  it('writes catalogue names as people do', () => {
    expect(displayName('MESSIER081')).toBe('M81');
    expect(displayName('NGC0253')).toBe('NGC 253');
    expect(displayName('IC0342')).toBe('IC 342');
    expect(displayName('Sag dSph')).toBe('Sag dSph');
  });

  it('builds a connected web from the real catalogue, the Local Group held still', () => {
    const gs = parseGalaxies(catalogueFile);
    expect(gs.length).toBe(500);
    const w = galaxyWeb(gs, MW);
    const groups = new Set(w.lead.filter((l) => l >= 0));
    expect(w.bridges).toHaveLength(groups.size);
    // M31 and the Magellanic Clouds are in the Local Group (never stretched); M81 leads its own group.
    for (const n of ['MESSIER031', 'LMC', 'SMC']) expect(w.lead[gs.findIndex((g) => g.name === n)]).toBe(-1);
    const m81 = gs.findIndex((g) => g.name === 'MESSIER081');
    expect(w.lead[gs.findIndex((g) => g.name === 'MESSIER082')]).toBe(m81);
    expect(w.lead[m81]).toBe(m81);
  });

  it('tells the kinds apart by type', () => {
    expect(galaxyKind(-5)).toBe('elliptical');
    expect(galaxyKind(3)).toBe('spiral');
    expect(galaxyKind(10)).toBe('irregular');
    expect(galaxyKind(null)).toBe('irregular');
  });
});
