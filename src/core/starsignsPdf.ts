/**
 * The Starsigns sheet (0.4.0, ADR-0018): one printable page with the moment and place,
 * a chart wheel (the zodiac, the 12 houses, every body at its longitude), the table of
 * signs, degrees and houses, what is astronomy and what is astrology, and links to read
 * more. Customisable: title, a name, Letter or A4, paper or night colours. The free
 * preview carries a PREVIEW mark across it. Pure: returns the PDF's bytes.
 */

import { formatSignDeg, houseLabel, houseOf } from './houses';
import { PdfDoc, type PdfPage, type RGB, wrapText } from './pdf';
import type { Reading } from './reading';

export interface SheetOptions {
  readonly title: string;
  readonly name?: string;
  readonly paper: 'letter' | 'a4';
  readonly style: 'paper' | 'night';
  readonly preview: boolean;
  /** "14 July 1985, 3:20 pm (UTC−5)". */
  readonly whenText: string;
  readonly placeLabel: string;
  /** "49°52′59″ N · 97°09′58″ W". */
  readonly coordsText: string;
  readonly systemName: string;
  readonly noTime?: boolean;
}

/** Where to read more (free); a partner's text can be added here, credited. */
export const READ_MORE: ReadonlyArray<{ label: string; url: string }> = [
  { label: 'Astrodienst (astro.com): free horoscopes and chart notes', url: 'https://www.astro.com/' },
  { label: 'Cafe Astrology: the signs, planets and houses explained', url: 'https://cafeastrology.com/' },
];

const SIGN_ABBR = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
const BODY_ABBR: Record<string, string> = { sun: 'Sun', moon: 'Moon', mercury: 'Mer', venus: 'Ven', mars: 'Mar', jupiter: 'Jup', saturn: 'Sat', uranus: 'Ura', neptune: 'Nep', pluto: 'Plu' };

