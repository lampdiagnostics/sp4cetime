import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { alignmentPositions, dataCodewords, formatBits, qrEncode, qrSvg, rawDataModules, rsDivisor, rsRemainder, versionBits } from './qr';
import { parseSkyLink, skyLinkUrl } from './skyLink';

describe('QR codes', () => {
  it('know the standard capacities (level M, bytes)', () => {
    // ISO 18004 table 7: data codewords at level M for versions 1, 2, 5, 10, 20 (669 holds 666 bytes after the mode and count).
    expect([1, 2, 5, 10, 20].map(dataCodewords)).toEqual([16, 28, 86, 216, 669]);
    expect(rawDataModules(1)).toBe(208);
  });

  it('place alignment patterns as the standard lists them', () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(14)).toEqual([6, 26, 46, 66]);
  });

  it('write the known format and version bits', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010'); // M, mask 0
    expect(formatBits(4).toString(2).padStart(15, '0')).toBe('100010111111001'); // M, mask 4
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
  });

  it('compute Reed–Solomon check bytes (the standard worked example, version 1-M "01234567")', () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  it('draw the three finder patterns, the timing lines and the dark module', () => {
    const q = qrEncode('https://sp4cetime.org/');
    const at = (x: number, y: number): boolean => q.modules[y]![x]!;
    for (const [ox, oy] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]] as const) {
      for (let k = 0; k < 7; k++) {
        expect(at(ox + k, oy)).toBe(true);
        expect(at(ox, oy + k)).toBe(true);
      }
      expect(at(ox + 1, oy + 1)).toBe(false);
      expect(at(ox + 3, oy + 3)).toBe(true);
    }
    for (let i = 8; i < q.size - 8; i++) expect(at(i, 6)).toBe(i % 2 === 0);
    expect(at(8, q.size - 8)).toBe(true);
  });

  it('pick the smallest version that fits, up to 20', () => {
    expect(qrEncode('x'.repeat(14)).version).toBe(1);
    expect(qrEncode('x'.repeat(15)).version).toBe(2);
    expect(() => qrEncode('x'.repeat(700))).toThrow();
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const q = qrEncode(s);
        expect(q.size).toBe(17 + 4 * q.version);
        expect(q.modules).toHaveLength(q.size);
      }),
      { numRuns: 40 },
    );
  });

  it('give an SVG with a quiet zone', () => {
    const q = qrEncode('hi');
    expect(qrSvg(q)).toContain(`viewBox="0 0 ${q.size + 8} ${q.size + 8}"`);
  });
});

describe('Sky links', () => {
  const s = { date: '1990-06-21', time: '14:30', lat: 49.88333, lon: -97.16667, zone: 'America/Winnipeg', place: 'Winnipeg', system: 'whole' as const, heading: 'Happy 36th, Sam!' };

  it('round-trip, coordinates to 3 decimals', () => {
    const url = skyLinkUrl(s);
    expect(url.startsWith('https://sp4cetime.org/?sky&d=1990-06-21&t=14:30')).toBe(true);
    const back = parseSkyLink(new URL(url).search)!;
    expect(back).toEqual({ ...s, lat: 49.883, lon: -97.167 });
  });

  it('stay short enough for a small QR code', () => {
    const url = skyLinkUrl({ ...s, place: 'Saint-Jean-sur-Richelieu', zone: 'America/Argentina/Buenos_Aires' });
    expect(url.length).toBeLessThan(200);
    expect(qrEncode(url).version).toBeLessThanOrEqual(9);
  });

  it('refuse what is not a sky link, or is broken', () => {
    expect(parseSkyLink('?gift')).toBeNull();
    expect(parseSkyLink('?sky&d=1990-13-01&lat=1&lon=1')).toBeNull();
    expect(parseSkyLink('?sky&d=1700-01-01&lat=1&lon=1')).toBeNull();
    expect(parseSkyLink('?sky&d=1990-01-01&lat=95&lon=1')).toBeNull();
    const noTime = parseSkyLink('?sky&d=1990-01-01&lat=1&lon=2&z=<script>');
    expect(noTime).toMatchObject({ time: null, zone: null, place: 'this place', system: 'whole' });
  });
});

describe('The e-card', () => {
  it('holds the message safely, the QR code, and nothing fetched from elsewhere', async () => {
    const { ecardHtml, skyRows } = await import('./ecard');
    const { readingAt } = await import('./reading');
    const { fromUnixMs } = await import('./time');
    const r = readingAt(fromUnixMs(Date.UTC(1990, 5, 21, 19, 30)), 49.883, -97.167, 'whole');
    const html = ecardHtml({ heading: 'Happy <36th>, Sam!', message: 'Love & "hugs"', whenText: '21 June 1990, 2:30 pm', placeText: 'Winnipeg', front: null, starMap: 'data:image/jpeg;base64,AAAA', link: 'https://sp4cetime.org/?sky&d=1990-06-21', reading: r, systemName: 'Whole Sign' });
    expect(html).toContain('Happy &lt;36th&gt;, Sam!');
    expect(html).toContain('Love &amp; &quot;hugs&quot;');
    expect(html).not.toContain('<36th>');
    expect(html.match(/<svg[^>]*shape-rendering="crispEdges"/g)).toHaveLength(2); // the QR, on screen and in print
    expect(html).not.toMatch(/(src|href)="https?:/); // self-contained
    expect(html).toContain('size:11in 8.5in');
    expect(skyRows(r)).toHaveLength(12);
  });
});
