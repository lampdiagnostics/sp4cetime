/**
 * Starsigns (0.4.0, ADR-0018): a reading becomes a path anyone can play for free, flown
 * like any other (ADR-0017), and recorded as the video of the paid package.
 *
 *   START    the calendar at the moment, time held still
 *   POINT 1  Earth from space, the planets labelled with their signs against the zodiac
 *   POINT 2  high over the place (a town at its centre)
 *   POINT 3  standing there, facing the Ascendant on the eastern horizon, houses on the sky
 *   POINT 4  looking up to the Midheaven
 *   END      Earth and the whole zodiac again
 *
 * Pure: the caller passes the look and calendar to start from, an id and a date.
 */

import { BODIES, solarSystemAt } from './bodies';
import type { Vec3 } from './geometry';
import { eclipticDirOfDate, formatSignDeg, signOf } from './houses';
import type { ChartLook, FlyState, Path, PathPoint, PointLook } from './path';
import { PLANET_IDS } from './planets';
import type { Reading } from './reading';

const EARTH_R = BODIES.find((b) => b.id === 'earth')!.radiusKm;
const DEG = Math.PI / 180;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/**
 * The orientation of a camera looking along `dir` with `up` above it, as a quaternion
 * [x, y, z, w] (a camera looks along its −z with +y up, as in three.js).
 */
