/**
 * The chart wheel in 3D (✶ Starsigns, step 4): a flat ring around Earth in the plane of
 * the ecliptic, like the wheel on the printed sheet. The zodiac's twelve signs (counted
 * from the equinox of the date), the twelve houses of the chosen place and moment, the
 * horizon (ASC–DSC) and meridian (MC–IC), and every body ticked at its longitude as seen
 * from Earth's centre, so the wheel shows the sky as it is from the ground, without the
 * skew of being up here. Shown while a chart is on and you are far enough out to see it.
 *
 * Built in the world (J2000 ecliptic) frame, at unit radius, placed relative to the camera
 * each frame (floating origin, CLAUDE.md rule 10). Labels are DOM elements like the others.
 */

import * as THREE from 'three';
import type { BodyId } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import { SIGNS } from '../core/skyfigures';

export interface WheelInput {
  /** Earth's centre relative to the camera, km. */
  readonly centre: Vec3;
  /** The wheel's outer radius, km. */
  readonly radiusKm: number;
  /** Degrees the signs have slid from J2000 (houses.ts skyOfDate.lonShift). */
  readonly shift: number;
  /** The 12 house cusps, longitudes of date, degrees, house 1 first. */
  readonly cusps: readonly number[];
  readonly asc: number;
  readonly mc: number;
  /** Every body: longitude of date and a short label. */
  readonly bodies: ReadonlyArray<{ readonly id: BodyId; readonly lon: number; readonly text: string; readonly colour?: string }>;
  readonly highlight: BodyId | null;
  /** Line colours: the zodiac's, and the houses' (an accent). */
  readonly zodiac: string;
  readonly accent: string;
}

const R_OUT = 1, R_SIGN = 0.84, R_HOUSE = 0.42;

export interface Wheel {
  /** Show (with this chart) or hide, then place the labels for this camera. */
  update(w: WheelInput | null, cam: THREE.PerspectiveCamera, inv: THREE.Quaternion, width: number, height: number): void;
  dispose(): void;
}

