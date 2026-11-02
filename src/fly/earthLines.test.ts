// @ts-expect-error: Node's types are not installed (few dependencies); Vitest runs in Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLines } from './earthLines';

const load = (f: string): ArrayBuffer => {
  const b = readFileSync(`public/textures/${f}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('Earth’s line skin', () => {
  it('puts every coastline and border point on the sphere, in Earth’s frame', () => {
    for (const f of ['earth-coast.bin', 'earth-borders.bin']) {
      const p = parseLines(load(f), 1.001);
      expect(p.length).toBeGreaterThan(6 * 1000);
      for (let i = 0; i < p.length; i += 3) expect(Math.hypot(p[i]!, p[i + 1]!, p[i + 2]!)).toBeCloseTo(1.001, 5);
    }
  });

  it('reads longitude east from x toward y and latitude toward z', () => {
    const buf = new ArrayBuffer(2 + 8);
    const v = new DataView(buf);
    v.setInt16(0, 2, true);
    v.setInt16(2, 0, true); // 0°, 0°
    v.setInt16(4, 0, true);
    v.setInt16(6, Math.round((90 * 32767) / 180), true); // 90° E, 45° N
    v.setInt16(8, Math.round((45 * 32767) / 90), true);
    const p = parseLines(buf, 1);
    expect([p[0], p[1], p[2]].map((x) => +x!.toFixed(4))).toEqual([1, 0, 0]);
    expect(p[3]).toBeCloseTo(0, 3);
    expect(p[4]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(p[5]).toBeCloseTo(Math.SQRT1_2, 3);
  });
});
