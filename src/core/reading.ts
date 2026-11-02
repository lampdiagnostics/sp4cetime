/**
 * A reading: every body's sign and house for one moment and one place (the Starsigns
 * table, path and PDF, 0.4.0). Positions are geocentric (seen from Earth's centre), from
 * the app's own ephemeris (bodies.ts), moved to the equinox of the date (houses.ts).
 * Geometric positions: light-time and aberration are left out (under 1′ for every body,
 * far below the whole degrees shown). The Moon seen from the place itself can differ by
 * up to about 1° (parallax); the reading says so.
 */

import { accuracyTier, type AccuracyTier } from './models';
import { BODIES, type BodyId, moonGeocentric, solarSystemAt } from './bodies';
import { type Chart, chartAt, houseOf, type HouseSystem, lonOfDateFromVector, signOf, type SignPlace, skyOfDate } from './houses';
import { addSeconds, type Time } from './time';

export interface BodyReading {
  readonly id: BodyId;
  readonly name: string;
  /** Ecliptic longitude from the true equinox of date, degrees. */
  readonly lon: number;
  readonly sign: SignPlace;
  /** 1–12. */
  readonly house: number;
  /** Moving backward along the zodiac seen from Earth (apparent, not real). */
  readonly retrograde: boolean;
}

export interface Reading {
  readonly time: Time;
  readonly lat: number;
  readonly lon: number;
  readonly chart: Chart;
  readonly bodies: readonly BodyReading[];
  readonly tier: AccuracyTier;
}

/** The order astrologers list them in: the Sun and the Moon, then outward. */
const ORDER: readonly BodyId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** Geocentric ecliptic longitudes of date, degrees, for every body but Earth. */
function longitudes(t: Time): Map<BodyId, number> {
  const sky = skyOfDate(t);
  const all = solarSystemAt(t);
  const earth = all.find((b) => b.info.id === 'earth')!.pos;
  const out = new Map<BodyId, number>();
  for (const b of all) {
    if (b.info.id === 'earth') continue;
    const v: [number, number, number] =
      b.info.id === 'moon' ? (moonGeocentric(t) as [number, number, number]) : [b.pos[0] - earth[0], b.pos[1] - earth[1], b.pos[2] - earth[2]];
    out.set(b.info.id, lonOfDateFromVector(v, sky));
  }
  return out;
}

export function readingAt(t: Time, lat: number, lonEast: number, system: HouseSystem = 'whole'): Reading {
  const chart = chartAt(t, lat, lonEast, system);
  const now = longitudes(t);
  // Retrograde: the longitude a few hours later is smaller (the Moon and Sun never are).
  const later = longitudes(addSeconds(t, 6 * 3600));
  const bodies = ORDER.map((id) => {
    const lon = now.get(id)!;
    const step = ((((later.get(id)! - lon) % 360) + 540) % 360) - 180;
    return { id, name: BODIES.find((b) => b.id === id)!.name, lon, sign: signOf(lon), house: houseOf(lon, chart.cusps), retrograde: step < 0 };
  });
  return { time: t, lat, lon: lonEast, chart, bodies, tier: accuracyTier(t) };
}
