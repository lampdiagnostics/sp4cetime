/**
 * A small ZIP writer (stored, no compression: PDFs and videos are compressed already), for
 * the Starsigns package (owner, 3 Nov 2026: the PDF, the video and the path token in one
 * download). No dependency (CLAUDE.md rule 8). Pure: returns the file's parts in order, to
 * join into a Blob without copying a large video again.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (the one ZIP and PNG use). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/** The ZIP file as parts (headers and the files' own bytes), in order. Names are UTF-8. */
export function zipParts(entries: readonly ZipEntry[], when = { year: 2026, month: 1, day: 1, hour: 0, minute: 0 }): Uint8Array[] {
  const time = (when.hour << 11) | (when.minute << 5);
  const date = ((Math.max(1980, when.year) - 1980) << 9) | (when.month << 5) | when.day;
  const parts: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    // Local file header; flag 0x0800: the name is UTF-8.
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...name]);
    parts.push(local, e.data);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
    offset += local.length + size;
  }
  const dir = new Uint8Array(central);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(dir.length), ...u32(offset), ...u16(0)]);
  parts.push(dir, end);
  return parts;
}
