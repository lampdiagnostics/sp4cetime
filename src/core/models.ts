/**
 * Where Earth and the Moon are, and how sure we can be (docs/adr/0005-accuracy-tiers.md).
 *
 * - ephemeris: within ±3,000 years of 2000, positions from astronomy-engine.
 * - modelled:  within ±10,000 years, mean orbital motion (good to a few degrees nearby,
 *              drifting further out).
 * - schematic: beyond that, the shape is right but the phase is illustrative.
 *              Earth's orbital phase is genuinely unknowable beyond ~50–100 Myr
 *              because the solar system is chaotic, and the day and month were
 *              shorter in the deep past.
 */
import * as Astronomy from 'astronomy-engine';
import { GALACTIC_YEAR_YEARS, SYNODIC_MONTH_SECONDS, TROPICAL_YEAR_SECONDS } from './constants';
import { type Time, toDaysApprox, toUnixMs, toYearsApprox } from './time';

export type AccuracyTier = 'ephemeris' | 'modelled' | 'schematic';

export const EPHEMERIS_LIMIT_YEARS = 3_000;
export const MODELLED_LIMIT_YEARS = 10_000;

export const TIER_LABELS: Record<AccuracyTier, string> = {
  ephemeris: 'Ephemeris: real positions',
  modelled: 'Modelled: mean orbits',
  schematic: 'Schematic: illustrative phase',
};

export function accuracyTier(t: Time): AccuracyTier {
  const years = Math.abs(toYearsApprox(t));
  if (years <= EPHEMERIS_LIMIT_YEARS) return 'ephemeris';
  if (years <= MODELLED_LIMIT_YEARS) return 'modelled';
  return 'schematic';
}

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

export function wrapRadians(a: number): number {
  const r = a % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

/** Earth's mean angular speed around the Sun, radians per second. */
export const EARTH_ANGULAR_SPEED = TWO_PI / TROPICAL_YEAR_SECONDS;
/** Moon's mean angular speed relative to the Sun direction (phase), radians per second. */
export const MOON_PHASE_SPEED = TWO_PI / SYNODIC_MONTH_SECONDS;

/** Earth's mean heliocentric ecliptic longitude, radians. */
export function earthLongitudeMean(t: Time): number {
  const d = toDaysApprox(t) - 0.5; // days from J2000.0 (noon)
  return wrapRadians((100.464_57 + 0.985_647_36 * d) * DEG);
}

/** Moon phase angle (0 = new, π = full) from the mean synodic month. */
export function moonPhaseMean(t: Time): number {
  // Reference new moon: 2000-01-06 18:14 UTC = 5.7597 days after the epoch.
  const months = (toDaysApprox(t) - 5.7597) / 29.530_588_853;
  return wrapRadians(months * TWO_PI);
}

function asDate(t: Time): Date {
  return new Date(toUnixMs(t));
}

/** Earth's heliocentric ecliptic longitude, radians, using the best tier available. */
export function earthLongitude(t: Time): number {
  if (accuracyTier(t) === 'ephemeris') {
    const sun = Astronomy.SunPosition(asDate(t));
    return wrapRadians((sun.elon + 180) * DEG);
  }
  return earthLongitudeMean(t);
}

/** Moon phase angle, radians (0 = new, π = full), using the best tier available. */
export function moonPhase(t: Time): number {
  if (accuracyTier(t) === 'ephemeris') {
    return wrapRadians(Astronomy.MoonPhase(asDate(t)) * DEG);
  }
  return moonPhaseMean(t);
}

/** Illuminated fraction of the Moon's disc, 0–1. */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(phase)) / 2;
}

/** Rotation of the galactic background: one turn per galactic year. A pure function of time. */
export function galacticAngle(t: Time): number {
  return wrapRadians((toYearsApprox(t) / GALACTIC_YEAR_YEARS) * TWO_PI);
}

export interface BodyState {
  readonly earthLongitude: number;
  readonly moonPhase: number;
  readonly tier: AccuracyTier;
}

export function bodyState(t: Time): BodyState {
  return { earthLongitude: earthLongitude(t), moonPhase: moonPhase(t), tier: accuracyTier(t) };
}
