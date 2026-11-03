/**
 * sp4cetime.store's Worker (ADR-0019): serves the shop page and its small API.
 *
 *   POST /api/checkout       a cart → a Stripe Checkout session (one-time payment) → { url }
 *   GET  /api/order?session  a paid session → the cart lines, so the page can make the files
 *   POST /api/subscribe      a design and week|month → a Checkout session (subscription) → { url }
 *   POST /api/stripe-webhook Stripe's events: each paid readout invoice sends that readout by email
 *   GET  /api/config         whether Stripe is in test mode, the coffee and manage links
 *
 * Prices come from Stripe by lookup key (card, wedding, calendar, screensaver, phone,
 * readout_week, readout_month) and must equal src/core/catalog.ts, or the Worker refuses.
 * No database: the order is in the Checkout session's metadata, the reader's chart in the
 * subscription's. Stripe is called with fetch (no SDK; CLAUDE.md rule 8).
 *
 * Secrets (set by the owner in Cloudflare, never in the repo): STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET. Variables (wrangler.store.jsonc): SITE_URL, MAIL_FROM, PORTAL_URL,
 * COFFEE_URL. Email: Cloudflare Email Service's send_email binding EMAIL.
 */

import { decodeLine, encodeDesign, encodeLine, parseCart, parseDesign, PRODUCTS, productById, SUBSCRIPTION, type Design } from '../src/core/catalog';
import { readingAt } from '../src/core/reading';
import { readout, readoutEmail } from '../src/core/transits';
import { fromUnixMs, makeTime, toCivil } from '../src/core/time';

interface EmailBinding {
  send(m: { to: string; from: { email: string; name: string }; subject: string; html: string; text: string }): Promise<unknown>;
}

export interface Env {
  ASSETS: { fetch(r: Request): Promise<Response> };
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  MAIL_FROM?: string;
  PORTAL_URL?: string;
  COFFEE_URL?: string;
  EMAIL?: EmailBinding;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Stripe's form encoding: nested objects and arrays as a[b][0][c]=v. */
export function form(o: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' && x !== null ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(env: Env, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not set up yet (STRIPE_SECRET_KEY).');
  const q = method === 'GET' && body ? `?${form(body).toString()}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${q}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    ...(method === 'POST' && body ? { body: form(body).toString() } : {}),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String((data.error as { message?: string } | undefined)?.message ?? `Stripe ${res.status}`));
  return data;
}

/** Price ids by lookup key, checked against the catalogue. */
async function prices(env: Env, keys: string[]): Promise<Map<string, string>> {
  const res = await stripe(env, 'GET', 'prices', { lookup_keys: keys, active: true, limit: 20 });
  const want = new Map<string, number>(PRODUCTS.map((p) => [p.id, p.cents]));
  for (const i of SUBSCRIPTION.intervals) want.set(`readout_${i}`, SUBSCRIPTION.cents);
  const out = new Map<string, string>();
  for (const p of (res.data as Array<{ id: string; lookup_key: string; unit_amount: number }>) ?? []) {
    if (want.get(p.lookup_key) !== p.unit_amount) throw new Error(`The price of ${p.lookup_key} in Stripe (${p.unit_amount}) is not the shop's (${want.get(p.lookup_key)}).`);
    out.set(p.lookup_key, p.id);
  }
  for (const k of keys) if (!out.has(k)) throw new Error(`No Stripe price with lookup key "${k}".`);
  return out;
}

const site = (env: Env, req: Request): string => (env.SITE_URL ?? new URL(req.url).origin).replace(/\/$/, '');

async function checkout(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { cart?: unknown } | null;
  const cart = parseCart(body?.cart);
  if (!cart) return json({ error: 'That cart could not be read.' }, 400);
  const ids = await prices(env, [...new Set(cart.map((i) => i.product))]);
  const metadata: Record<string, string> = { n: String(cart.length) };
  cart.forEach((i, k) => (metadata[`i${k}`] = encodeLine(i)));
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment',
    line_items: cart.map((i) => ({ price: ids.get(i.product), quantity: i.qty })),
    metadata,
    success_url: `${site(env, req)}/order?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site(env, req)}/cart`,
    submit_type: 'pay',
    custom_text: { submit: { message: 'Your files are made right after payment, on the next page (and the link is in your receipt).' } },
    invoice_creation: { enabled: true },
  });
  return json({ url: s.url });
}

