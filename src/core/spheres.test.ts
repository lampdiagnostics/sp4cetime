import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GEO_RADIUS_KM, solarSystemAt } from './bodies';
import { SUN_GALACTOCENTRIC_KM } from './constants';
import {
  apparentDiameter,
  arcBetween,
  arcPosition,
  bodySphere,
  formatDMS,
  formatLat,
  formatLon,
  fromArc,
  galaxySphere,
  raySphere,
} from './spheres';
import { addSeconds, fromCivil } from './time';

const now = fromCivil(2026, 10, 30, 18 * 3600);
const bodies = solarSystemAt(now);
const earth = bodySphere(bodies.find((b) => b.info.id === 'earth')!);
const DEG = Math.PI / 180;

describe('Degrees, minutes, seconds', () => {
  it('formats with exact carries', () => {
    expect(formatDMS(23.439_291 * DEG)).toBe('23°26′21.4″');
    expect(formatDMS((59.999_99 / 3600) * DEG, 1)).toBe('0°01′00.0″');
    expect(formatDMS(0.5 * DEG, 0)).toBe('0°30′00″');
    expect(formatDMS((31 / 60 + 5 / 3600) * DEG, 0, true)).toBe('31′05″');
    expect(formatDMS((2.1 / 3600) * DEG, 1, true)).toBe('2.1″');
    expect(formatLat(-33.5 * DEG, 0)).toBe('33°30′00″ S');
    expect(formatLon(-97.1375 * DEG, 0)).toBe('97°08′15″ W');
  });
});

describe('Spheres', () => {
  it('arc positions round-trip: any longitude, latitude and distance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI + 1e-6, max: Math.PI - 1e-6, noNaN: true }),
        fc.double({ min: -Math.PI / 2 + 1e-6, max: Math.PI / 2 - 1e-6, noNaN: true }),
        fc.double({ min: 100, max: 1e7, noNaN: true }),
        (lon, lat, r) => {
          const a = arcPosition(fromArc(earth, lon, lat, r), earth);
          // Longitude matters less toward the poles: compare the east–west arc it makes.
          const dLon = Math.abs(Math.atan2(Math.sin(a.lon - lon), Math.cos(a.lon - lon))); // wrapped at ±180°
          expect(Math.cos(lat) * dLon).toBeLessThan(1e-7);
          expect(a.lat).toBeCloseTo(lat, 7);
          expect(a.r / r).toBeCloseTo(1, 7);
        },
      ),
    );
  });

  it('a geostationary point keeps its longitude and latitude on Earth\'s sphere', () => {
    const p = fromArc(earth, -97 * DEG, 0, GEO_RADIUS_KM);
    const a = arcPosition(p, earth);
    expect(a.radii).toBeCloseTo(GEO_RADIUS_KM / 6371, 6);
    expect(a.lat).toBeCloseTo(0, 9);
    // An hour later Earth has turned; the same body-fixed point is still at −97°.
    const later = bodySphere(solarSystemAt(addSeconds(now, 3600)).find((b) => b.info.id === 'earth')!);
    const q = fromArc(later, -97 * DEG, 0, GEO_RADIUS_KM);
    expect(arcPosition(q, later).lon).toBeCloseTo(-97 * DEG, 9);
  });

  it('the galaxy sphere puts the Sun 8.178 kpc from Sgr A*, near the galactic plane', () => {
    const a = arcPosition([0, 0, 0], galaxySphere(now));
    expect(a.r / SUN_GALACTOCENTRIC_KM).toBeCloseTo(1, 6);
    expect(Math.abs(a.lat)).toBeLessThan(0.1 * DEG);
    expect(a.lon / DEG).toBeCloseTo(179.94, 1);
    expect(a.radii).toBeCloseTo(26_673 / 50_000, 2);
  });

  it('measures arcs between points from any sphere\'s centre', () => {
    const a = fromArc(earth, 0, 0, 6371);
    const b = fromArc(earth, 1 * DEG, 0, 6371);
    expect(arcBetween(a, b, earth) / DEG).toBeCloseTo(1, 9);
    // The same two points, seen from the Sun, are a tiny arc apart.
    expect(arcBetween(a, b, bodySphere(bodies[0]!))).toBeLessThan(1e-6);
  });

  it('gives apparent diameters and ray hits on spheres', () => {
    expect(apparentDiameter(1737.4, 384_400) / DEG).toBeCloseTo(0.518, 2);
    expect(raySphere([0, 0, 10], [0, 0, -1], [0, 0, 0], 2)).toBeCloseTo(8, 9);
    expect(raySphere([0, 0, 10], [0, 1, 0], [0, 0, 0], 2)).toBeNull();
  });
});
