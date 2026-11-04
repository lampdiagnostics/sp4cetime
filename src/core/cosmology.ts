/**
 * The universe's expansion skin (0.4.5; docs/SPHERES.md §9, ADR-0021): how far apart
 * unbound galaxies are at any moment, as a scale factor a(t), 1 now. A pure function of
 * time (rule 4): the skin names a cosmology, not keyframes.
 *
 * Two universes, each with today's Hubble constant (so they agree now and differ in the
 * past and future):
 * - 'lcdm', the real one as best measured (flat ΛCDM, Planck 2018: matter and dark
 *   energy; radiation, which mattered only in the first ~50,000 years, left out):
 *     a(t) = (Ωm/ΩΛ)^⅓ · sinh^⅔(3/2 · √ΩΛ · H0 · t)
 *   It slowed down for its first ~7.7 billion years and has been speeding up since.
 * - 'matter', a teaching option: a universe of matter only (Friedmann 1922; Einstein and
 *   de Sitter 1932, the clip's universe): a(t) = (t / t0)^⅔, t0 = 2 / (3 H0) ≈ 9.7 billion
 *   years. It only ever slows down.
 *
 * Times are years since J2000 (negative is the past); t is the universe's age.
 */
import { HUBBLE_KM_S_MPC, KM_PER_PARSEC, OMEGA_LAMBDA, OMEGA_MATTER } from './constants';

export type Cosmology = 'lcdm' | 'matter';

const SECONDS_PER_YEAR = 365.25 * 86_400;
/** H0 in 1 / years. */
export const H0_PER_YEAR = (HUBBLE_KM_S_MPC / (KM_PER_PARSEC * 1e6)) * SECONDS_PER_YEAR;

const K_LCDM = 1.5 * Math.sqrt(OMEGA_LAMBDA) * H0_PER_YEAR;
const A_LCDM = Math.cbrt(OMEGA_MATTER / OMEGA_LAMBDA);

/** The universe's age now, years: 13.8 billion (ΛCDM), 9.7 billion (matter only). */
export function ageNow(c: Cosmology): number {
  return c === 'matter' ? 2 / (3 * H0_PER_YEAR) : Math.asinh(Math.sqrt(OMEGA_LAMBDA / OMEGA_MATTER)) / K_LCDM;
}

/** The scale factor at an age of the universe (years). */
export function scaleAtAge(c: Cosmology, age: number): number {
  if (!(age > 0)) return 0;
  return c === 'matter' ? Math.pow(age / ageNow('matter'), 2 / 3) : A_LCDM * Math.pow(Math.sinh(K_LCDM * age), 2 / 3);
}

/** The scale factor `years` from now (negative: the past); 1 now, 0 at the Big Bang. */
export function scaleFactor(c: Cosmology, years: number): number {
  return scaleAtAge(c, ageNow(c) + years);
}

/** The expansion rate H = ȧ/a, km/s per Mpc, `years` from now. */
export function hubbleAt(c: Cosmology, years: number): number {
  const age = ageNow(c) + years;
  if (!(age > 0)) return Infinity;
  const perYear = c === 'matter' ? 2 / (3 * age) : (2 / 3) * K_LCDM / Math.tanh(K_LCDM * age);
  return (perYear / SECONDS_PER_YEAR) * KM_PER_PARSEC * 1e6;
}

/** Redshift of light that left a galaxy `emitted` years from now and arrives `received` years from now: 1 + z = a(received) / a(emitted). */
export function redshift(c: Cosmology, emitted: number, received: number): number {
  const ae = scaleFactor(c, emitted);
  return ae > 0 ? scaleFactor(c, received) / ae - 1 : Infinity;
}

/** When the expansion stopped slowing and began to speed up (ä = 0), years from now (ΛCDM only). */
export function turnToAcceleration(): number {
  // ä = 0 where sinh²(k t) = 1/2 … from a ∝ sinh^⅔: tanh²(k t) = 1/3.
  return Math.atanh(1 / Math.sqrt(3)) / K_LCDM - ageNow('lcdm');
}
