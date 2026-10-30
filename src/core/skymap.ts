/**
 * The whole sky on a flat disc, for the calendar's background (docs/adr/0011-calendar-sky.md).
 *
 * The calendar looks at the solar system from +Z toward −Z (view frame: X = the
 * Sun's direction of travel, to the right; Y up). The sky is drawn as the inside of
 * a sphere seen from its centre, with every direction on one disc (an azimuthal
 * equidistant projection): the direction straight ahead (−Z) in the middle, the
 * directions to the sides (X, Y) halfway out, and the direction behind you (+Z)
 * all around the rim. It turns with the view, so rotating the solar system turns
 * the sky with it.
 */
import { ECL_TO_GAL, type Mat3, type Vec3 } from './geometry';

/** A view-frame direction → position on a disc of radius R (screen y down). */
export function projectSky(d: Vec3, R: number): { x: number; y: number } {
  const theta = Math.acos(Math.max(-1, Math.min(1, -d[2])));
  const s = Math.hypot(d[0], d[1]);
  if (s < 1e-12) return { x: 0, y: theta < 1 ? 0 : R }; // dead ahead, or dead behind (the whole rim)
  const r = (theta / Math.PI) * R;
  return { x: (r * d[0]) / s, y: (-r * d[1]) / s };
}

/** Position on the disc → view-frame direction (inverse of projectSky); null outside the disc. */
export function unprojectSky(x: number, y: number, R: number): Vec3 | null {
  const r = Math.hypot(x, y);
  if (r > R) return null;
  const theta = (r / R) * Math.PI;
  if (r < 1e-9) return [0, 0, -1];
  const st = Math.sin(theta);
  return [(st * x) / r, (-st * y) / r, -Math.cos(theta)];
}

/** Apply a matrix (rows) to a vector. */
export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Apply the transpose (the inverse, for a rotation). */
export function applyT(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

/** View-frame direction → galactic longitude and latitude (radians), given the view matrix (ecliptic → view). */
export function viewToGalactic(view: Mat3, d: Vec3): { l: number; b: number } {
  const g = apply(ECL_TO_GAL, applyT(view, d));
  return { l: Math.atan2(g[1], g[0]), b: Math.asin(Math.max(-1, Math.min(1, g[2]))) };
}
