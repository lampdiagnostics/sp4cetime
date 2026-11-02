import { describe, expect, it } from 'vitest';
import { PdfDoc, textWidth, winAnsi } from './pdf';
import { readingAt } from './reading';
import { starsignsPdf } from './starsignsPdf';
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
