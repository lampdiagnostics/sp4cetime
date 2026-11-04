/**
 * The nearest galaxies in Fly mode (0.4.3; docs/SPHERES.md §9, ADR-0021): about 500 from
 * the Updated Nearby Galaxy Catalog (public/sky/galaxies.json, src/core/galaxies.ts), each
 * at its measured place and true size, and the galaxy web joining them, ruled in light
 * years. With the expansion skin on, the space between groups stretches with time
 * (ΛCDM, or the matter-only universe as a teaching option); groups stay whole.
 *
 * The catalogue gives no position angles, so every disc is drawn face-on to you, tinted by
 * type: picture modelled; only the place and the size are measured (rule 5). The six Local
 * Group galaxies with their own pictures (localGroup.ts) are not drawn again here.
 *
 * Like the rest of the galaxy view, everything is drawn shrunk toward the camera (positions
 * relative to it in double precision, then scaled), so 10^20 km never reach the GPU.
 */
import * as THREE from 'three';
import type { Cosmology } from '../core/cosmology';
import { displayName, formatLy, type Galaxy, galaxyKind, galaxyText, type GalaxyWeb, galaxyWeb, isHandDrawn, markStepLy, marksAlong, parseGalaxies, placesAt } from '../core/galaxies';
import { KM_PER_LIGHT_YEAR, type Vec3 } from '../core/geometry';
import type { SkyStyle } from '../core/theme';
import { threeColour } from './sky';
import type { Hoverable } from './localGroup';

const KM_PER_KPC = 3.085_677_581_491_367e16;

export interface NearbyOptions {
  /** The web and its light-year marks. */
  readonly web: boolean;
  /** The expansion skin: which universe, or none (today's places). */
  readonly cosmology: Cosmology | null;
  /** Years from J2000 (the moment shown). */
  readonly years: number;
}

export interface NearbyLabel {
  readonly pos: Vec3;
  readonly text: string;
  readonly action?: string;
}

/** Load the catalogue (outside the JS budget, when the galaxy view first opens). */
export async function loadNearby(base: string): Promise<Galaxy[]> {
  const r = await fetch(`${base}sky/galaxies.json`);
  if (!r.ok) throw new Error(`galaxies.json: ${r.status}`);
  return parseGalaxies(await r.json());
}

