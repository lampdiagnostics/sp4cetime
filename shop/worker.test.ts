import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env, form, readoutFor, verifyStripe } from './worker';
import { encodeDesign, type Design } from '../src/core/catalog';

const design: Design = {
  occasion: 'birthday',
  names: 'Ada',
  message: 'Hi',
  day: -5_284,
  sec: 73_200,
  when: '14 July 1985, 3:20 pm (UTC−5)',
  noTime: false,
  place: 'Winnipeg, Manitoba, Canada',
  lat: 49.88,
  lon: -97.15,
  system: 'whole',
  paper: 'letter',
  style: 'night',
};

const PRICES = [
  { id: 'price_card', lookup_key: 'card', unit_amount: 399 },
  { id: 'price_phone', lookup_key: 'phone', unit_amount: 99 },
  { id: 'price_rw', lookup_key: 'readout_week', unit_amount: 399 },
];

function env(over: Partial<Env> = {}): Env {
  return { ASSETS: { fetch: async () => new Response('page') }, STRIPE_SECRET_KEY: 'sk_test_x', SITE_URL: 'https://sp4cetime.store', ...over };
}

afterEach(() => vi.unstubAllGlobals());

async function sign(body: string, secret: string, t: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return `t=${t},v1=${[...sig].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

describe('Stripe form encoding', () => {
  it('nests objects and arrays the way Stripe reads them', () => {
    const f = form({ mode: 'payment', line_items: [{ price: 'p1', quantity: 2 }], metadata: { n: '1' }, skip: undefined });
    expect(f.toString()).toBe('mode=payment&line_items%5B0%5D%5Bprice%5D=p1&line_items%5B0%5D%5Bquantity%5D=2&metadata%5Bn%5D=1');
    expect(form({ lookup_keys: ['a', 'b'] }).toString()).toBe('lookup_keys%5B0%5D=a&lookup_keys%5B1%5D=b');
  });
});

describe('webhook signatures', () => {
  it('accepts Stripe’s signature and refuses a changed body, a wrong secret or an old one', async () => {
    const t = 1_800_000_000;
    const h = await sign('{"a":1}', 'whsec_1', t);
    expect(await verifyStripe('{"a":1}', h, 'whsec_1', t + 10)).toBe(true);
    expect(await verifyStripe('{"a":2}', h, 'whsec_1', t + 10)).toBe(false);
    expect(await verifyStripe('{"a":1}', h, 'whsec_2', t + 10)).toBe(false);
    expect(await verifyStripe('{"a":1}', h, 'whsec_1', t + 600)).toBe(false);
    expect(await verifyStripe('{"a":1}', 'nonsense', 'whsec_1', t)).toBe(false);
  });
});

describe('checkout', () => {
  it('charges Stripe’s prices for a valid cart and keeps the design in the session', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.includes('/v1/prices')) return new Response(JSON.stringify({ data: PRICES }));
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    });
    const cart = [{ product: 'card', qty: 2, design: encodeDesign(design) }];
    const res = await worker.fetch(new Request('https://sp4cetime.store/api/checkout', { method: 'POST', body: JSON.stringify({ cart }) }), env());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toContain('checkout.stripe.com');
    const s = new URLSearchParams(calls[1]!.body);
    expect(s.get('line_items[0][price]')).toBe('price_card');
    expect(s.get('line_items[0][quantity]')).toBe('2');
    expect(s.get('metadata[i0]')).toMatch(/^card\|2\|\{/);
    expect(s.get('success_url')).toBe('https://sp4cetime.store/order?session_id={CHECKOUT_SESSION_ID}');
  });

  it('refuses when Stripe’s price is not the catalogue’s', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ id: 'p', lookup_key: 'card', unit_amount: 1 }] })));
    const res = await worker.fetch(new Request('https://x/api/checkout', { method: 'POST', body: JSON.stringify({ cart: [{ product: 'card', qty: 1, design: encodeDesign(design) }] }) }), env());
    expect(res.status).toBe(500);
  });

  it('refuses a cart it cannot read', async () => {
    const res = await worker.fetch(new Request('https://x/api/checkout', { method: 'POST', body: JSON.stringify({ cart: [{ product: 'card', qty: 99, design: encodeDesign(design) }] }) }), env());
    expect(res.status).toBe(400);
  });
});

describe('orders', () => {
  it('gives the lines of a paid session only', async () => {
    const meta = { n: '1', i0: `phone|1|${encodeDesign(design)}` };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ payment_status: 'paid', metadata: meta, customer_details: { email: 'a@b.test' }, livemode: false })));
    const ok = await worker.fetch(new Request('https://x/api/order?session_id=cs_test_abc'), env());
    const j = (await ok.json()) as { items: Array<{ product: string }>; email: string };
    expect(j.items[0]!.product).toBe('phone');
    expect(j.email).toBe('a@b.test');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ payment_status: 'unpaid', metadata: meta })));
    expect((await worker.fetch(new Request('https://x/api/order?session_id=cs_test_abc'), env())).status).toBe(402);
    expect((await worker.fetch(new Request('https://x/api/order?session_id=../../etc'), env())).status).toBe(400);
  });
});

describe('readouts', () => {
  it('sends the readout when a subscription invoice is paid', async () => {
    const sent: Array<{ to: string; subject: string }> = [];
    const body = JSON.stringify({
      type: 'invoice.paid',
      data: { object: { customer_email: 'ada@b.test', parent: { subscription_details: { subscription: 'sub_1', metadata: { design: encodeDesign(design) } } } } },
    });
    const header = await sign(body, 'whsec_1', Math.floor(Date.now() / 1000));
    const res = await worker.fetch(
      new Request('https://x/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': header } }),
      env({ STRIPE_WEBHOOK_SECRET: 'whsec_1', EMAIL: { send: async (m) => void sent.push(m) } }),
    );
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ada@b.test');
    expect(sent[0]!.subject).toContain('Ada');
  });

  it('writes a readout for any moment', () => {
    const m = readoutFor(design, Date.UTC(2026, 10, 2, 18), 'https://sp4cetime.store/readouts');
    expect(m.subject).toBe('Your Starsigns readout for Ada: 2 November 2026');
    expect(m.text).toMatch(/your \d+ · /);
  });
});
