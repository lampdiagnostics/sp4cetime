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
  /** The calendar's view axes (right, up, toward the viewer), for the overview. */
  axes: readonly [Vec3, Vec3, Vec3] = CALENDAR_AXES,
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
      // 42 kpc from Sgr A*, 25° above the plane on the Sun's side: the disc, bulge, Fermi bubbles and the Sun's path in view.
      const g = galaxyVantage(now);
      return view('sun', 'inertial', { pos: g.pos, quat: lookAt(g.pos, g.target, g.up) });
    }
    case 'overview': {
      // The calendar's view: the Sun in the centre, the future to the right,
      // seen from 3.2 AU off the Sun's line of travel, turned as the calendar is turned.
      const v = overviewView(sun, axes);
      return view('sun', 'inertial', v);
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

/** 1 AU, km. */
export const AU_KM = 149_597_870.7;
/** Backing away past this distance from the Sun warps you out to the whole galaxy. */
export const WARP_OUT_KM = 1000 * AU_KM;
/** Within this distance of the warp line, the screen says that you are about to leave. */
export const WARP_HINT_KM = 300 * AU_KM;
/** Heading at the Sun from outside the solar system (within this angle) warps you back in. */
export const WARP_IN_ANGLE = (4 * Math.PI) / 180;
/** Zooming in to within this distance of the galaxy's disc (from outside the solar system) warps you back in. */
export const WARP_IN_DISC_KM = 7 * 3.085_677_581_491_367e16;
/** Where a warp back in ends: this far from the Sun, looking at it. */
export const ARRIVAL_KM = 6 * AU_KM;
/** Flights whose start and end distances from the Sun differ more than this fly as a warp. */
export const WARP_RATIO = 1e4;

/**
 * A point on a warp between `from` and `to` (both relative to `centre`, usually the Sun),
 * at progress e (0–1): the direction turns smoothly and the distance changes by equal
 * factors in equal steps, so the speed grows (or falls) exponentially, from a crawl past
 * the planets to many thousand times the speed of light between the stars.
 */
export function warpPoint(centre: Vec3, from: Vec3, to: Vec3, e: number): Vec3 {
  const a = sub(from, centre), b = sub(to, centre);
  const ra = Math.max(1, Math.hypot(...a)), rb = Math.max(1, Math.hypot(...b));
  const r = Math.exp(Math.log(ra) + (Math.log(rb) - Math.log(ra)) * e);
  const ua = scale(a, 1 / ra), ub = scale(b, 1 / rb);
  const cos = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]));
  const ang = Math.acos(cos);
  let dir: Vec3;
  if (ang < 1e-9) dir = ua;
  else if (Math.PI - ang < 1e-6) {
    // Opposite directions: turn through any perpendicular.
    const p = unit(Math.abs(ua[0]) < 0.9 ? cross(ua, [1, 0, 0]) : cross(ua, [0, 1, 0]));
    dir = addv(scale(ua, Math.cos(Math.PI * e)), scale(p, Math.sin(Math.PI * e)));
  } else dir = rotateToward(ua, ub, ang * e);
  if (e >= 1) return to;
  if (e <= 0) return from;
  return addv(centre, scale(dir, r));
}

/** Does a flight between these two places (km from the Sun) cross scales enough to fly as a warp? */
export function isWarp(fromKm: number, toKm: number): boolean {
  const a = Math.max(1, fromKm), b = Math.max(1, toKm);
  return Math.max(a, b) / Math.min(a, b) > WARP_RATIO;
}