export function starsignsPdf(r: Reading, o: SheetOptions): Uint8Array {
  const [W, H] = o.paper === 'a4' ? [595.28, 841.89] : [612, 792];
  const night = o.style === 'night';
  const ink: RGB = night ? [0.92, 0.93, 0.97] : [0.08, 0.09, 0.12];
  const dim: RGB = night ? [0.62, 0.66, 0.76] : [0.38, 0.4, 0.46];
  const faint: RGB = night ? [0.3, 0.33, 0.42] : [0.82, 0.83, 0.86];
  const accent: RGB = night ? [0.96, 0.72, 0.36] : [0.72, 0.42, 0.05];
  const doc = new PdfDoc({ title: `${o.title}${o.name ? ` · ${o.name}` : ''}`, author: 'sp4cetime.org', subject: 'Starsigns' });
  const p = doc.addPage(W, H);
  if (night) p.rect(0, 0, W, H, { fill: [0.03, 0.04, 0.08] });
  // The preview mark goes under everything, so the sheet stays readable.
  if (o.preview) {
    for (const k of [0.32, 0.62]) p.text(W / 2, H * k, 'PREVIEW  ·  sp4cetime.shop', { size: 44, font: 'bold', color: night ? [0.2, 0.17, 0.11] : [0.93, 0.9, 0.85], align: 'center', angle: 30 });
  }
  const M = 48;
  let y = H - M - 10;

  // Heading.
  p.text(M, y, o.title, { size: 26, font: 'bold', color: ink });
  p.text(W - M, y + 6, 'sp4cetime.org', { size: 9, color: accent, align: 'right' });
  y -= 22;
  if (o.name) {
    p.text(M, y, o.name, { size: 15, color: accent });
    y -= 20;
  }
  p.text(M, y, o.whenText, { size: 11, color: ink });
  y -= 15;
  p.text(M, y, `${o.placeLabel}  ·  ${o.coordsText}`, { size: 10, color: dim });
  y -= 14;
  if (!o.noTime) p.text(M, y, `Houses: ${o.systemName}  ·  Ascendant ${formatSignDeg(r.chart.asc)}  ·  Midheaven ${formatSignDeg(r.chart.mc)}`, { size: 10, color: dim });
  else p.text(M, y, 'No birth time: signs only (the Moon may be in the next or previous sign).', { size: 10, color: dim });
  y -= 18;

  // The wheel: the Ascendant on the left, the zodiac running counter-clockwise.
  // Letter is shorter than A4: a smaller wheel keeps everything on one page.
  const R = Math.min(o.paper === 'a4' ? 150 : 124, (W - 2 * M) / 2 - 20);
  const cx = W / 2, cy = y - R - 14;
  const zero = o.noTime ? 0 : r.chart.asc;
  const at = (lon: number, rad: number): [number, number] => {
    const a = ((180 + lon - zero) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  wheel(p, r, o, { cx, cy, R, at, ink, dim, faint, accent });
  y = cy - R - 30;

  // The table.
  const cols = o.noTime ? [M, M + 130, M + 290] : [M, M + 130, M + 290, M + 360];
  const head = o.noTime ? ['Body', 'Sign', ''] : ['Body', 'Sign and degree', 'House', ''];
  head.forEach((h, i) => p.text(cols[i]!, y, h.toUpperCase(), { size: 8, font: 'bold', color: dim }));
  y -= 6;
  p.line(M, y, W - M, y, { color: faint });
  y -= 13;
  const row = (name: string, lon: number, house: number | null, rx: boolean, strong: boolean): void => {
    p.text(cols[0]!, y, name, { size: 10.5, font: 'bold', color: strong ? accent : ink });
    p.text(cols[1]!, y, formatSignDeg(lon), { size: 10.5, color: strong ? accent : ink });
    if (house !== null) p.text(cols[2]!, y, String(house), { size: 10.5, color: strong ? accent : ink });
    if (rx) p.text(cols[o.noTime ? 2 : 3]!, y, 'retrograde', { size: 9, color: dim });
    y -= 15;
  };
  for (const b of r.bodies) row(b.name, b.lon, o.noTime ? null : b.house, b.retrograde, false);
  if (!o.noTime) {
    row('Ascendant', r.chart.asc, 1, false, true);
    row('Midheaven (MC)', r.chart.mc, houseOf(r.chart.mc, r.chart.cusps), false, true);
  }
  y -= 6;
  p.line(M, y, W - M, y, { color: faint });
  y -= 16;

  // Honest notes, then where to read more.
  const notes = [
    'Positions are astronomy: where the Sun, the Moon and the planets were, seen from Earth’s centre, from the app’s ephemeris.',
    'Signs are tropical, counted from the equinox of that date; they sit about 24° from the constellations of the same names.',
    'Houses and their meanings are astrology. Retrograde is how a planet seems to move from Earth, not a real reversal.',
  ];
  for (const n of notes) {
    p.text(M, y, n, { size: 8.5, color: dim });
    y -= 12;
  }
  y -= 8;
  p.text(M, y, 'Read about your signs and houses (free):', { size: 9.5, font: 'bold', color: ink });
  y -= 14;
  for (const l of READ_MORE) {
    const w = p.text(M + 10, y, l.label, { size: 9.5, color: accent });
    p.link(M + 10, y - 3, M + 10 + w, y + 10, l.url);
    y -= 13;
  }

  p.text(W / 2, M - 18, `Made with Starsigns at sp4cetime.org  ·  ${r.tier === 'ephemeris' ? 'real positions' : 'modelled positions'}`, { size: 8, color: dim, align: 'center' });
  p.link(W / 2 - 120, M - 22, W / 2 + 120, M - 8, 'https://sp4cetime.org');

  return doc.bytes();
}

function wheel(
  p: PdfPage,
  r: Reading,
  o: SheetOptions,
  g: { cx: number; cy: number; R: number; at: (lon: number, rad: number) => [number, number]; ink: RGB; dim: RGB; faint: RGB; accent: RGB },
): void {
  const { cx, cy, R, at } = g;
  const rSign = R, rSignIn = R * 0.84, rHouse = R * 0.42;
  p.circle(cx, cy, rSign, { stroke: g.ink, width: 0.8 });
  p.circle(cx, cy, rSignIn, { stroke: g.dim, width: 0.5 });
  p.circle(cx, cy, rHouse, { stroke: g.faint, width: 0.5 });
  // The twelve signs.
  for (let k = 0; k < 12; k++) {
    const [x0, y0] = at(k * 30, rSignIn), [x1, y1] = at(k * 30, rSign);
    p.line(x0, y0, x1, y1, { color: g.dim, width: 0.5 });
    const [tx, ty] = at(k * 30 + 15, (rSign + rSignIn) / 2);
    p.text(tx, ty - 3, SIGN_ABBR[k]!, { size: 8, font: 'bold', color: g.dim, align: 'center' });
  }
  // The houses: lines from the inner circle to the zodiac ring, numbered.
  if (!o.noTime) {
    r.chart.cusps.forEach((c, i) => {
      const [x0, y0] = at(c, rHouse), [x1, y1] = at(c, rSignIn);
      p.line(x0, y0, x1, y1, { color: i % 3 === 0 ? g.accent : g.faint, width: i % 3 === 0 ? 1 : 0.5 });
      const [tx, ty] = at(c + 15, rHouse - 10);
      p.text(tx, ty - 3, String(i + 1), { size: 7.5, color: g.dim, align: 'center' });
    });
    // The horizon (Ascendant–Descendant) and meridian (MC–IC).
    const [ax, ay] = at(r.chart.asc, rSign + 6), [dx, dy] = at(r.chart.asc + 180, rSign + 6);
    p.line(ax, ay, dx, dy, { color: g.accent, width: 0.6, dash: [3, 2] });
    p.text(ax - 4, ay - 3, 'ASC', { size: 7.5, font: 'bold', color: g.accent, align: 'right' });
    const [mx, my] = at(r.chart.mc, rSign + 6), [ix, iy] = at(r.chart.mc + 180, rSign + 6);
    p.line(mx, my, ix, iy, { color: g.accent, width: 0.6, dash: [3, 2] });
    p.text(mx, my + 3, 'MC', { size: 7.5, font: 'bold', color: g.accent, align: 'center' });
  }
  // The bodies, spread a little where they crowd, each with a tick at its true place.
  const sorted = [...r.bodies].sort((a, b) => a.lon - b.lon);
  const shown: number[] = [];
  for (const b of sorted) {
    let lon = b.lon;
    for (const s of shown) if (Math.abs(((lon - s + 540) % 360) - 180) < 11) lon = s + 11;
    shown.push(lon);
    const [x0, y0] = at(b.lon, rSignIn), [x1, y1] = at(b.lon, rSignIn - 6);
    p.line(x0, y0, x1, y1, { color: g.ink, width: 0.9 });
    const [dx, dy] = at(lon, rSignIn - 14);
    p.circle(dx, dy, 2, { fill: b.id === 'sun' || b.id === 'moon' ? g.accent : g.ink });
    const [tx, ty] = at(lon, rSignIn - 27);
    p.text(tx, ty - 3, BODY_ABBR[b.id] ?? b.name, { size: 7.5, color: g.ink, align: 'center' });
  }
}

export interface CardOptions {
  /** Letter: a 5 × 7 in card (folded from 10 × 7 in); A4: an A6 card (folded from A5). */
  readonly paper: 'letter' | 'a4';
  readonly preview: boolean;
  readonly whenText: string;
  readonly placeLabel: string;
  readonly coordsText: string;
  readonly systemName: string;
}

/**
 * The Starsigns birthday card (0.4.0): two pages to print on both sides (flip on the short
 * edge) and fold in half. Outside: the front cover (right half: title, the wheel as art,
 * the moment and place) and the back (left half: where it came from). Inside, in landscape:
 * the wheel on the left, every body's sign and house (by name) on the right, honest notes
 * and where to read more. Crop marks show the card's edge; a dashed line the fold.
 * Personalised versions (a name, artwork) are made on sp4cetime.shop.
 */
export function starsignsCard(r: Reading, o: CardOptions): Uint8Array {
  const letter = o.paper === 'letter';
  const [PW, PH] = letter ? [792, 612] : [841.89, 595.28];
  const [CW, CH] = letter ? [720, 504] : [595.28, 419.53];
  const x0 = (PW - CW) / 2, y0 = (PH - CH) / 2;
  const k = CW / 720; // sizes scale with the card
  const half = CW / 2;
  const ink: RGB = [0.08, 0.09, 0.12], dim: RGB = [0.38, 0.4, 0.46], faint: RGB = [0.8, 0.81, 0.85], accent: RGB = [0.72, 0.42, 0.05];
  const doc = new PdfDoc({ title: 'Starsigns', author: 'sp4cetime.org', subject: `Starsigns card · ${o.whenText}` });
  const marks = (p: PdfPage): void => {
    const L = 14, g = 4;
    for (const [x, y] of [[x0, y0], [x0 + CW, y0], [x0, y0 + CH], [x0 + CW, y0 + CH]] as const) {
      const sx = x === x0 ? -1 : 1, sy = y === y0 ? -1 : 1;
      p.line(x + sx * g, y, x + sx * (g + L), y, { color: dim, width: 0.4 });
      p.line(x, y + sy * g, x, y + sy * (g + L), { color: dim, width: 0.4 });
    }
    // The fold, marked outside the card (top and bottom) and lightly across it.
    p.line(x0 + half, y0 + CH + 4, x0 + half, y0 + CH + 18, { color: dim, width: 0.4 });
    p.line(x0 + half, y0 - 4, x0 + half, y0 - 18, { color: dim, width: 0.4 });
    p.line(x0 + half, y0, x0 + half, y0 + CH, { color: faint, width: 0.3, dash: [2, 3] });
    if (o.preview) p.text(x0 + CW / 2, y0 + CH * 0.42, 'PREVIEW  ·  sp4cetime.shop', { size: 40 * k, font: 'bold', color: [0.93, 0.9, 0.85], align: 'center', angle: 24 });
  };
  const sheet: SheetOptions = { title: 'Starsigns', paper: o.paper, style: 'paper', preview: false, whenText: o.whenText, placeLabel: o.placeLabel, coordsText: o.coordsText, systemName: o.systemName };
  const wheelAt = (p: PdfPage, cx: number, cy: number, R: number, plain: boolean): void => {
    const at = (lon: number, rad: number): [number, number] => {
      const a = ((180 + lon - r.chart.asc) * Math.PI) / 180;
      return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    };
    wheel(p, r, { ...sheet, noTime: plain }, { cx, cy, R, at, ink, dim, faint, accent });
  };

  // Outside: the back (left half), then the front cover (right half).
  const out = doc.addPage(PW, PH);
  marks(out);
  out.text(x0 + half / 2, y0 + 40 * k, 'Starsigns by sp4cetime.org', { size: 9 * k, color: dim, align: 'center' });
  out.text(x0 + half / 2, y0 + 28 * k, 'Positions are astronomy · houses are astrology', { size: 7.5 * k, color: dim, align: 'center' });
  out.link(x0 + half / 2 - 60 * k, y0 + 36 * k, x0 + half / 2 + 60 * k, y0 + 50 * k, 'https://sp4cetime.org');
  const fx = x0 + half + half / 2;
  out.text(fx, y0 + CH - 70 * k, 'Starsigns', { size: 34 * k, font: 'bold', color: ink, align: 'center' });
  out.text(fx, y0 + CH - 92 * k, 'the sky at your moment', { size: 11 * k, color: accent, align: 'center' });
  wheelAt(out, fx, y0 + CH / 2 - 12 * k, 112 * k, true);
  out.text(fx, y0 + 66 * k, o.whenText, { size: 10.5 * k, color: ink, align: 'center' });
  out.text(fx, y0 + 50 * k, o.placeLabel, { size: 9.5 * k, color: dim, align: 'center' });

  // Inside: the wheel (left), the table (right).
  const ins = doc.addPage(PW, PH);
  marks(ins);
  const lx = x0 + half / 2;
  ins.text(x0 + 24 * k, y0 + CH - 34 * k, 'Your sky', { size: 15 * k, font: 'bold', color: ink });
  ins.text(x0 + 24 * k, y0 + CH - 50 * k, `${o.whenText}`, { size: 8.5 * k, color: dim });
  ins.text(x0 + 24 * k, y0 + CH - 62 * k, `${o.placeLabel} · ${o.coordsText}`, { size: 8.5 * k, color: dim });
  wheelAt(ins, lx, y0 + CH / 2 - 26 * k, 138 * k, false);
  ins.text(lx, y0 + 26 * k, `Houses: ${o.systemName} · Ascendant ${formatSignDeg(r.chart.asc)} · Midheaven ${formatSignDeg(r.chart.mc)}`, { size: 7.5 * k, color: dim, align: 'center' });

  const rx = x0 + half + 24 * k, rw = half - 48 * k;
  let y = y0 + CH - 36 * k;
  const cols = [rx, rx + 92 * k, rx + 186 * k];
  ['Body', 'Sign', 'House'].forEach((h, i) => ins.text(cols[i]!, y, h.toUpperCase(), { size: 7 * k, font: 'bold', color: dim }));
  y -= 5 * k;
  ins.line(rx, y, rx + rw, y, { color: faint });
  y -= 13 * k;
  const row = (name: string, lon: number, house: number, rx2: boolean, strong: boolean): void => {
    const c = strong ? accent : ink;
    ins.text(cols[0]!, y, name, { size: 9.5 * k, font: 'bold', color: c });
    ins.text(cols[1]!, y, `${formatSignDeg(lon)}${rx2 ? '  Rx' : ''}`, { size: 9.5 * k, color: c });
    ins.text(cols[2]!, y, houseLabel(house), { size: 9 * k, color: c });
    y -= 14 * k;
  };
  for (const b of r.bodies) row(b.name, b.lon, b.house, b.retrograde, false);
  row('Ascendant', r.chart.asc, 1, false, true);
  row('Midheaven', r.chart.mc, houseOf(r.chart.mc, r.chart.cusps), false, true);
  y -= 2 * k;
  ins.line(rx, y, rx + rw, y, { color: faint });
  y -= 12 * k;
  const notes = [
    'Where the Sun, the Moon and the planets were, seen from Earth’s centre (astronomy). Signs are counted from the equinox of that date; Rx: retrograde, how a planet seems to move from Earth.',
    'The houses and what they stand for are astrology: twelve parts of the sky around this place at this moment.',
  ];
  for (const n of notes) {
    for (const line of wrapText(n, rw, 7.5 * k)) {
      ins.text(rx, y, line, { size: 7.5 * k, color: dim });
      y -= 10 * k;
    }
    y -= 3 * k;
  }
  y -= 4 * k;
  ins.text(rx, y, 'Read about your signs and houses (free):', { size: 8 * k, font: 'bold', color: ink });
  y -= 12 * k;
  for (const l of READ_MORE) {
    const w = ins.text(rx + 6 * k, y, l.label, { size: 7.5 * k, color: accent });
    ins.link(rx + 6 * k, y - 3, rx + 6 * k + w, y + 9 * k, l.url);
    y -= 11 * k;
  }
  return doc.bytes();
}
