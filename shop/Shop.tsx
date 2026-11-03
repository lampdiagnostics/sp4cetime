/**
 * sp4cetime.store (ADR-0019): the catalogue, a page to customise each item (with a live,
 * watermarked preview), the cart, Stripe Checkout, the order page that makes the files,
 * the Starsigns readout subscription, and astrologers we like. Routes by path; the
 * Worker serves this page for every path that is not /api/.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ASTROLOGERS, type CartItem, cartTotal, type Design, encodeDesign, formatPrice, parseCart, parseDesign, type Product, type ProductId, PRODUCTS, productById, SUBSCRIPTION, type ReadoutInterval } from '../src/core/catalog';
import { art, calendarFile, cardPdf, type MadeFile, makeFiles, openPdf, previewMark, save } from './make';
import { DesignForm, designOf, emptyForm, type FormState, formFromDesign } from './DesignForm';
import { drawArt } from '../src/core/wallArt';

// ---------------------------------------------------------------------------------------
// Routing, cart and remembered design (local storage is a convenience: it may be missing).

function usePath(): [string, (to: string) => void] {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const on = (): void => setPath(location.pathname + location.search);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = (to: string): void => {
    history.pushState(null, '', to);
    setPath(to);
    scrollTo(0, 0);
  };
  return [path, go];
}

const store = {
  get<T>(k: string): T | null {
    try {
      const s = localStorage.getItem(k);
      return s ? (JSON.parse(s) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private window: the cart lasts for this visit only */
    }
  },
};

type Line = { product: ProductId; qty: number; design: string };

function useCart(): [Line[], (l: Line[]) => void] {
  const [lines, setLines] = useState<Line[]>(() => {
    const raw = store.get<Line[]>('sp4ce-cart') ?? [];
    return parseCart(raw) ? raw : [];
  });
  return [
    lines,
    (l) => {
      setLines(l);
      store.set('sp4ce-cart', l);
    },
  ];
}

const items = (lines: Line[]): CartItem[] => parseCart(lines) ?? [];

