import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  easeInOut,
  isBigTimeJump,
  logLerp,
  parsePath,
  parsePoint,
  DEFAULT_LOOK,
  parseSp4ceFile,
  type Path,
  PathError,
  type PathPoint,
  pathFileName,
  pointLabel,
  toSp4ceFile,
  zoomPath,
  zoomPathMs,
} from './path';
import { diffSeconds, makeTime, SECONDS_PER_YEAR, type Time } from './time';

const DEEP_DAYS = 5e9 * 366;
const arbTime = fc
  .tuple(fc.integer({ min: -DEEP_DAYS, max: DEEP_DAYS }), fc.double({ min: 0, max: 86_399.999, noNaN: true }))
  .map(([d, s]) => makeTime(d, s));
/** A span across the view: a minute to the Sun's whole life. */
const arbSpan = fc.double({ min: 60, max: 1e10 * SECONDS_PER_YEAR, noNaN: true });

const point = (over: Partial<PathPoint> = {}): PathPoint => ({
  view: 'calendar',
  present: makeTime(9800, 3600),
  speed: 1,
  playing: true,
  calendar: { offset: makeTime(0), secondsPerPixel: 0.1, roll: -0.4, yaw: 0.2, spaceZoom: 1, panY: 0 },
  fly: null,
  look: {
    themeId: 'dark', round: true, chrome: 0, planets: ['earth', 'mars'], moon: true, rings: true, labels: true, spirals: true,
    timeGrid: true, distanceGrid: true, constellations: true, zodiac: true, galactic: true, coastlines: true, chart: null, highlight: null, seeThrough: false, strobe: false, strobeSteps: 5.2,
    focus: 'sun', measure: 'near', barycentre: false, galaxyWeb: true, expansion: true, massOnly: false,
  },
  caption: 'Here we are',
  where: 'Calendar',
  facing: 'turned 23°',
  ...over,
});
const path = (points: PathPoint[]): Path => ({ id: 'p1', name: 'Test', created: '2026-11-01T12:00:00Z', points, finished: true });

describe('point names', () => {
  it('runs START, POINT 1 … END', () => {
    expect([0, 1, 2, 3].map((i) => pointLabel(i, 4, true))).toEqual(['START', 'POINT 1', 'POINT 2', 'END']);
    expect([0, 1, 2].map((i) => pointLabel(i, 3, false))).toEqual(['START', 'POINT 1', 'POINT 2']);
    expect(pointLabel(0, 1, true)).toBe('START · END');
  });
});

