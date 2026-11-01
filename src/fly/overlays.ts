/**
 * The calendar's overlays in 3D: spirals (each body's path through time), orbits,
 * the Sun's line, and the time and space grids as lines standing across it.
 * Rebuilt every frame relative to the camera (floating origin), so they flow
 * with time exactly as in the calendar.
 */
import * as THREE from 'three';
import { type BodyState, moonGeocentric } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import { CALENDAR_AXES, helixAt, moonLoop, orbitLoop, pathPeriod, rulerSpaceMarks, rulerTimeMarks, TRAVEL } from '../core/paths3d';
import { formatDistanceStep } from '../core/ticks';
import { SUN_GALACTIC_SPEED_KM_S } from '../core/constants';
import type { PlanetId } from '../core/planets';
import type { Theme } from '../core/theme';
import { addSeconds, type Time } from '../core/time';

export interface OverlayOptions {
  readonly spirals: boolean;
  readonly orbits: boolean;
  readonly timeGrid: boolean;
  readonly spaceGrid: boolean;
  readonly planets: readonly PlanetId[];
  readonly moon: boolean;
  readonly constellations: boolean;
  readonly zodiac: boolean;
  readonly galactic: boolean;
}

export interface OverlayLabel {
  /** Heliocentric ecliptic position, km. */
  readonly pos: Vec3;
  readonly text: string;
  readonly kind: 'time' | 'space' | 'galaxy';
}

/** Samples per side of now: enough for 24 per turn, between these limits. */
const K_MIN = 150;
const K_MAX = 6000;
const AU = 149_597_870.7;
const ORBIT_N = 256;
const V = SUN_GALACTIC_SPEED_KM_S;
const MARKS = 12;
const SUN_LINE_N = 40;

/** "#rrggbb" or "rgba(r, g, b, a)" → colour and opacity. */
function css(c: string, alphaScale = 1): { color: THREE.Color; opacity: number } {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a] = m[1]!.split(',').map((x) => Number(x.trim()));
    return { color: new THREE.Color(r! / 255, g! / 255, b! / 255), opacity: Math.min(1, (a ?? 1) * alphaScale) };
  }
  return { color: new THREE.Color(c), opacity: Math.min(1, alphaScale) };
}

/** A line whose vertices are rewritten each frame. */
class DynLine {
  readonly obj: THREE.Line | THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  constructor(max: number, style: { color: THREE.Color; opacity: number }, segments = false) {
    this.pos = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    const mat = new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false });
    this.obj = segments ? new THREE.LineSegments(g, mat) : new THREE.Line(g, mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = -1;
  }
  /** Copy points (km, heliocentric) relative to the camera, in double precision. */
  set(src: ArrayLike<number>, count: number, cam: Vec3): void {
    const n = Math.min(count, this.pos.length / 3);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = src[i * 3]! - cam[0];
      this.pos[i * 3 + 1] = src[i * 3 + 1]! - cam[1];
      this.pos[i * 3 + 2] = src[i * 3 + 2]! - cam[2];
    }
    this.obj.geometry.setDrawRange(0, n);
    this.attr.needsUpdate = true;
    this.obj.visible = n > 1;
  }
  hide(): void {
    this.obj.visible = false;
  }
  dispose(): void {
    this.obj.geometry.dispose();
    (this.obj.material as THREE.Material).dispose();
  }
}

/**
 * A path with a width on screen, like the calendar's (WebGL lines are always 1 px):
 * a strip of triangles whose sides are pushed apart across the view, rebuilt each frame.
 * Thicker than the 1 px grid and sky lines, so paths stand out from them.
 */
