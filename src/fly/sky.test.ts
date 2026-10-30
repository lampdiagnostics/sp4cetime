import { describe, expect, it } from 'vitest';
import { eqDir, SIGNS, toEcl } from './sky';

describe('The sky sphere', () => {
  it('puts the March equinox at ecliptic longitude 0 (the start of Aries) and the ecliptic pole in Draco', () => {
    const equinox = toEcl(eqDir(0, 0));
    expect(equinox[0]).toBeCloseTo(1, 9);
    // North ecliptic pole: RA 18h 00m, Dec +66.56° (J2000).
    const pole = toEcl(eqDir(270, 66.560_708_9));
    expect(pole[2]).toBeCloseTo(1, 6);
  });

  it('places Regulus, a zodiac star, within half a degree of the ecliptic', () => {
    // Regulus (α Leo): RA 152.093°, Dec +11.967°; ecliptic latitude +0.46°.
    const d = toEcl(eqDir(152.093, 11.967));
    expect((Math.asin(d[2]) * 180) / Math.PI).toBeCloseTo(0.46, 1);
  });

  it('has twelve signs of 30°', () => {
    expect(SIGNS).toHaveLength(12);
    expect(SIGNS[0][1]).toBe('Aries');
  });
});
