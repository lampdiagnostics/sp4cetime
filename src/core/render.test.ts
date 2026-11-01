import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { orbitalPeriod, planetById } from './planets';
import { coilWeight, densePaths, samplesPerTurn, segmentOff } from './render';

describe('Coil or band', () => {
  it('is a pure coil when turns are well apart, and a pure band when they crowd', () => {
    expect(coilWeight(40)).toBe(1);
    expect(coilWeight(8)).toBe(0);
    expect(coilWeight(2)).toBe(0);
  });

  it('fades smoothly between the two as you zoom: no jumps', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1000, noNaN: true }), (px) => {
        expect(Math.abs(coilWeight(px * 1.001) - coilWeight(px))).toBeLessThan(0.002);
        expect(coilWeight(px * 1.001)).toBeGreaterThanOrEqual(coilWeight(px));
      }),
    );
  });

  it('reports when paths are shown as bands', () => {
    const earth = orbitalPeriod(planetById('earth'));
    expect(densePaths(['earth'], earth / 2)).toBe(true);
    expect(densePaths(['earth'], earth / 100)).toBe(false);
  });
});

describe('Sampling', () => {
  it('uses a power of two per turn, so zooming only adds or removes in-between points', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e5, noNaN: true }), fc.double({ min: 0, max: 1e5, noNaN: true }), (px, r) => {
        const n = samplesPerTurn(px, r, 64, 4096);
        expect(Number.isInteger(Math.log2(n))).toBe(true);
        expect(n).toBeGreaterThanOrEqual(64);
        expect(n).toBeLessThanOrEqual(4096);
      }),
    );
  });

  it('keeps on-screen steps small for ordinary sizes', () => {
    const n = samplesPerTurn(600, 300, 64, 4096);
    expect(600 / n).toBeLessThanOrEqual(2);
    expect((2 * Math.PI * 300) / n).toBeLessThanOrEqual(4);
  });
});

describe('Edge-to-edge drawing', () => {
  it('keeps a segment that crosses the whole screen even when both ends are off it', () => {
    expect(segmentOff(-5000, 300, 9000, 320, 1440, 900)).toBe(false);
    expect(segmentOff(400, -9000, 420, 9000, 1440, 900)).toBe(false);
  });

  it('skips segments wholly off one side', () => {
    expect(segmentOff(-500, 300, -200, 320, 1440, 900)).toBe(true);
    expect(segmentOff(400, 2000, 900, 3000, 1440, 900)).toBe(true);
  });
});

