import * as Astronomy from 'astronomy-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ascendantDeg,
  centuries,
  chartAt,
  eclipticDirOfDate,
  zenithDir,
  formatSignDeg,
  gmstDeg,
  houseCusps,
  houseOf,
  lonOfDateFromVector,
  meanObliquityDeg,
  midheavenDeg,
  norm360,
  precessionDeg,
  signOf,
  skyOfDate,
} from './houses';
import { eclDir, toEcl, turnSigns } from './skyfigures';
import { addSeconds, fromCivil, makeTime, toUnixMs, type Time } from './time';

const DEG = Math.PI / 180;
/** Smallest difference between two angles, degrees. */
const dAng = (a: number, b: number): number => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const SIDEREAL_DAY_S = 86_164.090_5;

/** Times from 1800 to 2200 (astronomy-engine's comfortable range for these checks). */
const modern = fc.integer({ min: -73_000, max: 73_000 }).chain((day) => fc.double({ min: 0, max: 86_399, noNaN: true }).map((sec) => makeTime(day, sec)));

/** Altitude (degrees) and hour angle (degrees) of an ecliptic-of-date longitude at a place. */
function horizon(lon: number, lst: number, lat: number, eps: number): { alt: number; ha: number } {
  const l = lon * DEG, e = eps * DEG, f = lat * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l));
  const dec = Math.asin(Math.sin(l) * Math.sin(e));
  const ha = lst * DEG - ra;
  const alt = Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(ha));
  return { alt: alt / DEG, ha: norm360(ha / DEG) };
}

