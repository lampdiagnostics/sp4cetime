/**
 * The files each product makes from a design, in the buyer's browser (ADR-0019). The same
 * code makes the watermarked previews before payment and the clean files after it.
 */

import { calendarPdf } from '../src/core/calendarPdf';
import { type Design, occasionTitle, type ProductId } from '../src/core/catalog';
import { HOUSE_SYSTEMS } from '../src/core/houses';
import { readingAt, type Reading } from '../src/core/reading';
import { screensaverHtml } from '../src/core/screensaver';
import { formatLat, formatLon } from '../src/core/spheres';
import { starsignsCard, starsignsPdf } from '../src/core/starsignsPdf';
import { makeTime, toCivil } from '../src/core/time';
import { artData, type ArtData, drawArt } from '../src/core/wallArt';

const DEG = Math.PI / 180;

export interface MadeFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: Blob;
}

export const natalOf = (d: Design): Reading => readingAt(makeTime(d.day, d.sec), d.lat, d.lon, d.system);

const coords = (d: Design): string => `${formatLat(d.lat * DEG, 0)} · ${formatLon(d.lon * DEG, 0)}`;
const slug = (d: Design): string => {
  const c = toCivil(makeTime(d.day, d.sec));
  const who = d.names.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return `${who ? `${who}-` : ''}${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
};
const whenFull = (d: Design): string => `${d.when}${d.noTime ? ' (no time given: noon)' : ''}`;
const systemName = (d: Design): string => HOUSE_SYSTEMS.find((h) => h.id === d.system)!.name;

export function art(d: Design): ArtData {
  return artData(natalOf(d), { title: occasionTitle(d.occasion), names: d.names, when: d.when, place: d.place, noTime: d.noTime, night: d.style === 'night' });
}

const pdf = (name: string, b: Uint8Array): MadeFile => ({ name, type: 'application/pdf', bytes: new Blob([b as BlobPart], { type: 'application/pdf' }) });

export function cardPdf(d: Design, paper: 'letter' | 'a4', preview: boolean): Uint8Array {
  return starsignsCard(natalOf(d), {
    paper,
    preview,
    sides: 'both',
    whenText: whenFull(d),
    placeLabel: d.place,
    coordsText: coords(d),
    systemName: systemName(d),
    cover: { title: occasionTitle(d.occasion), names: d.names, message: d.message },
  });
}

export function calendarFile(d: Design, preview: boolean): Uint8Array {
  const now = new Date();
  const [y, m] = d.start ? d.start.split('-').map(Number) : [now.getFullYear() + (now.getMonth() >= 10 ? 1 : 0), now.getMonth() >= 10 ? 1 : now.getMonth() + 1];
  const title = d.names ? `${d.names}: a year in the sky` : 'A year in the sky';
  const label = d.names ? `${d.names}${d.occasion === 'birthday' ? '’s birthday' : ''}`.slice(0, 40) : occasionTitle(d.occasion);
  return calendarPdf(natalOf(d), { paper: d.paper, startYear: y!, startMonth: m!, title, names: d.names, whenText: whenFull(d), placeText: d.place, noTime: d.noTime, dayLabel: label, preview });
}

/** A picture of the art at a size, as PNG; with `preview`, a PREVIEW mark across it. */
export async function artPng(d: Design, w: number, h: number, preview = false): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  drawArt(ctx, art(d), w, h, 0);
  if (preview) previewMark(ctx, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png'));
}

export function previewMark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.4);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, w / 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(Math.min(w, h) / 7)}px sans-serif`;
  ctx.fillText('PREVIEW', 0, 0);
  ctx.strokeText('PREVIEW', 0, 0);
  ctx.restore();
}

/** Everything a paid line makes. */
export async function makeFiles(product: ProductId, d: Design): Promise<MadeFile[]> {
  const s = slug(d);
  switch (product) {
    case 'card':
      return [pdf(`starsigns-card-${s}.pdf`, cardPdf(d, d.paper, false))];
    case 'wedding':
      return [
        pdf(`starsigns-wedding-card-letter-${s}.pdf`, cardPdf(d, 'letter', false)),
        pdf(`starsigns-wedding-card-a4-${s}.pdf`, cardPdf(d, 'a4', false)),
        pdf(
          `starsigns-wedding-table-sheet-${s}.pdf`,
          starsignsPdf(natalOf(d), { title: occasionTitle(d.occasion), name: d.names, paper: d.paper, style: d.style, preview: false, whenText: whenFull(d), placeLabel: d.place, coordsText: coords(d), systemName: systemName(d), noTime: d.noTime }),
        ),
      ];
    case 'calendar':
      return [pdf(`sky-calendar-${s}.pdf`, calendarFile(d, false))];
    case 'screensaver': {
      const html = screensaverHtml(art(d));
      const out: MadeFile[] = [{ name: `starsigns-screensaver-${s}.html`, type: 'text/html', bytes: new Blob([html], { type: 'text/html' }) }];
      for (const [w, h] of [
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ] as const)
        out.push({ name: `starsigns-desktop-${w}x${h}-${s}.png`, type: 'image/png', bytes: await artPng(d, w, h) });
      return out;
    }
    case 'phone': {
      const out: MadeFile[] = [];
      for (const [w, h, n] of [
        [1290, 2796, 'iphone'],
        [1080, 2400, 'android'],
      ] as const)
        out.push({ name: `starsigns-phone-${n}-${s}.png`, type: 'image/png', bytes: await artPng(d, w, h) });
      return out;
    }
  }
}

export function save(f: MadeFile): void {
  const url = URL.createObjectURL(f.bytes);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function openPdf(b: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([b as BlobPart], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
