/**
 * A small MP4 writer (0.4.2, no dependency, like pdf.ts): H.264 video and AAC-LC sound,
 * already encoded (by the browser's WebCodecs), packed into one file that X and every
 * player accept: ISO base media, the index (moov) before the data ("fast start", so it
 * plays while it downloads), constant frame rate, one keyframe-led group after another.
 * Each sample is its own chunk, interleaved by time. Files up to 4 GB (32-bit offsets).
 */

export interface VideoSample {
  readonly data: Uint8Array;
  /** Presentation time, in the track's timescale. */
  readonly pts: number;
  readonly key: boolean;
}

export interface VideoTrack {
  readonly width: number;
  readonly height: number;
  /** Units per second (e.g. 30 000 for 30 frames a second at 1 000 a frame). */
  readonly timescale: number;
  /** Every frame lasts this long (constant frame rate). */
  readonly frameDuration: number;
  /** The AVCDecoderConfigurationRecord (WebCodecs' decoderConfig.description). */
  readonly avcC: Uint8Array;
  /** In decode order. */
  readonly samples: readonly VideoSample[];
}

export interface AudioTrack {
  readonly sampleRate: number;
  readonly channels: number;
  /** The AudioSpecificConfig (2 bytes for AAC-LC). */
  readonly asc: Uint8Array;
  /** Raw AAC frames (no ADTS headers), 1 024 samples each. */
  readonly frames: readonly Uint8Array[];
  readonly avgBitrate?: number;
}

/** AudioSpecificConfig for AAC-LC at a sample rate and channel count. */
export function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const fi = rates.indexOf(sampleRate);
  if (fi < 0) throw new Error(`AAC: unsupported sample rate ${sampleRate}`);
  // 5 bits object type (2, LC), 4 bits frequency index, 4 bits channels, 3 bits zero.
  const v = (2 << 11) | (fi << 7) | (channels << 3);
  return new Uint8Array([v >> 8, v & 255]);
}

/**
 * One silent AAC-LC frame (stereo, any rate: a channel pair with no spectral data), so a
 * recording always has a sound track even where the browser cannot encode AAC.
 */
export const SILENT_AAC_STEREO = new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]);

// --- Writing boxes ---------------------------------------------------------------

