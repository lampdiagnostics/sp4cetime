/**
 * The sky calendar's data (sp4cetime.store, ADR-0019): for each day of a month, the Moon's
 * phase and sign at noon GMT, the four main phases, and the days a planet enters a new sign
 * or stands still and turns (a station: retrograde or direct, as seen from Earth).
 *
 * Days are GMT days (00:00–24:00 UTC). Pure.
 */

import { signOf } from './houses';
import { moonPhase } from './models';
import { longitudes } from './reading';
import { fromCivil, type Time } from './time';
import type { BodyId } from './bodies';

export interface AlmanacDay {
  readonly day: number;
  /** Phase angle at noon GMT, radians (0 new, π full). */
  readonly phase: number;
  /** The Moon's sign at noon (0 Aries … 11 Pisces). */
  readonly moonSign: number;
  /** "Full Moon" etc. if one of the four main phases falls in this GMT day. */
  readonly mainPhase: string | null;
  /** "Mars enters Leo", "Mercury turns retrograde". */
  readonly events: readonly string[];
}

const NAMES: Record<string, string> = { sun: 'Sun', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };
const EVENT_BODIES = Object.keys(NAMES) as BodyId[];
const SIGN_NAMES = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

export function daysInMonth(year: number, month: number): number {
  return fromCivil(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1).day - fromCivil(year, month, 1).day;
}

/** 0 = Sunday. */
export function weekday(year: number, month: number, day: number): number {
  // 2000-01-01 (day 0) was a Saturday.
  return (((fromCivil(year, month, day).day + 6) % 7) + 7) % 7;
}

const wrap = (d: number): number => ((((d % 360) + 540) % 360) - 180);

/** The phase crossing (0, 90, 180, 270°) between two angles, if any. */
function crossing(a: number, b: number): number | null {
  const da = (((a * 180) / Math.PI) % 360 + 360) % 360;
  const db = (((b * 180) / Math.PI) % 360 + 360) % 360;
  for (const q of [0, 90, 180, 270]) {
    // Forward distance from a to q is within the forward step from a to b.
    const step = (db - da + 360) % 360;
    const toQ = (q - da + 360) % 360;
    if (toQ > 0 && toQ <= step) return q;
  }
  return null;
}

const PHASE_NAMES: Record<number, string> = { 0: 'New Moon', 90: 'First quarter', 180: 'Full Moon', 270: 'Last quarter' };

export function almanacMonth(year: number, month: number): AlmanacDay[] {
  const n = daysInMonth(year, month);
  const at = (d: number, sec: number): Time => fromCivil(year, month, d, sec);
  // Longitudes at each midnight (n + 2 midnights: the day before the first, for speeds).
  const mid: Array<Map<BodyId, number>> = [];
  for (let d = 0; d <= n + 1; d++) mid.push(longitudes(at(d, 0)));
  const out: AlmanacDay[] = [];
  for (let d = 1; d <= n; d++) {
    const noon = at(d, 43_200);
    const phase = moonPhase(noon);
    const lonNow = longitudes(noon);
    const q = crossing(moonPhase(at(d, 0)), moonPhase(at(d + 1, 0)));
    const events: string[] = [];
    const a = mid[d]!, b = mid[d + 1]!, prev = mid[d - 1]!;
    for (const id of EVENT_BODIES) {
      const s0 = signOf(a.get(id)!).index, s1 = signOf(b.get(id)!).index;
      if (s0 !== s1) events.push(`${NAMES[id]} enters ${SIGN_NAMES[s1]}`);
      if (id === 'sun') continue;
      const v0 = wrap(a.get(id)! - prev.get(id)!), v1 = wrap(b.get(id)! - a.get(id)!);
      if (v0 > 0 && v1 <= 0) events.push(`${NAMES[id]} turns retrograde`);
      else if (v0 < 0 && v1 >= 0) events.push(`${NAMES[id]} turns direct`);
    }
    out.push({ day: d, phase, moonSign: signOf(lonNow.get('moon')!).index, mainPhase: q === null ? null : PHASE_NAMES[q]!, events });
  }
  return out;
}

export const SIGN_SHORT = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
