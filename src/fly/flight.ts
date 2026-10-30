/**
 * Flight state and manoeuvres. The camera rides with an anchor body, either in
 * the body's inertial frame or turning with it (e.g. geostationary), so speeding
 * up time never leaves you behind.
 */
import * as THREE from 'three';
import { bodyInfo, type BodyId, type BodyState, GEO_RADIUS_KM } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import { CALENDAR_AXES } from '../core/paths3d';
import { J2000 } from '../core/ticks';
import type { Time } from '../core/time';
import { galaxyVantage } from './galaxy';

export type Frame = 'inertial' | 'body';

export interface Pose {
  readonly anchor: BodyId;
  readonly frame: Frame;
  /** Offset from the anchor's centre, km (in the anchor's axes when frame = 'body'). */
  readonly rel: Vec3;
  /** Orientation (in the anchor's axes when frame = 'body'). */
  readonly quat: THREE.Quaternion;
}

const v = (a: Vec3): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (a: THREE.Vector3): Vec3 => [a.x, a.y, a.z];

export function find(bodies: readonly BodyState[], id: BodyId): BodyState {
  const b = bodies.find((x) => x.info.id === id);
  if (!b) throw new Error(`No body ${id}`);
  return b;
}

/** Rotation from a body's axes to the ecliptic frame. */
export function bodyQuat(b: BodyState): THREE.Quaternion {
  const [x, y, z] = b.axes;
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(x), v(y), v(z)));
}

/** World (heliocentric ecliptic) position and orientation of a pose at this moment. */
export function worldOf(p: Pose, bodies: readonly BodyState[]): { pos: Vec3; quat: THREE.Quaternion } {
  const a = find(bodies, p.anchor);
  if (p.frame === 'inertial') {
    return { pos: [a.pos[0] + p.rel[0], a.pos[1] + p.rel[1], a.pos[2] + p.rel[2]], quat: p.quat.clone() };
  }
  const q = bodyQuat(a);
  const off = v(p.rel).applyQuaternion(q);
  return { pos: [a.pos[0] + off.x, a.pos[1] + off.y, a.pos[2] + off.z], quat: q.clone().multiply(p.quat) };
}

/** Express a world position and orientation as a pose anchored on a body. */
export function poseFrom(pos: Vec3, quat: THREE.Quaternion, anchor: BodyId, frame: Frame, bodies: readonly BodyState[]): Pose {
  const a = find(bodies, anchor);
  const off = new THREE.Vector3(pos[0] - a.pos[0], pos[1] - a.pos[1], pos[2] - a.pos[2]);
  if (frame === 'inertial') return { anchor, frame, rel: arr(off), quat: quat.clone() };
  const qi = bodyQuat(a).invert();
  return { anchor, frame, rel: arr(off.applyQuaternion(qi)), quat: qi.multiply(quat.clone()) };
}

/** The nearest surface: which body, and how far above it, km. */
export function nearest(pos: Vec3, bodies: readonly BodyState[]): { id: BodyId; altitude: number } {
  let best: { id: BodyId; altitude: number } = { id: 'sun', altitude: Infinity };
  for (const b of bodies) {
    const alt = Math.hypot(pos[0] - b.pos[0], pos[1] - b.pos[1], pos[2] - b.pos[2]) - b.info.radiusKm;
    if (alt < best.altitude) best = { id: b.info.id, altitude: alt };
  }
  return best;
}

/** Cruise speed, km/s: half your altitude per second, so approach always feels the same. */
export function cruiseSpeed(altitudeKm: number): number {
  return Math.max(0.05, 0.5 * altitudeKm);
}

/** Keep the camera outside every body (a few km above the surface). */
export function pushOut(pos: Vec3, bodies: readonly BodyState[]): Vec3 {
  let p = pos;
  for (const b of bodies) {
    const d: Vec3 = [p[0] - b.pos[0], p[1] - b.pos[1], p[2] - b.pos[2]];
    const r = Math.hypot(...d);
    const min = b.info.radiusKm * 1.0005 + 2;
    if (r < min && r > 0) p = [b.pos[0] + (d[0] / r) * min, b.pos[1] + (d[1] / r) * min, b.pos[2] + (d[2] / r) * min];
  }
  return p;
}

