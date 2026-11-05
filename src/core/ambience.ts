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

// --- Soundtracks for a gift (5 Nov 2026) ---------------------------------------------------
//
// A video made as a gift can carry music instead of the hum. These are made from numbers
// too (nothing to license), each a loop of LOOP_SECONDS that repeats without a seam: every
// steady tone is tuned to a whole number of cycles in the loop, and every note's tail that
// runs past the end is folded back onto the start (as it would sound the second time round).

export type Mood = 'calm' | 'musicbox' | 'deep';
export const MOODS: readonly { readonly id: Mood; readonly name: string }[] = [
  { id: 'calm', name: 'Calm (slow warm chords)' },
  { id: 'musicbox', name: 'Music box (soft notes)' },
  { id: 'deep', name: 'Deep space (low drone)' },
];

/** Every soundtrack loops after this many seconds. */
export const LOOP_SECONDS = 32;
/** Loudness of the music: about −20 dB RMS, well under full scale, with room for the peaks. */
export const MUSIC_RMS = 0.1;

/** A frequency moved to the nearest whole number of cycles per loop (at most 1/64 Hz off: inaudible). */
export const loopTuned = (f: number, seconds = LOOP_SECONDS): number => Math.max(1, Math.round(f * seconds)) / seconds;

/** Equal-tempered pitch: MIDI note number → Hz (A4 = 69 = 440 Hz). */
export const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/**
 * A soundtrack loop, `seconds` long at `sampleRate`, normalised to MUSIC_RMS and never
 * clipping. Pure and repeatable (the same numbers every time).
 */
export function musicLoop(mood: Mood, sampleRate: number, seconds = LOOP_SECONDS): StereoLoop {
  const n = Math.round(sampleRate * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  const TAU = Math.PI * 2;

  /** A steady tone (seamless: tuned to the loop), its loudness swelling with `swell(t)` (also periodic). */
  const tone = (f: number, amp: number, pan: number, swell: (t: number) => number = () => 1): void => {
    const w = (TAU * loopTuned(f, seconds)) / sampleRate;
    const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4), gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < n; i++) {
      const s = Math.sin(w * i) * swell(i / sampleRate);
      L[i] = L[i]! + s * gl;
      R[i] = R[i]! + s * gr;
    }
  };
  /** A note starting at `at` seconds: a soft attack, then `decay` seconds to fade by 1/e; tails wrap round. */
  const note = (f: number, at: number, amp: number, pan: number, attack: number, decay: number, partials: readonly number[] = [1]): void => {
    const len = Math.min(n, Math.round(sampleRate * (attack + decay * 6)));
    const start = Math.round(at * sampleRate);
    const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4), gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let j = 0; j < len; j++) {
      const t = j / sampleRate;
      const env = (t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1) * Math.exp(-Math.max(0, t - attack) / decay);
      let s = 0;
      for (const [k, p] of partials.entries()) s += Math.sin(TAU * f * p * t) / (k + 1) ** 1.6;
      const i = (start + j) % n;
      L[i] = L[i]! + s * env * gl;
      R[i] = R[i]! + s * env * gr;
    }
  };
  /** A smooth bump 0 → 1 → 0 across [a, b] seconds, wrapping round the loop (for chords that cross-fade). */
  const bump = (a: number, b: number) => (t: number): number => {
    const u = (((t - a) % seconds) + seconds) % seconds;
    const len = b - a;
    return u < len ? Math.sin((Math.PI * u) / len) ** 2 : 0;
  };

  const rnd = rng(mood === 'calm' ? 7 : mood === 'musicbox' ? 11 : 13);
  if (mood === 'calm') {
    // Four chords, 8 s each, overlapping by half so one swells as the last fades: Cmaj7, Am9, Fmaj7, G6.
    const chords = [[48, 55, 64, 71], [45, 52, 60, 67, 71], [41, 48, 57, 64], [43, 50, 59, 64]];
    for (const [c, chord] of chords.entries()) {
      const a = c * 8 - 4;
      for (const [k, m] of chord.entries()) {
        const pan = (k / (chord.length - 1)) * 1.2 - 0.6;
        tone(hz(m), 1 / (k + 2), pan, bump(a, a + 16));
        tone(hz(m) * 1.003, 0.5 / (k + 2), -pan, bump(a, a + 16)); // a slow beat: warmth
      }
    }
  } else if (mood === 'musicbox') {
    // A soft pad (C and G), and a pentatonic tune of plucked notes, one every half second, some rests.
    tone(hz(48), 0.5, -0.3, bump(0, 16));
    tone(hz(55), 0.4, 0.3, bump(16, 32));
    tone(hz(43), 0.4, 0, bump(8, 24));
    const scale = [72, 74, 76, 79, 81, 84, 86, 88];
    let k = 3;
    for (let b = 0; b < seconds * 2; b++) {
      if (rnd() < 0.22) continue;
      k = Math.max(0, Math.min(scale.length - 1, k + Math.round((rnd() - 0.5) * 4)));
      note(hz(scale[k]!), b / 2, 0.55, rnd() * 1.2 - 0.6, 0.004, 0.7, [1, 2, 3, 4.2]);
    }
  } else {
    // A low drone on A (55 Hz) and its fifth, breathing slowly, with high partials shimmering in and out.
    const breathe = (p: number, d: number) => (t: number): number => 0.75 + 0.25 * Math.sin((TAU * t * p) / seconds + d);
    tone(55, 1, -0.2, breathe(1, 0));
    tone(55 * 1.002, 0.6, 0.2, breathe(1, 2));
    tone(82.5, 0.55, 0.1, breathe(2, 1));
    tone(110, 0.35, -0.1, breathe(3, 0.5));
    for (const [k, m] of [76, 81, 83, 88, 93].entries()) tone(hz(m), 0.06, k % 2 ? 0.7 : -0.7, bump(k * 6.4, k * 6.4 + 14));
  }

  // Normalise to MUSIC_RMS, then hold every peak under 0.9 (soft: tanh near the top).
  let e = 0;
  for (let i = 0; i < n; i++) e += L[i]! ** 2 + R[i]! ** 2;
  const g = MUSIC_RMS / Math.sqrt(e / (2 * n) || 1);
  for (const ch of [L, R]) for (let i = 0; i < n; i++) ch[i] = 0.9 * Math.tanh((ch[i]! * g) / 0.9);
  return { sampleRate, left: L, right: R };
}
