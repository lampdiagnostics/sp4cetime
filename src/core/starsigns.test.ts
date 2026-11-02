import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, parseSp4ceFile, toSp4ceFile } from './path';
import { readingAt } from './reading';
import { lookQuat, starsignsPath } from './starsigns';
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

describe('The Starsigns path', () => {
  const t = fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60);
  const r = readingAt(t, 49.883, -97.166, 'whole');
  const base = { look: DEFAULT_LOOK, calendar: { offset: { day: 0, sec: 0 }, secondsPerPixel: 0.1, roll: -0.4, yaw: 0.2, spaceZoom: 1, panY: 0 } };
  const path = starsignsPath(r, { ...base, id: 's1', created: '2026-11-02T00:00:00Z', placeLabel: 'Winnipeg, Manitoba, Canada', placeName: 'Winnipeg', whenText: '14 July 1985, 3:20 pm', system: 'whole' });

  it('goes from the calendar to Earth, the town, its horizon and its Midheaven, and ends', () => {
    expect(path.points.map((p) => p.view)).toEqual(['calendar', 'fly', 'fly', 'fly', 'fly', 'fly']);
    expect(path.finished).toBe(true);
    expect(path.points.every((p) => p.present === t && !p.playing)).toBe(true);
    expect(path.points[3]!.caption).toContain('Rising: 6° Scorpio');
    expect(path.points[3]!.look.chart).toMatchObject({ lat: 49.883, lon: -97.166, system: 'whole' });
    expect(path.points[1]!.look.chart).toBeNull();
  });

  it('stands on the ground in the town, looking above the horizon', () => {
    for (const p of path.points.slice(3, 5)) {
      const f = p.fly!;
      expect(f.frame).toBe('body');
      expect(Math.hypot(...f.rel)).toBeCloseTo(6_372, 0);
      const look = rot(f.quat, [0, 0, -1]);
      const up = f.rel.map((x) => x / Math.hypot(...f.rel)) as V;
      expect(look[0] * up[0] + look[1] * up[1] + look[2] * up[2]).toBeGreaterThan(Math.sin((11 * Math.PI) / 180));
    }
  });

  it('is a path like any other: written to a .sp4ce.json file and read back', () => {
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path))));
    expect(back.points).toHaveLength(path.points.length);
    expect(back.points[3]!.look.chart).toMatchObject({ system: 'whole', place: 'Winnipeg' });
  });

  it('without a birth time: signs only, no ground view, no houses', () => {
    const p = starsignsPath(r, { ...base, id: 's2', created: '', placeLabel: 'Winnipeg', placeName: 'Winnipeg', whenText: '14 July 1985', system: 'whole', noTime: true });
    expect(p.points).toHaveLength(3);
    expect(p.points.every((x) => x.look.chart === null)).toBe(true);
  });
});
