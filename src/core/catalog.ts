/**
 * sp4cetime.store's catalogue (ADR-0019): what is sold, at what price, and the design a
 * buyer makes (occasion, names, message, the moment and the place). Shared by the shop page
 * and its Worker, so the Worker charges the prices written here and nothing a browser sends.
 * Everything is digital: files made from the design, in the buyer's browser, after payment.
 *
 * Pure: no DOM, no fetch.
 */

import type { HouseSystem } from './houses';

export type ProductId = 'card' | 'wedding' | 'calendar' | 'screensaver' | 'phone';

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  /** US cents. */
  readonly cents: number;
  readonly blurb: string;
  /** What the buyer downloads. */
  readonly files: readonly string[];
  /** Most a cart may hold of it (a card can be bought for several people; a pack once per design). */
  readonly maxQty: number;
}

export const CURRENCY = 'usd';

export const PRODUCTS: readonly Product[] = [
  {
    id: 'card',
    name: 'Starsigns card',
    cents: 399,
    blurb: 'A folding card for a birthday, a new baby, a wedding, an anniversary or a moment to remember: your names and message on the front, the sky of that moment inside.',
    files: ['Card PDF, both sides (5 × 7 in on Letter, or A6 on A4)'],
    maxQty: 20,
  },
  {
    id: 'wedding',
    name: 'Wedding pack',
    cents: 1999,
    blurb: 'One card design for the whole wedding: print as many as you like, for every guest. Letter and A4 versions, plus a sheet for the table.',
    files: ['Card PDF on Letter and on A4', 'Table sheet PDF (the sky of the wedding, one page)'],
    maxQty: 1,
  },
  {
    id: 'calendar',
    name: 'Sky calendar',
    cents: 599,
    blurb: 'Twelve months from the month you choose: the Moon’s phase and sign every day, when each planet changes sign or turns retrograde, and your day marked every year.',
    files: ['Calendar PDF, 13 pages (cover and 12 months), Letter or A4'],
    maxQty: 20,
  },
  {
    id: 'screensaver',
    name: 'Screensaver',
    cents: 199,
    blurb: 'Your sky, slowly turning: an animated screensaver page and desktop pictures in three sizes.',
    files: ['Animated screensaver (.html, works offline)', 'Desktop pictures: 1920 × 1080, 2560 × 1440, 3840 × 2160 (PNG)'],
    maxQty: 20,
  },
  {
    id: 'phone',
    name: 'Phone background',
    cents: 99,
    blurb: 'Your sky as a lock screen: the wheel low on the screen, clear of the clock.',
    files: ['Phone pictures: 1290 × 2796 (iPhone) and 1080 × 2400 (Android) (PNG)'],
    maxQty: 20,
  },
];

/** The Starsigns readout by email: the sky now against your own chart, each week or month. */
export const SUBSCRIPTION = { name: 'Starsigns readout', cents: 399, intervals: ['week', 'month'] as const };
export type ReadoutInterval = (typeof SUBSCRIPTION.intervals)[number];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatPrice(cents: number): string {
  return `US$${(cents / 100).toFixed(2)}`;
}

export type Occasion = 'birthday' | 'baby' | 'wedding' | 'anniversary' | 'moment' | 'memory';

export const OCCASIONS: ReadonlyArray<{ id: Occasion; name: string; title: string }> = [
  { id: 'birthday', name: 'Birthday', title: 'Happy Birthday' },
  { id: 'baby', name: 'A new baby', title: 'Welcome to the World' },
  { id: 'wedding', name: 'Wedding', title: 'Just Married' },
  { id: 'anniversary', name: 'Anniversary', title: 'Happy Anniversary' },
  { id: 'moment', name: 'This moment', title: 'This Moment' },
  { id: 'memory', name: 'In memory', title: 'In Loving Memory' },
];

export function occasionTitle(o: Occasion): string {
  return OCCASIONS.find((x) => x.id === o)?.title ?? 'Starsigns';
}

/** A buyer's design. Kept small: it travels in Stripe's metadata (500 characters a value). */
export interface Design {
  readonly occasion: Occasion;
  /** Names on the front ("Ada & Grace"). */
  readonly names: string;
  readonly message: string;
  /** The moment, as the app's Time (days and seconds from 2000-01-01 00:00 UTC). */
  readonly day: number;
  readonly sec: number;
  /** As the buyer wrote it: "14 July 1985, 3:20 pm (UTC−5)". */
  readonly when: string;
  /** No time given (noon used: no houses). */
  readonly noTime: boolean;
  readonly place: string;
  readonly lat: number;
  readonly lon: number;
  readonly system: HouseSystem;
  readonly paper: 'letter' | 'a4';
  readonly style: 'paper' | 'night';
  /** The calendar's first month, "2027-01". */
  readonly start?: string;
}

