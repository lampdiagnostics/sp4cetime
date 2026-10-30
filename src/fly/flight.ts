/**
 * Flight state and manoeuvres. The camera rides with an anchor body, either in
 * the body's inertial frame or turning with it (e.g. geostationary), so speeding
 * up time never leaves you behind.
 */
import * as THREE from 'three';
import { bodyInfo, type BodyId, type BodyState, GEO_RADIUS_KM } from '../core/bodies';
import type { Vec3 } from '../core/geometry';

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
const ECL_NORTH: Vec3 = [0, 0, 1];

/** Rotate unit vector a toward b by `angle` radians in their common plane. */
function rotateToward(a: Vec3, b: Vec3, angle: number): Vec3 {
  const n = unit(cross(a, b));
  const c = Math.cos(angle), s = Math.sin(angle);
  return addv(scale(a, c), scale(cross(n, a), s));
}

export type Destination = 'geo' | 'leo' | 'moon' | 'earthMoon' | 'mars' | 'jupiter' | 'saturn' | 'sun';

export const DESTINATIONS: ReadonlyArray<{ id: Destination; label: string }> = [
  { id: 'geo', label: 'Geostationary orbit' },
  { id: 'leo', label: 'Low Earth orbit' },
  { id: 'earthMoon', label: 'Earth & Moon' },
  { id: 'moon', label: 'Moon' },
  { id: 'mars', label: 'Mars' },
  { id: 'jupiter', label: 'Jupiter' },
  { id: 'saturn', label: 'Saturn' },
  { id: 'sun', label: 'Sun' },
];

/** A vantage point for each destination, as a world position and orientation. */
export function vantage(dest: Destination, bodies: readonly BodyState[]): { pose: Pose; pos: Vec3; quat: THREE.Quaternion } {
  const earth = find(bodies, 'earth');
  const moon = find(bodies, 'moon');
  const toSun = (b: BodyState): Vec3 => unit(scale(b.pos, -1));
  let anchor: BodyId;
  let frame: Frame = 'inertial';
  let pos: Vec3;
  let target: Vec3;
  let up: Vec3 = ECL_NORTH;

  switch (dest) {
    case 'geo': {
      // In Earth's equatorial plane, 42,164 km out, placed so the Moon is in view
      // beside Earth. Held geostationary: it turns with Earth.
      anchor = 'earth';
      frame = 'body';
      const north = earth.axes[2];
      const m = unit(sub(moon.pos, earth.pos));
      const mEq = unit(sub(m, scale(north, m[0] * north[0] + m[1] * north[1] + m[2] * north[2])));
      const away = rotateToward(scale(mEq, -1), cross(north, mEq), (30 * Math.PI) / 180);
      pos = addv(earth.pos, scale(away, GEO_RADIUS_KM));
      const dE = unit(sub(earth.pos, pos)), dM = unit(sub(moon.pos, pos));
      target = addv(pos, unit(addv(dE, scale(dM, 0.75))));
      up = north;
      break;
    }
    case 'leo': {
      // 420 km up on the day side, looking along the horizon.
      anchor = 'earth';
      const R = bodyInfo('earth').radiusKm;
      const radial = rotateToward(toSun(earth), earth.axes[2], (25 * Math.PI) / 180);
      pos = addv(earth.pos, scale(radial, R + 420));
      const tangent = unit(cross(earth.axes[2], radial));
      target = addv(pos, unit(addv(tangent, scale(radial, -0.45))));
      up = radial;
      break;
    }
    case 'earthMoon': {
      // Off to the side of the Earth–Moon line, a little above it.
      anchor = 'earth';
      const em = sub(moon.pos, earth.pos);
      const side = unit(cross(em, ECL_NORTH));
      const mid = addv(earth.pos, scale(em, 0.5));
      pos = addv(addv(mid, scale(side, 520_000)), scale(ECL_NORTH, 180_000));
      target = mid;
      break;
    }
    case 'moon': {
      // Just beyond the Moon, looking back past it toward Earth (an Earthrise).
      anchor = 'moon';
      const R = bodyInfo('moon').radiusKm;
      const out = rotateToward(unit(sub(moon.pos, earth.pos)), ECL_NORTH, (14 * Math.PI) / 180);
      pos = addv(moon.pos, scale(out, R * 4.2));
      const dMoon = unit(sub(moon.pos, pos)), dEarth = unit(sub(earth.pos, pos));
      target = addv(pos, unit(addv(dMoon, scale(dEarth, 0.6))));
      break;
    }
    default: {
      // Planets and the Sun: a few radii out, partly lit, a little above the ecliptic.
      anchor = dest as BodyId;
      const b = find(bodies, anchor);
      const R = b.info.radiusKm;
      const distR = dest === 'saturn' ? 6.5 : dest === 'sun' ? 6 : 4;
      const dir = dest === 'sun' ? unit(sub(earth.pos, b.pos)) : rotateToward(toSun(b), ECL_NORTH, (22 * Math.PI) / 180);
      const sideways = dest === 'sun' ? dir : rotateToward(dir, unit(cross(dir, ECL_NORTH)), (40 * Math.PI) / 180);
      pos = addv(b.pos, scale(sideways, R * distR));
      target = b.pos;
      break;
    }
  }
  const quat = lookAt(pos, target, up);
  return { pose: poseFrom(pos, quat, anchor, frame, bodies), pos, quat };
}
