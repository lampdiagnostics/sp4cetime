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
          // Measured east from the group's first body; two bodies 1e-12° apart may come back in
          // either order from the vector maths, so a hair west of the first counts as 0, not 360.
          for (const l of ls) expect(((l - first + 360 + 1e-7) % 360) - 1e-7).toBeLessThanOrEqual(56 + 1e-6);
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

  it('starts above Earth’s north pole, as clicking its name does, and stays in 3D, time running from the moment', () => {
    expect(pts.every((p) => p.view === 'fly' && p.present === t && p.playing && p.speed === 1)).toBe(true);
    const f = pts[0]!.fly!;
    expect(f.anchor).toBe('earth');
    expect(Math.hypot(...f.rel)).toBeCloseTo(6_371 * 1.4, 0);
    expect(path.finished).toBe(true);
  });

  it('pauses over every body without picking any out (owner, 3 Nov 2026)', () => {
    expect(pts.every((p) => p.look.highlight === null)).toBe(true);
    // Every body is named once over the world, with its sign, in a view held longer for more bodies.
    for (const b of r.bodies) expect(pts.filter((p) => !p.look.chart && p.caption.includes(b.name)).length).toBeGreaterThanOrEqual(1);
    // Mars is beside the Sun in July 1985, so it shares the Sun's brisk stop; Mercury has its own.
    const mars = pts.find((p) => p.caption.includes('Mars 23° Cancer'))!;
    expect(mars.look.chart).toBeNull();
    expect(mars.pause).toBe(2);
    expect(pts.find((p) => p.caption.includes('Mercury 18° Leo'))!.pause).toBe(2);
    for (const p of pts) expect(p.pause).toBeGreaterThan(0);
  });

  it('stands in the town looking straight up, then puts the Ascendant on the left of the wheel', () => {
    const ground = pts.find((p) => p.caption.startsWith('The sky over Winnipeg'))!;
    const f = ground.fly!;
    expect(f.frame).toBe('body');
    const up = f.rel.map((x) => x / Math.hypot(...f.rel)) as V;
    const look = rot(f.quat, [0, 0, -1]);
    // Standing in a field: looking 41° up (the horizon 9° above the bottom of a 100° view), level (no roll).
    expect((Math.asin(look[0] * up[0] + look[1] * up[1] + look[2] * up[2]) * 180) / Math.PI).toBeCloseTo(41, 4);
    const right = rot(f.quat, [1, 0, 0]);
    expect(right[0] * up[0] + right[1] * up[1] + right[2] * up[2]).toBeCloseTo(0, 6);
    // The last pose: still in the town (body frame, same spot), Earth see-through, looking up the
    // ecliptic's north pole with the Ascendant on the left (as on the printed chart).
    const last = pts[pts.length - 1]!;
    const wheel = last.fly!;
    // Held 5 s on the ground, then 5 s on the wheel, the end (owner, 4 Nov 2026).
    expect(ground.pause).toBe(5);
    expect(last.pause).toBe(5);
    expect(pts[pts.length - 2]!.look.seeThrough).toBe(false);
    expect(wheel.frame).toBe('body');
    expect(wheel.rel).toEqual(f.rel);
    expect(last.look.seeThrough).toBe(true);
    expect(ground.look.seeThrough).toBe(false);
    expect(ground.look.constellations).toBe(true);
    for (const p of pts) expect(p.look.galactic).toBe(false);
    // Nothing else is taken away: every point keeps the visitor's own choices (time marks, spirals, orbits, planets, round, controls).
    for (const p of pts) {
      for (const k of ['timeGrid', 'spirals', 'rings', 'distanceGrid', 'constellations', 'planets', 'round', 'chrome', 'labels', 'zodiac'] as const) {
        expect(p.look[k]).toEqual(DEFAULT_LOOK[k]);
      }
    }
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

  it('sweeps once round the sky, east from the Sun, 2 s at each planet or group, every body once (any date, any place)', () => {
    const lonOfQuat = (q: readonly number[]): number => {
      const d = rot(q, [0, 0, -1]);
      return ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360;
    };
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), fc.integer({ min: 0, max: 86_399 }),
        fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }),
        (y, m, d, sec, lat, lon) => {
          const rr = readingAt(fromCivil(y, m, d, sec), lat, lon, 'whole');
          const p = starsignsPath(rr, { ...base, id: 'p', created: '', placeLabel: 'X', placeName: 'X', whenText: 'w', system: 'whole' }).points;
          const sweep = p.filter((x) => !x.look.chart);
          // Starts facing the Sun's group, from the first pose itself.
          expect(sweep[0]!.caption).toContain('Sun ');
          // Every body named once; each named stop 2 s, each pass-through point no pause and no name.
          for (const b of rr.bodies) expect(sweep.filter((x) => x.caption.includes(`${b.name} `)).length).toBe(1);
          for (const x of sweep) expect(x.pause).toBe(x.caption ? 2 : 0);
          // Always turning east, each turn under 120° (so the short way is east), less than once round in all.
          let total = 0;
          for (let i = 1; i < sweep.length; i++) {
            const step = (lonOfQuat(sweep[i]!.fly!.quat) - lonOfQuat(sweep[i - 1]!.fly!.quat) + 360) % 360;
            expect(step).toBeGreaterThan(0);
            expect(step).toBeLessThanOrEqual(120 + 1e-6);
            total += step;
          }
          expect(total).toBeLessThan(360);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('never sweeps round the sky more than once, even with a planet just past the Sun (16 Aug 1915 swept 1.5 times)', () => {
    const lonOfQuat = (q: readonly number[]): number => {
      const d = rot(q, [0, 0, -1]);
      return ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360;
    };
    const rr = readingAt(fromCivil(1915, 8, 16, 4372), 0, 0, 'whole');
    const sweep = starsignsPath(rr, { ...base, id: 'p', created: '', placeLabel: 'X', placeName: 'X', whenText: 'w', system: 'whole' }).points.filter((x) => !x.look.chart);
    let total = 0;
    for (let i = 1; i < sweep.length; i++) total += (lonOfQuat(sweep[i]!.fly!.quat) - lonOfQuat(sweep[i - 1]!.fly!.quat) + 360) % 360;
    expect(total).toBeLessThan(360);
    for (const b of rr.bodies) expect(sweep.filter((x) => x.caption.includes(`${b.name} `)).length).toBe(1);
    expect(sweep[0]!.caption).toContain('Mercury ');
  });

  it('is silent except a quiet hum in the field, which is under the place from the landing on', () => {
    const ground = pts.findIndex((p) => p.caption.startsWith('The sky over Winnipeg'));
    expect(pts.map((p) => p.sound === 'noise')).toEqual(pts.map((p) => !!p.look.chart?.ground && !p.look.seeThrough));
    expect(pts[ground]!.sound).toBe('noise');
    expect(pts[pts.length - 1]!.sound).toBeUndefined();
    expect(pts[ground]!.look.chart?.ground).toBe(true);
    expect(pts[pts.length - 1]!.look.chart?.ground).toBe(true);
    expect(pts.slice(0, ground).every((p) => !p.look.chart?.ground)).toBe(true);
  });

  it('is a path like any other: written to a .sp4ce.json file and read back', () => {
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path))));
    expect(back.points).toHaveLength(pts.length);
    expect(back.points.map((p) => p.look.highlight)).toEqual(pts.map((p) => p.look.highlight));
    expect(back.points.map((p) => p.pause)).toEqual(pts.map((p) => (p.pause === undefined ? undefined : Math.round(p.pause * 10) / 10)));
    expect(back.points.map((p) => p.sound)).toEqual(pts.map((p) => p.sound));
    expect(back.points.map((p) => p.look.chart?.ground)).toEqual(pts.map((p) => p.look.chart?.ground));
  });
});

describe('the clock caption’s zone', () => {
  it('is carried on every point and through a file', () => {
    const t = fromCivil(1985, 7, 15, 4 * 3600 + 30 * 60);
    const r = readingAt(t, 49.883, -97.166, 'whole');
    const base = { look: DEFAULT_LOOK, calendar: { offset: { day: 0, sec: 0 }, secondsPerPixel: 0.1, roll: 0, yaw: 0, spaceZoom: 1, panY: 0 } };
    const path = starsignsPath(r, { ...base, id: 'z', created: '2026-11-04T00:00:00Z', placeLabel: 'Winnipeg', placeName: 'Winnipeg', whenText: '14 July 1985, 11:30 pm', system: 'whole', zone: -300 });
    expect(path.points.every((p) => p.zone === -300)).toBe(true);
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path))));
    expect(back.points.every((p) => p.zone === -300 && p.playing)).toBe(true);
  });
});