/** The design carried from sp4cetime.org's ✶ Customize: #starsigns=<base64url JSON>. */
function designFromLink(): FormState | null {
  const m = location.hash.match(/starsigns=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const b = atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))) as { design?: unknown; date?: string; time?: string; zone?: string };
    const d = parseDesign(o.design);
    return d ? formFromDesign(d, o.zone ?? null, o.date ? { date: o.date, time: o.time ?? '' } : null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------

const ICONS: Record<ProductId, string> = { card: '✉', wedding: '❦', calendar: '▦', screensaver: '◐', phone: '▯' };

export function Shop() {
  const [path, go] = usePath();
  const [lines, setLines] = useCart();
  const [form, setForm] = useState<FormState>(() => designFromLink() ?? store.get<FormState>('sp4ce-form') ?? emptyForm());
  const [config, setConfig] = useState<{ ready: boolean; test: boolean; portal: string; coffee: string } | null>(null);
  useEffect(() => store.set('sp4ce-form', form), [form]);
  useEffect(() => {
    if (location.hash.includes('starsigns=')) history.replaceState(null, '', location.pathname + location.search);
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const link = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    go(to);
  };
  const route = path.split('?')[0]!;
  const make = route.match(/^\/make\/([a-z]+)$/);

  let page: React.ReactNode;
  if (make && productById(make[1]!)) page = <Make product={productById(make[1]!)!} form={form} setForm={setForm} onAdd={(l) => (setLines([...lines, l]), go('/cart'))} />;
  else if (route === '/cart') page = <Cart lines={lines} setLines={setLines} go={go} config={config} />;
  else if (route === '/order') page = <Order onDone={() => setLines([])} />;
  else if (route === '/readouts') page = <Readouts form={form} setForm={setForm} config={config} />;
  else if (route === '/subscribed') page = <Subscribed portal={config?.portal ?? ''} />;
  else if (route === '/astrologers') page = <Astrologers />;
  else page = <Home go={go} />;

  return (
    <div className="shop">
      {config?.test && <div className="testbar">Test mode: no real payments. Use card 4242 4242 4242 4242, any future date, any CVC.</div>}
      <header>
        <a href="/" onClick={link('/')} className="brand">
          <span className="logo">✶</span> sp4cetime<span className="tld">.store</span>
        </a>
        <nav>
          <a href="/readouts" onClick={link('/readouts')}>
            Readouts
          </a>
          <a href="/astrologers" onClick={link('/astrologers')}>
            Astrologers
          </a>
          <a href="/cart" onClick={link('/cart')} className="cart-link" aria-label={`Cart, ${count} items`}>
            Cart{count ? <span className="badge">{count}</span> : null}
          </a>
        </nav>
      </header>
      <main>{page}</main>
      <footer>
        <p>
          Made from the real sky by <a href="https://sp4cetime.org">sp4cetime.org</a>, where the path, the video and the one-sided card are free. Positions are astronomy; signs, houses and what they mean are astrology.
        </p>
        <p>
          Digital files only: you download them right after paying (and the link is in your receipt). Payments by Stripe. Questions: reply to your receipt.
        </p>
      </footer>
    </div>
  );
}

function Home({ go }: { go: (to: string) => void }) {
  return (
    <>
      <section className="hero">
        <h1>The sky of your moment, made to keep</h1>
        <p>Birthdays, a new baby, a wedding, an anniversary, or right now: the real positions of the Sun, the Moon and the planets at that minute and place, turned into a card, a calendar, a screensaver or a phone background.</p>
      </section>
      <section className="grid">
        {PRODUCTS.map((p) => (
          <article key={p.id} className="product">
            <div className="icon" aria-hidden>
              {ICONS[p.id]}
            </div>
            <h2>{p.name}</h2>
            <p className="price">{formatPrice(p.cents)}</p>
            <p>{p.blurb}</p>
            <button type="button" className="primary" onClick={() => go(`/make/${p.id}`)}>
              Customize
            </button>
          </article>
        ))}
        <article className="product sub">
          <div className="icon" aria-hidden>
            ✉
          </div>
          <h2>{SUBSCRIPTION.name}</h2>
          <p className="price">{formatPrice(SUBSCRIPTION.cents)} a readout</p>
          <p>The sky now, laid over your own chart, in your inbox every week or every month: each planet’s sign and the house of yours it is passing through, and the close angles it makes to your planets. Stop any time.</p>
          <button type="button" className="primary" onClick={() => go('/readouts')}>
            Subscribe
          </button>
        </article>
      </section>
    </>
  );
}

/** A live picture of the design, watermarked. */
function ArtPreview({ design, shape }: { design: Design; shape: 'wide' | 'tall' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const D = useMemo(() => art(design), [design]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [w, h] = shape === 'tall' ? [390, 845] : [960, 540];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawArt(ctx, D, w, h, 0);
    previewMark(ctx, w, h);
  }, [D, shape]);
  return <canvas ref={ref} className={`preview ${shape}`} aria-label="Preview of your design" />;
}

function Make({ product, form, setForm, onAdd }: { product: Product; form: FormState; setForm: (f: FormState) => void; onAdd: (l: Line) => void }) {
  const [qty, setQty] = useState(1);
  const design = useMemo(() => designOf(product.id === 'wedding' && form.occasion === 'birthday' ? { ...form, occasion: 'wedding' } : form), [form, product.id]);
  const card = product.id === 'card' || product.id === 'wedding';
  return (
    <section className="make">
      <div className="make-form">
        <h1>
          {product.name} <span className="price">{formatPrice(product.cents)}</span>
        </h1>
        <p className="lead">{product.blurb}</p>
        <DesignForm value={form} onChange={setForm} show={{ message: card, calendar: product.id === 'calendar', paper: card || product.id === 'calendar', style: !card }} />
        <ul className="files">
          {product.files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="buy">
          {product.maxQty > 1 && (
            <label className="qty">
              Copies
              <input type="number" min={1} max={product.maxQty} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(product.maxQty, Math.round(+e.target.value) || 1)))} />
              <span className="hint">one design each; for different people, add each to the cart</span>
            </label>
          )}
          <button type="button" className="primary" disabled={!design} onClick={() => design && onAdd({ product: product.id, qty, design: encodeDesign(design) })}>
            Add to cart · {formatPrice(product.cents * qty)}
          </button>
        </div>
      </div>
      <div className="make-preview">
        {design ? (
          <>
            <ArtPreview design={design} shape={product.id === 'phone' ? 'tall' : 'wide'} />
            {(card || product.id === 'calendar') && (
              <button type="button" onClick={() => openPdf(product.id === 'calendar' ? calendarFile(design, true) : cardPdf(design, design.paper, true))}>
                Preview the {product.id === 'calendar' ? 'calendar' : 'card'} (PDF, marked PREVIEW)
              </button>
            )}
            <p className="hint">
              {card ? 'The card prints on both sides of one sheet and folds in half: the names on the front, your message on the back, the sky of that moment inside.' : 'The preview carries a PREVIEW mark; your files will not.'}
            </p>
          </>
        ) : (
          <p className="hint">Pick a date and a place to see your sky.</p>
        )}
      </div>
    </section>
  );
}

