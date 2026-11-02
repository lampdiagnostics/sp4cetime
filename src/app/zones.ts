/**
 * A birth time is local ("3:20 pm in Winnipeg"); the sky needs UTC. The browser's time
 * zone database (Intl, IANA zones with their history, daylight saving included) turns one
 * into the other. This is the edge where `Date` is allowed (CLAUDE.md rule 3): it only
 * reads a calendar date and clock time, it never carries model time.
 */

/** Minutes the zone's clocks were ahead of UTC at this instant (e.g. −300 for Winnipeg in summer). */
export function zoneOffsetMinutes(zone: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    era: 'short',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  let year = Number(p.year);
  if (p.era === 'BC' || p.era === 'B') year = 1 - year;
  const d = new Date(0);
  d.setUTCFullYear(year, Number(p.month) - 1, Number(p.day));
  d.setUTCHours(Number(p.hour), Number(p.minute), Number(p.second), 0);
  return Math.round((d.getTime() - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

export interface LocalTime {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second?: number;
}

export interface ZonedResult {
  readonly utcMs: number;
  /** The zone's offset used, minutes ahead of UTC. */
  readonly offset: number;
  /** "gap": that clock time never happened (clocks jumped forward), taken as if before the jump; "twice": it happened twice (clocks went back), the first is taken. */
  readonly note?: 'gap' | 'twice';
}

/** A local clock time in a zone → the instant (UTC milliseconds). */
export function localToUtc(t: LocalTime, zone: string): ZonedResult {
  const d = new Date(0);
  d.setUTCFullYear(t.year, t.month - 1, t.day);
  d.setUTCHours(t.hour, t.minute, Math.floor(t.second ?? 0), Math.round(((t.second ?? 0) % 1) * 1000));
  const wall = d.getTime();
  // Two candidates, with the offsets either side of any change near this time.
  const o1 = zoneOffsetMinutes(zone, wall - 36 * 3_600_000);
  const o2 = zoneOffsetMinutes(zone, wall + 36 * 3_600_000);
  const fits = (o: number): boolean => zoneOffsetMinutes(zone, wall - o * 60_000) === o;
  const a = fits(o1), b = fits(o2);
  if (a && b && o1 !== o2) return { utcMs: wall - Math.max(o1, o2) * 60_000, offset: Math.max(o1, o2), note: 'twice' };
  if (a) return { utcMs: wall - o1 * 60_000, offset: o1 };
  if (b) return { utcMs: wall - o2 * 60_000, offset: o2 };
  // Neither fits: the clocks skipped this time. Use the offset from before the jump.
  return { utcMs: wall - o1 * 60_000, offset: o1, note: 'gap' };
}

/** "UTC−5", "UTC+5:30". */
export function formatOffset(minutes: number): string {
  const s = minutes < 0 ? '−' : '+';
  const a = Math.abs(minutes);
  return `UTC${s}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}
