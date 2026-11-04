import { describe, expect, it } from 'vitest';
import { PdfDoc, textWidth, winAnsi, wrapText } from './pdf';
import { readingAt } from './reading';
import { starsignsCard, starsignsFramePdf, starsignsPdf } from './starsignsPdf';
import { fromCivil } from './time';

const asText = (b: Uint8Array): string => Array.from(b, (c) => String.fromCharCode(c)).join('');

/** Every xref entry points at the start of its object, and startxref at the xref table. */
function checkXref(s: string): number {
  const start = Number(s.match(/startxref\n(\d+)\n%%EOF/)![1]);
  expect(s.slice(start, start + 4)).toBe('xref');
  const n = Number(s.slice(start).match(/xref\n0 (\d+)/)![1]);
  const entries = s.slice(start).split('\n').slice(3, 2 + n);
  entries.forEach((e, i) => {
    const off = Number(e.slice(0, 10));
    expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
  });
  return n - 1;
}

describe('The PDF writer', () => {
  it('writes a valid file: header, objects at their offsets, stream lengths', () => {
    const d = new PdfDoc({ title: 'Test (1)' });
    const p = d.addPage(612, 792);
    p.text(72, 700, 'Hello (world) \\ 14° Leo · café — ok', { size: 12 });
    p.line(72, 690, 300, 690);
    p.circle(200, 400, 50, { stroke: [0, 0, 0] });
    p.link(72, 680, 200, 710, 'https://sp4cetime.org');
    const s = asText(d.bytes());
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(checkXref(s)).toBeGreaterThan(5);
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const at = m.index! + m[0].length;
      expect(s.slice(at + Number(m[1]), at + Number(m[1]) + 10)).toBe('\nendstream');
    }
    expect(s).toContain('(Hello \\(world\\) \\\\ 14° Leo · café \u0097 ok) Tj');
    expect(s).toContain('/URI (https://sp4cetime.org)');
  });

  it('keeps to WinAnsi and measures Helvetica', () => {
    expect(winAnsi('♋ Cancer ℞')).toBe('? Cancer Rx');
    expect(winAnsi('it’s')).toBe('it\u0092s');
    expect(textWidth('Hello', 10)).toBeCloseTo((722 + 556 + 222 + 222 + 556) / 100, 6);
    expect(textWidth('Hello', 10, 'bold')).toBeGreaterThan(textWidth('Hello', 10));
  });
});

describe('The Starsigns sheet', () => {
  const r = readingAt(fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60), 49.883, -97.166, 'whole');
  const base = { title: 'Starsigns', name: 'Alex', whenText: '14 July 1985, 3:20 pm (UTC-5)', placeLabel: 'Winnipeg, Manitoba, Canada', coordsText: '49°52′59″ N · 97°09′58″ W', systemName: 'Whole Sign' };

  it('lists every body with its sign, degree and house, on one page, with the reading links', () => {
    const s = asText(starsignsPdf(r, { ...base, paper: 'letter', style: 'paper', preview: false }));
    checkXref(s);
    expect(s).toContain('/Count 1');
    expect(s).toContain('(22° Cancer) Tj');
    expect(s).toContain('(6° Scorpio) Tj');
    expect(s).toContain('/URI (https://www.astro.com/)');
    expect(s).not.toContain('PREVIEW');
    expect(s).toContain('/MediaBox [0 0 612 792]');
  });

  it('marks the preview, and makes A4 and night versions', () => {
    const s = asText(starsignsPdf(r, { ...base, paper: 'a4', style: 'night', preview: true }));
    checkXref(s);
    expect(s).toContain('PREVIEW');
    expect(s).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});

describe('The Starsigns card', () => {
  const r = readingAt(fromCivil(1985, 7, 14, 20 * 3600 + 20 * 60), 49.883, -97.166, 'whole');
  const o = { whenText: '14 July 1985, 3:20 pm', placeLabel: 'Winnipeg, Manitoba, Canada', coordsText: '49°52′59″ N · 97°09′58″ W', systemName: 'Whole Sign' };
  it('is two landscape pages (outside, inside) with houses by name', () => {
    const s = asText(starsignsCard(r, { ...o, paper: 'letter', preview: false }));
    checkXref(s);
    expect(s).toContain('/Count 2');
    expect(s).toContain('/MediaBox [0 0 792 612]');
    expect(s).toContain('(9 · Travel and learning) Tj');
    expect(s).not.toContain('PREVIEW');
  });
  it('makes the free one-sided card: the inside only, one page, no mark', () => {
    const s = asText(starsignsCard(r, { ...o, paper: 'letter', preview: false, sides: 'inside' }));
    checkXref(s);
    expect(s).toContain('/Count 1');
    expect(s).toContain('(Your sky) Tj');
    expect(s).not.toContain('(the sky at your moment) Tj');
    expect(s).not.toContain('PREVIEW');
  });
  it('makes an A6 card on A4, marked when a preview', () => {
    const s = asText(starsignsCard(r, { ...o, paper: 'a4', preview: true }));
    checkXref(s);
    expect(s).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(s).toContain('PREVIEW');
  });
  it('wraps text to a width', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(60);
  });
});

describe('Images and the tour’s frame PDF (0.4.5)', () => {
  // A tiny stand-in for JPEG bytes (the writer copies them as they are).
  const jpeg = { data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x80, 0x0a, 0xff, 0xd9]), width: 1920, height: 1080 };
  it('embeds a JPEG byte for byte, with its length, and draws it', () => {
    const d = new PdfDoc({ title: 'img' });
    const p = d.addPage(792, 445.5);
    p.image(jpeg, 0, 0, 792, 445.5);
    const s = asText(d.bytes());
    checkXref(s);
    expect(s).toContain('/Subtype /Image /Width 1920 /Height 1080');
    expect(s).toContain('/Filter /DCTDecode /Length 10 >>');
    expect(s).toContain(`stream\n${asText(jpeg.data)}\nendstream`);
    expect(s).toContain('/XObject << /Im1 ');
    expect(s).toContain('q 792 0 0 445.5 0 0 cm /Im1 Do Q');
  });
  it('makes one page the shape of the frame, the text around the wheel by house names', () => {
    const r = readingAt(fromCivil(1985, 7, 15, 4 * 3600 + 30 * 60), 49.883, -97.166, 'whole');
    const s = asText(starsignsFramePdf(r, { frame: jpeg, dark: true, whenText: '14 July 1985, 11:30 pm (UTC−5)', placeLabel: 'Winnipeg, Manitoba, Canada', coordsText: '49°52′59″ N · 97°09′58″ W', systemName: 'Whole Sign' }));
    checkXref(s);
    expect(s).toContain('/MediaBox [0 0 792 445.5]');
    expect(s).toContain('(The houses)');
    expect(s).toContain('Partnership');
    expect(s).toMatch(/\(house \d+ \xb7 [A-Z]/);
    // Light text on the dark frame.
    expect(s).toMatch(/0\.95 0\.94 0\.9 rg/);
    const light = asText(starsignsFramePdf(r, { frame: jpeg, dark: false, whenText: 'x', placeLabel: 'y', coordsText: 'z', systemName: 'Whole Sign' }));
    expect(light).toMatch(/0\.08 0\.09 0\.12 rg/);
    // Without a chart: the frame alone.
    expect(asText(starsignsFramePdf(null, { frame: jpeg, dark: true, whenText: '', placeLabel: '', coordsText: '', systemName: '' }))).not.toContain('The houses');
  });
});
