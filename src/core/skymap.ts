/**
 * The sky behind the calendar, seen exactly as Fly mode's camera would see it
 * (docs/adr/0011-calendar-sky.md).
 *
 * The calendar looks at the solar system from +Z toward −Z (view frame: X = the
 * Sun's direction of travel, to the right; Y up). The sky is the inside of a sphere
 * around the viewer, seen through a perspective lens: `focal` is pixels per unit
 * of tan(angle from the view direction). It turns with the view, so rotating the
 * solar system turns the sky with it.
 */
import { ECL_TO_GAL, type Mat3, type Vec3 } from './geometry';

/** A view-frame direction → screen offset from the view centre (y down), or null if behind the viewer. */
export function projectSky(d: Vec3, focal: number): { x: number; y: number } | null {
  if (d[2] > -1e-6) return null;
  return { x: (focal * d[0]) / -d[2], y: (-focal * d[1]) / -d[2] };
}

/** Screen offset from the view centre → view-frame direction (unit vector). */
export function unprojectSky(x: number, y: number, focal: number): Vec3 {
  const v: Vec3 = [x / focal, -y / focal, -1];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Pixels per unit tan(angle) for a lens whose half-height (or radius) `halfPx` spans `halfAngle` radians. */
export function focalFor(halfPx: number, halfAngle = Math.PI / 6): number {
  return halfPx / Math.tan(halfAngle);
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