describe('Sidereal time and the frame of date', () => {
  it('matches Meeus example 12.a and 12.b', () => {
    // 1987 April 10, 0h UT: GMST 13h10m46.3668s; 19h21m00s UT: 8h34m57.0896s.
    expect(dAng(gmstDeg(fromCivil(1987, 4, 10, 0)), (13 + 10 / 60 + 46.3668 / 3600) * 15)).toBeLessThan(0.1 / 3600);
    expect(dAng(gmstDeg(fromCivil(1987, 4, 10, 19 * 3600 + 21 * 60)), (8 + 34 / 60 + 57.0896 / 3600) * 15)).toBeLessThan(0.1 / 3600);
  });

  it('agrees with astronomy-engine’s apparent sidereal time and true obliquity (1800–2200)', () => {
    fc.assert(
      fc.property(modern, (t) => {
        const date = new Date(toUnixMs(t));
        const sky = skyOfDate(t);
        // Within 1.5″ of time-angle (our short nutation series; UT vs UT1 is the same in both).
        expect(dAng(sky.gast, Astronomy.SiderealTime(date) * 15)).toBeLessThan(1.5 / 3600);
        const tilt = Astronomy.e_tilt(Astronomy.MakeTime(date));
        expect(Math.abs(sky.obliquity - tilt.tobl)).toBeLessThan(1 / 3600);
      }),
      { numRuns: 200 },
    );
  });

  it('moves J2000 longitudes to the true equinox of date as astronomy-engine does (1800–2200)', () => {
    fc.assert(
      fc.property(modern, (t) => {
        const date = new Date(toUnixMs(t));
        const sky = skyOfDate(t);
        for (const body of [Astronomy.Body.Sun, Astronomy.Body.Mars, Astronomy.Body.Moon]) {
          const v = Astronomy.GeoVector(body, date, true);
          const ours = lonOfDateFromVector(toEcl([v.x, v.y, v.z]), sky);
          const theirs = Astronomy.Ecliptic(v).elon;
          // A few arcseconds: our precession neglects the ecliptic's own slow tilt (≈47″ a century, at latitude).
          expect(dAng(ours, theirs)).toBeLessThan(15 / 3600);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('precesses about 50.3″ a year now, and continues smoothly past ±10,000 years, finite to ±5 Gyr', () => {
    const perYear = (precessionDeg(0.01) - precessionDeg(-0.01)) / 2 * 3600;
    expect(perYear).toBeCloseTo(50.29, 1);
    for (const edge of [100, -100]) {
      expect(Math.abs(precessionDeg(edge + 1e-6) - precessionDeg(edge - 1e-6))).toBeLessThan(1e-5);
    }
    fc.assert(
      fc.property(fc.double({ min: -5e7, max: 5e7, noNaN: true }), (T) => {
        expect(Number.isFinite(precessionDeg(T))).toBe(true);
        expect(meanObliquityDeg(T)).toBeGreaterThan(22);
        expect(meanObliquityDeg(T)).toBeLessThan(25);
      }),
    );
    // ~25,800 years for a full circle.
    const turn = 360 / ((precessionDeg(150) - precessionDeg(120)) / 30) * 100;
    expect(turn).toBeGreaterThan(24_000);
    expect(turn).toBeLessThan(28_000);
  });

  it('keeps sidereal time exact far from 2000 (whole days apart, one sidereal turn more per year)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.double({ min: 0, max: 86_399, noNaN: true }), (day, sec) => {
        const g = gmstDeg(makeTime(day, sec));
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThan(360);
      }),
    );
    // A sidereal day later (near 2000), the same sidereal time.
    const t: Time = fromCivil(2026, 11, 2, 12 * 3600);
    expect(dAng(gmstDeg(t), gmstDeg(addSeconds(t, SIDEREAL_DAY_S)))).toBeLessThan(0.001);
    expect(centuries(fromCivil(2000, 1, 1, 12 * 3600))).toBe(0);
  });
});

describe('Ascendant and Midheaven', () => {
  it('give the textbook values at the equator', () => {
    // The equinox on the meridian: MC 0° Aries, Ascendant 0° Cancer (90°).
    expect(dAng(midheavenDeg(0, 23.44), 0)).toBeLessThan(1e-9);
    expect(dAng(ascendantDeg(0, 0, 23.44), 90)).toBeLessThan(1e-9);
    expect(dAng(midheavenDeg(90, 23.44), 90)).toBeLessThan(1e-9);
    expect(dAng(ascendantDeg(90, 0, 23.44), 180)).toBeLessThan(1e-9);
  });

  const place = fc.record({
    lst: fc.double({ min: 0, max: 360, noNaN: true }),
    lat: fc.double({ min: -66, max: 66, noNaN: true }),
    eps: fc.double({ min: 22, max: 24.6, noNaN: true }),
  });

  it('puts the Ascendant on the eastern horizon, rising', () => {
    fc.assert(
      fc.property(place, ({ lst, lat, eps }) => {
        const h = horizon(ascendantDeg(lst, lat, eps), lst, lat, eps);
        expect(Math.abs(h.alt)).toBeLessThan(1e-7);
        // Rising: hour angle in the eastern half (180°–360°).
        expect(h.ha).toBeGreaterThan(180 - 1e-7);
      }),
      { numRuns: 500 },
    );
  });

  it('puts the MC on the upper meridian (hour angle 0)', () => {
    fc.assert(
      fc.property(place, ({ lst, eps }) => {
        const h = horizon(midheavenDeg(lst, eps), lst, 0, eps);
        expect(dAng(h.ha, 0)).toBeLessThan(1e-7);
      }),
      { numRuns: 500 },
    );
  });

  it('carries the Ascendant once round the ecliptic in a sidereal day, always forward', () => {
    fc.assert(
      fc.property(modern, fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (t, lat, lon) => {
        const a0 = chartAt(t, lat, lon).asc;
        expect(dAng(a0, chartAt(addSeconds(t, SIDEREAL_DAY_S), lat, lon).asc)).toBeLessThan(0.01);
        let prev = a0, total = 0;
        for (let k = 1; k <= 96; k++) {
          const a = chartAt(addSeconds(t, (SIDEREAL_DAY_S * k) / 96), lat, lon).asc;
          const step = norm360(a - prev);
          expect(step).toBeLessThan(180);
          total += step;
          prev = a;
        }
        expect(total).toBeCloseTo(360, 1);
      }),
      { numRuns: 40 },
    );
  });
});

describe('Houses and signs', () => {
  it('names signs and degrees', () => {
    expect(signOf(0).name).toBe('Aries');
    expect(signOf(359.999).name).toBe('Pisces');
    expect(signOf(-0.5).name).toBe('Pisces');
    expect(signOf(134.7)).toMatchObject({ name: 'Leo', index: 4 });
    expect(formatSignDeg(134.7)).toBe('14° Leo');
  });

  it('makes 12 cusps 30° apart, Whole Sign on sign boundaries, and finds each house', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), fc.constantFrom('whole' as const, 'equal' as const), (asc, sys) => {
        const c = houseCusps(sys, asc);
        expect(c).toHaveLength(12);
        for (let i = 0; i < 12; i++) {
          expect(dAng(c[(i + 1) % 12]!, c[i]! + 30)).toBeLessThan(1e-9);
          if (sys === 'whole') expect(c[i]! % 30).toBeCloseTo(0, 9);
          expect(houseOf(c[i]! + 0.01, c)).toBe(i + 1);
          expect(houseOf(c[i]! + 29.99, c)).toBe(i + 1);
        }
        // The Ascendant is in house 1 either way.
        expect(houseOf(asc, c)).toBe(1);
      }),
    );
  });

  it('says when a place is inside a polar circle', () => {
    const t = fromCivil(2026, 6, 21, 12 * 3600);
    expect(chartAt(t, 49.9, -97.1).polar).toBe(false); // Winnipeg
    expect(chartAt(t, 69.6, 18.9).polar).toBe(true); // Tromsø
  });
});

describe('The zodiac drawn from the equinox of date', () => {
  it('turns each sign boundary onto its longitude of date, for any date in the model', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_800_000_000, max: 1_800_000_000 }), (day) => {
        const sky = skyOfDate(makeTime(day, 0));
        for (let k = 0; k < 12; k++) {
          const v = turnSigns(eclDir(k * 30, 0), sky.lonShift);
          expect(dAng(lonOfDateFromVector(v, sky), k * 30)).toBeLessThan(1e-6);
        }
      }),
    );
  });
});

describe('The horizon of a place on the sky', () => {
  it('has the Ascendant on it, east of the meridian, and the MC on its meridian above', () => {
    fc.assert(
      fc.property(modern, fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (t, lat, lon) => {
        const c = chartAt(t, lat, lon);
        const z = zenithDir(t, lat, lon);
        const asc = eclipticDirOfDate(c.asc, 0, c.sky);
        // On the horizon: 90° from the zenith (the ecliptic's tilt since 2000 is ignored: under 0.1° by 2200).
        expect(Math.abs(asc[0] * z[0] + asc[1] * z[1] + asc[2] * z[2])).toBeLessThan(0.002);
        const mc = eclipticDirOfDate(c.mc, 0, c.sky);
        // The MC is above the horizon outside the polar circles.
        expect(mc[0] * z[0] + mc[1] * z[1] + mc[2] * z[2]).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});
