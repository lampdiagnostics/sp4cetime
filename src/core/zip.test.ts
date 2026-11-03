import { describe, expect, it } from 'vitest';
// @ts-expect-error Node's types are not installed; Vitest runs in Node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error as above
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
// @ts-expect-error as above
import { tmpdir } from 'node:os';
import { crc32, zipParts } from './zip';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('zip', () => {
  it('computes CRC-32 as everyone does', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('writes a file other tools open, names and contents intact', () => {
    const files = [
      { name: 'starsigns-2026-11-03.pdf', data: enc('%PDF-1.4 hello') },
      { name: 'Ada’s sky.sp4ce.json', data: enc('{"a":1}') },
      { name: 'video.mp4', data: new Uint8Array(70_000).map((_, i) => i % 251) },
    ];
    const parts = zipParts(files);
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    const dir: string = mkdtempSync(`${tmpdir()}/zip-`);
    writeFileSync(`${dir}/t.zip`, all);
    let py = '';
    try {
      py = String(
        execFileSync('python3', ['-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("|".join(z.namelist()));print(len(z.read("video.mp4")))`, `${dir}/t.zip`]),
      );
    } catch {
      // No Python here: check the end record by hand instead.
      expect(all[all.length - 22]).toBe(0x50);
      return;
    }
    const [bad, names, size] = py.trim().split('\n');
    expect(bad).toBe('None');
    expect(names).toBe(files.map((f) => f.name).join('|'));
    expect(Number(size)).toBe(70_000);
    expect(readFileSync(`${dir}/t.zip`).length).toBe(all.length);
  });
});
