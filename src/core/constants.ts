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

/**
 * The Sun's mass over each giant planet's (the planet with its moons), for the barycentre
 * (barycentre.ts): IAU 2009 system of constants / JPL DE430. Known to better than 1 part
 * in 10⁵; Uranus and Neptune the least well (about ±0.03 and ±0.4 in the ratio).
 */
export const SUN_PLANET_MASS_RATIO = {
  jupiter: 1_047.348_644,
  saturn: 3_497.901_8,
  uranus: 22_902.98,
  neptune: 19_412.26,
} as const;

/** Sun's speed around the galactic centre, ~230 km/s (frame: galactic rest frame). */
export const SUN_GALACTIC_SPEED_KM_S = 230;

/** Mean tropical year and synodic month, in seconds. */
export const TROPICAL_YEAR_SECONDS = 365.242_19 * 86_400;
export const SYNODIC_MONTH_SECONDS = 29.530_588_853 * 86_400;

/** Zoom limits: about 1 minute across a phone screen to the Sun's whole life on one. */
export const MIN_SECONDS_PER_PIXEL = 0.05;
export const MAX_SECONDS_PER_PIXEL = 1e15;

/**
 * Distance from the Sun to Sagittarius A*, the black hole at the galaxy's centre:
 * 8.178 kpc (GRAVITY Collaboration 2019; published values 8.0–8.3 kpc).
 */
export const SUN_GALACTOCENTRIC_KPC = 8.178;
export const KM_PER_PARSEC = 3.085_677_581_491_367e13;
export const SUN_GALACTOCENTRIC_KM = SUN_GALACTOCENTRIC_KPC * 1000 * KM_PER_PARSEC;
/** Direction of Sgr A* from the Sun, galactic coordinates (Reid & Brunthaler 2004), degrees. */
export const SGR_A_L_DEG = 359.944_2;
export const SGR_A_B_DEG = -0.046_2;
/** The galaxy sphere's radius: the disc is ~100,000 light years across (the stellar disc thins out beyond). */
export const GALAXY_RADIUS_LY = 50_000;

// --- Cosmology (the universe's expansion skin, 0.4.3; docs/SPHERES.md §9) -------------

/** Hubble constant now, km/s per Mpc (Planck 2018: 67.4 ± 0.5; the distance ladder gives 73.0 ± 1.0, the "Hubble tension"). */
export const HUBBLE_KM_S_MPC = 67.4;
/** Matter's share of the critical density now (Planck 2018: 0.315 ± 0.007). */
export const OMEGA_MATTER = 0.315;
/** Dark energy's share (a flat universe: 1 − Ωm = 0.685). */
export const OMEGA_LAMBDA = 1 - OMEGA_MATTER;
/** Light years in a megaparsec. */
export const LY_PER_MPC = 3.261_563_777e6;