class DynRibbon {
  readonly obj: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly local: Float64Array;
  constructor(
    private readonly max: number,
    style: { color: THREE.Color; opacity: number },
    /** Half the width on screen, px. */
    private readonly halfPx: number,
  ) {
    this.pos = new Float32Array(max * 2 * 3);
    this.local = new Float64Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 2, 2 * i + 1, 2 * i + 3);
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, side: THREE.DoubleSide });
    this.obj = new THREE.Mesh(g, mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = -1;
  }
  /** Points (km, heliocentric), relative to the camera in double precision; `pxAngle` is radians per screen px. */
  set(src: ArrayLike<number>, count: number, cam: Vec3, pxAngle: number): void {
    const n = Math.min(count, this.max);
    const p = this.local;
    for (let i = 0; i < n; i++) {
      p[i * 3] = src[i * 3]! - cam[0];
      p[i * 3 + 1] = src[i * 3 + 1]! - cam[1];
      p[i * 3 + 2] = src[i * 3 + 2]! - cam[2];
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3, c = i * 3;
      const tx = p[b]! - p[a]!, ty = p[b + 1]! - p[a + 1]!, tz = p[b + 2]! - p[a + 2]!;
      const x = p[c]!, y = p[c + 1]!, z = p[c + 2]!;
      // Across the path and across the line of sight: the side the ribbon spreads to.
      const sx = ty * z - tz * y, sy = tz * x - tx * z, sz = tx * y - ty * x;
      const len = Math.hypot(sx, sy, sz);
      const w = len > 0 ? (this.halfPx * pxAngle * Math.hypot(x, y, z)) / len : 0;
      const j = i * 6;
      this.pos[j] = x + sx * w;
      this.pos[j + 1] = y + sy * w;
      this.pos[j + 2] = z + sz * w;
      this.pos[j + 3] = x - sx * w;
      this.pos[j + 4] = y - sy * w;
      this.pos[j + 5] = z - sz * w;
    }
    this.obj.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.attr.needsUpdate = true;
    this.obj.visible = n > 1;
  }
  hide(): void {
    this.obj.visible = false;
  }
  dispose(): void {
    this.obj.geometry.dispose();
    (this.obj.material as THREE.Material).dispose();
  }
}