export function createWheel(scene: THREE.Scene, host: HTMLElement): Wheel {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 5;
  scene.add(group);
  const zodiacMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
  const houseMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const bodyMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  let lines: THREE.LineSegments[] = [];
  let key = '';

  const labels: HTMLDivElement[] = [];
  const label = (i: number): HTMLDivElement => {
    let el = labels[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'fly-wheel-label';
      host.appendChild(el);
      labels[i] = el;
    }
    return el;
  };

  const at = (lonJ2000: number, r: number): Vec3 => {
    const a = (lonJ2000 * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a), 0];
  };
  const build = (w: WheelInput): void => {
    for (const l of lines) {
      group.remove(l);
      l.geometry.dispose();
    }
    lines = [];
    const add = (pts: number[], mat: THREE.LineBasicMaterial): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(g, mat);
      l.renderOrder = 5;
      l.frustumCulled = false;
      group.add(l);
      lines.push(l);
    };
    const z: number[] = [];
    for (const r of [R_OUT, R_SIGN, R_HOUSE]) for (let k = 0; k < 180; k++) z.push(...at(k * 2, r), ...at(k * 2 + 2, r));
    for (let k = 0; k < 12; k++) z.push(...at(k * 30 - w.shift, R_SIGN), ...at(k * 30 - w.shift, R_OUT));
    add(z, zodiacMat);
    const h: number[] = [];
    for (const c of w.cusps) h.push(...at(c - w.shift, R_HOUSE), ...at(c - w.shift, R_SIGN));
    // The horizon and the meridian, dashed, across the whole wheel.
    for (const a of [w.asc, w.mc]) {
      for (let s = -1.06; s < 1.06; s += 0.06) {
        const p = at(a - w.shift, s), q = at(a - w.shift, s + 0.035);
        h.push(...p, ...q);
      }
    }
    add(h, houseMat);
    const b: number[] = [];
    for (const x of w.bodies) b.push(...at(x.lon - w.shift, R_SIGN), ...at(x.lon - w.shift, R_SIGN - 0.07));
    add(b, bodyMat);
  };

  const v = new THREE.Vector3();
  return {
    update(w, cam, inv, W, H) {
      if (!w) {
        group.visible = false;
        for (const el of labels) el.style.display = 'none';
        return;
      }
      const k = `${w.shift.toFixed(3)}|${w.cusps.map((c) => c.toFixed(2)).join(',')}|${w.asc.toFixed(2)}|${w.mc.toFixed(2)}|${w.bodies.map((b) => b.lon.toFixed(2)).join(',')}`;
      if (k !== key) {
        key = k;
        build(w);
      }
      zodiacMat.color.set(w.zodiac);
      houseMat.color.set(w.accent);
      group.visible = true;
      group.position.set(w.centre[0], w.centre[1], w.centre[2]);
      group.scale.setScalar(w.radiusKm);

      // Labels: signs in the ring, house numbers inside, ASC and MC outside, bodies spread where they crowd.
      const items: Array<{ p: Vec3; text: string; kind: string; hl?: boolean; colour?: string; size?: number }> = [];
      // Each body as a disc on the ring at its true longitude, big enough to see (the real ones
      // are too small, or at the edge of the view): the Sun largest, then the Moon.
      for (const b of w.bodies) {
        const size = b.id === 'sun' ? 18 : b.id === 'moon' ? 14 : 10;
        items.push({ p: at(b.lon - w.shift, R_SIGN - 0.05), text: '', kind: 'dot', hl: b.id === w.highlight, size, ...(b.colour ? { colour: b.colour } : {}) });
      }
      for (let s = 0; s < 12; s++) items.push({ p: at(s * 30 + 15 - w.shift, (R_OUT + R_SIGN) / 2), text: `${SIGNS[s]![0]} ${SIGNS[s]![1]}`, kind: 'sign' });
      w.cusps.forEach((c, i) => items.push({ p: at(c + 15 - w.shift, R_HOUSE - 0.07), text: String(i + 1), kind: 'house' }));
      items.push({ p: at(w.asc - w.shift, 1.12), text: 'ASC', kind: 'angle' }, { p: at(w.mc - w.shift, 1.12), text: 'MC', kind: 'angle' });
      const sorted = [...w.bodies].sort((a, b) => a.lon - b.lon);
      // Names on an outer ring; one too close to the last there drops to an inner ring, and only if
      // both are taken does it slide along.
      const near = (x: number, y: number): boolean => Math.abs(((x - y + 540) % 360) - 180) < 9;
      const last = [-1e9, -1e9];
      for (const b of sorted) {
        let lon = b.lon;
        let ring = 0;
        if (near(lon, last[0]!)) {
          if (!near(lon, last[1]!)) ring = 1;
          else lon = last[0]! + 9;
        }
        last[ring] = lon;
        const hl = b.id === w.highlight;
        items.push({ p: at(lon - w.shift, R_SIGN - (ring ? 0.27 : 0.15)), text: b.text, kind: 'body', hl });
      }
      items.forEach((it, i) => {
        const el = label(i);
        v.set(w.centre[0] + it.p[0] * w.radiusKm, w.centre[1] + it.p[1] * w.radiusKm, w.centre[2] + it.p[2] * w.radiusKm);
        const behind = v.clone().applyQuaternion(inv).z > 0;
        v.project(cam);
        if (behind || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'block';
        el.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -50%)`;
        if (el.textContent !== it.text) el.textContent = it.text;
        if (el.dataset.kind !== it.kind) el.dataset.kind = it.kind;
        el.classList.toggle('hl', !!it.hl);
        if (it.kind === 'dot') {
          const px = `${it.size ?? 10}px`;
          if (el.style.width !== px) el.style.width = el.style.height = px;
          const c = it.colour ?? '#ffffff';
          if (el.style.getPropertyValue('--dot') !== c) el.style.setProperty('--dot', c);
        } else if (el.style.width) {
          el.style.width = el.style.height = '';
        }
        // While one body is picked out, the others step back.
        el.classList.toggle('dim', it.kind === 'body' && !!w.highlight && !it.hl);
      });
      for (let i = items.length; i < labels.length; i++) labels[i]!.style.display = 'none';
    },
    dispose() {
      for (const l of lines) l.geometry.dispose();
      zodiacMat.dispose();
      houseMat.dispose();
      bodyMat.dispose();
      scene.remove(group);
      for (const el of labels) el.remove();
    },
  };
}
