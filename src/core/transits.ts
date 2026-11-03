/**
 * The Starsigns readout (sp4cetime.store subscription, ADR-0019): the sky now laid over a
 * person's own chart. Where each body is today (sign and degree), which of their houses it
 * is passing through, and the close angles (aspects) it makes to where the bodies were at
 * their moment. Positions are astronomy; houses, aspects and what they mean are astrology,
 * and the readout says so.
 *
 * Pure: returns data and the email's text and HTML.
 */

import { ASTROLOGERS } from './catalog';
import { formatSignDeg, houseLabel, houseOf } from './houses';
import { moonIllumination, moonPhase } from './models';
import type { Reading } from './reading';

export type AspectName = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

/** The five classical aspects (Ptolemy): angle and the orb allowed, degrees. */
export const ASPECTS: ReadonlyArray<{ name: AspectName; angle: number; orb: number }> = [
  { name: 'conjunction', angle: 0, orb: 3 },
  { name: 'sextile', angle: 60, orb: 2 },
  { name: 'square', angle: 90, orb: 3 },
  { name: 'trine', angle: 120, orb: 3 },
  { name: 'opposition', angle: 180, orb: 3 },
];

/** Angle between two longitudes, 0–180°. */
export function separation(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

export interface Aspect {
  readonly now: string;
  readonly natal: string;
  readonly name: AspectName;
  /** How far from exact, degrees. */
  readonly off: number;
}

/** Aspects from today's bodies to the natal bodies (and the Ascendant and Midheaven when the time is known), closest first. */
export function aspectsTo(now: Reading, natal: Reading, natalHasTime = true): Aspect[] {
  const targets = natal.bodies.map((b) => ({ name: b.name, lon: b.lon }));
  if (natalHasTime) targets.push({ name: 'Ascendant', lon: natal.chart.asc }, { name: 'Midheaven', lon: natal.chart.mc });
  const out: Aspect[] = [];
  for (const b of now.bodies) {
    // Today's Moon moves 13° a day: an aspect from it is gone by the time the mail is read.
    if (b.id === 'moon') continue;
    for (const t of targets) {
      const sep = separation(b.lon, t.lon);
      for (const a of ASPECTS) {
        const off = Math.abs(sep - a.angle);
        if (off <= a.orb) out.push({ now: b.name, natal: t.name, name: a.name, off });
      }
    }
  }
  return out.sort((x, y) => x.off - y.off);
}

export interface TransitLine {
  readonly name: string;
  readonly lon: number;
  readonly retrograde: boolean;
  /** The natal house it is passing through (1–12). */
  readonly house: number;
}

export interface Readout {
  readonly lines: readonly TransitLine[];
  readonly aspects: readonly Aspect[];
  /** "Waxing gibbous, 78% lit". */
  readonly moon: string;
}

export function moonPhaseName(phaseRad: number): string {
  const d = ((phaseRad * 180) / Math.PI + 360) % 360;
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.floor(((d + 22.5) % 360) / 45)]!;
}

export function readout(now: Reading, natal: Reading, natalHasTime = true): Readout {
  const lines = now.bodies.map((b) => ({ name: b.name, lon: b.lon, retrograde: b.retrograde, house: houseOf(b.lon, natal.chart.cusps) }));
  const ph = moonPhase(now.time);
  return { lines, aspects: aspectsTo(now, natal, natalHasTime).slice(0, 8), moon: `${moonPhaseName(ph)}, ${Math.round(moonIllumination(ph) * 100)}% lit` };
}

export interface ReadoutEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The readout as an email. `dateText` is today's date as words; `manageUrl` where to stop or change it. */
export function readoutEmail(
  r: Readout,
  o: { dateText: string; whenText: string; placeText: string; names: string; natalHasTime: boolean; manageUrl: string },
): ReadoutEmail {
  const who = o.names ? ` for ${o.names}` : '';
  const subject = `Your Starsigns readout${who}: ${o.dateText}`;
  const rows = r.lines.map((l) => ({
    a: l.name,
    b: `${formatSignDeg(l.lon)}${l.retrograde ? ' Rx' : ''}`,
    c: o.natalHasTime ? `your ${houseLabel(l.house)}` : '',
  }));
  const asp = r.aspects.map((a) => `${a.now} ${a.name} your ${a.natal} (${a.off.toFixed(1)}° from exact)`);
  const notes = [
    'Where the bodies are is astronomy, from sp4cetime’s own ephemeris. Houses, aspects and what they mean are astrology.',
    o.natalHasTime ? '' : 'No birth time was given, so the houses and the angles to your Ascendant are left out.',
  ].filter(Boolean);
  const text = [
    `Starsigns readout${who}, ${o.dateText}`,
    `Your moment: ${o.whenText}, ${o.placeText}`,
    '',
    'The sky today, in your chart:',
    ...rows.map((x) => `  ${x.a.padEnd(9)} ${x.b.padEnd(16)} ${x.c}`),
    '',
    `Moon: ${r.moon}`,
    '',
    asp.length ? 'Close angles to your chart today:' : 'No close angles to your chart today.',
    ...asp.map((x) => `  ${x}`),
    '',
    ...notes,
    '',
    'Astrologers we like (no affiliation):',
    ...ASTROLOGERS.map((a) => `  ${a.name}: ${a.url}`),
    '',
    `Stop or change your readouts: ${o.manageUrl}`,
    'Starsigns by sp4cetime.org',
  ].join('\n');
  const td = 'padding:3px 10px 3px 0;';
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171e;max-width:560px;margin:0 auto;padding:16px">
<h2 style="margin:0 0 4px">Starsigns readout${esc(who)}</h2>
<p style="margin:0 0 14px;color:#5a5f6c">${esc(o.dateText)} · your moment: ${esc(o.whenText)}, ${esc(o.placeText)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map((x) => `<tr><td style="${td}font-weight:600">${esc(x.a)}</td><td style="${td}">${esc(x.b)}</td><td style="${td}color:#5a5f6c">${esc(x.c)}</td></tr>`)
    .join('')}</table>
<p style="margin:12px 0"><b>Moon:</b> ${esc(r.moon)}</p>
${asp.length ? `<p style="margin:12px 0 4px"><b>Close angles to your chart today</b></p><ul style="margin:0;padding-left:18px">${asp.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>No close angles to your chart today.</p>'}
<p style="color:#5a5f6c;font-size:12px">${notes.map(esc).join('<br>')}</p>
<p style="margin:14px 0 4px"><b>Astrologers we like</b> <span style="color:#5a5f6c;font-size:12px">(no affiliation)</span></p>
<ul style="margin:0;padding-left:18px;font-size:13px">${ASTROLOGERS.map((a) => `<li><a href="${esc(a.url)}">${esc(a.name)}</a></li>`).join('')}</ul>
<p style="margin-top:18px;font-size:12px;color:#5a5f6c"><a href="${esc(o.manageUrl)}">Stop or change your readouts</a> · Starsigns by <a href="https://sp4cetime.org">sp4cetime.org</a></p>
</body></html>`;
  return { subject, text, html };
}