export function createOverlays(scene: THREE.Scene, theme: Theme) {
  const group = new THREE.Group();
  scene.add(group);
  const lines: DynLine[] = [];
  const make = (max: number, style: { color: THREE.Color; opacity: number }, segments = false): DynLine => {
    const l = new DynLine(max, style, segments);
    group.add(l.obj);
    lines.push(l);
    return l;
  };
  const ribbons: DynRibbon[] = [];
  /** Paths are drawn as wide as in the calendar (its trail width, a little more for the 3D view's lighter stroke). */
  const ribbon = (max: number, style: { color: THREE.Color; opacity: number }, scaleW = 1, widthPx = theme.trailWidth * 1.5): DynRibbon => {
    const r = new DynRibbon(max, style, Math.max(0.9, (widthPx * scaleW) / 2));
    group.add(r.obj);
    ribbons.push(r);
    return r;
  };

  const ids: Array<PlanetId | 'moon'> = [...(Object.keys(theme.planets) as PlanetId[]), 'moon'];
  const colourOf = (id: PlanetId | 'moon'): string => (id === 'moon' ? theme.moon : theme.planets[id]);
  const spiral = new Map(ids.map((id) => [id, ribbon(2 * K_MAX + 1, css(colourOf(id), id === 'moon' ? 0.55 : 0.75), id === 'moon' ? 0.75 : 1)]));
  const orbit = new Map(ids.map((id) => [id, ribbon(ORBIT_N + 1, css(colourOf(id), theme.ringAlpha), 0.8)]));
  // The Sun's line: the thickest line on screen, as in the calendar.
  const sunLine = ribbon(2 * SUN_LINE_N + 1, css(theme.sunLine, 0.75), 1, Math.max(theme.sunLineWidth * 1.2, theme.trailWidth * 2.2));
  const timeRings = make((2 * MARKS + 1) * 2, css(theme.gridMajor, 2.2), true);
  const spaceSquares = make((2 * MARKS + 1) * 2, css(theme.distanceGrid, 1.5), true);

  const buf = new Float64Array((2 * K_MAX + 1) * 3);
  const times = new Float64Array(2 * K_MAX + 1);
  const fwd = new Float64Array(K_MAX);
  const back = new Float64Array(K_MAX);
  /**
   * The moments to sample a coil at, from −reach to +reach (s from now). Each turn gets as
   * many points as it needs to look round where it is on screen: 24 where it is large,
   * 8 where it is a few pixels across, and fewer still once it is under a pixel (where no
   * corner can show). So every coil runs all the way out, however many turns that is,
   * instead of stopping after a fixed number of turns. Returns how many.
   */
  const coilTimes = (
    P: number, R: number, reach: number, sC: number, perp: number, pxAngle: number,
    /** A second, slower turn the path also makes (the Moon's: around the Sun with Earth). */
    outer?: { P: number; R: number },
  ): number => {
    const longest = reach / K_MIN;
    const stepFor = (P: number, R: number, s: number): number => {
      const dist = Math.max(Math.hypot(V * s - sC, perp), 0.5 * R);
      const r = R / (dist * Math.max(1e-9, pxAngle));
      const per = r >= 1 ? Math.min(24, Math.max(8, 1.6 * r)) : 8 * r;
      return P / Math.max(per, 1e-12);
    };
    const step = (s: number): number => {
      const own = stepFor(P, R, s);
      const d = outer ? Math.min(own, stepFor(outer.P, outer.R, s)) : own;
      return Math.max(P / 24, Math.min(d, Math.max(longest, P / 24)));
    };
    const side = (dir: 1 | -1, into: Float64Array): number => {
      let s = 0, n = 0;
      while (n < K_MAX && Math.abs(s) < reach) {
        s = dir * Math.min(reach, Math.abs(s) + step(s));
        into[n++] = s;
      }
      return n;
    };
    const nb = side(-1, back), nf = side(1, fwd);
    let n = 0;
    for (let i = nb - 1; i >= 0; i--) times[n++] = back[i] as number;
    times[n++] = 0;
    for (let i = 0; i < nf; i++) times[n++] = fwd[i] as number;
    return n;
  };
  const ringBuf = new Float64Array((2 * MARKS + 1) * 2 * 3);
  const up = CALENDAR_AXES[1], side = CALENDAR_AXES[2];
  // (side is kept for points off the plane of the grid lines)
  const along = (s: number, a: number, b: number): Vec3 => [
    TRAVEL[0] * s + up[0] * a + side[0] * b,
    TRAVEL[1] * s + up[1] * a + side[1] * b,
    TRAVEL[2] * s + up[2] * a + side[2] * b,
  ];

  let statement = '';
  let bar = { km: 0, px: 0 };
  return {
    /** What the space grid says about itself ("Space grid · 2 million km between lines"), or ''. */
    statement: (): string => statement,
    /** For the scale bar: the grid's spacing and how far apart its lines look (at the Sun's line), px. */
    bar: (): { km: number; px: number } => bar,
    /** Rebuild everything for this moment and camera; returns grid labels to place. */
    update(
      o: OverlayOptions,
      now: Time,
      bodies: readonly BodyState[],
      cam: Vec3,
      /** Real positions (the paths are built from these, then reshaped by `shape`). */
      trueBodies: readonly BodyState[] = bodies,
      shape?: (o: Vec3) => Vec3,
      /** Radians per screen pixel, for the paths' width. */
      pxAngle = 1e-3,
      /** The zoom's span, s: the ruler's step is a sixth of it (10 s at "Minute"). */
      timeSpan = 86_400,
    ): OverlayLabel[] {
      const labels: OverlayLabel[] = [];
      const posOf = (id: string): Vec3 | undefined => bodies.find((b) => b.info.id === id)?.pos;
      const truePos = (id: string): Vec3 | undefined => trueBodies.find((b) => b.info.id === id)?.pos;
      const shown = new Set<string>([...o.planets, ...(o.moon ? ['moon'] : [])]);

      // How far the camera is from the Sun's line sets the scale of the grids.
      const sC = cam[0] * TRAVEL[0] + cam[1] * TRAVEL[1] + cam[2] * TRAVEL[2];
      const perp = Math.hypot(cam[0] - sC * TRAVEL[0], cam[1] - sC * TRAVEL[1], cam[2] - sC * TRAVEL[2]);
      const D = Math.max(perp, 2e4);
      // How far along the line of travel the window can show: from now to where you are,
      // and well beyond either way (paths farther than that are too small to see).
      const reachS = (Math.abs(sC) + 40 * Math.max(D, 0.5 * AU)) / SUN_GALACTIC_SPEED_KM_S;

      for (const id of ids) {
        const p = posOf(id);
        const tp = truePos(id);
        const sp = spiral.get(id)!;
        if (o.spirals && shown.has(id) && p && tp) {
          // The whole coil is always there. Draw it out along the line until, in perspective,
          // it has shrunk to under half a pixel, so looking down the line into the past or
          // future every coil converges on the vanishing point instead of stopping in space.
          const sun = posOf('sun') ?? [0, 0, 0];
          const R = Math.max(1e5, Math.hypot(p[0] - sun[0], p[1] - sun[1], p[2] - sun[2]));
          const converge = (Math.abs(sC) + R / (0.5 * Math.max(1e-7, pxAngle))) / SUN_GALACTIC_SPEED_KM_S;
          const reach = Math.min(Math.max(reachS, converge), (1e6 * AU) / SUN_GALACTIC_SPEED_KM_S);
          const P = pathPeriod(id);
          // The Moon's turns are around Earth (as small as its distance from Earth), on Earth's yearly turn.
          const e = id === 'moon' ? posOf('earth') : undefined;
          const n = e
            ? coilTimes(P, Math.max(1e3, Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])), reach, sC, perp, pxAngle, { P: pathPeriod('earth'), R })
            : coilTimes(P, R, reach, sC, perp, pxAngle);
          sp.set(helixAt(id, now, tp, times, n, buf, shape), n, cam, pxAngle);
        }
        else sp.hide();
        const or = orbit.get(id)!;
        if (o.orbits && shown.has(id) && p) {
          if (id === 'moon') {
            const e = posOf('earth')!;
            or.set(moonLoop(e, [p[0] - e[0], p[1] - e[1], p[2] - e[2]], moonGeocentric(addSeconds(now, -6 * 3600)), ORBIT_N, buf), ORBIT_N + 1, cam, pxAngle);
          } else {
            or.set(orbitLoop(id, now, tp ?? p, ORBIT_N, buf, shape), ORBIT_N + 1, cam, pxAngle);
          }
        } else or.hide();
      }

      // The Sun's line: points spaced geometrically out from the part nearest you.
      if (o.spirals) {
        let n = 0;
        for (let i = -SUN_LINE_N; i <= SUN_LINE_N; i++) {
          const s = sC + Math.sign(i) * D * 0.25 * (2 ** (Math.abs(i) * 0.6) - 1);
          const q = along(s, 0, 0);
          buf[n * 3] = q[0];
          buf[n * 3 + 1] = q[1];
          buf[n * 3 + 2] = q[2];
          n++;
        }
        sunLine.set(buf, n, cam, pxAngle);
      } else sunLine.hide();

      // Grid lines stand across the Sun's line, like the calendar's vertical grid lines.
      const R = D * 0.5;
      const tick = (marks: ReadonlyArray<{ s: number; label: string }>, lo: number, hi: number, line: DynLine, kind: OverlayLabel['kind']): void => {
        let n = 0;
        for (const m of marks) {
          for (const h of [lo, hi]) {
            const q = along(m.s, h, 0);
            ringBuf[n * 3] = q[0];
            ringBuf[n * 3 + 1] = q[1];
            ringBuf[n * 3 + 2] = q[2];
            n++;
          }
          if (m.label) labels.push({ pos: along(m.s, kind === 'time' ? hi : lo, 0), text: m.label, kind });
        }
        line.set(ringBuf, n, cam);
      };
      if (o.timeGrid) tick(rulerTimeMarks(now, sC, D * 0.25, timeSpan / 6, MARKS), -R, R, timeRings, 'time');
      else timeRings.hide();
      statement = '';
      bar = { km: 0, px: 0 };
      if (o.spaceGrid) {
        const sp = rulerSpaceMarks(now, sC, D * 0.25, timeSpan / 6, MARKS);
        tick(sp.marks, -R * 0.85, R * 0.85, spaceSquares, 'space');
        statement = `Space grid · ${formatDistanceStep(sp.step)} between lines`;
        const gap = sp.marks.length > 1 ? Math.abs((sp.marks[1] as { s: number }).s - (sp.marks[0] as { s: number }).s) : 0;
        bar = { km: sp.step.km, px: gap / (D * Math.max(1e-9, pxAngle)) };
      } else spaceSquares.hide();

      return labels;
    },
    dispose(): void {
      lines.forEach((l) => l.dispose());
      ribbons.forEach((r) => r.dispose());
      scene.remove(group);
    },
  };
}
