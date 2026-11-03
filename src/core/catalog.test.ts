import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cartTotal, decodeLine, type Design, encodeDesign, encodeLine, LIMITS, OCCASIONS, parseCart, parseDesign, PRODUCTS, productById } from './catalog';

const base: Design = {
  occasion: 'birthday',
  names: 'Ada',
  message: 'Many happy returns',
  day: -5_284,
  sec: 55_200,
  when: '14 July 1985, 3:20 pm (UTC−5)',
  noTime: false,
  place: 'Winnipeg, Manitoba, Canada',
  lat: 49.8844,
  lon: -97.14704,
  system: 'whole',
  paper: 'letter',
  style: 'paper',
};

const designArb = fc.record({
  occasion: fc.constantFrom(...OCCASIONS.map((o) => o.id)),
  names: fc.string({ maxLength: LIMITS.names }),
  message: fc.string({ maxLength: LIMITS.message }),
  day: fc.integer({ min: -3_000_000, max: 3_000_000 }),
  sec: fc.integer({ min: 0, max: 86_399 }),
  when: fc.string({ maxLength: LIMITS.when }),
  noTime: fc.boolean(),
  place: fc.string({ maxLength: LIMITS.place }),
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  system: fc.constantFrom('whole' as const, 'equal' as const),
  paper: fc.constantFrom('letter' as const, 'a4' as const),
  style: fc.constantFrom('paper' as const, 'night' as const),
});

describe('catalogue', () => {
  it('has the prices the owner set', () => {
    expect(Object.fromEntries(PRODUCTS.map((p) => [p.id, p.cents]))).toEqual({ card: 399, wedding: 1999, calendar: 599, screensaver: 199, phone: 99 });
  });

  it('round-trips a design', () => {
    const d = parseDesign(JSON.parse(encodeDesign(base)));
    expect(d).toMatchObject({ ...base, lat: 49.8844, lon: -97.14704 });
  });

  it('keeps every cart line within Stripe’s 500-character metadata value, even at the limits', () => {
    fc.assert(
      fc.property(designArb, (d) => {
        // Worst case: characters JSON escapes (\u0001 → 6 chars) are stripped by parseDesign first.
        const clean = parseDesign(JSON.parse(encodeDesign(d)))!;
        const line = encodeLine({ product: 'screensaver', qty: 20, design: clean });
        expect(line.length).toBeLessThanOrEqual(500);
      }),
    );
  });

  it('reads back what it writes, line by line', () => {
    const line = encodeLine({ product: 'card', qty: 3, design: base });
    expect(decodeLine(line)).toEqual({ product: 'card', qty: 3, design: parseDesign(JSON.parse(encodeDesign(base))) });
  });

  it('refuses unknown products, bad quantities and broken designs', () => {
    const design = JSON.parse(encodeDesign(base));
    expect(parseCart([{ product: 'card', qty: 2, design }])).not.toBeNull();
    expect(parseCart([{ product: 'yacht', qty: 1, design }])).toBeNull();
    expect(parseCart([{ product: 'wedding', qty: 2, design }])).toBeNull();
    expect(parseCart([{ product: 'card', qty: 0, design }])).toBeNull();
    expect(parseCart([{ product: 'card', qty: 1.5, design }])).toBeNull();
    expect(parseCart([{ product: 'card', qty: 1, design: { ...design, la: 91 } }])).toBeNull();
    expect(parseCart([])).toBeNull();
  });

  it('totals from its own prices', () => {
    const c = parseCart([
      { product: 'card', qty: 2, design: encodeDesign(base) },
      { product: 'phone', qty: 1, design: encodeDesign(base) },
    ])!;
    expect(cartTotal(c)).toBe(2 * 399 + 99);
    expect(productById('wedding')!.maxQty).toBe(1);
  });
});
