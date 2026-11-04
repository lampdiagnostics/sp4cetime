/**
 * Sounds made from numbers (0.4.2): no recordings, so nothing to license. Space is silent;
 * standing in a Starsigns field there is a summer night on the prairie: crickets close by
 * and far off (field crickets chirping near 4.5 kHz, a snowy tree cricket's slow, steady
 * beat near 2.9 kHz) and traffic murmuring in the distance, a car passing now and then.
 *
 * `fieldSound` returns a stereo loop that repeats without a seam: every rhythm fits a
 * whole number of times into it, swells wrap around its end, and the noise's tail is
 * blended into its head. Pure, so it is tested in Node and played by src/app/sound.ts.
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

/** A rhythm's period, nudged so it fits a whole number of times into `loop` seconds. */
export const fitPeriod = (period: number, loop: number): number => loop / Math.max(1, Math.round(loop / period));

/** The field at night, `seconds` long (a loop), at `sampleRate`. */
export function fieldSound(sampleRate: number, seconds = 16, seed = 1985): StereoLoop {
  const n = Math.round(sampleRate * seconds);
  const loop = n / sampleRate;
  const L = new Float32Array(n), R = new Float32Array(n);
  const rnd = rng(seed);
  const TAU = Math.PI * 2;

  // Crickets: [carrier Hz, chirp period s, pulses per chirp, loudness, pan −1…1].
  const crickets: Array<[number, number, number, number, number]> = [
    [4600, 0.62, 4, 0.05, -0.55],
    [4350, 0.71, 3, 0.035, 0.6],
    [4900, 0.55, 4, 0.018, 0.15],
    [4150, 0.83, 3, 0.014, -0.15],
    [4750, 0.47, 5, 0.01, 0.85],
  ];
  const PULSE = 0.016, GAP = 0.013;
  for (const [f0, p0, pulses, amp, pan] of crickets) {
    const period = fitPeriod(p0 * (0.95 + rnd() * 0.1), loop);
    const phase = rnd() * period;
    const f = f0 * (0.98 + rnd() * 0.04);
    const gl = amp * Math.sqrt((1 - pan) / 2), gr = amp * Math.sqrt((1 + pan) / 2);
    // Some chirps a little louder or softer, the same each time round.
    const chirps = Math.round(loop / period);
    const level = Array.from({ length: chirps }, () => 0.7 + rnd() * 0.3);
    const chirpLen = pulses * (PULSE + GAP);
    for (let c = 0; c < chirps; c++) {
      const t0 = (phase + c * period) % loop;
      const a = level[c]!;
      const i0 = Math.floor(t0 * sampleRate), i1 = Math.ceil((t0 + chirpLen) * sampleRate);
      for (let i = i0; i < i1; i++) {
        const t = i / sampleRate - t0;
        const k = t % (PULSE + GAP);
        if (k >= PULSE) continue;
        const env = Math.sin((Math.PI * k) / PULSE) ** 2;
        const s = Math.sin(TAU * f * (i / sampleRate)) * env * a;
        const j = i % n;
        L[j]! += s * gl;
        R[j]! += s * gr;
      }
    }
  }
  // A snowy tree cricket some way off: one soft pulse after another, steady as a clock.
  {
    const period = fitPeriod(0.42, loop);
    const f = 2900;
    for (let c = 0, m = Math.round(loop / period); c < m; c++) {
      const t0 = 0.11 + c * period;
      const len = 0.06;
      for (let i = Math.floor(t0 * sampleRate), e = Math.ceil((t0 + len) * sampleRate); i < e; i++) {
        const t = i / sampleRate - t0;
        const env = Math.sin((Math.PI * t) / len) ** 2 * (0.6 + 0.4 * Math.sin(TAU * 180 * t) ** 2);
        const s = Math.sin(TAU * f * (i / sampleRate)) * env * 0.016;
        const j = i % n;
        L[j]! += s * 0.8;
        R[j]! += s * 0.55;
      }
    }
  }

  // Traffic far off: deep, soft noise, swelling slowly, with a car passing now and then.
  const blend = Math.round(sampleRate * 0.5);
  const lp = (fc: number): number => 1 - Math.exp((-TAU * fc) / sampleRate);
  const aLow = lp(220), aCar = lp(700), aCarHi = lp(140);
  let bl = 0, br = 0, cl = 0, cr = 0, hl = 0, hr = 0;
  const rumbleL = new Float32Array(n + blend), rumbleR = new Float32Array(n + blend);
  const carL = new Float32Array(n + blend), carR = new Float32Array(n + blend);
  for (let i = 0; i < n + blend; i++) {
    const wl = rnd() * 2 - 1, wr = rnd() * 2 - 1;
    bl += (wl - bl) * aLow;
    br += (0.6 * wr + 0.4 * wl - br) * aLow;
    rumbleL[i] = bl;
    rumbleR[i] = br;
    cl += (wl - cl) * aCar;
    cr += (wr - cr) * aCar;
    hl += (cl - hl) * aCarHi;
    hr += (cr - hr) * aCarHi;
    carL[i] = cl - hl;
    carR[i] = cr - hr;
  }
  for (const buf of [rumbleL, rumbleR, carL, carR]) {
    for (let i = 0; i < blend; i++) {
      const w = i / blend;
      buf[i] = buf[i]! * w + buf[n + i]! * (1 - w);
    }
  }
  // Two cars in a loop, each a swell of a few seconds moving across, wrapping round the end.
  const cars = [
    { at: loop * (0.2 + rnd() * 0.1), width: 2.4, dir: 1 },
    { at: loop * (0.65 + rnd() * 0.1), width: 3.2, dir: -1 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const swell = 0.75 + 0.25 * Math.sin((TAU * 2 * t) / loop);
    let l = rumbleL[i]! * 0.09 * swell, r = rumbleR[i]! * 0.09 * swell;
    for (const c of cars) {
      let d = t - c.at;
      d -= loop * Math.round(d / loop);
      const g = Math.exp(-0.5 * (d / c.width) ** 2) * 0.05;
      const pan = Math.max(-1, Math.min(1, (c.dir * d) / (c.width * 1.5)));
      l += carL[i]! * g * Math.sqrt((1 - pan) / 2);
      r += carR[i]! * g * Math.sqrt((1 + pan) / 2);
    }
    // The traffic sits a little under the crickets: far off.
    L[i]! += l * 0.7;
    R[i]! += r * 0.7;
  }
  // Up to a comfortable listening level (about −32 dB on average, peaks near −14 dB).
  for (let i = 0; i < n; i++) {
    L[i]! *= 3;
    R[i]! *= 3;
  }
  return { sampleRate, left: L, right: R };
}
