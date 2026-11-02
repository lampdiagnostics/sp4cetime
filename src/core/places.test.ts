import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fold, parseLatLon, parsePlaces, placeLabel, searchPlaces } from './places';

// @ts-expect-error: Node's types are not installed (few dependencies); Vitest runs in Node.
import { readFileSync } from 'node:fs';

const places = parsePlaces(JSON.parse(readFileSync('public/places.json', 'utf8') as string));

describe('Finding a place', () => {
  it('reads every town with a centre and a time zone', () => {
    expect(places.length).toBeGreaterThan(7000);
    for (const p of places) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
      expect(p.zone).toMatch(/^[A-Za-z_]+\/[A-Za-z_\-/]+$|^UTC$/);
    }
  });

  it('finds Winnipeg at the middle of town, in its time zone', () => {
    const [w] = searchPlaces(places, 'winnip');
    expect(w).toMatchObject({ name: 'Winnipeg', zone: 'America/Winnipeg' });
    expect(w!.lat).toBeCloseTo(49.88, 1);
    expect(w!.lon).toBeCloseTo(-97.17, 1);
    expect(placeLabel(w!)).toBe('Winnipeg, Manitoba, Canada');
  });

  it('ignores accents and case, and narrows by region or country after a comma', () => {
    expect(searchPlaces(places, 'montreal')[0]?.name).toBe('Montréal');
    expect(searchPlaces(places, 'MONTRÉAL')[0]?.name).toBe('Montréal');
    expect(searchPlaces(places, 'Paris')[0]?.country).toBe('France');
    const tx = searchPlaces(places, 'Paris, Texas');
    expect(tx.every((p) => p.region === 'Texas')).toBe(true);
    expect(searchPlaces(places, '')).toEqual([]);
    expect(fold('São Paulo')).toBe('sao paulo');
  });
});

describe('Typing latitude and longitude', () => {
  it('reads decimals, degrees–minutes–seconds and hemispheres', () => {
    expect(parseLatLon('49.883, -97.166')).toEqual({ lat: 49.883, lon: -97.166 });
    const dms = parseLatLon('49°52′59.2″N 97°09′57.6″W')!;
    expect(dms.lat).toBeCloseTo(49 + 52 / 60 + 59.2 / 3600, 9);
    expect(dms.lon).toBeCloseTo(-(97 + 9 / 60 + 57.6 / 3600), 9);
    expect(parseLatLon('49 52 59 N, 97 9 58 W')!.lon).toBeCloseTo(-97.1661, 3);
    expect(parseLatLon('N49.883 W97.166')).toEqual({ lat: 49.883, lon: -97.166 });
    expect(parseLatLon("33°52'S, 151°12'E")!.lat).toBeCloseTo(-33.8667, 3);
  });

  it('refuses what is not a place', () => {
    for (const bad of ['', 'Winnipeg', '91, 0', '0, 181', '49 61 0 N, 97 W', '49 N 97 N', '-49 N, 97 E']) expect(parseLatLon(bad)).toBeNull();
  });

  it('round-trips any decimal place', () => {
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (lat, lon) => {
        const r = parseLatLon(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)!;
        expect(r.lat).toBeCloseTo(lat, 5);
        expect(r.lon).toBeCloseTo(lon, 5);
      }),
    );
  });
});