describe('.sp4ce.json', () => {
  it('round-trips a path through JSON exactly', () => {
    const p = path([
      point(),
      point({
        view: 'fly',
        fly: { anchor: 'mars', frame: 'inertial', rel: [1, 2, 3e6], quat: [0, 0, 0, 1], fov: 60, up: [0, 0, 1] },
        caption: '',
      }),
    ]);
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(p))));
    expect({ ...back, id: p.id }).toEqual(p);
  });

  it('writes a light file: the look only where it differs, no 3D camera for calendar points', () => {
    const p = path([point(), point({ look: { ...point().look, themeId: 'bright' } })]);
    const f = toSp4ceFile(p, () => '1 Nov 2026');
    // The test points show only Earth and Mars; the app's default shows four planets.
    expect(f.points[0]?.look).toEqual({ planets: ['earth', 'mars'] });
    expect(f.points[1]?.look).toEqual({ themeId: 'bright', planets: ['earth', 'mars'] });
    expect(f.points[0]?.cam).toBeUndefined();
    expect(f.points[0]?.when).toBe('1 Nov 2026');
    expect(JSON.stringify(f).length).toBeLessThan(1000);
  });

  it('still reads the first (0.3.0) layout, as a new path', () => {
    const p = path([point()]);
    const old = { format: 'sp4ce', version: 1, kind: 'path', path: p };
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(old)));
    expect({ ...back, id: p.id }).toEqual(p);
    expect(back.id).not.toBe(p.id);
  });

  it('keeps uploaded numbers to what the app can show, and drops control characters', () => {
    const f = JSON.parse(JSON.stringify(toSp4ceFile(path([point({ view: 'fly', fly: { anchor: 'earth', frame: 'inertial', rel: [7000, 0, 0], quat: [0, 0, 0, 1], fov: 60, up: [0, 0, 1] } })]))));
    f.points[0].rate = 1e300;
    f.points[0].cal.size = 1e9;
    f.points[0].caption = 'Hi\u0001 there';
    f.name = 'Tour\u0007';
    const back = parseSp4ceFile(f);
    expect(Math.abs(back.points[0]!.speed)).toBeLessThanOrEqual(3_155_760_000);
    expect(back.points[0]!.calendar.spaceZoom).toBe(500);
    expect(back.points[0]!.caption).toBe('Hi there');
    const zeroUp = JSON.parse(JSON.stringify(f));
    zeroUp.points[0].cam.up = [0, 0, 0];
    expect(() => parseSp4ceFile(zeroUp)).toThrow(/up/);
    const far = JSON.parse(JSON.stringify(f));
    far.points[0].t = [1e15, 0];
    expect(() => parseSp4ceFile(far)).toThrow(/day/);
    expect(parsePath({ ...path([point()]), id: 'example:x' }).id).not.toMatch(/^example:/);
  });

  it('remembers the barycentre at a point, and reads older files without it as off', () => {
    const p = point();
    const on = { ...p, look: { ...p.look, barycentre: true } };
    expect(parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path([on]))))).points[0]!.look.barycentre).toBe(true);
    const old = JSON.parse(JSON.stringify(path([p]))) as { points: Array<{ look: Record<string, unknown> }> };
    delete old.points[0]!.look.barycentre;
    expect(parsePath(old).points[0]!.look.barycentre).toBe(false);
  });

  it('keeps deep times exact', () => {
    fc.assert(
      fc.property(arbTime, (t) => {
        const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile(path([point({ present: t })])))));
        expect(back.points[0]?.present.day).toBe(t.day);
        expect(Math.abs((back.points[0]?.present.sec ?? -1) - t.sec)).toBeLessThan(6e-4);
      }),
    );
  });

  it('rejects what is not a path, saying why', () => {
    expect(() => parseSp4ceFile({ hello: 1 })).toThrow(PathError);
    expect(() => parseSp4ceFile({ ...toSp4ceFile(path([point()])), version: 99 })).toThrow(/newer version/);
    const f = JSON.parse(JSON.stringify(toSp4ceFile(path([point()]))));
    f.points[0].cal.spp = -1;
    expect(() => parseSp4ceFile(f)).toThrow(/secondsPerPixel/);
    expect(() => parsePath({ id: 'x', name: 'x', points: [] })).toThrow(/no points/);
    const bad = JSON.parse(JSON.stringify(path([point()]))) as { points: Array<{ look: { planets: string[] } }> };
    bad.points[0]!.look.planets = ['vulcan'];
    expect(() => parsePath(bad)).toThrow(/planets/);
    const badFly = JSON.parse(JSON.stringify(path([point({ view: 'fly', fly: { anchor: 'earth', frame: 'body', rel: [1, 1, 1], quat: [0, 0, 0, 1], fov: 60, up: [0, 0, 1] } })])));
    badFly.points[0].fly.anchor = 'vulcan';
    expect(() => parsePath(badFly)).toThrow(/anchor/);
  });

  it('names files plainly', () => {
    expect(pathFileName('Life of the Sun!')).toBe('life-of-the-sun.sp4ce.json');
    expect(pathFileName('  ')).toBe('path.sp4ce.json');
  });
});

