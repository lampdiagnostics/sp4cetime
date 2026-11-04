/**
 * Video made for X (0.4.2, ADR-0020): the browser's own encoders (WebCodecs) and our MP4
 * writer (src/core/mp4.ts), so a recording uploads as it is:
 *
 * - H.264 High profile, 4:2:0 (yuv420p), even width and height, at most 1920 × 1080;
 * - constant 30 frames a second: frame n is stamped n/30 s, whatever the screen did (a
 *   slow frame is shown twice, never skipped), a keyframe every 2 s (closed groups);
 * - AAC-LC stereo sound at 48 kHz, 160 kbit/s, always present: what is heard (the field's
 *   crickets) or silence, and silent frames written by us where the browser has no AAC
 *   encoder (Firefox, say);
 * - the index at the front of the file ("fast start").
 *
 * Where WebCodecs is missing, capture.ts falls back to MediaRecorder.
 */
import { aacConfig, SILENT_AAC_STEREO, type VideoSample, writeMp4 } from '../core/mp4';
import { soundRate, soundSamples } from './sound';

export interface XVideo {
  /** Encode the canvas as the next frame (`repeat` times, up to a second: a frame shown again for slots the screen missed). */
  frame(canvas: HTMLCanvasElement, repeat?: number): void;
  /** Frames so far. */
  readonly frames: number;
  /** Finish: the MP4 file, or null if the encoder failed. */
  finish(): Promise<Blob | null>;
  /** Stop without a file. */
  abort(): void;
}

const SR_FALLBACK = 48_000;

/** Is the X-ready encoder there (WebCodecs with H.264)? */
export function canEncodeX(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

async function pickVideoCodec(width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  const big = width * height > 1920 * 1088;
  // High profile, level 4.0 (1080p30) or 5.1 (4K); then Main and Baseline if High is refused.
  const codecs = big ? ['avc1.640033', 'avc1.4d0033'] : ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
  for (const codec of codecs) {
    const cfg: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality', avc: { format: 'avc' } };
    try {
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return cfg;
    } catch {
      /* try the next */
    }
  }
  return null;
}

async function aacSupported(sampleRate: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    const s = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 160_000 });
    return !!s.supported;
  } catch {
    return false;
  }
}

/** Start an X-ready recording `width` × `height` (even) at `fps`; null if this browser cannot. */
export async function startXVideo(width: number, height: number, fps: number): Promise<XVideo | null> {
  if (!canEncodeX()) return null;
  // About 0.2 bits per pixel per frame: 12 Mbit/s at 1080p30 (X allows 25), up to 40 at 4K.
  const bitrate = Math.round(Math.min(40e6, Math.max(4e6, width * height * fps * 0.2)));
  const cfg = await pickVideoCodec(width, height, fps, bitrate);
  if (!cfg) return null;
  const TIMESCALE = fps * 1000;
  const samples: VideoSample[] = [];
  let avcC: Uint8Array | null = null;
  let failed = false;
  const venc = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) avcC = new Uint8Array(d instanceof ArrayBuffer ? d : (d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength));
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, pts: Math.round((chunk.timestamp * TIMESCALE) / 1e6 / 1000) * 1000, key: chunk.type === 'key' });
    },
    error: (e) => {
      failed = true;
      console.warn('Video encoder:', e);
    },
  });
  venc.configure(cfg);

  // Sound: what is heard, encoded as AAC-LC; silence where nothing is heard or AAC is missing.
  const sr = soundRate() || SR_FALLBACK;
  const useAac = await aacSupported(sr);
  const aFrames: Uint8Array[] = [];
  let asc: Uint8Array | null = null;
  let aenc: AudioEncoder | null = null;
  let heard = 0;
  let stopTap: (() => void) | null = null;
  if (useAac) {
    aenc = new AudioEncoder({
      output: (chunk, meta) => {
        const d = meta?.decoderConfig?.description;
        if (d && !asc) asc = new Uint8Array(d instanceof ArrayBuffer ? d : (d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength));
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        aFrames.push(data);
      },
      error: (e) => {
        console.warn('Sound encoder:', e);
        aenc = null;
      },
    });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: 2, bitrate: 160_000 });
  }
  const encodeSound = (l: Float32Array, r: Float32Array): void => {
    if (!aenc || aenc.state !== 'configured') return;
    const planar = new Float32Array(l.length * 2);
    planar.set(l, 0);
    planar.set(r, l.length);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: l.length, numberOfChannels: 2, timestamp: Math.round((heard / sr) * 1e6), data: planar });
    heard += l.length;
    aenc.encode(ad);
    ad.close();
  };

  let n = 0;
  const frameUs = 1e6 / fps;
  const api: XVideo = {
    get frames() {
      return n;
    },
    frame(canvas, repeat = 1) {
      if (failed || venc.state !== 'configured') return;
      if (n === 0 && aenc) stopTap = soundSamples((l, r) => encodeSound(l, r));
      for (let k = 0; k < Math.max(1, Math.min(30, repeat)); k++) {
        const vf = new VideoFrame(canvas, { timestamp: Math.round(n * frameUs), duration: Math.round(frameUs) });
        venc.encode(vf, { keyFrame: n % (fps * 2) === 0 });
        vf.close();
        n++;
      }
    },
    async finish() {
      stopTap?.();
      try {
        await venc.flush();
      } catch {
        failed = true;
      }
      venc.close();
      if (failed || !avcC || samples.length === 0) return null;
      // Sound as long as the picture: what was heard, then silence to the end.
      const seconds = n / fps;
      const need = Math.ceil((seconds * sr) / 1024);
      if (aenc) {
        const live = aenc as AudioEncoder;
        const block = 4096;
        while (heard < need * 1024 + 2048) {
          const z = new Float32Array(block);
          encodeSound(z, z);
        }
        try {
          await live.flush();
        } catch {
          /* keep what came */
        }
        live.close();
      }
      const frames = aFrames.length >= need ? aFrames.slice(0, need) : [...aFrames, ...Array.from({ length: need - aFrames.length }, () => SILENT_AAC_STEREO)];
      // Decode order is the order frames came out; times are frame numbers (constant rate).
      const mp4 = writeMp4(
        { width: cfg.width, height: cfg.height, timescale: TIMESCALE, frameDuration: 1000, avcC, samples },
        { sampleRate: sr, channels: 2, asc: asc ?? aacConfig(sr, 2), frames, avgBitrate: 160_000 },
      );
      return new Blob([mp4 as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
    },
    abort() {
      stopTap?.();
      try {
        venc.close();
        (aenc as AudioEncoder | null)?.close();
      } catch {
        /* closed */
      }
    },
  };
  return api;
}
