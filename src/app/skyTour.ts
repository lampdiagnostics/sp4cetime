/**
 * A Starsigns tour from a sky link (the e-card's QR code, 6 Nov 2026): the same steps as the
 * ✶ Starsigns dialog (local time in the place's zone → UTC, the reading, the path), without it.
 */
import type { Path, PathPoint } from '../core/path';
import { readingAt } from '../core/reading';
import type { SkyLink } from '../core/skyLink';
import { starsignsPath } from '../core/starsigns';
import { fromUnixMs } from '../core/time';
import { localToUtc } from './zones';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function tourFromLink(link: SkyLink, base: PathPoint): { path: Path; whenText: string } | null {
  const d = link.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = (link.time ?? '12:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !tm) return null;
  const local = { year: +d[1]!, month: +d[2]!, day: +d[3]!, hour: +tm[1]!, minute: +tm[2]! };
  const h12 = ((local.hour + 11) % 12) + 1;
  const whenText = `${local.day} ${MONTHS[local.month - 1]} ${local.year}, ${h12}:${String(local.minute).padStart(2, '0')} ${local.hour < 12 ? 'am' : 'pm'}`;
  let utcMs: number, offset = 0;
  if (link.zone) {
    try {
      const r = localToUtc(local, link.zone);
      utcMs = r.utcMs;
      offset = r.offset;
    } catch {
      return null;
    }
  } else utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const reading = readingAt(fromUnixMs(utcMs), link.lat, link.lon, link.system);
  const path = starsignsPath(reading, {
    id: `sky-${link.date}-${link.time ?? 'noon'}-${link.lat}-${link.lon}`,
    created: new Date().toISOString(),
    placeLabel: link.place,
    placeName: link.place,
    whenText,
    system: link.system,
    noTime: link.time === null,
    ...(link.zone ? { zone: offset } : {}),
    look: base.look,
    calendar: base.calendar,
  });
  return { path: { ...path, name: link.heading ? `${link.heading} · ${link.place}` : path.name }, whenText };
}
