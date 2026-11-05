/**
 * What is heard (0.4.2): silence, or a soft white-noise bed (src/core/ambience.ts). One
 * AudioContext for the page, made on the first click or key (browsers allow sound only
 * after one). Everything heard also goes to recordings: as a track for MediaRecorder, and
 * as raw samples for the X-ready encoder (videoEncode.ts), which always writes a sound
 * track, silent or not.
 */
import type { PointSound } from '../core/path';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let bed: GainNode | null = null;
let bedStarted = false;
let tapDest: MediaStreamAudioDestinationNode | null = null;
let current: PointSound = 'silence';

function make(): Ctx | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ sampleRate: 48_000, latencyHint: 'playback' });
  } catch {
    ctx = new AC();
  }
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  bed = ctx.createGain();
  bed.gain.value = 0;
  bed.connect(master);
  return ctx;
}

/** Call from a click or key press: makes the sound system and lets it play. */
export function unlockSound(): void {
  const c = make();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function startBed(c: Ctx): void {
  if (bedStarted || !bed) return;
  bedStarted = true;
  // The sound is made the first time it is wanted (in its own small file, a fraction of a second's work).
  void import('../core/ambience').then(({ noiseLoop }) => playLoop(c, noiseLoop(c.sampleRate)));
}

function playLoop(c: Ctx, loop: { left: Float32Array; right: Float32Array }): void {
  if (!bed) return;
  const buf = c.createBuffer(2, loop.left.length, c.sampleRate);
  buf.copyToChannel(loop.left as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(loop.right as Float32Array<ArrayBuffer>, 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(bed);
  src.start();
}

/**
 * Change what is heard. `fade` seconds to the new level; `delay` seconds before the change begins.
 */
export function setSound(kind: PointSound, o: { fade?: number; delay?: number } = {}): void {
  current = kind;
  const c = make();
  if (!c || !bed) return;
  if (kind === 'noise') startBed(c);
  const g = bed.gain;
  const t = c.currentTime + (o.delay ?? 0);
  g.cancelScheduledValues(c.currentTime);
  g.setValueAtTime(g.value, c.currentTime);
  g.setValueAtTime(g.value, t);
  const to = kind === 'noise' ? 1 : 0;
  const fade = Math.max(0.02, o.fade ?? 0.3);
  // Silence is reached exactly (a ramp to zero), the noise by a smooth rise.
  g.linearRampToValueAtTime(to, t + fade);
}

export const soundNow = (): PointSound => current;

/** What is heard, as a stream (for MediaRecorder); null without sound. */
export function soundStream(): MediaStream | null {
  const c = make();
  if (!c || !master) return null;
  if (!tapDest) {
    tapDest = c.createMediaStreamDestination();
    master.connect(tapDest);
  }
  return tapDest.stream;
}

/**
 * What is heard, as raw samples while it plays: `onData` gets each block (left, right)
 * and the sample rate. Returns a function that stops it. Nothing arrives while the
 * browser keeps sound suspended; the encoder fills that with silence.
 */
export function soundSamples(onData: (left: Float32Array, right: Float32Array, sampleRate: number) => void): (() => void) | null {
  const c = make();
  if (!c || !master) return null;
  // A ScriptProcessor works in every browser that records; it hears the master and says nothing itself.
  const proc = c.createScriptProcessor(4096, 2, 2);
  const mute = c.createGain();
  mute.gain.value = 0;
  proc.onaudioprocess = (e) => {
    const b = e.inputBuffer;
    const l = new Float32Array(b.getChannelData(0));
    const r = new Float32Array(b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0));
    onData(l, r, b.sampleRate);
  };
  master.connect(proc);
  proc.connect(mute);
  mute.connect(c.destination);
  return () => {
    proc.onaudioprocess = null;
    try {
      master?.disconnect(proc);
    } catch {
      /* already gone */
    }
    proc.disconnect();
    mute.disconnect();
  };
}

// --- A gift's soundtrack (5 Nov 2026) ---------------------------------------------------

/** What a gift video plays: one of the moods made from numbers, or the customer's own audio file. */
export type Soundtrack = { readonly kind: 'mood'; readonly mood: import('../core/ambience').Mood } | { readonly kind: 'file'; readonly data: ArrayBuffer; readonly name: string };

let music: GainNode | null = null;
let musicSrc: AudioBufferSourceNode | null = null;
const moodCache = new Map<string, AudioBuffer>();

/**
 * Play a soundtrack under everything else (and so into recordings), fading in over `fadeIn`
 * seconds; it loops until stopSoundtrack. Resolves once it is playing (a mood is made the
 * first time, a fraction of a second; a file is decoded). Rejects if a file cannot be read.
 */
export async function playSoundtrack(t: Soundtrack, fadeIn = 1.5): Promise<void> {
  const c = make();
  if (!c || !master) return;
  stopSoundtrack(0.05);
  let buf: AudioBuffer;
  if (t.kind === 'mood') {
    const hit = moodCache.get(t.mood);
    if (hit) buf = hit;
    else {
      const { musicLoop } = await import('../core/ambience');
      const loop = musicLoop(t.mood, c.sampleRate);
      buf = c.createBuffer(2, loop.left.length, c.sampleRate);
      buf.copyToChannel(loop.left as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(loop.right as Float32Array<ArrayBuffer>, 1);
      moodCache.set(t.mood, buf);
    }
  } else {
    // decodeAudioData takes the buffer over, so it gets a copy (the gift can be flown again).
    buf = await c.decodeAudioData(t.data.slice(0));
  }
  music = c.createGain();
  music.gain.setValueAtTime(0, c.currentTime);
  music.gain.linearRampToValueAtTime(1, c.currentTime + Math.max(0.02, fadeIn));
  music.connect(master);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(music);
  src.start();
  musicSrc = src;
}

/** Fade the soundtrack out over `fade` seconds and let it go. */
export function stopSoundtrack(fade = 1.5): void {
  const c = ctx;
  const g = music, src = musicSrc;
  music = null;
  musicSrc = null;
  if (!c || !g || !src) return;
  const now = c.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
  try {
    src.stop(now + Math.max(0.02, fade) + 0.05);
  } catch {
    /* already stopped */
  }
  src.onended = () => g.disconnect();
}

/** The sample rate sounds are made at (48 kHz where the browser allows). */
export const soundRate = (): number => make()?.sampleRate ?? 48_000;
