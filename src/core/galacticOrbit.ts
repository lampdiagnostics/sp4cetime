/**
 * The Sun's orbit around the galaxy, in the epicycle approximation: not a circle but a
 * rosette. The Sun circles a "guiding centre" that goes round at the rotation speed,
 * while swinging in and out radially (and a little ahead and behind) on a shorter
 * period, and bobbing up and down through the disc (bob.ts). Fitted to what is measured
 * now:
 *
 * - circular speed 230 km/s (as everywhere in sp4cetime), flat rotation curve, so the
 *   epicyclic frequency κ = √2 · Ω;
 * - the Sun's motion relative to circular (Schönrich, Binney & Dehnen 2010): 11.1 km/s
 *   toward the galactic centre, 12.24 km/s faster than circular.
 *
 * That puts the guiding centre at 8.61 kpc (the Sun, at 8.178 kpc, is inside it, near
 * its closest), the radial swing at ±0.52 kpc (from ~8.09 to ~9.13 kpc from Sgr A*), one
 * radial cycle every ~163 Myr against ~230 Myr for a turn: so successive loops do not
 * close, each one turned ~1/3 of a turn from the last. It is a model: the real orbit is
 * not exactly epicyclic, and over billions of years stars migrate in radius in ways not
 * known for the Sun, so the far past and future are drawn as if nothing changed.
 */
import { SUN_GALACTIC_SPEED_KM_S, SUN_GALACTOCENTRIC_KM } from './constants';
import { SECONDS_PER_YEAR } from './time';

export const SUN_U_KM_S = 11.1;
export const SUN_V_PECULIAR_KM_S = 12.24;

const VC = SUN_GALACTIC_SPEED_KM_S;
const R0 = SUN_GALACTOCENTRIC_KM;
/** Guiding-centre radius, km: the circular orbit with the Sun's angular momentum. */
export const GUIDING_RADIUS_KM = (R0 * (VC + SUN_V_PECULIAR_KM_S)) / VC;
const OMEGA = VC / GUIDING_RADIUS_KM; // rad/s
const KAPPA = Math.SQRT2 * OMEGA; // rad/s
const X0 = R0 - GUIDING_RADIUS_KM; // the Sun's radial offset now, km (negative: inside)
const VX0 = -SUN_U_KM_S; // its radial velocity now, km/s (negative: inward)
/** Amplitude of the radial swing, km. */
export const RADIAL_AMPLITUDE_KM = Math.hypot(X0, VX0 / KAPPA);
const PSI = Math.atan2(-VX0 / KAPPA, X0);
const Y0 = -((2 * OMEGA) / KAPPA) * RADIAL_AMPLITUDE_KM * Math.sin(PSI);

/** One turn of the guiding centre, years (~230 Myr). */
export const ORBIT_PERIOD_YEARS = (2 * Math.PI) / OMEGA / SECONDS_PER_YEAR;
/** One radial in-and-out, years (~163 Myr). */
export const RADIAL_PERIOD_YEARS = (2 * Math.PI) / KAPPA / SECONDS_PER_YEAR;

/**
 * Where the Sun is in its orbit `seconds` from now: distance from Sgr A* (km), and the
 * angle it has gone round since now (radians, in the direction of rotation).
 */
export function sunOrbitAt(seconds: number): { r: number; phi: number } {
  const a = KAPPA * seconds + PSI;
  const x = RADIAL_AMPLITUDE_KM * Math.cos(a);
  const y = -((2 * OMEGA) / KAPPA) * RADIAL_AMPLITUDE_KM * Math.sin(a);
  return { r: GUIDING_RADIUS_KM + x, phi: OMEGA * seconds + (y - Y0) / GUIDING_RADIUS_KM };
}
