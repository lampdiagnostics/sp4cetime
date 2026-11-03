/**
 * Places for the Starsigns dialog (0.4.0): find a town by name and take it at its centre
 * ("Winnipeg" is the middle of Winnipeg), or read latitude and longitude typed in degrees,
 * minutes and seconds or decimals. Data: public/places.json (Natural Earth populated
 * places, public domain; scripts/build_places.py), with each town's time zone.
 *
 * Pure: no DOM, no fetch (the app loads the file and passes it in).
 */

export interface Place {
  readonly name: string;
  readonly region: string;
  readonly country: string;
  /** Degrees, north +. */
  readonly lat: number;
  /** Degrees, east +. */
  readonly lon: number;
  /** IANA time zone, e.g. "America/Winnipeg". */
  readonly zone: string;
  readonly population: number;
}

interface PlacesFile {
  readonly zones: readonly string[];
  readonly countries: Readonly<Record<string, string>>;
  readonly places: ReadonlyArray<readonly [string, string, string, number, number, number, number]>;
}

/** Read public/places.json (anything malformed is skipped, never thrown). */
export function parsePlaces(json: unknown): Place[] {
  const f = json as Partial<PlacesFile> | null;
  if (!f || !Array.isArray(f.places) || !Array.isArray(f.zones)) return [];
  const countries = f.countries ?? {};
  const out: Place[] = [];
  for (const r of f.places) {
    if (!Array.isArray(r) || r.length < 7) continue;
    const [name, region, cc, lat, lon, zi, pop] = r;
    const zone = f.zones[zi];
    if (typeof name !== 'string' || typeof lat !== 'number' || typeof lon !== 'number' || !zone) continue;
    out.push({ name, region: String(region ?? ''), country: countries[cc] ?? String(cc ?? ''), lat, lon, zone, population: Number(pop) || 0 });
  }
  return out;
}

/** Lower case, accents dropped, punctuation as spaces: "Montréal" and "montreal" match. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Winnipeg, Manitoba, Canada". */
export function placeLabel(p: Place): string {
  return [p.name, p.region && p.region !== p.name ? p.region : '', p.country].filter(Boolean).join(', ');
}

/**
 * Towns matching what was typed, best first: the name starting with it (larger towns
 * first), then a word of the name, then the name containing it; a comma narrows by region or country
 * ("Paris, Texas"). Ties go to the larger town.
 */
export function searchPlaces(places: readonly Place[], query: string, limit = 8): Place[] {
  const [head = '', ...rest] = query.split(',');
  const q = fold(head);
  const where = rest.map(fold).filter(Boolean);
  if (!q) return [];
  const scored: Array<{ p: Place; s: number }> = [];
  for (const p of places) {
    const n = fold(p.name);
    let s = -1;
    // An exact name and a name starting with what was typed rank together, larger towns
    // first (typing "San" offers Santiago and San Francisco before a village called San).
    if (n.startsWith(q)) s = 3;
    else if (n.split(' ').some((w) => w.startsWith(q))) s = 2;
    else if (n.includes(q)) s = 1;
    if (s < 0) continue;
    if (where.length > 0) {
      const r = fold(`${p.region} ${p.country}`);
      if (!where.every((w) => r.includes(w))) continue;
    }
    scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s || b.p.population - a.p.population);
  return scored.slice(0, limit).map((x) => x.p);
}

