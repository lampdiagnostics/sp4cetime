import fc from 'fast-check';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../core/geometry';
import { GEO_RADIUS_KM, solarSystemAt } from '../core/bodies';
import { addSeconds, fromCivil } from '../core/time';
import { aboveNorth, arrivalView, AU_KM, orbitAround, orbitTarget, fitRadius, OVERVIEW_KM, overviewView, scaleBodies, cruiseSpeed, DESTINATIONS, find, isWarp, nearest, poseFrom, pushOut, vantage, warpPoint, WARP_HINT_KM, WARP_OUT_KM, ARRIVAL_KM, worldOf } from './flight';

const t = fromCivil(2026, 10, 30, 12 * 3600);
const bodies = solarSystemAt(t);
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((x, i) => x - (b[i] as number)));

describe('Vantage points', () => {
  /** Is `p` on screen (60° tall, aspect 1.6)? */
  const onScreen = (camPos: readonly number[], quat: THREE.Quaternion, p: readonly number[]): boolean => {
    const d = new THREE.Vector3(p[0]! - camPos[0]!, p[1]! - camPos[1]!, p[2]! - camPos[2]!).applyQuaternion(quat.clone().invert());
    if (d.z >= 0) return false;
    const t = Math.tan((30 * Math.PI) / 180);
    return Math.abs(d.y / -d.z) < t && Math.abs(d.x / -d.z) < t * 1.6;
  };

  it('geostationary orbit is 42,164 km from Earth, in its equatorial plane, with Earth and the Sun in view', () => {
    const { pos, quat } = vantage('geo', bodies);
    const earth = find(bodies, 'earth');
    expect(dist(pos, earth.pos)).toBeCloseTo(GEO_RADIUS_KM, 0);
    const rel = pos.map((x, i) => x - earth.pos[i]!);
    expect(Math.abs(rel[0]! * earth.axes[2][0] + rel[1]! * earth.axes[2][1] + rel[2]! * earth.axes[2][2])).toBeLessThan(1);
    expect(onScreen(pos, quat, earth.pos)).toBe(true);
    expect(onScreen(pos, quat, find(bodies, 'sun').pos)).toBe(true);
  });

  it('every view has the Sun on screen, the body in front, and the body\'s north up', () => {
    for (const d of DESTINATIONS) {
      const { pos, quat } = vantage(d.id, bodies, 1.6, t);
      expect(onScreen(pos, quat, find(bodies, 'sun').pos), d.label).toBe(true);
      if (d.id === 'overview' || d.id === 'sun' || d.id === 'leo' || d.id === 'galaxy') continue;
      const b = find(bodies, d.id === 'geo' || d.id === 'earthMoon' ? 'earth' : d.id);
      expect(onScreen(pos, quat, b.pos), d.label).toBe(true);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const n = b.axes[2];
      expect(up.x * n[0] + up.y * n[1] + up.z * n[2], d.label).toBeGreaterThan(0.5);
    }
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

describe('Warps between the solar system and the galaxy', () => {
  const sun: Vec3 = [10, -20, 5];
  const from: Vec3 = [sun[0] + 3 * AU_KM, sun[1], sun[2]];
  const to: Vec3 = [sun[0], sun[1] + 1e18, sun[2] + 4e17];

  it('starts and ends exactly where asked', () => {
    expect(warpPoint(sun, from, to, 0)).toEqual(from);
    expect(warpPoint(sun, from, to, 1)).toEqual(to);
  });

  it('changes distance by equal factors in equal steps, so speed grows exponentially', () => {
    const r = (e: number): number => {
      const p = warpPoint(sun, from, to, e);
      return Math.hypot(p[0] - sun[0], p[1] - sun[1], p[2] - sun[2]);
    };
    const r0 = r(0.2), r1 = r(0.4), r2 = r(0.6);
    expect(r1 / r0).toBeCloseTo(r2 / r1, 6);
    fc.assert(fc.property(fc.double({ min: 0, max: 0.99, noNaN: true }), (e) => {
        expect(r(e + 0.01)).toBeGreaterThan(r(e));
      }),
    );
  });

  it('warps only across big changes of scale', () => {
    expect(isWarp(AU_KM, 30 * AU_KM)).toBe(false);
    expect(isWarp(3 * AU_KM, 1e18)).toBe(true);
    expect(isWarp(1e18, 3 * AU_KM)).toBe(true);
  });

  it('arrives in front of the Sun, looking at it', () => {
    const a = arrivalView(sun, [0.6, 0.8, 0]);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(a.quat);
    const toSun = new THREE.Vector3(sun[0] - a.pos[0], sun[1] - a.pos[1], sun[2] - a.pos[2]).normalize();
    expect(fwd.dot(toSun)).toBeCloseTo(1, 9);
    expect(Math.hypot(a.pos[0] - sun[0], a.pos[1] - sun[1], a.pos[2] - sun[2])).toBeCloseTo(ARRIVAL_KM, 3);
    expect(WARP_OUT_KM).toBeGreaterThan(WARP_HINT_KM);
  });
});

describe('Clicking a body: standing just above its north pole, facing the Sun', () => {
  const ang = (a: THREE.Vector3, b: THREE.Vector3): number => (a.angleTo(b) * 180) / Math.PI;
  for (const id of ['earth', 'mars', 'jupiter', 'saturn', 'moon', 'sun'] as const) {
    it(`${id}: upright over the pole, the body at your feet, the Sun (or, over the Sun, Earth) ahead`, () => {
      const v = aboveNorth(id, bodies);
      const b = find(bodies, id);
      const n = new THREE.Vector3(...b.axes[2]);
      const off = new THREE.Vector3(v.pos[0] - b.pos[0], v.pos[1] - b.pos[1], v.pos[2] - b.pos[2]);
      // Over the north pole, just above the surface.
      expect(off.clone().normalize().dot(n)).toBeCloseTo(1, 9);
      expect(off.length() / b.info.radiusKm).toBeCloseTo(1.4, 9);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(v.quat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
      // Upright: the body's north is up on screen (never upside down or rolled).
      expect(up.dot(n)).toBeGreaterThan(0.3);
      expect(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(v.quat).dot(n))).toBeLessThan(1e-9);
      // The body is in view, below the centre: its top edge is inside the 60° view.
      const toBody = off.clone().negate();
      const rho = (Math.asin(1 / 1.4) * 180) / Math.PI;
      expect(ang(fwd, toBody) - rho).toBeLessThan(30);
      expect(toBody.dot(up)).toBeLessThan(0);
      // Facing the Sun (or Earth, over the Sun): it is ahead, above the centre, and in view.
      const t = find(bodies, id === 'sun' ? 'earth' : 'sun').pos;
      const toT = new THREE.Vector3(t[0] - v.pos[0], t[1] - v.pos[1], t[2] - v.pos[2]);
      expect(ang(fwd, toT)).toBeLessThan(30);
      expect(toT.dot(up)).toBeGreaterThan(0);
    });
  }
});

describe('Scale modes in 3D', () => {
  it('√ fit keeps Earth at 1 AU, pulls Neptune in, and leaves sizes and the Moon beside Earth', () => {
    expect(fitRadius(AU_KM)).toBeCloseTo(AU_KM, 3);
    expect(fitRadius(30 * AU_KM) / AU_KM).toBeCloseTo(Math.sqrt(30), 9);
    const s = scaleBodies(bodies, 'fit');
    const sun = find(s, 'sun').pos, nep = find(s, 'neptune').pos;
    expect(dist(nep, sun) / AU_KM).toBeLessThan(6);
    const e0 = find(bodies, 'earth'), m0 = find(bodies, 'moon'), e1 = find(s, 'earth'), m1 = find(s, 'moon');
    expect(dist(m1.pos, e1.pos)).toBeCloseTo(dist(m0.pos, e0.pos), 3);
    expect(find(s, 'jupiter').info.radiusKm).toBe(find(bodies, 'jupiter').info.radiusKm);
  });
  it('linear and true are real distances', () => {
    expect(scaleBodies(bodies, 'true')).toBe(bodies);
    expect(scaleBodies(bodies, 'linear')).toBe(bodies);
  });
  it('the overview is the calendar’s view from 3.2 AU', () => {
    const sun = find(bodies, 'sun').pos;
    const v = overviewView(sun);
    expect(dist(v.pos, sun) / OVERVIEW_KM).toBeCloseTo(1, 9);
  });
});

describe('Turning around a body (Option + scroll)', () => {
  it('keeps the distance to the centre and keeps the centre where it was on screen', () => {
    const earth = find(bodies, 'earth');
    const start = aboveNorth('earth', bodies);
    const ahead = (p: readonly number[], q: THREE.Quaternion) =>
      new THREE.Vector3(earth.pos[0] - p[0]!, earth.pos[1] - p[1]!, earth.pos[2] - p[2]!).applyQuaternion(q.clone().invert()).normalize();
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), (yaw, pitch) => {
        const o = orbitAround(start.pos, start.quat, earth.pos, yaw, pitch);
        expect(dist(o.pos, earth.pos) / dist(start.pos, earth.pos)).toBeCloseTo(1, 9);
        const a = ahead(start.pos, start.quat), b = ahead(o.pos, o.quat);
        expect(a.distanceTo(b)).toBeLessThan(1e-6);
      }),
    );
  });
  it('turns around the body nearest the middle of the view', () => {
    const v = vantage('mars', bodies);
    expect(orbitTarget(v.pos, v.quat, bodies).info.id).toBe('mars');
  });
});