describe('flights through time (van Wijk and Nuij)', () => {
  it('starts and ends exactly where asked, at the widths asked', () => {
    fc.assert(
      fc.property(arbTime, arbSpan, arbTime, arbSpan, (t0, w0, t1, w1) => {
        const z = zoomPath(t0, w0, t1, w1);
        const a = z.at(0), b = z.at(z.S);
        expect(Math.abs(diffSeconds(a.centre, t0))).toBeLessThan(1e-6 * w0 + 1e-3);
        expect(Math.abs(diffSeconds(b.centre, t1))).toBeLessThan(1e-6 * w1 + 1e-3);
        expect(a.w / w0).toBeCloseTo(1, 6);
        expect(b.w / w1).toBeCloseTo(1, 6);
      }),
    );
  });

  it('never jumps: each step moves the view less than its own width', () => {
    fc.assert(
      fc.property(arbTime, arbSpan, arbTime, arbSpan, (t0, w0, t1, w1) => {
        const z = zoomPath(t0, w0, t1, w1);
        // Small steps along the path (0.005 of its own units) move the view only a
        // small part of its span: it glides, it never jumps.
        const N = Math.max(50, Math.ceil(z.S / 0.005));
        let prev = z.at(0);
        for (let i = 1; i <= N; i++) {
          const cur = z.at((z.S * i) / N);
          const step = Math.abs(diffSeconds(cur.centre, prev.centre));
          expect(step).toBeLessThan(Math.max(cur.w, prev.w) * 0.05 + 1e-3);
          expect(cur.w).toBeGreaterThan(0);
          prev = cur;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('zooms out enough to see both ends on a long jump', () => {
    const t0 = makeTime(9800), t1 = makeTime(9800 - 4.6e9 * 365.25);
    const z = zoomPath(t0, 60, t1, 60);
    const mid = z.at(z.S / 2);
    expect(mid.w).toBeGreaterThan(Math.abs(diffSeconds(t1, t0)) * 0.5);
    expect(zoomPathMs(z.S)).toBeLessThanOrEqual(6500);
  });

  it('is only a zoom when the time is the same', () => {
    const t: Time = makeTime(100, 5);
    const z = zoomPath(t, 60, t, 6e6);
    expect(diffSeconds(z.at(z.S / 3).centre, t)).toBe(0);
    expect(z.at(z.S / 2).w).toBeCloseTo(Math.sqrt(60 * 6e6), 0);
    expect(zoomPath(t, 60, t, 60).S).toBe(0);
    expect(zoomPathMs(0)).toBe(0);
  });
});

describe('helpers', () => {
  it('turns the short way', () => {
    fc.assert(
      fc.property(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true }), (a, b) => {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThan(-Math.PI - 1e-9);
        expect(d).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(Math.cos(a + d)).toBeCloseTo(Math.cos(b), 6);
        expect(Math.sin(a + d)).toBeCloseTo(Math.sin(b), 6);
      }),
    );
  });
  it('eases and scales by factors', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBeCloseTo(1, 12);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(logLerp(1, 100, 0.5)).toBeCloseTo(10, 9);
  });
  it('knows a big jump in time', () => {
    expect(isBigTimeJump(makeTime(0), makeTime(10))).toBe(false);
    expect(isBigTimeJump(makeTime(0), makeTime(40))).toBe(true);
  });
});

describe('Points among the nearby galaxies (0.4.3)', () => {
  it('keep a camera 16 Mpc out, and the web, expansion and mass-only settings', () => {
    const p = parsePoint({
      view: 'fly', present: { day: 0, sec: 0 }, speed: 1, playing: false,
      calendar: { offset: { day: 0, sec: 0 }, secondsPerPixel: 0.1, roll: 0, yaw: 0, spaceZoom: 1, panY: 0 },
      fly: { anchor: 'sun', frame: 'inertial', rel: [4.9e20, 1e19, 2e20], quat: [0, 0, 0, 1], fov: 60, up: [0, 0, 1] },
      look: { ...DEFAULT_LOOK, galaxyWeb: false, expansion: true, massOnly: true },
    });
    expect(p.fly!.rel[0]).toBe(4.9e20);
    const back = parseSp4ceFile(JSON.parse(JSON.stringify(toSp4ceFile({ id: 'a', name: 'n', created: '', points: [p], finished: true })))).points[0]!;
    expect(back.look).toMatchObject({ galaxyWeb: false, expansion: true, massOnly: true });
  });
});