/**
 * Latitude and longitude as typed: "49.883, -97.166", "49°52′59″N 97°09′58″W",
 * "49 52 59 N, 97 9 58 W", "N49.883 W97.166". Returns null if it is not a place.
 * Seconds can have fractions (to fractions of a second, as the design asks).
 */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const t = text.trim().toUpperCase().replace(/[′’']/g, "'").replace(/[″”"]/g, '"');
  if (!t) return null;
  // Split into the two halves: at a comma, or after the first N/S.
  let parts = t.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) {
    const m = /^[NS]/.test(t) ? t.match(/^([NS][^EW]*?)\s*([EW].*)$/) : t.match(/^(.*?[NS])\s*(.+)$/);
    parts = m ? [m[1]!.trim(), m[2]!.trim()] : t.split(/\s+/).length === 2 ? t.split(/\s+/) : [];
  }
  if (parts.length !== 2) return null;
  const one = (s: string, pos: string, neg: string, max: number): number | null => {
    let sign = 1;
    let body = s;
    const hemi = body.match(/[NSEW]/g);
    if (hemi) {
      if (hemi.length > 1 || (hemi[0] !== pos && hemi[0] !== neg)) return null;
      if (hemi[0] === neg) sign = -1;
      body = body.replace(/[NSEW]/, ' ');
    }
    const nums = body.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length > 3) return null;
    const [d, m = '0', sec = '0'] = nums;
    const deg = Number(d), min = Number(m), s2 = Number(sec);
    if (min < 0 || min >= 60 || s2 < 0 || s2 >= 60 || (nums.length > 1 && !Number.isInteger(deg))) return null;
    if (deg < 0) {
      if (hemi) return null;
      sign = -sign;
    }
    const v = sign * (Math.abs(deg) + min / 60 + s2 / 3600);
    return Math.abs(v) <= max ? v : null;
  };
  const lat = one(parts[0]!, 'N', 'S', 90);
  const lon = one(parts[1]!, 'E', 'W', 180);
  return lat === null || lon === null ? null : { lat, lon };
}

/** Angle between two places, degrees (great circle). */
export function arcDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const s = Math.sin(aLat * r) * Math.sin(bLat * r) + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.cos((aLon - bLon) * r);
  return Math.acos(Math.max(-1, Math.min(1, s))) / r;
}

/** The town nearest to a latitude and longitude, and how far it is (km), or null if the list is empty. */
export function nearestPlace(places: readonly Place[], lat: number, lon: number): { place: Place; km: number } | null {
  let best: Place | null = null;
  let bd = Infinity;
  for (const p of places) {
    // A cheap box test first: most towns are far away.
    if (Math.abs(p.lat - lat) > Math.min(bd, 30)) continue;
    const d = arcDeg(lat, lon, p.lat, p.lon);
    if (d < bd) (bd = d), (best = p);
  }
  return best ? { place: best, km: (bd * Math.PI * 6371) / 180 } : null;
}

/** A sensible starting place for a device: the largest town in its time zone (e.g. America/Winnipeg → Winnipeg). */
export function placeForZone(places: readonly Place[], zone: string): Place | null {
  let best: Place | null = null;
  for (const p of places) if (p.zone === zone && (!best || p.population > best.population)) best = p;
  return best;
}

/**
 * One coordinate as typed in its own box: "49.883", "-97.166", "49°52′59″N", "97 9 58 W".
 * A hemisphere letter must fit the box (N/S for latitude, E/W for longitude). Null if not valid.
 */
export function parseCoordinate(text: string, kind: 'lat' | 'lon'): number | null {
  const t = text.trim().toUpperCase().replace(/[′’']/g, ' ').replace(/[″”"°]/g, ' ');
  if (!t) return null;
  const [pos, neg, max] = kind === 'lat' ? ['N', 'S', 90] : ['E', 'W', 180];
  const hemi = t.match(/[A-Z]/g);
  let sign = 1;
  if (hemi) {
    if (hemi.length > 1 || (hemi[0] !== pos && hemi[0] !== neg)) return null;
    if (hemi[0] === neg) sign = -1;
  }
  const nums = t.replace(/[A-Z]/g, ' ').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length > 3) return null;
  const [d, m = '0', s = '0'] = nums;
  const deg = Number(d), min = Number(m), sec = Number(s);
  if (min < 0 || min >= 60 || sec < 0 || sec >= 60 || (nums.length > 1 && !Number.isInteger(deg))) return null;
  if (deg < 0) {
    if (hemi) return null;
    sign = -sign;
  }
  const v = sign * (Math.abs(deg) + min / 60 + sec / 3600);
  return Math.abs(v) <= max ? v : null;
}