/** Orientation looking from `from` toward `to`, with `up` kept as up. */
export function lookAt(from: Vec3, to: Vec3, up: Vec3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(v(from), v(to), v(up));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Rotate unit vector a toward b by `angle` radians in their common plane. */
function rotateToward(a: Vec3, b: Vec3, angle: number): Vec3 {
  const n = unit(cross(a, b));
  const c = Math.cos(angle), s = Math.sin(angle);
  return addv(scale(a, c), scale(cross(n, a), s));
}

export type Destination = 'galaxy' | 'overview' | 'geo' | 'leo' | 'moon' | 'earthMoon' | 'mars' | 'jupiter' | 'saturn' | 'sun';

export const DESTINATIONS: ReadonlyArray<{ id: Destination; label: string }> = [
  { id: 'overview', label: 'Solar system' },
  { id: 'geo', label: 'Geostationary orbit' },
  { id: 'leo', label: 'Low Earth orbit' },
  { id: 'earthMoon', label: 'Earth & Moon' },
  { id: 'moon', label: 'Moon' },
  { id: 'mars', label: 'Mars' },
  { id: 'jupiter', label: 'Jupiter' },
  { id: 'saturn', label: 'Saturn' },
  { id: 'sun', label: 'Sun' },
  { id: 'galaxy', label: 'Whole galaxy' },
];

/**
 * The default view of a sphere: standing in front of it with its north up, and
 * the Sun in view. The body sits left of centre and the Sun to the right, as far
 * apart as the window allows, so the body is as fully lit as it can be with the
 * Sun still on screen.
 *
 * `centre`/`radius` describe what must fit (a body, or Earth and the Moon together);
 * `dist` is the camera's distance from `centre`. The camera stays in the plane of
 * the body's equator (unless raised by `elevation`), so at 42,164 km from Earth
 * it is truly geostationary.
 */
export function frontView(
  centre: Vec3,
  radius: number,
  north: Vec3,
  dist: number,
  sun: Vec3,
  aspect: number,
  /** Raise the camera this far above the equator, radians (to see rings). */
  elevation = 0,
): { pos: Vec3; quat: THREE.Quaternion } {
  const DEG = Math.PI / 180;
  const h = Math.atan(Math.tan(30 * DEG) * Math.max(0.6, aspect)); // half the horizontal field of view
  const rho = Math.asin(Math.min(1, radius / dist)); // the body's angular radius
  const centreAt = Math.max(0.55 * h, rho + 4 * DEG); // body centre, left of the view's centre
  const sunAt = 0.8 * h; // the Sun, right of centre
  const phi = Math.min(Math.PI - 0.05, centreAt + sunAt); // angle between body and Sun, from the camera

  const n = unit(north);
  const s = unit(sub(sun, centre));
  const sn = s[0] * n[0] + s[1] * n[1] + s[2] * n[2];
  let e1 = sub(s, scale(n, sn));
  if (Math.hypot(...e1) < 1e-6) e1 = Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]);
  e1 = unit(e1);
  const e2 = cross(n, e1);
  // Direction from the camera to the body, in the equatorial plane, at angle phi from the Sun.
  const cosd = Math.sqrt(Math.max(1e-9, 1 - sn * sn));
  const phiEq = Math.acos(Math.max(-1, Math.min(1, Math.cos(phi) / cosd)));
  for (const side of [1, -1]) {
    const flat = addv(scale(e1, Math.cos(phiEq)), scale(e2, side * Math.sin(phiEq)));
    const toBody = unit(addv(scale(flat, Math.cos(elevation)), scale(n, Math.sin(elevation))));
    const pos = sub(centre, scale(toBody, dist));
    const toSun = unit(sub(sun, pos));
    const look = rotateToward(toBody, toSun, centreAt);
    const quat = lookAt(pos, addv(pos, look), n);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    if (side === -1 || right.x * toSun[0] + right.y * toSun[1] + right.z * toSun[2] > 0) return { pos, quat };
  }
  throw new Error('unreachable');
}

/** A vantage point for each destination, as a world position and orientation. */
export function vantage(
  dest: Destination,
  bodies: readonly BodyState[],
  aspect = 1.6,
  now: Time = J2000,
): { pose: Pose; pos: Vec3; quat: THREE.Quaternion } {
  const sun = find(bodies, 'sun').pos;
  const view = (anchor: BodyId, frame: Frame, v: { pos: Vec3; quat: THREE.Quaternion }) => ({
    pose: poseFrom(v.pos, v.quat, anchor, frame, bodies),
    ...v,
  });
  const front = (id: BodyId, dist: number, frame: Frame = 'inertial', radius?: number, elevation = 0) => {
    const b = find(bodies, id);
    return view(id, frame, frontView(b.pos, radius ?? b.info.radiusKm, b.axes[2], dist, sun, aspect, elevation));
  };

  switch (dest) {
    case 'galaxy': {
      // 40 kpc above the north galactic pole, the whole disc in view, the Sun toward the bottom.
      const g = galaxyVantage(now);
      return view('sun', 'inertial', { pos: g.pos, quat: lookAt(g.pos, g.target, g.up) });
    }
    case 'overview': {
      // The calendar's view: the Sun in the centre, the future to the right,
      // seen from 3.2 AU off the Sun's line of travel, ecliptic north up.
      const pos = addv(sun, scale(CALENDAR_AXES[2], 3.2 * 149_597_870.7));
      return view('sun', 'inertial', { pos, quat: lookAt(pos, sun, CALENDAR_AXES[1]) });
    }
    case 'geo':
      // In Earth's equatorial plane, 42,164 km out, turning with Earth.
      return front('earth', GEO_RADIUS_KM, 'body');
    case 'leo':
      // 420 km up, over the equator, the horizon and the Sun in view.
      return front('earth', bodyInfo('earth').radiusKm + 420);
    case 'earthMoon': {
      // Earth and the Moon together, from three times their separation.
      const earth = find(bodies, 'earth'), moon = find(bodies, 'moon');
      const mid = scale(addv(earth.pos, moon.pos), 0.5);
      const half = Math.hypot(...sub(moon.pos, earth.pos)) / 2;
      return view('earth', 'inertial', frontView(mid, half + earth.info.radiusKm, earth.axes[2], 3.2 * half, sun, aspect));
    }
    case 'moon':
      return front('moon', bodyInfo('moon').radiusKm * 4.2);
    case 'sun': {
      // Facing the Sun from Earth's side, its north pole up.
      const b = find(bodies, 'sun');
      const earth = find(bodies, 'earth');
      const pos = addv(b.pos, scale(unit(sub(earth.pos, b.pos)), b.info.radiusKm * 6));
      return view('sun', 'inertial', { pos, quat: lookAt(pos, b.pos, b.axes[2]) });
    }
    case 'saturn': {
      const R = bodyInfo('saturn').radiusKm;
      // Raised 18° above the ring plane, so the rings show.
      return front('saturn', R * 7, 'inertial', bodyInfo('saturn').rings?.[1] ?? R, (18 * Math.PI) / 180);
    }
    default:
      return front(dest, bodyInfo(dest).radiusKm * 4);
  }
}
