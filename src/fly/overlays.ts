/**
 * The calendar's overlays in 3D: spirals (each body's path through time), orbits,
 * the Sun's line, and the time and space grids as lines standing across it.
 * Rebuilt every frame relative to the camera (floating origin), so they flow
 * with time exactly as in the calendar.
 */
import * as THREE from 'three';
import { type BodyState, moonGeocentric } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import { CALENDAR_AXES, helix, moonLoop, orbitLoop, spaceMarks, timeMarks, TRAVEL } from '../core/paths3d';
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
  readonly kind: 'time' | 'space';
}

const K = 300; // helix samples each side of now
const ORBIT_N = 256;
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

  const ids: Array<PlanetId | 'moon'> = [...(Object.keys(theme.planets) as PlanetId[]), 'moon'];
  const colourOf = (id: PlanetId | 'moon'): string => (id === 'moon' ? theme.moon : theme.planets[id]);
  const spiral = new Map(ids.map((id) => [id, make(2 * K + 1, css(colourOf(id), id === 'moon' ? 0.55 : 0.75))]));
  const orbit = new Map(ids.map((id) => [id, make(ORBIT_N + 1, css(colourOf(id), theme.ringAlpha))]));
  const sunLine = make(2 * SUN_LINE_N + 1, css(theme.sunLine, 0.6));
  const timeRings = make((2 * MARKS + 1) * 2, css(theme.gridMajor, 2.2), true);
  const spaceSquares = make((2 * MARKS + 1) * 2, css(theme.distanceGrid, 1.5), true);

  const buf = new Float64Array((2 * K + 1) * 3);
  const ringBuf = new Float64Array((2 * MARKS + 1) * 2 * 3);
  const up = CALENDAR_AXES[1], side = CALENDAR_AXES[2];
  // (side is kept for points off the plane of the grid lines)
  const along = (s: number, a: number, b: number): Vec3 => [
    TRAVEL[0] * s + up[0] * a + side[0] * b,
    TRAVEL[1] * s + up[1] * a + side[1] * b,
    TRAVEL[2] * s + up[2] * a + side[2] * b,
  ];

  return {
    /** Rebuild everything for this moment and camera; returns grid labels to place. */
    update(o: OverlayOptions, now: Time, bodies: readonly BodyState[], cam: Vec3): OverlayLabel[] {
      const labels: OverlayLabel[] = [];
      const posOf = (id: string): Vec3 | undefined => bodies.find((b) => b.info.id === id)?.pos;
      const shown = new Set<string>([...o.planets, ...(o.moon ? ['moon'] : [])]);

      // How far the camera is from the Sun's line sets the scale of the grids.
      const sC = cam[0] * TRAVEL[0] + cam[1] * TRAVEL[1] + cam[2] * TRAVEL[2];
      const perp = Math.hypot(cam[0] - sC * TRAVEL[0], cam[1] - sC * TRAVEL[1], cam[2] - sC * TRAVEL[2]);
      const D = Math.max(perp, 2e4);

      for (const id of ids) {
        const p = posOf(id);
        const sp = spiral.get(id)!;
        if (o.spirals && shown.has(id) && p) sp.set(helix(id, now, p, K, buf), 2 * K + 1, cam);
        else sp.hide();
        const or = orbit.get(id)!;
        if (o.orbits && shown.has(id) && p) {
          if (id === 'moon') {
            const e = posOf('earth')!;
            or.set(moonLoop(e, [p[0] - e[0], p[1] - e[1], p[2] - e[2]], moonGeocentric(addSeconds(now, -6 * 3600)), ORBIT_N, buf), ORBIT_N + 1, cam);
          } else {
            or.set(orbitLoop(id, now, p, ORBIT_N, buf), ORBIT_N + 1, cam);
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
        sunLine.set(buf, n, cam);
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
          labels.push({ pos: along(m.s, kind === 'time' ? hi : lo, 0), text: m.label, kind });
        }
        line.set(ringBuf, n, cam);
      };
      if (o.timeGrid) tick(timeMarks(now, sC, D * 0.25, MARKS), -R, R, timeRings, 'time');
      else timeRings.hide();
      if (o.spaceGrid) tick(spaceMarks(now, sC, D * 0.25, MARKS).marks, -R * 0.85, R * 0.85, spaceSquares, 'space');
      else spaceSquares.hide();

      return labels;
    },
    dispose(): void {
      lines.forEach((l) => l.dispose());
      scene.remove(group);
    },
  };
}
