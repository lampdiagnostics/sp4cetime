/**
 * A sky link (5 Nov 2026): a short address that opens one Starsigns tour on sp4cetime.org, for
 * the QR code on an e-card's back. It carries only what makes the tour (the local date and time,
 * the place and its time zone, the house system) and an optional heading to greet with; the site
 * rebuilds the path from them, so the link stays short enough for a small, easily scanned code.
 *
 *   https://sp4cetime.org/?sky&d=1990-06-21&t=14:30&lat=49.883&lon=-97.166&z=America/Winnipeg&p=Winnipeg&h=w&n=Happy%2036th%2C%20Sam!
 */
import type { HouseSystem } from './houses';

export const SITE_URL = 'https://sp4cetime.org/';

export interface SkyLink {
  /** Local date, YYYY-MM-DD (astronomical years are not needed: 1800–2200). */
  readonly date: string;
  /** Local time HH:MM, or null when not known (noon is used). */
  readonly time: string | null;
  readonly lat: number;
  readonly lon: number;
  /** IANA time zone, or null (the time is then UTC). */
  readonly zone: string | null;
  /** The place's name, as shown ("Winnipeg"). */
  readonly place: string;
  readonly system: HouseSystem;
  /** A greeting to show on arrival ("Happy 36th, Sam!"), optional. */
  readonly heading?: string;
}

const enc = (s: string): string => encodeURIComponent(s).replace(/%2F/g, '/').replace(/%3A/g, ':');

/** The address for a tour. Coordinates to 3 decimals (about 100 m: far finer than the houses need). */
export function skyLinkUrl(s: SkyLink, base = SITE_URL): string {
  const q = [
    'sky',
    `d=${s.date}`,
    ...(s.time ? [`t=${s.time}`] : []),
    `lat=${s.lat.toFixed(3)}`,
    `lon=${s.lon.toFixed(3)}`,
    ...(s.zone ? [`z=${enc(s.zone)}`] : []),
    `p=${enc(s.place)}`,
    `h=${s.system === 'equal' ? 'e' : 'w'}`,
    ...(s.heading ? [`n=${enc(s.heading.slice(0, 60))}`] : []),
  ];
  return `${base}?${q.join('&')}`;
}

/** Read a sky link from a page's query string (`location.search`); null if it is not one or is malformed. */
export function parseSkyLink(search: string): SkyLink | null {
  const q = new URLSearchParams(search);
  if (!q.has('sky')) return null;
  const date = q.get('d') ?? '';
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || +m[1]! < 1800 || +m[1]! > 2200 || +m[2]! < 1 || +m[2]! > 12 || +m[3]! < 1 || +m[3]! > 31) return null;
  const t = q.get('t');
  const time = t && /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? t.padStart(5, '0') : null;
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const zone = q.get('z');
  const heading = q.get('n')?.trim().slice(0, 60);
  return {
    date,
    time,
    lat,
    lon,
    zone: zone && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone) ? zone : null,
    place: (q.get('p') ?? '').slice(0, 80) || 'this place',
    system: q.get('h') === 'e' ? 'equal' : 'whole',
    ...(heading ? { heading } : {}),
  };
}