export const LIMITS = { names: 60, message: 160, when: 48, place: 80 } as const;

const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Read a design from anything (a form, local storage, Stripe metadata); null if it is not one. */
export function parseDesign(json: unknown): Design | null {
  const o = json as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const occasion = OCCASIONS.some((x) => x.id === o.o) ? (o.o as Occasion) : null;
  const day = num(o.d, -3_000_000, 3_000_000);
  const sec = num(o.s, 0, 86_400);
  const lat = num(o.la, -90, 90);
  const lon = num(o.lo, -180, 180);
  if (!occasion || day === null || !Number.isInteger(day) || sec === null || lat === null || lon === null) return null;
  const start = typeof o.st === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.st) ? o.st : undefined;
  return {
    occasion,
    names: clip(o.n, LIMITS.names),
    message: clip(o.m, LIMITS.message),
    day,
    sec,
    when: clip(o.w, LIMITS.when),
    noTime: o.nt === 1,
    place: clip(o.p, LIMITS.place),
    lat,
    lon,
    system: o.h === 'equal' ? 'equal' : 'whole',
    paper: o.pa === 'a4' ? 'a4' : 'letter',
    style: o.sy === 'night' ? 'night' : 'paper',
    ...(start ? { start } : {}),
  };
}

const r5 = (x: number): number => Math.round(x * 1e5) / 1e5;

/** A design as short JSON (the keys parseDesign reads). */
export function encodeDesign(d: Design): string {
  return JSON.stringify({
    o: d.occasion,
    n: d.names.slice(0, LIMITS.names),
    m: d.message.slice(0, LIMITS.message),
    d: d.day,
    s: Math.round(d.sec),
    w: d.when.slice(0, LIMITS.when),
    ...(d.noTime ? { nt: 1 } : {}),
    p: d.place.slice(0, LIMITS.place),
    la: r5(d.lat),
    lo: r5(d.lon),
    h: d.system,
    pa: d.paper,
    sy: d.style,
    ...(d.start ? { st: d.start } : {}),
  });
}

export interface CartItem {
  readonly product: ProductId;
  readonly qty: number;
  readonly design: Design;
}

export const MAX_CART_LINES = 20;

/** A cart as the Worker accepts it: known products, whole quantities within limits, valid designs. */
export function parseCart(json: unknown): CartItem[] | null {
  if (!Array.isArray(json) || json.length === 0 || json.length > MAX_CART_LINES) return null;
  const out: CartItem[] = [];
  for (const x of json) {
    const o = x as Record<string, unknown> | null;
    const p = productById(String(o?.product));
    const qty = o?.qty;
    const design = parseDesign(typeof o?.design === 'string' ? safeJson(o.design) : o?.design);
    if (!p || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > p.maxQty || !design) return null;
    out.push({ product: p.id, qty, design });
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function cartTotal(items: readonly CartItem[]): number {
  return items.reduce((s, i) => s + (productById(i.product)?.cents ?? 0) * i.qty, 0);
}

/** One cart line as a Stripe metadata value: "card|2|{design}". */
export function encodeLine(i: CartItem): string {
  return `${i.product}|${i.qty}|${encodeDesign(i.design)}`;
}

export function decodeLine(s: string): CartItem | null {
  const m = /^([a-z]+)\|(\d+)\|(.*)$/s.exec(s);
  if (!m) return null;
  return parseCart([{ product: m[1], qty: Number(m[2]), design: m[3] }])?.[0] ?? null;
}

/** Astrologers whose readings we point people to (no affiliation, nothing paid either way). */
export const ASTROLOGERS: ReadonlyArray<{ name: string; url: string; about: string }> = [
  { name: 'The Astrology Podcast (Chris Brennan)', url: 'https://theastrologypodcast.com/', about: 'Long, careful talks on how astrology works; the home of Whole Sign houses, the system sp4cetime uses first.' },
  { name: 'CHANI (Chani Nicholas)', url: 'https://chani.com/', about: 'Weekly horoscopes and an app, written warmly, built on Whole Sign houses.' },
  { name: 'The AstroTwins (Astrostyle)', url: 'https://astrostyle.com/', about: 'Daily, weekly and monthly horoscopes for every sign, and a podcast.' },
  { name: 'Astrology Zone (Susan Miller)', url: 'https://www.astrologyzone.com/', about: 'Long monthly forecasts for each sign, written since the 1990s.' },
  { name: 'Astrodienst (astro.com)', url: 'https://www.astro.com/', about: 'Free charts and the texts of Liz Greene and Robert Hand; a reference for astrologers.' },
  { name: 'Cafe Astrology', url: 'https://cafeastrology.com/', about: 'Free explanations of every sign, planet and house.' },
];
