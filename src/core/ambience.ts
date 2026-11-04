/**
 * Sound made from numbers (0.4.2), so there is nothing to license: a soft white-noise bed
 * under a path (owner, 4 Nov 2026: white noise throughout, no crickets). `noiseLoop` returns
 * a stereo loop (independent left and right, so it sounds wide) that repeats without a
 * seam: white noise has no memory, so its end runs into its start like anywhere else.
 * Pure, so it is tested in Node and played by src/app/sound.ts.
 */

/** A small, repeatable random sequence (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StereoLoop {
  readonly sampleRate: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/** Root-mean-square level of the noise: about −42 dB, a quiet hum (owner, 4 Nov 2026: a quarter of the first level, −30 dB). */
export const NOISE_RMS = 0.008;

/** White noise, `seconds` long (a loop), at `sampleRate`: flat in every frequency, the same each time. */
export function noiseLoop(sampleRate: number, seconds = 8, seed = 1985): StereoLoop {
  const n = Math.round(sampleRate * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rnd = rng(seed);
  // Uniform in ±a has RMS a/√3.
  const a = NOISE_RMS * Math.sqrt(3);
  for (let i = 0; i < n; i++) {
    L[i] = (rnd() * 2 - 1) * a;
    R[i] = (rnd() * 2 - 1) * a;
  }
  return { sampleRate, left: L, right: R };
}
