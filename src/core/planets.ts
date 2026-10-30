/**
 * Planetary orbits from JPL's "Keplerian Elements for Approximate Positions of
 * the Major Planets" (E. M. Standish, Table 1, J2000 ecliptic, valid 1800–2050 AD,
 * usable with growing error to ±3,000 years). Earth uses the Earth–Moon barycentre.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Units: a in AU; angles in degrees; rates per Julian century from J2000.0.
 * Beyond the validity window the slow rates are frozen at their window-edge
 * values and only the mean longitude keeps advancing (the schematic tier).
 */

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

export interface OrbitalElements {
  /** Semi-major axis, AU */
  readonly a: number;
  /** Eccentricity */
  readonly e: number;
  /** Inclination to the ecliptic, deg */
  readonly I: number;
  /** Mean longitude, deg */
  readonly L: number;
  /** Longitude of perihelion ϖ, deg */
  readonly varpi: number;
  /** Longitude of the ascending node Ω, deg */
  readonly node: number;
}

export interface Planet {
  readonly id: PlanetId;
  readonly name: string;
  /** Elements at J2000.0 */
  readonly el: OrbitalElements;
  /** Rates per Julian century */
  readonly rate: OrbitalElements;
}

const p = (
  id: PlanetId,
  name: string,
  el: [number, number, number, number, number, number],
  rate: [number, number, number, number, number, number],
): Planet => ({
  id,
  name,
  el: { a: el[0], e: el[1], I: el[2], L: el[3], varpi: el[4], node: el[5] },
  rate: { a: rate[0], e: rate[1], I: rate[2], L: rate[3], varpi: rate[4], node: rate[5] },
});

export const PLANETS: readonly Planet[] = [
  p('mercury', 'Mercury',
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]),
  p('venus', 'Venus',
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]),
  p('earth', 'Earth',
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]),
  p('mars', 'Mars',
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]),
  p('jupiter', 'Jupiter',
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]),
  p('saturn', 'Saturn',
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]),
  p('uranus', 'Uranus',
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]),
  p('neptune', 'Neptune',
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]),
  p('pluto', 'Pluto',
    [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]),
];

export const PLANET_IDS: readonly PlanetId[] = PLANETS.map((pl) => pl.id);

export function planetById(id: PlanetId): Planet {
  const found = PLANETS.find((pl) => pl.id === id);
  if (!found) throw new Error(`Unknown planet ${id}`);
  return found;
}

/** Slow-rate validity window, in Julian centuries from J2000 (±3,000 years). */
export const ELEMENT_WINDOW_CENTURIES = 30;

/** Elements at T Julian centuries from J2000.0 (slow rates frozen outside ±30 centuries). */
export function elementsAt(planet: Planet, T: number): OrbitalElements {
  const { el, rate } = planet;
  const Ts = Math.max(-ELEMENT_WINDOW_CENTURIES, Math.min(ELEMENT_WINDOW_CENTURIES, T));
  return {
    a: el.a + rate.a * Ts,
    e: el.e + rate.e * Ts,
    I: el.I + rate.I * Ts,
    L: el.L + rate.L * T,
    varpi: el.varpi + rate.varpi * Ts,
    node: el.node + rate.node * Ts,
  };
}

const SECONDS_PER_CENTURY = 36_525 * 86_400;

/** Mean motion, radians per second. */
export function meanMotion(planet: Planet): number {
  return ((planet.rate.L * Math.PI) / 180) / SECONDS_PER_CENTURY;
}

/** Orbital period, seconds. */
export function orbitalPeriod(planet: Planet): number {
  return (2 * Math.PI) / meanMotion(planet);
}