/** Arriving back in the solar system along `heading`: in front of the Sun, looking at it, ecliptic north up. */
export function arrivalView(sun: Vec3, heading: Vec3): { pos: Vec3; quat: THREE.Quaternion } {
  const h = unit(heading);
  const pos = sub(sun, scale(h, ARRIVAL_KM));
  const up: Vec3 = Math.abs(h[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0];
  return { pos, quat: lookAt(pos, sun, up) };
}

/** Distance from the Sun at which the calendar's own view is seen in 3D, km. */
export const OVERVIEW_KM = 3.2 * AU_KM;

/** The calendar's view in 3D: looking at the Sun from 3.2 AU toward the viewer, with the calendar's up as up. */
export function overviewView(sun: Vec3, axes: readonly [Vec3, Vec3, Vec3] = CALENDAR_AXES): { pos: Vec3; quat: THREE.Quaternion } {
  const pos = addv(sun, scale(axes[2], OVERVIEW_KM));
  return { pos, quat: lookAt(pos, sun, axes[1]) };
}

/** Just above a body: this many radii from its centre (0.4 radii up). */
export const ABOVE_RADII = 1.4;
/** Facing the Sun from above a body: the Sun this far above the centre of the view, radians. */
const SUN_ABOVE_CENTRE = (22 * Math.PI) / 180;
/** …and the body's centre at most this far below it, so it is always at your feet. */
const BODY_BELOW_MAX = (68 * Math.PI) / 180;

/**
 * Standing just above a body's north pole, upright (its north is up), facing the Sun:
 * the body curves away beneath your feet at the bottom of the view and the Sun is near
 * the top. (Above the Sun, you face Earth.) If the Sun is high in that body's sky (a
 * tilted planet in summer), you look down a little more so the body stays in view.
 */
export function aboveNorth(id: BodyId, bodies: readonly BodyState[]): { pose: Pose; pos: Vec3; quat: THREE.Quaternion } {
  const b = find(bodies, id);
  const n = unit(b.axes[2]);
  const pos = addv(b.pos, scale(n, b.info.radiusKm * ABOVE_RADII));
  const target = id === 'sun' ? find(bodies, 'earth').pos : find(bodies, 'sun').pos;
  let s = unit(sub(target, pos));
  const down = scale(n, -1);
  // The Sun straight overhead or underfoot: face any horizontal direction instead.
  if (Math.abs(s[0] * n[0] + s[1] * n[1] + s[2] * n[2]) > 0.9999) s = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
  const A = Math.acos(Math.max(-1, Math.min(1, s[0] * down[0] + s[1] * down[1] + s[2] * down[2]))); // body ↔ Sun, from here
  const forward = rotateToward(down, s, Math.min(BODY_BELOW_MAX, Math.max(0, A - SUN_ABOVE_CENTRE)));
  const quat = lookAt(pos, addv(pos, forward), n);
  return { pose: poseFrom(pos, quat, id, 'inertial', bodies), pos, quat };
}

/** Distances from the Sun compressed as in the calendar's √ fit: r → √(r · 1 AU), so Earth stays at 1 AU. */
export function fitRadius(rKm: number): number {
  return rKm > 0 ? Math.sqrt(rKm * AU_KM) : 0;
}

/** Reshape a place around the Sun for a scale mode (√ fit compresses; linear and true are real distances in 3D). */
export function shapeFor(mode: 'fit' | 'linear' | 'true', sun: Vec3): ((o: Vec3) => Vec3) | undefined {
  if (mode !== 'fit') return undefined;
  return (o) => {
    const d = sub(o, sun);
    const r = Math.hypot(...d);
    return r > 0 ? addv(sun, scale(d, fitRadius(r) / r)) : o;
  };
}

/** Bodies placed for a scale mode: planets moved in toward the Sun, the Moon kept beside Earth, sizes unchanged. */
export function scaleBodies(bodies: readonly BodyState[], mode: 'fit' | 'linear' | 'true'): readonly BodyState[] {
  const sun = find(bodies, 'sun').pos;
  const shape = shapeFor(mode, sun);
  if (!shape) return bodies;
  const earth = find(bodies, 'earth').pos;
  const earth2 = shape(earth);
  return bodies.map((b) => {
    if (b.info.id === 'sun') return b;
    if (b.info.id === 'moon') return { ...b, pos: addv(earth2, sub(b.pos, earth)) };
    return { ...b, pos: shape(b.pos) };
  });
}

/**
 * Turn around a point (the body you are looking at, or the galaxy's centre), keeping
 * it where it is on screen: like turning a globe in your hands. `yaw` turns about your
 * own up axis, `pitch` about your own right axis, radians.
 */
export function orbitAround(pos: Vec3, quat: THREE.Quaternion, centre: Vec3, yaw: number, pitch: number): { pos: Vec3; quat: THREE.Quaternion } {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const r = new THREE.Quaternion().setFromAxisAngle(up, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(right, pitch));
  const off = v(sub(pos, centre)).applyQuaternion(r);
  return { pos: addv(centre, arr(off)), quat: r.clone().multiply(quat) };
}

/**
 * What Option + scroll turns around: the most prominent body near the middle of the view
 * (within 35°: the largest on screen for how close it is to the middle, so a big planet
 * beats a speck of light behind it), else the nearest body.
 */
export function orbitTarget(pos: Vec3, quat: THREE.Quaternion, bodies: readonly BodyState[]): BodyState {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  let best: { b: BodyState; score: number } | null = null;
  for (const b of bodies) {
    const rel = v(sub(b.pos, pos));
    const a = fwd.angleTo(rel);
    if (a > (35 * Math.PI) / 180) continue;
    const rho = Math.asin(Math.min(1, b.info.radiusKm / Math.max(1, rel.length())));
    const score = rho / (a + (2 * Math.PI) / 180);
    if (!best || score > best.score) best = { b, score };
  }
  return best ? best.b : find(bodies, nearest(pos, bodies).id);
}
