/**
 * The sky calendar (sp4cetime.store, ADR-0019): a cover with the buyer's chart wheel, then
 * twelve month pages. Each day shows the Moon's phase (drawn) and sign at noon GMT; the
 * days the planets change sign or turn; the buyer's own day marked every year. Landscape
 * Letter or A4, to print at home. Pure: returns the PDF's bytes.
 */

import { almanacMonth, daysInMonth, SIGN_SHORT, weekday } from './almanac';
import { PdfDoc, type PdfPage, type RGB, textWidth, wrapText } from './pdf';
import type { Reading } from './reading';
import { drawWheel } from './starsignsPdf';
import { toCivil } from './time';

export interface CalendarOptions {
  readonly paper: 'letter' | 'a4';
  readonly startYear: number;
  /** 1–12. */
  readonly startMonth: number;
  /** "Ada's year in the sky". */
  readonly title: string;
  readonly names: string;
  readonly whenText: string;
  readonly placeText: string;
  readonly noTime: boolean;
  /** The label on the buyer's day each year ("Ada's birthday"). */
  readonly dayLabel: string;
  /** A PREVIEW mark and only the cover and the first month. */
  readonly preview: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ink: RGB = [0.08, 0.09, 0.12], dim: RGB = [0.38, 0.4, 0.46], faint: RGB = [0.82, 0.83, 0.87], accent: RGB = [0.72, 0.42, 0.05], wash: RGB = [0.99, 0.95, 0.88];

/** The lit part of the Moon's disc as a polygon (lit on the right while waxing, as from the northern hemisphere). */
export function moonLitPolygon(cx: number, cy: number, r: number, phase: number): Array<[number, number]> {
  const k = Math.cos(phase);
  const waxing = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < Math.PI;
  const s = waxing ? 1 : -1;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    pts.push([cx + s * r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 24; i >= 0; i--) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    pts.push([cx + s * k * r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function moonIcon(p: PdfPage, cx: number, cy: number, r: number, phase: number): void {
  p.circle(cx, cy, r, { fill: [0.3, 0.32, 0.38] });
  p.poly(moonLitPolygon(cx, cy, r, phase), { fill: [1, 1, 1] });
  p.circle(cx, cy, r, { stroke: dim, width: 0.4 });
}

export function calendarPdf(natal: Reading, o: CalendarOptions): Uint8Array {
  const [W, H] = o.paper === 'a4' ? [841.89, 595.28] : [792, 612];
  const M = 36;
  const doc = new PdfDoc({ title: o.title, author: 'sp4cetime.store', subject: 'Sky calendar' });
  const mark = (p: PdfPage): void => {
    if (o.preview) p.text(W / 2, H * 0.42, 'PREVIEW  ·  sp4cetime.store', { size: 46, font: 'bold', color: [0.93, 0.9, 0.85], align: 'center', angle: 22 });
  };

  // Cover.
  const c = doc.addPage(W, H);
  let ts = 34;
  while (ts > 16 && textWidth(o.title, ts, 'bold') > W - 2 * M) ts -= 1;
  c.text(W / 2, H - 70, o.title, { size: ts, font: 'bold', color: ink, align: 'center' });
  const last = ((o.startMonth + 10) % 12) + 1;
  const lastYear = o.startYear + (o.startMonth === 1 ? 0 : 1);
  c.text(W / 2, H - 94, `${MONTHS[o.startMonth - 1]} ${o.startYear} to ${MONTHS[last - 1]} ${lastYear}`, { size: 12, color: accent, align: 'center' });
  drawWheel(c, natal, W / 2, H / 2 - 18, 165, o.noTime);
  c.text(W / 2, 62, `${o.names ? `${o.names} · ` : ''}${o.whenText}`, { size: 10.5, color: ink, align: 'center' });
  c.text(W / 2, 46, o.placeText, { size: 9.5, color: dim, align: 'center' });
  c.text(W / 2, 24, 'Made at sp4cetime.store · positions are astronomy, houses are astrology', { size: 7.5, color: dim, align: 'center' });
  mark(c);

  const birth = toCivil(natal.time);
  const months = o.preview ? 1 : 12;
  for (let i = 0; i < months; i++) {
    const m0 = o.startMonth - 1 + i;
    const year = o.startYear + Math.floor(m0 / 12), month = (m0 % 12) + 1;
    const days = almanacMonth(year, month);
    const p = doc.addPage(W, H);
    p.text(M, H - 46, `${MONTHS[month - 1]} ${year}`, { size: 24, font: 'bold', color: ink });
    p.text(W - M, H - 44, o.title, { size: 9, color: dim, align: 'right' });
    const top = H - 64, bottom = 46;
    const first = weekday(year, month, 1);
    const rows = Math.ceil((first + daysInMonth(year, month)) / 7);
    const cw = (W - 2 * M) / 7, ch = (top - 16 - bottom) / rows;
    WEEK.forEach((d, k) => p.text(M + k * cw + cw / 2, top - 11, d.toUpperCase(), { size: 7.5, font: 'bold', color: dim, align: 'center' }));
    const gy = top - 16;
    for (const d of days) {
      const idx = first + d.day - 1;
      const x = M + (idx % 7) * cw, y = gy - Math.floor(idx / 7) * ch - ch;
      const mine = d.day === birth.day && month === birth.month;
      p.rect(x, y, cw, ch, mine ? { fill: wash, stroke: accent, width: 1 } : { stroke: faint, width: 0.5 });
      p.text(x + 5, y + ch - 13, String(d.day), { size: 11, font: 'bold', color: ink });
      moonIcon(p, x + cw - 11, y + ch - 10, 5, d.phase);
      p.text(x + cw - 19, y + ch - 13, SIGN_SHORT[d.moonSign]!, { size: 6.5, color: dim, align: 'right' });
      let ly = y + ch - 25;
      const lines: Array<{ s: string; c: RGB; b?: boolean }> = [];
      if (mine && o.dayLabel) lines.push({ s: o.dayLabel, c: accent, b: true });
      if (d.mainPhase) lines.push({ s: d.mainPhase, c: ink, b: true });
      for (const e of d.events) lines.push({ s: e, c: ink });
      for (const l of lines) {
        for (const w of wrapText(l.s, cw - 8, 6.5, l.b ? 'bold' : 'regular')) {
          if (ly < y + 3) break;
          p.text(x + 4, ly, w, { size: 6.5, font: l.b ? 'bold' : 'regular', color: l.c });
          ly -= 8;
        }
      }
    }
    p.text(M, 26, 'Moon: phase and sign at 12:00 GMT (Ari Aries · Tau Taurus · Gem Gemini · Can Cancer · Leo · Vir Virgo · Lib Libra · Sco Scorpio · Sag Sagittarius · Cap Capricorn · Aqu Aquarius · Pis Pisces).', { size: 6.5, color: dim });
    p.text(M, 17, 'Changes of sign and turns are dated by the GMT day. Signs from the equinox of date. Made at sp4cetime.store.', { size: 6.5, color: dim });
    mark(p);
  }
  return doc.bytes();
}