export function lookQuat(dir: Vec3, up: Vec3): readonly [number, number, number, number] {
  const back = unit(scale(dir, -1));
  const right = unit(cross(up, back));
  const u = cross(back, right);
  // Rotation matrix with columns right, u, back → quaternion.
  const m00 = right[0], m01 = u[0], m02 = back[0];
  const m10 = right[1], m11 = u[1], m12 = back[1];
  const m20 = right[2], m21 = u[2], m22 = back[2];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

export interface StarsignsOptions {
  readonly id: string;
  /** ISO date and time the path was made. */
  readonly created: string;
  /** "Winnipeg, Manitoba, Canada" (or the coordinates). */
  readonly placeLabel: string;
  /** The short place name for labels ("Winnipeg"). */
  readonly placeName: string;
  /** "14 July 1985, 3:20 pm" as the person entered it (local time). */
  readonly whenText: string;
  /** Whose sky, if they gave a name. */
  readonly name?: string;
  readonly system: 'whole' | 'equal';
  /** No birth time: signs only (no houses, no ground view). */
  readonly noTime?: boolean;
  /** The look and calendar to start from (what is on screen), changed only where the path needs it. */
  readonly look: PointLook;
  readonly calendar: PathPoint['calendar'];
}

export function starsignsPath(r: Reading, o: StarsignsOptions): Path {
  const t = r.time;
  const bodies = solarSystemAt(t);
  const earth = bodies.find((b) => b.info.id === 'earth')!;
  const [ax, ay, az] = earth.axes;
  /** A world (ecliptic) direction in Earth's own axes. */
  const toBody = (d: Vec3): Vec3 => [dot(d, ax), dot(d, ay), dot(d, az)];
  /** Earth's own axes → world. */
  const toWorld = (d: Vec3): Vec3 => add(add(scale(ax, d[0]), scale(ay, d[1])), scale(az, d[2]));

  const chart: ChartLook = { lat: r.lat, lon: r.lon, system: o.system, place: o.placeName };
  // Full screen, names and the zodiac; in 3D nothing else (no spirals, orbits, grids or figures), so the sky reads clearly.
  const look = (withChart: boolean, inCalendar = false): PointLook => ({
    ...o.look,
    round: false,
    chrome: 1,
    zodiac: true,
    labels: true,
    moon: true,
    planets: [...PLANET_IDS],
    coastlines: true,
    spirals: inCalendar,
    rings: inCalendar,
    timeGrid: inCalendar,
    distanceGrid: false,
    constellations: false,
    strobe: false,
    chart: withChart && !o.noTime ? chart : null,
  });
  const point = (p: Partial<PathPoint> & Pick<PathPoint, 'view' | 'caption'>, withChart = false): PathPoint => ({
    present: t,
    speed: 1,
    playing: false,
    calendar: { ...o.calendar, offset: { day: 0, sec: 0 } },
    fly: null,
    look: look(withChart, p.view === 'calendar'),
    where: '',
    facing: '',
    ...p,
  });

  const sun = r.bodies.find((b) => b.id === 'sun')!;
  const moon = r.bodies.find((b) => b.id === 'moon')!;
  const whose = o.name ? `${o.name}’s sky` : 'Your sky';
  const sign = (lon: number): string => signOf(lon).name;

  // POINT 1 and END: Earth from space, the Sun just beside it (its sign behind Earth), north up.
  const toSun = unit(scale(earth.pos, -1));
  const space = (dist: number, turn: number): FlyState => {
    const a = turn * DEG;
    const side: Vec3 = [toSun[0] * Math.cos(a) - toSun[1] * Math.sin(a), toSun[0] * Math.sin(a) + toSun[1] * Math.cos(a), 0];
    const rel = add(scale(unit(side), -dist * EARTH_R), [0, 0, dist * EARTH_R * 0.18]);
    return { anchor: 'earth', frame: 'inertial', rel, quat: lookQuat(unit(scale(rel, -1)), [0, 0, 1]), fov: 70, up: [0, 0, 1] };
  };

  // The place on Earth, in Earth's own axes: straight up, north and east.
  const lat = r.lat * DEG, lon = r.lon * DEG;
  const n: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const upWorld = unit(toWorld(n));
  const over: FlyState = {
    anchor: 'earth',
    frame: 'body',
    rel: scale(n, EARTH_R + 2_500),
    // Looking down, a little to the north, north at the top.
    quat: lookQuat(unit(add(scale(n, -1), scale(north, 0.25))), north),
    fov: 60,
    up: upWorld,
  };
  /** Standing in the place (1 km up, above the rooftops), looking toward a sky direction, raised a little. */
  const stand = (dirWorld: Vec3, raise: number, fov: number): FlyState => {
    const d = toBody(dirWorld);
    // Level part of the direction, then raised by `raise` degrees above the horizon (at least).
    const h = unit(add(d, scale(n, -dot(d, n))));
    const alt = Math.max(Math.asin(Math.max(-1, Math.min(1, dot(d, n)))), raise * DEG);
    const look = unit(add(scale(h, Math.cos(alt)), scale(n, Math.sin(alt))));
    return { anchor: 'earth', frame: 'body', rel: scale(n, EARTH_R + 1), quat: lookQuat(look, n), fov, up: upWorld };
  };

  const top3 = r.bodies
    .filter((b) => b.id !== 'sun' && b.id !== 'moon')
    .slice(0, 3)
    .map((b) => `${b.name} in ${b.sign.name}`)
    .join(', ');
  const points: PathPoint[] = [
    point({ view: 'calendar', caption: `${whose}: ${o.whenText} · ${o.placeLabel}`, where: o.placeLabel }),
    point({ view: 'fly', fly: space(7, 28), caption: `The Sun in ${sign(sun.lon)}, the Moon in ${sign(moon.lon)}; ${top3}` }),
  ];
  if (!o.noTime) {
    const asc = eclipticDirOfDate(r.chart.asc, 0, r.chart.sky);
    const mc = eclipticDirOfDate(r.chart.mc, 0, r.chart.sky);
    points.push(
      point({ view: 'fly', fly: over, caption: o.placeLabel, where: o.placeLabel }, true),
      point(
        { view: 'fly', fly: stand(asc, 12, 80), caption: `Rising: ${formatSignDeg(r.chart.asc)}. House 1 begins on the eastern horizon`, where: o.placeLabel, facing: 'east' },
        true,
      ),
      point({ view: 'fly', fly: stand(mc, 20, 80), caption: `Midheaven: ${formatSignDeg(r.chart.mc)}, the top of the sky`, where: o.placeLabel, facing: 'the meridian' }, true),
    );
  }
  points.push(point({ view: 'fly', fly: space(10, -20), caption: `${whose} · ${o.whenText} · Starsigns by sp4cetime.org` }));
  return { id: o.id, name: `Starsigns · ${o.name ? `${o.name}, ` : ''}${o.whenText}`, created: o.created, points, finished: true };
}