class Out {
  private parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array): this {
    this.parts.push(b);
    this.length += b.length;
    return this;
  }
  u8(x: number): this {
    return this.push(new Uint8Array([x & 255]));
  }
  u16(x: number): this {
    return this.push(new Uint8Array([(x >> 8) & 255, x & 255]));
  }
  u32(x: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, x >>> 0);
    return this.push(b);
  }
  i32(x: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, x | 0);
    return this.push(b);
  }
  text(s: string): this {
    return this.push(new Uint8Array([...s].map((c) => c.charCodeAt(0) & 255)));
  }
  zeros(n: number): this {
    return this.push(new Uint8Array(n));
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

const cat = (...parts: Uint8Array[]): Uint8Array => {
  const o = new Out();
  for (const p of parts) o.push(p);
  return o.bytes();
};

function box(type: string, ...body: Uint8Array[]): Uint8Array {
  const size = 8 + body.reduce((s, b) => s + b.length, 0);
  return cat(new Out().u32(size).text(type).bytes(), ...body);
}
function full(type: string, version: number, flags: number, ...body: Uint8Array[]): Uint8Array {
  return box(type, new Out().u8(version).u8(flags >> 16).u16(flags & 0xffff).bytes(), ...body);
}
const MATRIX = (): Uint8Array => {
  const o = new Out();
  for (const v of [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]) o.u32(v);
  return o.bytes();
};

/** Runs of equal values: [count, value] … */
function runs(values: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

interface TrackTables {
  readonly sizes: readonly number[];
  readonly offsets: readonly number[];
  readonly deltas: readonly number[];
}

function sampleTables(t: TrackTables, extra: Uint8Array[]): Uint8Array[] {
  const stts = new Out().u32(0);
  const r = runs(t.deltas);
  stts.u32(r.length);
  for (const [c, v] of r) stts.u32(c).u32(v);
  // One entry: from chunk 1, one sample per chunk, description 1.
  const stsc = new Out().u32(1).u32(1).u32(1).u32(1);
  const stsz = new Out().u32(0).u32(t.sizes.length);
  for (const s of t.sizes) stsz.u32(s);
  const stco = new Out().u32(t.offsets.length);
  for (const o of t.offsets) stco.u32(o);
  return [
    box('stts', stts.bytes()),
    ...extra,
    full('stsc', 0, 0, stsc.bytes()),
    full('stsz', 0, 0, stsz.bytes()),
    full('stco', 0, 0, stco.bytes()),
  ];
}

function tkhd(id: number, duration: number, w: number, h: number, audio: boolean): Uint8Array {
  const o = new Out().u32(0).u32(0).u32(id).u32(0).u32(duration).zeros(8).u16(0).u16(audio ? 1 : 0).u16(audio ? 0x0100 : 0).u16(0);
  o.push(MATRIX()).u32(w << 16).u32(h << 16);
  return full('tkhd', 0, 3, o.bytes());
}
function mdhd(timescale: number, duration: number): Uint8Array {
  return full('mdhd', 0, 0, new Out().u32(0).u32(0).u32(timescale).u32(duration).u16(0x55c4).u16(0).bytes());
}
function hdlr(kind: 'vide' | 'soun', name: string): Uint8Array {
  return full('hdlr', 0, 0, new Out().u32(0).text(kind).zeros(12).text(`${name}\0`).bytes());
}
const dinf = (): Uint8Array => box('dinf', full('dref', 0, 0, new Out().u32(1).bytes(), full('url ', 0, 1)));

/** A descriptor (esds): tag, length (one byte, or four for long ones), body. */
function desc(tag: number, body: Uint8Array): Uint8Array {
  const n = body.length;
  const head = n < 128 ? new Out().u8(tag).u8(n) : new Out().u8(tag).u8(0x80 | ((n >> 21) & 127)).u8(0x80 | ((n >> 14) & 127)).u8(0x80 | ((n >> 7) & 127)).u8(n & 127);
  return cat(head.bytes(), body);
}

/** The whole file: ftyp, moov, then mdat with every sample, video and sound interleaved by time. */
export function writeMp4(v: VideoTrack, a?: AudioTrack): Uint8Array {
  if (v.samples.length === 0) throw new Error('MP4: no video frames');
  // Decode times: one frame after another (constant rate). Presentation times as given.
  const vDts = v.samples.map((_, i) => i * v.frameDuration);
  const vOff = v.samples.map((s, i) => s.pts - vDts[i]!);
  const reordered = vOff.some((x) => x !== 0);
  const vDur = v.samples.length * v.frameDuration;
  const aFrames = a?.frames ?? [];
  const aDur = aFrames.length * 1024;

  // The order in mdat: by decode time in seconds.
  type Item = { track: 0 | 1; i: number; t: number; data: Uint8Array };
  const items: Item[] = [
    ...v.samples.map((s, i): Item => ({ track: 0, i, t: vDts[i]! / v.timescale, data: s.data })),
    ...aFrames.map((d, i): Item => ({ track: 1, i, t: (i * 1024) / (a?.sampleRate ?? 1), data: d })),
  ].sort((x, y) => x.t - y.t || x.track - y.track);
  const dataSize = items.reduce((s, x) => s + x.data.length, 0);
  if (dataSize > 0xffffffff - 1e6) throw new Error('MP4: too large (over 4 GB)');

  const ftyp = box('ftyp', new Out().text('isom').u32(0x200).text('isom').text('iso2').text('avc1').text('mp41').bytes());

  const moovWith = (vOffsets: number[], aOffsets: number[]): Uint8Array => {
    const movieDur = Math.round(Math.max(vDur / v.timescale, a ? aDur / a.sampleRate : 0) * 1000);
    const mvhd = full(
      'mvhd', 0, 0,
      new Out().u32(0).u32(0).u32(1000).u32(movieDur).u32(0x00010000).u16(0x0100).zeros(10).push(MATRIX()).zeros(24).u32(a ? 3 : 2).bytes(),
    );
    // Video.
    const avc1 = box(
      'avc1',
      new Out()
        .zeros(6).u16(1).u16(0).u16(0).zeros(12)
        .u16(v.width).u16(v.height).u32(0x00480000).u32(0x00480000).u32(0).u16(1)
        .zeros(32).u16(0x0018).u16(0xffff)
        .bytes(),
      box('avcC', v.avcC),
      box('pasp', new Out().u32(1).u32(1).bytes()),
    );
    const vExtra: Uint8Array[] = [];
    const keys = v.samples.map((s, i) => (s.key ? i + 1 : 0)).filter((x) => x > 0);
    if (keys.length < v.samples.length) {
      const o = new Out().u32(keys.length);
      for (const k of keys) o.u32(k);
      vExtra.push(full('stss', 0, 0, o.bytes()));
    }
    if (reordered) {
      const neg = vOff.some((x) => x < 0);
      const r = runs(vOff);
      const o = new Out().u32(r.length);
      for (const [c, x] of r) o.u32(c).i32(x);
      vExtra.unshift(full('ctts', neg ? 1 : 0, 0, o.bytes()));
    }
    const vStbl = box(
      'stbl',
      full('stsd', 0, 0, new Out().u32(1).bytes(), avc1),
      ...sampleTables({ sizes: v.samples.map((s) => s.data.length), offsets: vOffsets, deltas: v.samples.map(() => v.frameDuration) }, vExtra),
    );
    const vTrak = box(
      'trak',
      tkhd(1, Math.round((vDur / v.timescale) * 1000), v.width, v.height, false),
      box('mdia', mdhd(v.timescale, vDur), hdlr('vide', 'sp4cetime video'), box('minf', full('vmhd', 0, 1, new Out().zeros(8).bytes()), dinf(), vStbl)),
    );
    if (!a) return box('moov', mvhd, vTrak);
    // Sound.
    const bitrate = a.avgBitrate ?? 160_000;
    const dcd = desc(
      4,
      cat(new Out().u8(0x40).u8(0x15).u8(0).u16(0).u32(bitrate).u32(bitrate).bytes(), desc(5, a.asc)),
    );
    const esds = full('esds', 0, 0, desc(3, cat(new Out().u16(2).u8(0).bytes(), dcd, desc(6, new Uint8Array([2])))));
    const mp4a = box(
      'mp4a',
      new Out().zeros(6).u16(1).zeros(8).u16(a.channels).u16(16).u16(0).u16(0).u32((a.sampleRate << 16) >>> 0).bytes(),
      esds,
    );
    const aStbl = box(
      'stbl',
      full('stsd', 0, 0, new Out().u32(1).bytes(), mp4a),
      ...sampleTables({ sizes: aFrames.map((d) => d.length), offsets: aOffsets, deltas: aFrames.map(() => 1024) }, []),
    );
    const aTrak = box(
      'trak',
      tkhd(2, Math.round((aDur / a.sampleRate) * 1000), 0, 0, true),
      box('mdia', mdhd(a.sampleRate, aDur), hdlr('soun', 'sp4cetime sound'), box('minf', full('smhd', 0, 0, new Out().u32(0).bytes()), dinf(), aStbl)),
    );
    return box('moov', mvhd, vTrak, aTrak);
  };

  // Twice: once to learn the index's size, then with the real offsets (the size does not change).
  const zeroV = v.samples.map(() => 0), zeroA = aFrames.map(() => 0);
  const size0 = moovWith(zeroV, zeroA).length;
  let at = ftyp.length + size0 + 8;
  const vOffsets = [...zeroV], aOffsets = [...zeroA];
  for (const it of items) {
    if (it.track === 0) vOffsets[it.i] = at;
    else aOffsets[it.i] = at;
    at += it.data.length;
  }
  const moov = moovWith(vOffsets, aOffsets);
  const mdatHead = new Out().u32(8 + dataSize).text('mdat').bytes();
  return cat(ftyp, moov, mdatHead, ...items.map((x) => x.data));
}
