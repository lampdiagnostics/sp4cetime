import { describe, expect, it } from 'vitest';
import { hz, LOOP_SECONDS, loopTuned, MOODS, MUSIC_RMS, musicLoop, NOISE_RMS, noiseLoop } from './ambience';

describe('The white-noise bed', () => {
  const s = noiseLoop(48_000, 8);
  const rms = (a: Float32Array, from = 0, to = a.length): number => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i]! ** 2;
    return Math.sqrt(e / (to - from));
  };

  it('is a stereo loop of the length asked, quiet and never clipping', () => {
    expect(s.left).toHaveLength(8 * 48_000);
    expect(s.right).toHaveLength(8 * 48_000);
    for (const ch of [s.left, s.right]) {
      expect(rms(ch)).toBeCloseTo(NOISE_RMS, 3);
      for (const x of ch) expect(Math.abs(x)).toBeLessThan(0.06);
    }
  });

  it('is even all the way through, with no gaps', () => {
    for (let k = 0; k < 8; k++) expect(rms(s.left, k * 48_000, (k + 1) * 48_000)).toBeGreaterThan(NOISE_RMS * 0.9);
  });

  it('is white: neighbouring samples unrelated, left and right independent', () => {
    let lag = 0, lr = 0;
    for (let i = 1; i < s.left.length; i++) {
      lag += s.left[i]! * s.left[i - 1]!;
      lr += s.left[i]! * s.right[i]!;
    }
    const e = rms(s.left) ** 2 * s.left.length;
    expect(Math.abs(lag / e)).toBeLessThan(0.01);
    expect(Math.abs(lr / e)).toBeLessThan(0.01);
  });

  it('is the same every time (made from numbers, not recordings)', () => {
    expect(noiseLoop(48_000, 8).left[12345]).toBe(s.left[12345]);
  });
});

describe('The gift soundtracks', () => {
  const rate = 16_000; // the same maths at any rate; small for speed
  const loops = MOODS.map((m) => [m.id, musicLoop(m.id, rate)] as const);
  const rms = (a: Float32Array, from = 0, to = a.length): number => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i]! ** 2;
    return Math.sqrt(e / (to - from));
  };

  it('are stereo loops of LOOP_SECONDS at about MUSIC_RMS, never clipping', () => {
    for (const [, s] of loops) {
      expect(s.left).toHaveLength(LOOP_SECONDS * rate);
      const level = Math.sqrt((rms(s.left) ** 2 + rms(s.right) ** 2) / 2);
      expect(level).toBeGreaterThan(MUSIC_RMS * 0.85);
      expect(level).toBeLessThan(MUSIC_RMS * 1.05);
      for (const ch of [s.left, s.right]) for (const x of ch) expect(Math.abs(x)).toBeLessThan(0.9);
    }
  });

  it('never fall silent for a whole second (no gaps in the loop)', () => {
    for (const [, s] of loops) for (let k = 0; k < LOOP_SECONDS; k++) expect(rms(s.left, k * rate, (k + 1) * rate)).toBeGreaterThan(MUSIC_RMS * 0.15);
  });

  it('join without a click: the last sample runs into the first like any two neighbours', () => {
    for (const [id, s] of loops) {
      let worst = 0;
      for (let i = 1; i < s.left.length; i++) worst = Math.max(worst, Math.abs(s.left[i]! - s.left[i - 1]!));
      const seam = Math.abs(s.left[0]! - s.left[s.left.length - 1]!);
      expect(seam, id).toBeLessThanOrEqual(worst + 1e-6);
    }
  });

  it('are made from numbers: the same every time, and different from each other', () => {
    expect(musicLoop('calm', rate).left[54321]).toBe(loops[0]![1].left[54321]);
    expect(loops[0]![1].left[54321]).not.toBe(loops[1]![1].left[54321]);
  });

  it('tune steady tones to whole cycles per loop, so they repeat exactly', () => {
    for (const f of [55, 440, hz(71), 1234.567]) {
      const t = loopTuned(f);
      expect(Math.abs(t - f)).toBeLessThanOrEqual(1 / (2 * LOOP_SECONDS) + 1e-12);
      expect(Math.abs(t * LOOP_SECONDS - Math.round(t * LOOP_SECONDS))).toBeLessThan(1e-9);
    }
  });
});
