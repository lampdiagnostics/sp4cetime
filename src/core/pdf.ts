/**
 * A small PDF writer: pages of text (the 14 standard fonts' Helvetica and Helvetica-Bold,
 * which every reader has, so nothing is embedded), lines, circles, filled shapes, colours,
 * rotated text and web links. Enough for the Starsigns sheet (0.4.0) without a dependency
 * (CLAUDE.md rule 8). Text is written in WinAnsi (Latin-1 and a few typographic marks);
 * anything else becomes "?", so callers keep to plain letters.
 *
 * Coordinates are PDF points (1/72 inch), origin at the bottom left. Pure: returns bytes.
 */

export type Font = 'regular' | 'bold';
export type RGB = readonly [number, number, number];

/** Advance widths (thousandths of the font size) for codes 32–126 (Adobe's Helvetica metrics). */
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Unicode → WinAnsi byte for the marks Latin-1 lacks. */
const WIN: Record<string, number> = { '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, '€': 0x80 };
const SUBST: Record<string, string> = { '′': "'", '″': '"', '℞': 'Rx', '−': '-', '→': '->', '↑': '^', ' ': ' ', ' ': ' ' };

/** Text as WinAnsi bytes (one char per byte). */
export function winAnsi(s: string): string {
  let out = '';
  for (const ch of s) {
    const sub = SUBST[ch];
    if (sub !== undefined) {
      out += sub;
      continue;
    }
    const w = WIN[ch];
    if (w !== undefined) out += String.fromCharCode(w);
    else {
      const c = ch.codePointAt(0)!;
      out += c >= 32 && c < 256 && !(c >= 127 && c < 160) ? ch : '?';
    }
  }
  return out;
}

/** Width of text in points. */
export function textWidth(s: string, size: number, font: Font = 'regular'): number {
  const t = font === 'bold' ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of winAnsi(s)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? t[c - 32]! : c === 0xb0 ? 400 : c === 0xb7 || c === 0x92 || c === 0x91 ? 278 : 556;
  }
  return (w * size) / 1000;
}

const esc = (s: string): string => s.replace(/[\\()]/g, (m) => `\\${m}`);
const f2 = (x: number): string => (Math.round(x * 100) / 100).toString();
const col = (c: RGB): string => c.map((v) => f2(v)).join(' ');

/** A JPEG to place on a page (its bytes go into the file as they are, DCTDecode). */
export interface PdfJpeg {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export class PdfPage {
  readonly ops: string[] = [];
  readonly images: PdfJpeg[] = [];
  readonly links: Array<{ x0: number; y0: number; x1: number; y1: number; url: string }> = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** Text with its left (or centre, or right) end at x, baseline at y. Returns its width. */
  text(x: number, y: number, s: string, o: { size: number; font?: Font; color?: RGB; align?: 'left' | 'center' | 'right'; angle?: number }): number {
    const w = textWidth(s, o.size, o.font);
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    const a = ((o.angle ?? 0) * Math.PI) / 180;
    const c = Math.cos(a), sn = Math.sin(a);
    const tx = x + dx * c, ty = y + dx * sn;
    this.ops.push(
      `BT /${o.font === 'bold' ? 'F2' : 'F1'} ${f2(o.size)} Tf ${col(o.color ?? [0, 0, 0])} rg ${f2(c)} ${f2(sn)} ${f2(-sn)} ${f2(c)} ${f2(tx)} ${f2(ty)} Tm (${esc(winAnsi(s))}) Tj ET`,
    );
    return w;
  }