/** A soft face-on disc, white (tinted per galaxy). */
function discTexture(): THREE.CanvasTexture {
  const S = 128, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(C, C, 0, C, C, C);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

const TINT = { spiral: new THREE.Color(0.75, 0.82, 1), elliptical: new THREE.Color(1, 0.86, 0.66), irregular: new THREE.Color(0.62, 0.78, 1) };

export function createNearby(scene: THREE.Scene, gs: readonly Galaxy[], milkyWayNow: Vec3, style: SkyStyle) {
  const web: GalaxyWeb = galaxyWeb(gs, milkyWayNow);
  const drawn = gs.map((g, i) => i).filter((i) => !isHandDrawn(gs[i]!.name));
  const D = gs.map((g) => (g.diameterKpc ?? 3) * KM_PER_KPC);
  const text = gs.map(galaxyText);

  const tex = discTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const discs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, drawn.length));
  discs.frustumCulled = false;
  discs.renderOrder = 1;
  const brightness = (g: Galaxy): number => Math.max(0.35, Math.min(1, 0.35 + ((-(g.absB ?? -14)) - 12) / 9));
  drawn.forEach((i, k) => discs.setColorAt(k, TINT[galaxyKind(gs[i]!.type)].clone().multiplyScalar(brightness(gs[i]!))));
  scene.add(discs);

  // The web: group lines and bridges, and marks every round number of light years.
  const pairs: Array<readonly [number, number, boolean]> = [...web.members.map(([a, b]) => [a, b, false] as const), ...web.bridges.map(([a, b]) => [a, b, true] as const)];
  const linePos = new Float32Array(pairs.length * 6);
  const lineAttr = new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage);
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', lineAttr);
  const lineMat = new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  scene.add(lines);
  const MAX_MARKS = 6000;
  const markPos = new Float32Array(MAX_MARKS * 3);
  const markAttr = new THREE.BufferAttribute(markPos, 3).setUsage(THREE.DynamicDrawUsage);
  const markGeo = new THREE.BufferGeometry().setAttribute('position', markAttr);
  const markMat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false });
  const marks = new THREE.Points(markGeo, markMat);
  marks.frustumCulled = false;
  marks.renderOrder = 2;
  scene.add(marks);

  const setStyle = (s: SkyStyle): void => {
    mat.blending = s.ink ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.needsUpdate = true;
    const web = threeColour(s.path, false);
    lineMat.color.copy(web);
    markMat.color.copy(web);
    // On paper the discs are dark ink.
    if (s.ink) drawn.forEach((_, k) => discs.setColorAt(k, threeColour(s.milkyWayBright, false)));
    else drawn.forEach((i, k) => discs.setColorAt(k, TINT[galaxyKind(gs[i]!.type)].clone().multiplyScalar(brightness(gs[i]!))));
    if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
  };
  setStyle(style);

  let places: Vec3[] = gs.map((g) => g.pos);
  let mwNow: Vec3 = milkyWayNow;
  let stepLy = 1e6;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const v = new THREE.Vector3();
  const at = (k: number): Vec3 => (k < 0 ? mwNow : places[k]!);

  return {
    setStyle,
    web,
    /** Place everything for this camera; `fade` how much of the outside view shows; `pxAngle` radians per pixel. */
    update(cam: Vec3, camQuat: THREE.Quaternion, milkyWay: Vec3, fade: number, pxAngle: number, o: NearbyOptions): void {
      const on = fade > 0.002;
      discs.visible = on;
      lines.visible = marks.visible = on && o.web;
      if (!on) return;
      mwNow = milkyWay;
      places = placesAt(gs, web, milkyWay, o.years, o.cosmology);
      mat.opacity = fade;
      lineMat.opacity = 0.45 * fade;
      markMat.opacity = 0.8 * fade;
      // Each disc faces you, true size, never under a few pixels so it can be found; shrunk toward you.
      q.copy(camQuat);
      drawn.forEach((i, k) => {
        const p = places[i]!;
        const rel: Vec3 = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
        const dist = Math.hypot(...rel);
        const shrink = 1e6 / Math.max(1, dist);
        const size = Math.max(D[i]!, 9 * pxAngle * dist) * shrink;
        m.compose(v.set(rel[0] * shrink, rel[1] * shrink, rel[2] * shrink), q, sc.set(size, size, size));
        discs.setMatrixAt(k, m);
      });
      discs.instanceMatrix.needsUpdate = true;
      if (!o.web) return;
      // One shrink for every line (so they stay straight): the nearest point of the web at 10^7 km.
      let near = Infinity;
      for (const [a, b] of pairs) {
        near = Math.min(near, Math.hypot(at(a)[0] - cam[0], at(a)[1] - cam[1], at(a)[2] - cam[2]), Math.hypot(at(b)[0] - cam[0], at(b)[1] - cam[1], at(b)[2] - cam[2]));
      }
      const s = 1e7 / Math.max(1, near);
      const put = (buf: Float32Array, j: number, p: Vec3): void => {
        buf[j] = (p[0] - cam[0]) * s;
        buf[j + 1] = (p[1] - cam[1]) * s;
        buf[j + 2] = (p[2] - cam[2]) * s;
      };
      pairs.forEach(([a, b], j) => {
        put(linePos, j * 6, at(a));
        put(linePos, j * 6 + 3, at(b));
      });
      lineAttr.needsUpdate = true;
      // Marks about 40 px apart where the web is nearest, every round number of light years.
      stepLy = markStepLy((40 * pxAngle * near) / KM_PER_LIGHT_YEAR);
      let n = 0;
      for (const [a, b] of pairs) {
        for (const p of marksAlong(at(a), at(b), stepLy, 80)) {
          if (n >= MAX_MARKS) break;
          put(markPos, n * 3, p);
          n++;
        }
      }
      markGeo.setDrawRange(0, n);
      markAttr.needsUpdate = true;
    },
    /** Names worth showing now (the largest on screen), the bridges' lengths, and the ruler's step. */
    labels(cam: Vec3, pxAngle: number, o: NearbyOptions): NearbyLabel[] {
      const px = (k: number): number => D[k]! / Math.max(1, Math.hypot(places[k]![0] - cam[0], places[k]![1] - cam[1], places[k]![2] - cam[2])) / pxAngle;
      const named = drawn
        .map((i) => ({ i, px: px(i) }))
        .filter((x) => x.px >= 4 || (gs[x.i]!.absB ?? 0) < -19.5)
        .sort((a, b) => b.px - a.px)
        .slice(0, 28)
        .map(({ i }) => ({ pos: places[i]!, text: displayName(gs[i]!.name), action: `goto:c${i}` }));
      if (!o.web) return named;
      const bridgeLabels = web.bridges
        .map(([a, b]) => {
          const p = at(a), qq = at(b);
          const mid: Vec3 = [(p[0] + qq[0]) / 2, (p[1] + qq[1]) / 2, (p[2] + qq[2]) / 2];
          const len = Math.hypot(qq[0] - p[0], qq[1] - p[1], qq[2] - p[2]);
          const ang = len / Math.max(1, Math.hypot(mid[0] - cam[0], mid[1] - cam[1], mid[2] - cam[2])) / pxAngle;
          return { pos: mid, text: formatLy(len), ang };
        })
        .filter((x) => x.ang > 140)
        .sort((a, b) => b.ang - a.ang)
        .slice(0, 10)
        .map(({ pos, text: t }) => ({ pos, text: t }));
      return [...named, ...bridgeLabels];
    },
    /** The scale note (bottom right) while the nearby galaxies are the view: the web's marks, and the expansion. */
    statement(o: NearbyOptions): string {
      const step = stepLy >= 1e6 ? `${(stepLy / 1e6).toLocaleString('en-US')} million` : stepLy.toLocaleString('en-US');
      const web = o.web ? `Galaxy web · ${step} light years between marks` : 'The nearest galaxies';
      const exp = o.cosmology ? ` · expansion modelled (${o.cosmology === 'matter' ? 'mass-only universe' : 'ΛCDM'})` : '';
      return `${web}${exp} · discs modelled`;
    },
    hoverables(): Hoverable[] {
      return drawn.map((i) => ({ centre: places[i]!, radiusKm: D[i]! / 2, text: `${text[i]} · picture modelled` }));
    },
    /** Where to stand to see galaxy i: on your side of it, far enough to see all of it. */
    vantage(i: number, cam: Vec3, up: Vec3): { pos: Vec3; target: Vec3; up: Vec3 } | null {
      const p = places[i];
      if (!p) return null;
      const d = [cam[0] - p[0], cam[1] - p[1], cam[2] - p[2]];
      const l = Math.hypot(...d) || 1;
      const dist = 2.5 * D[i]!;
      return { pos: [p[0] + (d[0]! / l) * dist, p[1] + (d[1]! / l) * dist, p[2] + (d[2]! / l) * dist], target: p, up };
    },
    clearanceKm(pos: Vec3): number {
      let c = Infinity;
      places.forEach((p, i) => (c = Math.min(c, Math.hypot(pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]) - 0.1 * D[i]!)));
      return Math.max(1, c);
    },
    dispose(): void {
      scene.remove(discs, lines, marks);
      discs.geometry.dispose();
      mat.dispose();
      tex.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      markGeo.dispose();
      markMat.dispose();
    },
  };
}

export type Nearby = ReturnType<typeof createNearby>;
