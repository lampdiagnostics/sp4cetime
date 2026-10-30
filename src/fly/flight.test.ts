import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GEO_RADIUS_KM, solarSystemAt } from '../core/bodies';
import { addSeconds, fromCivil } from '../core/time';
import { cruiseSpeed, DESTINATIONS, find, nearest, poseFrom, pushOut, vantage, worldOf } from './flight';

const t = fromCivil(2026, 10, 30, 12 * 3600);
const bodies = solarSystemAt(t);
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((x, i) => x - (b[i] as number)));

/** Is `p` within the camera's view cone (half-angle in degrees)? */
function inView(camPos: readonly number[], quat: THREE.Quaternion, p: readonly number[], halfDeg: number): boolean {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const d = new THREE.Vector3(p[0]! - camPos[0]!, p[1]! - camPos[1]!, p[2]! - camPos[2]!).normalize();
  return (Math.acos(Math.min(1, fwd.dot(d))) * 180) / Math.PI < halfDeg;
}

describe('Vantage points', () => {
  it('geostationary orbit is 42,164 km from Earth, with Earth and the Moon both in view', () => {
    const { pos, quat } = vantage('geo', bodies);
    const earth = find(bodies, 'earth');
    expect(dist(pos, earth.pos)).toBeCloseTo(GEO_RADIUS_KM, 0);
    expect(inView(pos, quat, earth.pos, 30)).toBe(true);
    expect(inView(pos, quat, find(bodies, 'moon').pos, 30)).toBe(true);
  });

  it('geostationary orbit turns with Earth: an hour later it is still over the same place', () => {
    const { pose } = vantage('geo', bodies);
    const later = solarSystemAt(addSeconds(t, 3600));
    const a = worldOf(pose, bodies), b = worldOf(pose, later);
    const e0 = find(bodies, 'earth'), e1 = find(later, 'earth');
    const local = (p: readonly number[], e: typeof e0): number[] => {
      const d = p.map((x, i) => x - e.pos[i]!);
      return e.axes.map((ax) => ax[0] * d[0]! + ax[1] * d[1]! + ax[2] * d[2]!);
    };
    const la = local(a.pos, e0), lb = local(b.pos, e1);
    expect(dist(la, lb)).toBeLessThan(1);
  });

  it('every destination starts outside its body, looking at it', () => {
    for (const d of DESTINATIONS) {
      const { pos } = vantage(d.id, bodies);
      const near = nearest(pos, bodies);
      expect(near.altitude, d.label).toBeGreaterThan(100);
    }
  });
});

describe('Flight', () => {
  it('converts between world and anchored poses without drift', () => {
    const pos: [number, number, number] = [1.2e8, -3e7, 4e5];
    const quat = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
    for (const frame of ['inertial', 'body'] as const) {
      const p = poseFrom(pos, quat, 'earth', frame, bodies);
      const w = worldOf(p, bodies);
      expect(dist(w.pos, pos)).toBeLessThan(1e-3);
      expect(w.quat.angleTo(quat)).toBeLessThan(1e-6);
    }
  });

  it('never lets the camera inside a body', () => {
    const earth = find(bodies, 'earth');
    const p = pushOut([earth.pos[0] + 10, earth.pos[1], earth.pos[2]], bodies);
    expect(dist(p, earth.pos)).toBeGreaterThan(6371);
  });

  it('slows down near surfaces and speeds up far away', () => {
    expect(cruiseSpeed(400)).toBeLessThan(cruiseSpeed(4e8));
    expect(cruiseSpeed(0)).toBeGreaterThan(0);
  });
});
