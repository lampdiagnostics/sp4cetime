/**
 * The Sun bobs up and down through the galaxy's disc as it goes round: a slow vertical
 * oscillation about the midplane. Modelled as simple harmonic motion fitted to what is
 * measured now:
 *
 * - height above the midplane now: 20.8 ± 0.3 pc (Bennett & Bovy 2019, Gaia DR2);
 * - moving upward (toward the north galactic pole) at 7.25 km/s (Schönrich, Binney &
 *   Dehnen 2010);
 * - period about 85 Myr (estimates run ~60–90 Myr, depending on the disc's mass near
 *   the plane; 85 ± 4 Myr with a ~100 pc swing in arXiv:1009.4190).
 *
 * Together these give a swing of about ±102 pc. The Sun crossed the midplane going up
 * about 2.8 million years ago and reaches its highest, ~102 pc north, in about 18 million
 * years. A model: the real motion is not exactly harmonic, and the period is uncertain.
 */
import { KM_PER_PARSEC, SUN_GALACTIC_SPEED_KM_S } from './constants';
import { diffSeconds, SECONDS_PER_YEAR, type Time } from './time';
import { J2000 } from './ticks';

export const SUN_Z_NOW_PC = 20.8;
export const SUN_W_KM_S = 7.25;
export const SUN_Z_PERIOD_YEARS = 85e6;

const OMEGA = (2 * Math.PI) / (SUN_Z_PERIOD_YEARS * SECONDS_PER_YEAR); // rad/s
const Z0 = SUN_Z_NOW_PC * KM_PER_PARSEC;
/** Amplitude of the swing, km. */
export const SUN_Z_AMPLITUDE_KM = Math.hypot(Z0, SUN_W_KM_S / OMEGA);
const PHASE = Math.atan2(Z0 * OMEGA, SUN_W_KM_S);
/** The measurements are for the present epoch; J2000 is close enough (26 years is 0.00003 of a cycle). */
const EPOCH = J2000;

/** The Sun's height above the galactic midplane at time t, km. */
export function sunHeightKm(t: Time): number {
  return SUN_Z_AMPLITUDE_KM * Math.sin(OMEGA * diffSeconds(t, EPOCH) + PHASE);
}

/** How much higher (km, toward the north galactic pole) the Sun is at t than at `now`. */
export function bobKm(t: Time, now: Time): number {
  return sunHeightKm(t) - sunHeightKm(now);
}

/** The same, for a time given as seconds from `now` (cheaper inside loops). */
export function bobKmAt(now: Time, secondsFromNow: number): number {
  const a = OMEGA * diffSeconds(now, EPOCH) + PHASE;
  const d = OMEGA * secondsFromNow;
  // sin(a + d) − sin(a), written so it stays exact for tiny d (a second's bob is metres).
  return SUN_Z_AMPLITUDE_KM * 2 * Math.cos(a + d / 2) * Math.sin(d / 2);
}

/** The present slope of the Sun's path out of the galactic plane, radians (~1.8°). */
export const SUN_PATH_TILT = Math.atan2(SUN_W_KM_S, SUN_GALACTIC_SPEED_KM_S);