describe('Drawing with all text hidden', () => {
  it('draws no text and offers no names to click', async () => {
    const { drawFrame } = await import('./render');
    const { THEMES } = await import('../../content/themes');
    const { fromCivil } = await import('./time');
    const { DEFAULT_ROLL } = await import('./geometry');
    let texts = 0;
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      moveTo() {}
      lineTo() {}
      arc() {}
      closePath() {}
      rect() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
    };
    // A canvas context that counts text and ignores everything else. Its methods live on its
    // prototype, as in a real one, so hiding text (an own property) and restoring it both work.
    const methods: Record<string, unknown> = {
      fillText: () => texts++,
      measureText: () => ({ width: 10 }),
      getTransform: () => ({ a: 1 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const ctx = new Proxy(Object.create(methods) as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => ((t[k as string] = v), true),
      deleteProperty: (t, k) => (delete t[k as string], true),
    }) as unknown as CanvasRenderingContext2D;
    const now = fromCivil(2026, 10, 31);
    const base = {
      cam: { center: now, secondsPerPixel: 86_400 * 3, width: 1000, height: 700 },
      theme: THEMES[0]!,
      now,
      view: {
        roll: DEFAULT_ROLL, yaw: 0, scale: 'fit' as const, planets: ['earth', 'mars'] as const, moon: true, rings: true, labels: true, round: true,
        spirals: true, timeGrid: true, distanceGrid: true, spaceZoom: 1, focus: 'sun' as const, panY: 0, constellations: true, zodiac: true, galactic: true, text: true,
      },
    };
    const shown = drawFrame(ctx, base);
    expect(texts).toBeGreaterThan(0);
    expect(shown.labels.length).toBeGreaterThan(0);
    texts = 0;
    const hidden = drawFrame(ctx, { ...base, view: { ...base.view, text: false } });
    expect(texts).toBe(0);
    expect(hidden.labels).toEqual([]);
    // Text works again afterwards.
    drawFrame(ctx, base);
    expect(texts).toBeGreaterThan(0);
  });
});

describe('The sky behind the calendar', () => {
  it('in the default view, the Sun’s current zodiac sign is straight behind the Sun', async () => {
    const { skyMatrix } = await import('./render');
    const { DEFAULT_ROLL } = await import('./geometry');
    const { keplerKm } = await import('./paths3d');
    const { fromCivil } = await import('./time');
    const now = fromCivil(2026, 10, 31);
    const m = skyMatrix(DEFAULT_ROLL, 0, now);
    // Into the screen is −z of the view: the row-2 axis, negated, is the direction behind the Sun.
    const behind = [-m[2][0], -m[2][1], -m[2][2]];
    const e = keplerKm('earth', now);
    const sunFromEarth = [-e[0], -e[1]];
    const lon = (Math.atan2(behind[1]!, behind[0]!) * 180) / Math.PI;
    const want = (Math.atan2(sunFromEarth[1]!, sunFromEarth[0]!) * 180) / Math.PI;
    expect(lon).toBeCloseTo(want, 6);
    // On 31 October the Sun is in Scorpio (tropical: ecliptic longitude 210°–240°).
    expect(((lon % 360) + 360) % 360).toBeGreaterThan(210);
    expect(((lon % 360) + 360) % 360).toBeLessThan(240);
    expect(behind[2]).toBeCloseTo(0, 9);
  });
});

describe('True scale at a close time zoom', () => {
  it('points to the planets beyond the window instead of losing them', async () => {
    const { drawFrame } = await import('./render');
    const { THEMES } = await import('../../content/themes');
    const { fromCivil } = await import('./time');
    const { DEFAULT_ROLL } = await import('./geometry');
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      moveTo() {}
      lineTo() {}
      arc() {}
      closePath() {}
    };
    const methods: Record<string, unknown> = {
      measureText: () => ({ width: 10 }),
      getTransform: () => ({ a: 1 }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const ctx = new Proxy(Object.create(methods) as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => ((t[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    const now = fromCivil(2026, 10, 31);
    const r = drawFrame(ctx, {
      cam: { center: now, secondsPerPixel: 0.05, width: 1000, height: 700 },
      theme: THEMES[0]!,
      now,
      view: {
        roll: DEFAULT_ROLL, yaw: 0, scale: 'true', planets: ['earth', 'mars'], moon: true, rings: true, labels: true, round: true,
        spirals: true, timeGrid: true, distanceGrid: true, spaceZoom: 1, focus: 'sun', panY: 0, constellations: false, zodiac: false, galactic: false, text: true,
      },
    });
    const ids = r.labels.map((l) => l.id);
    expect(ids).toContain('earth');
    expect(ids).toContain('mars');
    // The pointers sit inside the round window.
    for (const l of r.labels.filter((b) => b.id !== 'sun')) {
      const cx = (l.x0 + l.x1) / 2, cy = (l.y0 + l.y1) / 2;
      expect(Math.hypot(cx - 500, cy - 350)).toBeLessThan(330);
    }
  });
});

describe('The Sun and the Moon on the zodiac, seen from Earth', () => {
  it('puts the Sun in Scorpio on 31 October and names the Moon’s sign', async () => {
    const { skyBodies } = await import('./render');
    const { fromCivil } = await import('./time');
    const [sun, moon] = skyBodies(fromCivil(2026, 10, 31));
    expect(sun!.text).toBe('Sun in ♏︎ Scorpio');
    expect(moon!.text).toMatch(/^Moon in \S+ \w+$/u);
    expect(Math.hypot(...moon!.dir)).toBeCloseTo(1, 9);
    // The Moon stays within ~5° of the ecliptic.
    expect(Math.abs(Math.asin(moon!.dir[2]) * 180 / Math.PI)).toBeLessThan(5.5);
  });
});

describe('Centre: Earth (geocentric)', () => {
  it('puts Earth at the centre on its straight line and the Sun off it', async () => {
    const { drawFrame } = await import('./render');
    const { THEMES } = await import('../../content/themes');
    const { fromCivil } = await import('./time');
    const { DEFAULT_ROLL } = await import('./geometry');
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      moveTo() {}
      lineTo() {}
      arc() {}
      closePath() {}
    };
    const methods: Record<string, unknown> = {
      measureText: () => ({ width: 10 }),
      getTransform: () => ({ a: 1 }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const ctx = new Proxy(Object.create(methods) as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => ((t[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    const now = fromCivil(2026, 10, 31);
    const view = {
      roll: DEFAULT_ROLL, yaw: 0, scale: 'fit' as const, planets: ['earth', 'mars'] as const, moon: false, rings: true, labels: true, round: true,
      spirals: true, timeGrid: true, distanceGrid: true, spaceZoom: 1, focus: 'earth' as const, panY: 0, constellations: false, zodiac: false, galactic: false, text: true,
    };
    const r = drawFrame(ctx, { cam: { center: now, secondsPerPixel: 3600 * 24 * 2, width: 1000, height: 700 }, theme: THEMES[0]!, now, view });
    const box = (id: string) => r.labels.find((l) => l.id === id)!;
    // Labels sit 9 px right of and 10 px above their body.
    const earthAt = [box('earth').x0 + 4 - 9, (box('earth').y0 + box('earth').y1) / 2 + 10];
    const sunAt = [box('sun').x0 + 4 - 9, (box('sun').y0 + box('sun').y1) / 2 + 10];
    expect(earthAt[0]).toBeCloseTo(r.sunX, 6);
    expect(earthAt[1]).toBeCloseTo(r.sunY, 6);
    expect(Math.hypot(sunAt[0]! - earthAt[0]!, sunAt[1]! - earthAt[1]!)).toBeGreaterThan(20);
    expect(r.space).toMatch(/^Space grid · .* km between lines$/);
  });
});

describe('Strobe', () => {
  it('freezes poses at fixed moments, a step apart, that stay put as time runs', async () => {
    const { drawFrame } = await import('./render');
    const { THEMES } = await import('../../content/themes');
    const { addSeconds, fromCivil, SECONDS_PER_YEAR } = await import('./time');
    const { DEFAULT_ROLL } = await import('./geometry');
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      moveTo() {}
      lineTo() {}
      arc() {}
      closePath() {}
    };
    const methods: Record<string, unknown> = {
      measureText: () => ({ width: 10 }),
      getTransform: () => ({ a: 1 }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const ctx = new Proxy(Object.create(methods) as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => ((t[k as string] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    const view = {
      roll: DEFAULT_ROLL, yaw: 0, scale: 'fit' as const, planets: ['earth'] as const, moon: false, rings: false, labels: true, round: false,
      spirals: false, timeGrid: false, distanceGrid: false, spaceZoom: 1, focus: 'earth' as const, panY: 0, constellations: false, zodiac: false, galactic: false, text: true,
      strobe: 5,
    };
    const step = SECONDS_PER_YEAR / 5;
    const frame = (now: ReturnType<typeof fromCivil>) =>
      drawFrame(ctx, { cam: { center: now, secondsPerPixel: (100 * SECONDS_PER_YEAR) / 1000, width: 1000, height: 700 }, theme: THEMES[0]!, now, view });
    const t0 = fromCivil(2026, 10, 31);
    const a = frame(t0);
    expect(a.poses.length).toBeGreaterThan(20);
    const dts = [...new Set(a.poses.map((p) => Math.round(p.dt)))].sort((x, y) => y - x);
    expect(dts[0]!).toBeLessThanOrEqual(0);
    expect(dts[0]!).toBeGreaterThan(-step);
    expect(dts[0]! - dts[1]!).toBeCloseTo(step, -1);
    // A day later, the same poses are a day further back.
    const b = frame(addSeconds(t0, 86_400));
    const dtsB = new Set(b.poses.map((p) => Math.round(p.dt + 86_400)));
    expect(dtsB.has(dts[1]!) || dtsB.has(dts[1]! + 1) || dtsB.has(dts[1]! - 1)).toBe(true);
    // Off: nothing frozen.
    expect(drawFrame(ctx, { cam: { center: t0, secondsPerPixel: 1e5, width: 1000, height: 700 }, theme: THEMES[0]!, now: t0, view: { ...view, strobe: 0 } }).poses).toHaveLength(0);
  });
});
