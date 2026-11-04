/**
 * Starsigns (0.4.0, ADR-0018): a reading becomes a path anyone can play for free, flown
 * like any other (ADR-0017), and recorded as the video. The owner's four steps
 * (2 November 2026):
 *
 *   1. SIGNS FROM ABOVE: where clicking Earth's name takes you, above its north pole,
 *      facing the Sun, the zodiac around the horizon.
 *   2. THE PLANETS: one sweep round the sky, east from the Sun's group (where pose 1
 *      already looks), stopping 2 seconds at each planet or group of planets (as few views
 *      as hold them all), every body once; pass-through points keep every turn eastward.
 *   3. THE SKY OVER THE PLACE (owner, 3 Nov 2026): standing in a field at the place (a town
 *      at its centre; 0.4.2: a gentle fall from space into a field ringed by trees, drawn as
 *      a silhouette, black at night and dark green by day), the ground along
 *      the bottom of the view, looking up toward the highest
 *      point of the zodiac (90° from the Ascendant) so the most of it is in view, with the
 *      constellations and the houses, the sky coloured for that hour. A pause, then the ground
 *      drops away (pose 4).
 *   4. THE WHOLE ZODIAC (owner, 3 Nov 2026): still standing at the place, the planet drops
 *      away beneath your feet (see-through; 0.4.2: the field falls away from under you; the
 *      wheel on a dark disc over a dimmed sky), and looking down past them toward the ecliptic's
 *      south pole the whole zodiac is a ring around the sky, exactly as on the printed chart
 *      (Ascendant on the left, Midheaven at the top; looking up the north pole shows it
 *      mirrored), every body at its longitude, picked out in turn with its sign and house.
 *
 * Captions are one short line each (the point box is one line high).
 *
 * Pure: the caller passes the look and calendar to start from, an id and a date.
 */

import { BODIES, type BodyId, moonGeocentric, solarSystemAt } from './bodies';
import type { Vec3 } from './geometry';
import { eclipticDirOfDate, formatSignDeg, signOf } from './houses';
import type { ChartLook, FlyState, Path, PathPoint, PointLook, PointSound } from './path';
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
  /** "14 July 1985, 3:20 pm" as entered (local time). */
  readonly whenText: string;
  /** Whose sky (set on the shop's customisation page; none in the free path). */
  readonly name?: string;
  readonly system: 'whole' | 'equal';
  /** No time was given: noon was used, so the houses are only a guide. */
  readonly noTime?: boolean;
  /** The look and calendar to start from (what is on screen), changed only where the path needs it. */
  readonly look: PointLook;
  readonly calendar: PathPoint['calendar'];
}

/** The 3D chart wheel's outer radius around Earth, in Earth radii (src/fly/wheel.ts draws it). */
export const WHEEL_RADII = 12;
/** Eye height above the place, km: standing in a field (owner, 3 Nov 2026: ground level). */
const STAND_KM = 0.002;
/** Seconds the sweep stops at each planet or group of planets (owner, 4 Nov 2026). */
export const SWEEP_PAUSE = 2;
/** The largest turn between two points of the sweep, degrees (a turn takes the short way, so under 180°). */
export const MAX_TURN_DEG = 120;
/** Half the angle a view of planets may span (so each group fits even on a narrow screen). */
const GROUP_HALF_DEG = 28;

/**
 * Split directions (unit vectors near the ecliptic) into as few groups as possible, each
 * spanning at most 2 × halfDeg of longitude; returns the indices of each group, in order.
 */
