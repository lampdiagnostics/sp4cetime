/**
 * Physical constants and the range of the canvas. Every value here is an
 * estimate with a published spread; the comment says which.
 */
import { fromYearsApprox, SECONDS_PER_YEAR } from './time';

/** Sun's age, ~4.57 Gyr. The canvas starts at the Sun's formation. */
export const SUN_AGE_YEARS = 4.6e9;
/** Remaining main-sequence lifetime, ~5 Gyr (estimates 4.5–5.5 Gyr). */
export const SUN_REMAINING_YEARS = 5.0e9;

/** Earth's age, ~4.54 Gyr. Earth's helix starts here. */
export const EARTH_AGE_YEARS = 4.54e9;

export const MIN_TIME = fromYearsApprox(-SUN_AGE_YEARS);
export const MAX_TIME = fromYearsApprox(SUN_REMAINING_YEARS);

/**
 * One galactic year: the Sun's orbital period around the Milky Way centre.
 * Published estimates span ~225–250 Myr; the project uses 230 Myr.
 */
export const GALACTIC_YEAR_YEARS = 230e6;
export const GALACTIC_YEAR_SECONDS = GALACTIC_YEAR_YEARS * SECONDS_PER_YEAR;

/** Sun's speed around the galactic centre, ~230 km/s (frame: galactic rest frame). */
export const SUN_GALACTIC_SPEED_KM_S = 230;

/** Mean tropical year and synodic month, in seconds. */
export const TROPICAL_YEAR_SECONDS = 365.242_19 * 86_400;
export const SYNODIC_MONTH_SECONDS = 29.530_588_853 * 86_400;

/** Zoom limits: about 1 minute across a phone screen to the Sun's whole life on one. */
export const MIN_SECONDS_PER_PIXEL = 0.05;
export const MAX_SECONDS_PER_PIXEL = 1e15;
