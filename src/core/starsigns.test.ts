import { solarSystemAt } from './bodies';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, parseSp4ceFile, toSp4ceFile } from './path';
import { readingAt } from './reading';
import { groupDirections, lookQuat, starsignsPath } from './starsigns';
import { fromCivil } from './time';

type V = [number, number, number];
/** Rotate v by quaternion q = [x, y, z, w]. */
function rot(q: readonly number[], v: V): V {
  const [x, y, z, w] = q as [number, number, number, number];
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const unitV = fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true })).filter((v) => Math.hypot(...v) > 0.2).map((v) => v.map((x) => x / Math.hypot(...v)) as V);

describe('Camera orientation', () => {
  it('looks along the direction asked, with up above', () => {
    fc.assert(
      fc.property(unitV, unitV, (d, up) => {
        const c = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
        fc.pre(Math.abs(c) < 0.95);
        const q = lookQuat(d, up);
        expect(Math.hypot(...q)).toBeCloseTo(1, 9);
        const f = rot(q, [0, 0, -1]);
        for (let i = 0; i < 3; i++) expect(f[i]).toBeCloseTo(d[i]!, 6);
        const u = rot(q, [0, 1, 0]);
        expect(u[0] * up[0] + u[1] * up[1] + u[2] * up[2]).toBeGreaterThan(0);
      }),
    );
  });
});

describe('Grouping the planets into views', () => {
  it('covers every body once, each group within the span, in as few groups as a sweep allows', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 360, noNaN: true }), { minLength: 1, maxLength: 10 }), (lons) => {
        const dirs = lons.map((l) => [Math.cos((l * Math.PI) / 180), Math.sin((l * Math.PI) / 180), 0] as V);
        const g = groupDirections(dirs, 28);
        expect(g.flat().sort((a, b) => a - b)).toEqual(lons.map((_, i) => i));
        for (const grp of g) {
          const ls = grp.map((i) => lons[i]!);
          const first = ls[0]!;
          for (const l of ls) expect((l - first + 360) % 360).toBeLessThanOrEqual(56 + 1e-9);
        }
        // Never more groups than a fixed 56° tiling of the circle needs.
        expect(g.length).toBeLessThanOrEqual(7);
      }),
    );
  });
});

describe('The Starsigns path', () => {
  const t = fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60);
  const r = readingAt(t, 49.883, -97.166, 'whole');
  const base = { look: DEFAULT_LOOK, calendar: { offset: { day: 0, sec: 0 }, secondsPerPixel: 0.1, roll: -0.4, yaw: 0.2, spaceZoom: 1, panY: 0 } };
  const path = starsignsPath(r, { ...base, id: 's1', created: '2026-11-02T00:00:00Z', placeLabel: 'Winnipeg, Manitoba, Canada', placeName: 'Winnipeg', whenText: '14 July 1985, 3:20 pm', system: 'whole' });
  const pts = path.points;

  it('starts above Earth’s north pole, as clicking its name does, and stays in 3D, time held', () => {
    expect(pts.every((p) => p.view === 'fly' && p.present === t && !p.playing)).toBe(true);
    const f = pts[0]!.fly!;
    expect(f.anchor).toBe('earth');
    expect(Math.hypot(...f.rel)).toBeCloseTo(6_371 * 1.4, 0);
    expect(path.finished).toBe(true);
  });

  it('picks out every body twice: by sign over the world, and by house on the wheel', () => {
    const lit = pts.filter((p) => p.look.highlight).map((p) => p.look.highlight);
    for (const b of r.bodies) expect(lit.filter((x) => x === b.id)).toHaveLength(2);
    const mars = pts.filter((p) => p.look.highlight === 'mars');
    expect(mars[0]!.caption).toBe('Mars · 23° Cancer');
    expect(mars[1]!.caption).toContain('house 9 · Travel and learning');
    // Signs first (no chart), then houses (with the chart).
    expect(mars[0]!.look.chart).toBeNull();
    expect(mars[1]!.look.chart).toMatchObject({ lat: 49.883, system: 'whole' });
  });

  it('stands in the town looking straight up, then puts the Ascendant on the left of the wheel', () => {
    const ground = pts.find((p) => p.caption.startsWith('The sky over Winnipeg'))!;
    const f = ground.fly!;
    expect(f.frame).toBe('body');
    const up = f.rel.map((x) => x / Math.hypot(...f.rel)) as V;
    const look = rot(f.quat, [0, 0, -1]);
    expect(look[0] * up[0] + look[1] * up[1] + look[2] * up[2]).toBeCloseTo(1, 6);
    // The last pose: still in the town (body frame, same spot), Earth see-through, looking up the
    // ecliptic's north pole with the Ascendant on the left (as on the printed chart).
    const last = pts[pts.length - 1]!;
    const wheel = last.fly!;
    expect(wheel.frame).toBe('body');
    expect(wheel.rel).toEqual(f.rel);
    expect(last.look.seeThrough).toBe(true);
    expect(ground.look.seeThrough).toBe(false);
    expect(ground.look.constellations).toBe(true);
    const [ax, ay, az] = solarSystemAt(r.time).find((b) => b.info.id === 'earth')!.axes;
    const toWorld = (d: V): V => [0, 1, 2].map((k) => ax[k]! * d[0] + ay[k]! * d[1] + az[k]! * d[2]) as V;
    expect(toWorld(rot(wheel.quat, [0, 0, -1]))[2]).toBeCloseTo(-1, 6);
    // The Midheaven at the top, as on the printed chart.
    const topV = toWorld(rot(wheel.quat, [0, 1, 0]));
    const topLon = (Math.atan2(topV[1], topV[0]) * 180) / Math.PI;
    expect(Math.abs(((topLon - (r.chart.mc - r.chart.sky.lonShift) + 540) % 360) - 180)).toBeLessThan(45);
    const left = toWorld(rot(wheel.quat, [-1, 0, 0]));
    const ascLon = (Math.atan2(left[1], left[0]) * 180) / Math.PI;
    const want = r.chart.asc - r.chart.sky.lonShift;
    expect(Math.abs(((ascLon - want + 540) % 360) - 180)).toBeLessThan(0.05);
    // One short line each.
    for (const p of pts) expect(p.caption.length).toBeLessThan(110);
  });

  it('is a path like any other: written to a .sp4ce.json file and read back', () => {
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path))));
    expect(back.points).toHaveLength(pts.length);
    expect(back.points.map((p) => p.look.highlight)).toEqual(pts.map((p) => p.look.highlight));
  });
});
