/**
 * The planisphere lens (✶ Starsigns' last pose; owner, 4 November 2026).
 *
 * The last pose looks at the ecliptic's south pole, with the chart wheel drawn as a ring
 * 38° out around it. The real zodiac constellations lie 90° from that pole, out of view,
 * so without a lens the wheel sits over the southern polar constellations. The lens slides
 * every point of the sky along its own line of ecliptic longitude toward the south pole,
 * scaling its angle from the pole by one factor, so the ecliptic lands in the middle of the
 * wheel's band of signs and each zodiac constellation sits behind its own stretch of the
 * wheel. This is an azimuthal equidistant projection about the pole, the projection of a
 * printed planisphere: longitudes (and so signs and which constellation is behind which
 * sign) stay true; latitudes are squeezed. It is labelled on screen as a lens (CLAUDE.md
 * rule 5); it never moves anything else, and amount 0 is the true sky.
 *
 * Directions are unit vectors in the ecliptic J2000 frame (the world frame).
 */

import type { Vec3 } from './geometry';

/** The wheel's outer edge seen from the camera, degrees from the view's centre (the pole). */
export const SKY_WHEEL_DEG = 38;

/** The middle of the wheel's band of signs, as a fraction of its outer radius (wheel.ts R_SIGN..R_OUT). */
const SIGN_BAND_MIDDLE = 0.92;

/** Where the lens puts the ecliptic: degrees from the south pole (≈35.7°, mid-band). */
export const PLANISPHERE_ECLIPTIC_DEG =
  (Math.atan(SIGN_BAND_MIDDLE * Math.tan((SKY_WHEEL_DEG * Math.PI) / 180)) * 180) / Math.PI;

/** The factor by which angles from the south pole are multiplied at full strength. */
export const PLANISPHERE_K = PLANISPHERE_ECLIPTIC_DEG / 90;

/**
 * A sky direction seen through the lens. `amount` 0 leaves it as it is, 1 is the full
 * planisphere; in between it eases from one to the other (for a smooth change of look).
 */
export function planisphereDir(d: Vec3, amount: number, k = PLANISPHERE_K): Vec3 {
  if (amount <= 0) return d;
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const x = d[0] / len, y = d[1] / len, z = d[2] / len;
  const psi = Math.acos(Math.max(-1, Math.min(1, -z))); // angle from the south ecliptic pole
  const s = 1 - Math.min(1, amount) * (1 - k);
  const psi2 = psi * s;
  const h = Math.hypot(x, y);
  const c = h > 1e-12 ? x / h : 1, sn = h > 1e-12 ? y / h : 0;
  const r = Math.sin(psi2);
  return [r * c * len, r * sn * len, -Math.cos(psi2) * len];
}

/** Within this many degrees of the north ecliptic pole the lens is singular (the pole maps to a circle), so the sky there is not drawn while it is on. */
export const PLANISPHERE_CUT_DEG = 20;

/**
 * The same lens in GLSL, for the sky's vertex shaders: `planisphere(dir)` with a `lensAmount`
 * uniform, and `planisphereCut(dir)`, 1 for a vertex too near the north pole (its line,
 * triangle or star is then dropped: a fragment discards wherever the varying is above 0).
 */
export const PLANISPHERE_GLSL = /* glsl */ `
  uniform float lensAmount;
  vec3 planisphere(vec3 p) {
    if (lensAmount <= 0.0) return p;
    float len = length(p);
    vec3 d = p / len;
    float psi = acos(clamp(-d.z, -1.0, 1.0));
    float psi2 = psi * (1.0 - lensAmount * (1.0 - ${PLANISPHERE_K.toFixed(9)}));
    float h = length(d.xy);
    vec2 cs = h > 1e-7 ? d.xy / h : vec2(1.0, 0.0);
    return len * vec3(sin(psi2) * cs, -cos(psi2));
  }
  float planisphereCut(vec3 p) {
    return lensAmount > 0.0 && normalize(p).z > ${Math.cos((PLANISPHERE_CUT_DEG * Math.PI) / 180).toFixed(9)} ? 1.0 : 0.0;
  }
`;