async function order(url: URL, env: Env): Promise<Response> {
  const id = url.searchParams.get('session_id') ?? '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: 'No such order.' }, 400);
  const s = await stripe(env, 'GET', `checkout/sessions/${id}`);
  if (s.payment_status !== 'paid') return json({ error: 'This order is not paid (yet).' }, 402);
  const md = (s.metadata ?? {}) as Record<string, string>;
  const items = [];
  for (let k = 0; k < Number(md.n ?? 0); k++) {
    const line = decodeLine(md[`i${k}`] ?? '');
    if (line) items.push({ product: line.product, qty: line.qty, design: encodeDesign(line.design) });
  }
  const email = (s.customer_details as { email?: string } | null)?.email ?? '';
  return json({ items, email, test: s.livemode === false });
}

async function subscribe(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { design?: unknown; interval?: unknown } | null;
  const design = parseDesign(typeof body?.design === 'string' ? JSON.parse(body.design) : body?.design);
  const interval = SUBSCRIPTION.intervals.find((i) => i === body?.interval);
  if (!design || !interval) return json({ error: 'That chart could not be read.' }, 400);
  const key = `readout_${interval}`;
  const ids = await prices(env, [key]);
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: ids.get(key), quantity: 1 }],
    subscription_data: { metadata: { design: encodeDesign(design) }, description: `Starsigns readout every ${interval}` },
    success_url: `${site(env, req)}/subscribed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site(env, req)}/readouts`,
  });
  return json({ url: s.url });
}

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Stripe's signature check: HMAC-SHA256 of "t.body" with the endpoint secret, within five minutes. */
export async function verifyStripe(body: string, header: string, secret: string, nowSec: number): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2)) as Record<string, string>;
  const all = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > 300 || all.length === 0) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return all.some((v) => v.length === sig.length && [...v].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ sig.charCodeAt(i)), 0) === 0);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The readout email for one design, now. */
export function readoutFor(design: Design, nowMs: number, manageUrl: string): ReturnType<typeof readoutEmail> {
  const natal = readingAt(makeTime(design.day, design.sec), design.lat, design.lon, design.system);
  const t = fromUnixMs(nowMs);
  const now = readingAt(t, design.lat, design.lon, design.system);
  const c = toCivil(t);
  return readoutEmail(readout(now, natal, !design.noTime), {
    dateText: `${c.day} ${MONTHS[c.month - 1]} ${c.year}`,
    whenText: design.when,
    placeText: design.place,
    names: design.names,
    natalHasTime: !design.noTime,
    manageUrl,
  });
}

async function webhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyStripe(body, req.headers.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000)))) {
    return json({ error: 'bad signature' }, 400);
  }
  const ev = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } };
  if (ev.type !== 'invoice.paid') return json({ ok: true, ignored: ev.type });
  const inv = ev.data.object;
  // Newer API versions put the subscription under parent.subscription_details; older ones at the top.
  const details = (inv.parent as { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } | null)?.subscription_details;
  const subId = details?.subscription ?? (typeof inv.subscription === 'string' ? inv.subscription : null);
  if (!subId) return json({ ok: true, ignored: 'not a subscription' });
  let md = details?.metadata;
  if (!md?.design) md = ((await stripe(env, 'GET', `subscriptions/${subId}`)).metadata ?? {}) as Record<string, string>;
  const design = parseDesign(JSON.parse(md.design ?? 'null'));
  const to = String(inv.customer_email ?? '');
  if (!design || !to) return json({ ok: true, ignored: 'no design or email' });
  const mail = readoutFor(design, Date.now(), env.PORTAL_URL || `${site(env, req)}/readouts`);
  if (!env.EMAIL) throw new Error('Email is not set up (send_email binding EMAIL).');
  await env.EMAIL.send({ to, from: { email: env.MAIL_FROM ?? 'readouts@sp4cetime.store', name: 'sp4cetime Starsigns' }, subject: mail.subject, html: mail.html, text: mail.text });
  return json({ ok: true, sent: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (url.pathname === '/api/config' && req.method === 'GET')
        return json({ ready: !!env.STRIPE_SECRET_KEY, test: !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.startsWith('sk_test') || env.STRIPE_SECRET_KEY.startsWith('rk_test'), portal: env.PORTAL_URL ?? '', coffee: env.COFFEE_URL ?? '', products: PRODUCTS.map((p) => productById(p.id)) });
      if (url.pathname === '/api/checkout' && req.method === 'POST') return await checkout(req, env);
      if (url.pathname === '/api/order' && req.method === 'GET') return await order(url, env);
      if (url.pathname === '/api/subscribe' && req.method === 'POST') return await subscribe(req, env);
      if (url.pathname === '/api/stripe-webhook' && req.method === 'POST') return await webhook(req, env);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
};