export function groupDirections(dirs: readonly Vec3[], halfDeg: number): number[][] {
  const lon = dirs.map((d) => ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360);
  const order = dirs.map((_, i) => i).sort((a, b) => lon[a]! - lon[b]!);
  let best: number[][] = [];
  for (let s = 0; s < order.length; s++) {
    const groups: number[][] = [];
    let cur: number[] = [];
    let start = 0;
    for (let k = 0; k < order.length; k++) {
      const i = order[(s + k) % order.length]!;
      const span = (lon[i]! - start + 360) % 360;
      if (cur.length === 0) {
        cur = [i];
        start = lon[i]!;
      } else if (span <= 2 * halfDeg) cur.push(i);
      else {
        groups.push(cur);
        cur = [i];
        start = lon[i]!;
      }
    }
    if (cur.length) groups.push(cur);
    if (best.length === 0 || groups.length < best.length) best = groups;
  }
  return best;
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

  const chart: ChartLook = { lat: r.lat, lon: r.lon, system: o.system, place: o.placeName, when: o.whenText };
  // Everything on screen stays as the visitor chose it in the menus (owner, 3 Nov 2026: nothing is
  // taken away for clarity). The path sets only what its poses need: the place's houses on the
  // sky, the body picked out, Earth see-through at the end; and, at the owner's request, no Milky
  // Way direction marks ("l 270° · behind the Sun").
  const look = (withChart: boolean, highlight: BodyId | null = null, ground = false, seeThrough = false): PointLook => ({
    ...o.look,
    galactic: false,
    // On the ground: the field and its trees under the place (0.4.2), which fall away when Earth goes see-through.
    chart: withChart ? (ground ? { ...chart, ground: true } : chart) : null,
    highlight,
    seeThrough,
  });
  const point = (fly: FlyState, caption: string, withChart: boolean, highlight: BodyId | null = null, where = '', ground = false, seeThrough = false, pause?: number, sound?: PointSound): PathPoint => ({
    ...(pause !== undefined ? { pause } : {}),
    // Silent, except a quiet white-noise hum while standing in the field (owner, 4 Nov 2026).
    ...(sound !== 'silence' && ground && !seeThrough ? { sound: 'noise' as const } : {}),
    view: 'fly',
    present: t,
    speed: 1,
    playing: false,
    calendar: { ...o.calendar, offset: { day: 0, sec: 0 } },
    fly,
    look: look(withChart, highlight, ground, seeThrough),
    caption,
    where,
    facing: '',
  });
  const whose = o.name ? `${o.name}’s sky` : 'Your sky';
  const sign = (id: BodyId): string => r.bodies.find((b) => b.id === id)!.sign.name;
  const noon = o.noTime ? ' (no time given: noon)' : '';

  // 1. Above Earth's north pole, as when its name is clicked, facing the Sun (just above the middle of the view).
  const n = unit(az);
  const above = scale(n, EARTH_R * 1.4);
  const toSun = unit(scale(add(earth.pos, above), -1));
  const down = scale(n, -1);
  // Tilted up toward the Sun (it stays in view even in a northern summer), Earth's limb along the bottom.
  const tilt = Math.min(85 * DEG, Math.max(0, Math.acos(Math.max(-1, Math.min(1, dot(toSun, down)))) - 15 * DEG));
  const sideways = unit(cross(cross(down, toSun), down));
  const forward = add(scale(down, Math.cos(tilt)), scale(sideways, Math.sin(tilt)));
  const pole: FlyState = { anchor: 'earth', frame: 'inertial', rel: above, quat: lookQuat(forward, n), fov: 84, up: n };
  const points: PathPoint[] = [
    point(pole, `${whose} · ${o.whenText}${noon} · ${o.placeName}`, false, null, '', false, false, 4),
  ];

  // 2. The planets: as few views as hold them all, each centred on its group; each body picked out in turn.
  const geo = (id: BodyId): Vec3 => {
    if (id === 'moon') return unit(moonGeocentric(t) as Vec3);
    const b = bodies.find((x) => x.info.id === id)!;
    return unit([b.pos[0] - earth.pos[0], b.pos[1] - earth.pos[1], b.pos[2] - earth.pos[2]]);
  };
  const ids = r.bodies.map((b) => b.id);
  const dirs = ids.map(geo);
  // ONE SWEEP ROUND THE SKY (owner, 4 Nov 2026), the pattern for every Starsigns path: from
  // the Sun's group (where the first view already looks), always turning east (the way the
  // longitudes run), stopping 2 seconds at each planet or group of planets, every body once.
  // A turn always takes the short way, so a gap of more than 120° between two stops gets
  // pass-through points (no pause): the camera never swings back over sky it has done.
  const groups = groupDirections(dirs, GROUP_HALF_DEG);
  const sunAt = Math.max(0, groups.findIndex((g) => g.some((i) => ids[i] === 'sun')));
  const tour = [...groups.slice(sunAt), ...groups.slice(0, sunAt)];
  const lonOf = (d: Vec3): number => ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360;
  let lastLon = lonOf(forward);
  for (const [k, g] of tour.entries()) {
    const centre = unit(g.reduce<Vec3>((acc, i) => add(acc, dirs[i]!), [0, 0, 0]));
    // Their names and signs are on screen (no picking out or pulsing, owner 3 Nov 2026).
    const names = g.map((i) => `${r.bodies[i]!.name} ${formatSignDeg(r.bodies[i]!.lon)}`);
    const caption = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!;
    if (k === 0) {
      points[0] = point(pole, `${whose}: ${caption}`, false, null, '', false, false, SWEEP_PAUSE);
      continue;
    }
    const lon = lonOf(centre);
    const gap = (lon - lastLon + 360) % 360;
    const legs = Math.ceil(gap / MAX_TURN_DEG);
    for (let j = 1; j < legs; j++) {
      const a = ((lastLon + (gap * j) / legs) * Math.PI) / 180;
      points.push(point({ ...pole, quat: lookQuat([Math.cos(a), Math.sin(a), 0], n) }, '', false, null, '', false, false, 0));
    }
    points.push(point({ ...pole, quat: lookQuat(centre, n) }, caption, false, null, '', false, false, SWEEP_PAUSE));
    lastLon = lon;
  }

  // 3. Down to the place, looking straight up: the zodiac and the houses overhead (the MC at the top of the view).
  const lat = r.lat * DEG, lon = r.lon * DEG;
  const up: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  // The highest point of the zodiac (the nonagesimal, 90° before the Ascendant): face its
  // direction along the ground, tilted up so the horizon sits just above the bottom of the view.
  const nona = toBody(eclipticDirOfDate(r.chart.asc - 90, 0, r.chart.sky));
  let toward = add(nona, scale(up, -dot(nona, up)));
  if (Math.hypot(...toward) < 1e-6) toward = north;
  toward = unit(toward);
  const groundFov = 100;
  const pitch = (groundFov / 2 - 9) * DEG;
  const gaze = add(scale(toward, Math.cos(pitch)), scale(up, Math.sin(pitch)));
  const upWorld = unit(toWorld(up));
  points.push(
    point(
      { anchor: 'earth', frame: 'body', rel: scale(up, EARTH_R + STAND_KM), quat: lookQuat(gaze, up), fov: groundFov, up: upWorld },
      `The sky over ${o.placeName}${noon} · rising ${formatSignDeg(r.chart.asc)}`,
      true,
      null,
      o.placeLabel,
      true,
      false,
      6,
    ),
  );

  // 4. Still at the place, the planet see-through: looking down past your feet to the ecliptic's
  //    south pole, the whole zodiac rings the view as on the printed chart (Ascendant left, MC top).
  const poleBody = unit(toBody([0, 0, -1]));
  const ascBody = toBody(eclipticDirOfDate(r.chart.asc, 0, r.chart.sky));
  // A camera's right is up × back; with up = pole × asc and back = −pole, right = −asc: the Ascendant on the left.
  const wheelUp = unit(cross(poleBody, ascBody));
  const wheel: FlyState = { anchor: 'earth', frame: 'body', rel: scale(up, EARTH_R + STAND_KM), quat: lookQuat(poleBody, wheelUp), fov: 90, up: upWorld };
  // The whole zodiac, held long enough to read every body on the wheel (no picking out, owner 3 Nov 2026).
  points.push(point(wheel, `The whole zodiac over ${o.placeName}: Sun in ${sign('sun')}, Moon in ${sign('moon')}, rising ${signOf(r.chart.asc).name}`, true, null, o.placeLabel, true, true, 10));
  points.push(point(wheel, `${whose} · ${o.whenText} · ${o.placeName} · sp4cetime.org`, true, null, o.placeLabel, true, true, 4));
  return { id: o.id, name: `Starsigns · ${o.name ? `${o.name}, ` : ''}${o.whenText}`, created: o.created, points, finished: true };
}