function Cart({ lines, setLines, go, config }: { lines: Line[]; setLines: (l: Line[]) => void; go: (to: string) => void; config: { ready: boolean } | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const its = items(lines);
  const pay = async (): Promise<void> => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cart: lines }) });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? 'Checkout could not start.');
      location.assign(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  if (!its.length)
    return (
      <section className="cart">
        <h1>Your cart is empty</h1>
        <button type="button" className="primary" onClick={() => go('/')}>
          See what to make
        </button>
      </section>
    );
  return (
    <section className="cart">
      <h1>Cart</h1>
      <table>
        <tbody>
          {its.map((i, k) => {
            const p = productById(i.product)!;
            return (
              <tr key={k}>
                <td>
                  <b>{p.name}</b>
                  <div className="hint">
                    {i.design.names ? `${i.design.names} · ` : ''}
                    {i.design.when} · {i.design.place}
                  </div>
                </td>
                <td>
                  {p.maxQty > 1 ? (
                    <input
                      type="number"
                      aria-label="Copies"
                      min={1}
                      max={p.maxQty}
                      value={i.qty}
                      onChange={(e) => setLines(lines.map((l, j) => (j === k ? { ...l, qty: Math.max(1, Math.min(p.maxQty, Math.round(+e.target.value) || 1)) } : l)))}
                    />
                  ) : (
                    '1'
                  )}
                </td>
                <td className="num">{formatPrice(p.cents * i.qty)}</td>
                <td>
                  <button type="button" className="link" onClick={() => setLines(lines.filter((_, j) => j !== k))} aria-label={`Remove ${p.name}`}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">
              <b>{formatPrice(cartTotal(its))}</b>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {err && <p className="error">{err}</p>}
      <div className="buy">
        <button type="button" onClick={() => go('/')}>
          Keep shopping
        </button>
        <button type="button" className="primary" disabled={busy || config?.ready === false} onClick={() => void pay()}>
          {busy ? 'Opening checkout…' : 'Checkout'}
        </button>
      </div>
      {config?.ready === false && <p className="hint">Checkout opens soon.</p>}
      <p className="hint">Checkout is on Stripe’s secure page. Your files are made in your browser right after payment.</p>
    </section>
  );
}

function Order({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<{ items: CartItem[]; email: string } | { error: string } | null>(null);
  const [files, setFiles] = useState<Array<{ title: string; files: MadeFile[] }>>([]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('session_id') ?? '';
    fetch(`/api/order?session_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(async (j: { items?: Line[]; email?: string; error?: string }) => {
        if (j.error || !j.items) return setState({ error: j.error ?? 'That order could not be found.' });
        const its = items(j.items);
        setState({ items: its, email: j.email ?? '' });
        onDone();
        const out = [];
        for (const i of its) out.push({ title: `${productById(i.product)!.name}${i.qty > 1 ? ` × ${i.qty}` : ''}${i.design.names ? ` · ${i.design.names}` : ''}`, files: await makeFiles(i.product, i.design) });
        setFiles(out);
      })
      .catch(() => setState({ error: 'That order could not be loaded. Try the link in your receipt again.' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!state) return <section className="order"><p>Finding your order…</p></section>;
  if ('error' in state) return <section className="order"><h1>Hmm</h1><p className="error">{state.error}</p></section>;
  return (
    <section className="order">
      <h1>Thank you!</h1>
      <p>
        Your files are ready{state.email ? `; the receipt went to ${state.email}` : ''}. Keep this page’s address (it is in the receipt too): it makes the files again any time.
      </p>
      {files.length === 0 && <p>Making your files…</p>}
      {files.map((g) => (
        <div key={g.title} className="made">
          <h2>{g.title}</h2>
          {g.files.map((f) => (
            <button key={f.name} type="button" onClick={() => save(f)}>
              ⤓ {f.name}
            </button>
          ))}
        </div>
      ))}
      <p className="hint">Cards and calendars: print on both sides (flip on the short edge) for the card; at 100% size. The screensaver page works offline: open it in a browser, click for full screen, or set it as a screensaver with an app that shows web pages (WebViewScreenSaver on a Mac, Lively Wallpaper on Windows).</p>
    </section>
  );
}

function Readouts({ form, setForm, config }: { form: FormState; setForm: (f: FormState) => void; config: { ready: boolean } | null }) {
  const [interval, setInterval] = useState<ReadoutInterval>('week');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const design = useMemo(() => designOf(form), [form]);
  const sub = async (): Promise<void> => {
    if (!design) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ design: encodeDesign(design), interval }) });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? 'Could not start.');
      location.assign(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <section className="make">
      <div className="make-form">
        <h1>
          {SUBSCRIPTION.name} <span className="price">{formatPrice(SUBSCRIPTION.cents)} a readout</span>
        </h1>
        <p className="lead">Your moment (usually your birth) once; then the sky as it is, laid over your chart, by email. Each readout: every planet’s sign today and the house of yours it is in, the Moon’s phase, and the close angles (aspects) to your own planets. With links to astrologers who write about what they mean.</p>
        <DesignForm value={form} onChange={setForm} show={{ occasion: false, style: false }} />
        <fieldset className="interval">
          <legend>How often</legend>
          {SUBSCRIPTION.intervals.map((i) => (
            <label key={i}>
              <input type="radio" name="interval" checked={interval === i} onChange={() => setInterval(i)} /> Every {i} · {formatPrice(SUBSCRIPTION.cents)} each {i}
            </label>
          ))}
        </fieldset>
        {err && <p className="error">{err}</p>}
        <div className="buy">
          <button type="button" className="primary" disabled={!design || busy || config?.ready === false} onClick={() => void sub()}>
            {busy ? 'Opening checkout…' : `Subscribe · ${formatPrice(SUBSCRIPTION.cents)} / ${interval}`}
          </button>
        </div>
        <p className="hint">The first readout comes as soon as you subscribe; then one each {interval}, charged as it is sent. Stop any time from the link in every email.</p>
      </div>
    </section>
  );
}

function Subscribed({ portal }: { portal: string }) {
  return (
    <section className="order">
      <h1>You’re subscribed</h1>
      <p>Your first readout is on its way to your inbox. Each one has a link to stop or change your subscription{portal ? '' : '.'}</p>
      {portal && (
        <p>
          <a href={portal}>Manage your subscription</a>
        </p>
      )}
    </section>
  );
}

function Astrologers() {
  return (
    <section className="astrologers">
      <h1>Astrologers we like</h1>
      <p className="lead">sp4cetime shows where everything was; these people write about what it might mean. No affiliation, nothing paid either way.</p>
      <ul>
        {ASTROLOGERS.map((a) => (
          <li key={a.url}>
            <a href={a.url} target="_blank" rel="noopener">
              {a.name}
            </a>
            <p>{a.about}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