  line(x0: number, y0: number, x1: number, y1: number, o: { width?: number; color?: RGB; dash?: readonly number[] } = {}): void {
    this.ops.push(`${col(o.color ?? [0, 0, 0])} RG ${f2(o.width ?? 0.5)} w [${(o.dash ?? []).join(' ')}] 0 d ${f2(x0)} ${f2(y0)} m ${f2(x1)} ${f2(y1)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; width?: number }): void {
    const paint = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
    this.ops.push(`${o.fill ? `${col(o.fill)} rg ` : ''}${o.stroke ? `${col(o.stroke)} RG ${f2(o.width ?? 0.5)} w ` : ''}[] 0 d ${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re ${paint}`);
  }

  circle(cx: number, cy: number, r: number, o: { fill?: RGB; stroke?: RGB; width?: number }): void {
    const k = 0.552_284_75 * r;
    const p = (x: number, y: number): string => `${f2(cx + x)} ${f2(cy + y)}`;
    const path = `${p(r, 0)} m ${p(r, k)} ${p(k, r)} ${p(0, r)} c ${p(-k, r)} ${p(-r, k)} ${p(-r, 0)} c ${p(-r, -k)} ${p(-k, -r)} ${p(0, -r)} c ${p(k, -r)} ${p(r, -k)} ${p(r, 0)} c`;
    const paint = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
    this.ops.push(`${o.fill ? `${col(o.fill)} rg ` : ''}${o.stroke ? `${col(o.stroke)} RG ${f2(o.width ?? 0.5)} w ` : ''}[] 0 d ${path} ${paint}`);
  }

  /** A closed polygon. */
  poly(pts: ReadonlyArray<readonly [number, number]>, o: { fill?: RGB; stroke?: RGB; width?: number }): void {
    if (pts.length < 3) return;
    const path = pts.map(([x, y], i) => `${f2(x)} ${f2(y)} ${i === 0 ? 'm' : 'l'}`).join(' ');
    const paint = o.fill && o.stroke ? 'b' : o.fill ? 'f' : 's';
    this.ops.push(`${o.fill ? `${col(o.fill)} rg ` : ''}${o.stroke ? `${col(o.stroke)} RG ${f2(o.width ?? 0.5)} w ` : ''}[] 0 d ${path} h ${paint}`);
  }

  /** A JPEG drawn into the rectangle x, y (bottom left), w × h points. */
  image(img: PdfJpeg, x: number, y: number, w: number, h: number): void {
    this.images.push(img);
    this.ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(y)} cm /Im${this.images.length} Do Q`);
  }

  /** A clickable web link over a rectangle. */
  link(x0: number, y0: number, x1: number, y1: number, url: string): void {
    this.links.push({ x0, y0, x1, y1, url });
  }
}

export class PdfDoc {
  readonly pages: PdfPage[] = [];
  constructor(readonly info: { title: string; author?: string; subject?: string } = { title: '' }) {}

  addPage(width: number, height: number): PdfPage {
    const p = new PdfPage(width, height);
    this.pages.push(p);
    return p;
  }

  /** The file, as bytes. */
  bytes(): Uint8Array {
    const objs: string[] = [];
    const add = (body: string): number => objs.push(body);
    const catalog = add('');
    const pagesId = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2id = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids: number[] = [];
    for (const p of this.pages) {
      const content = p.ops.join('\n');
      const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const ims = p.images.map((im) => {
        let raw = '';
        for (let i = 0; i < im.data.length; i += 8192) raw += String.fromCharCode(...im.data.subarray(i, i + 8192));
        return add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${raw}\nendstream`);
      });
      const xo = ims.length ? ` /XObject << ${ims.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(' ')} >>` : '';
      const annots = p.links.map((l) =>
        add(`<< /Type /Annot /Subtype /Link /Rect [${[l.x0, l.y0, l.x1, l.y1].map(f2).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${esc(winAnsi(l.url))}) >> >>`),
      );
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(p.width)} ${f2(p.height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2id} 0 R >>${xo} >> /Contents ${cid} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`,
        ),
      );
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(
      `<< /Title (${esc(winAnsi(this.info.title))})${this.info.author ? ` /Author (${esc(winAnsi(this.info.author))})` : ''}${this.info.subject ? ` /Subject (${esc(winAnsi(this.info.subject))})` : ''} /Producer (sp4cetime.org) >>`,
    );
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/** Break text into lines no wider than `width` points (at word boundaries). */
export function wrapText(s: string, width: number, size: number, font: Font = 'regular'): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, font) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
