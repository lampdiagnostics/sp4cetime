import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aacConfig, SILENT_AAC_STEREO, writeMp4 } from './mp4';

/** The boxes in a span: type, start, size. */
function boxes(b: Uint8Array, from = 0, to = b.length): Array<{ type: string; at: number; size: number }> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Array<{ type: string; at: number; size: number }> = [];
  for (let p = from; p < to; ) {
    const size = v.getUint32(p);
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    out.push({ type, at: p, size });
    if (size < 8) break;
    p += size;
  }
  return out;
}
function find(b: Uint8Array, path: string[], from = 0, to = b.length): { at: number; size: number } {
  const [head, ...rest] = path;
  const fullBoxes = ['stsd', 'mvhd', 'tkhd', 'mdhd', 'stts', 'stsz', 'stco', 'stss'];
  const hit = boxes(b, from, to).find((x) => x.type === head);
  if (!hit) throw new Error(`no ${head}`);
  if (rest.length === 0) return hit;
  const inner = hit.at + 8 + (fullBoxes.includes(head!) ? 4 : 0) + (head === 'stsd' ? 4 : 0);
  return find(b, rest, inner, hit.at + hit.size);
}
const u32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset).getUint32(at);

const video = (n: number, keyEvery = 60) => ({
  width: 1920, height: 1080, timescale: 30_000, frameDuration: 1000,
  avcC: new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80]),
  samples: Array.from({ length: n }, (_, i) => ({ data: new Uint8Array([0, 0, 0, 2, i & 255, (i >> 8) & 255]), pts: i * 1000, key: i % keyEvery === 0 })),
});
const audio = (frames: number) => ({ sampleRate: 48_000, channels: 2, asc: aacConfig(48_000, 2), frames: Array.from({ length: frames }, () => SILENT_AAC_STEREO) });

describe('The MP4 writer', () => {
  it('writes ftyp, then the index (moov), then the data: fast start', () => {
    const f = writeMp4(video(90), audio(141));
    expect(boxes(f).map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(boxes(f).reduce((s, x) => s + x.size, 0)).toBe(f.length);
  });

  it('says 30 frames a second, constant, and 3 seconds long', () => {
    const f = writeMp4(video(90), audio(141));
    const mdhd = find(f, ['moov', 'trak', 'mdia', 'mdhd']);
    expect(u32(f, mdhd.at + 20)).toBe(30_000);
    expect(u32(f, mdhd.at + 24)).toBe(90_000);
    const stts = find(f, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stts']);
    expect(u32(f, stts.at + 12)).toBe(1); // one run: every frame the same length
    expect(u32(f, stts.at + 16)).toBe(90);
    expect(u32(f, stts.at + 20)).toBe(1000);
  });

  it('points every sample at its own bytes, video and sound interleaved', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 300 }), (nv, na) => {
        const v = video(nv);
        const f = writeMp4(v, na ? audio(na) : undefined);
        const stco = find(f, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
        expect(u32(f, stco.at + 12)).toBe(nv);
        for (let i = 0; i < nv; i++) {
          const off = u32(f, stco.at + 16 + i * 4);
          expect(f[off + 4]).toBe(i & 255);
          expect(f[off + 5]).toBe((i >> 8) & 255);
        }
      }),
      { numRuns: 25 },
    );
  });

  it('marks the keyframes (a closed group every 2 s)', () => {
    const f = writeMp4(video(150), audio(10));
    const stss = find(f, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stss']);
    expect(u32(f, stss.at + 12)).toBe(3);
    expect([0, 1, 2].map((i) => u32(f, stss.at + 16 + i * 4))).toEqual([1, 61, 121]);
  });

  it('describes AAC-LC stereo at 48 kHz', () => {
    expect([...aacConfig(48_000, 2)]).toEqual([0x11, 0x90]);
    expect([...aacConfig(44_100, 2)]).toEqual([0x12, 0x10]);
  });
});
