# 0019. sp4cetime.store: a digital shop on Stripe and one Worker

Date: 2026-11-02 · Status: accepted (built in Stripe's sandbox; going live needs the owner's Stripe account and Cloudflare setup) · Supersedes the shop part of [0018](0018-starsigns-and-shop.md) (the domain is **sp4cetime.store**, not .shop)

## Context

The owner wants sp4cetime.org to stay free (no prices; a ☕ Buy us a coffee! link beside each free download: the video, the one-sided card and the path token) and a shop at sp4cetime.store with: a customisable birthday or commemorative card (US$3.99), a wedding pack (one design for every guest, US$19.99, in place of bulk pricing), a sky calendar (US$5.99), a screensaver (US$1.99), a phone background (US$0.99), a cart and checkout, a Starsigns readout by email each week or month (US$3.99 a readout), and links to astrologers. All digital for now (owner: no T-shirt or printed calendar until later).

## Decision

- **One Cloudflare Worker** (`shop/worker.ts`, `wrangler.store.jsonc`) serves the shop page (`shop/`, built to `dist-shop/` by `vite.shop.config.ts`) and five API routes: checkout, order, subscribe, the Stripe webhook, config. sp4cetime.org stays static.
- **Stripe Checkout** (hosted page) for the cart and the subscription; **a Payment Link** (pay what you like, `submit_type=donate`) for the coffee. Products and prices live in Stripe with **lookup keys** (`card`, `wedding`, `calendar`, `screensaver`, `phone`, `readout_week`, `readout_month`, `coffee`); the Worker refuses to sell if Stripe's amount differs from `src/core/catalog.ts`. Stripe is called with `fetch` (no SDK, rule 8).
- **No database.** The cart lines (product, copies, the design as short JSON, under 500 characters: property-tested) ride in the Checkout session's metadata; the readout's chart rides in the subscription's metadata. The order page asks the Worker for a paid session and **makes the files in the buyer's browser** with the same code as the watermarked preview (`shop/make.ts`): PDFs from our writer, PNGs from a canvas, the screensaver as one offline HTML page. The page's address is in Stripe's receipt, so files can be made again.
- **Readouts**: Stripe bills each week or month; its `invoice.paid` webhook (signature checked with Web Crypto) makes that readout (`src/core/transits.ts`: today's bodies in the person's houses, the Moon's phase, close aspects to their chart, astrologers' links) and sends it with **Cloudflare Email Service** (send_email binding; beta; sending to anyone needs Workers Paid, US$5 a month). Cancel and change through Stripe's customer portal (login link in every email).
- New pure core: `catalog.ts`, `transits.ts`, `almanac.ts` (Moon phases and signs, ingresses, stations by GMT day), `calendarPdf.ts`, `wallArt.ts` (one self-contained drawing for pictures and the screensaver), `screensaver.ts`; the card gains a cover (occasion, names, message). Tests for each.

## Consequences

- Files are made client-side from open code, so a determined person could make them without paying; acceptable for items this size (the same views are free on sp4cetime.org), and it keeps the shop serverless and private (designs are not stored by us beyond Stripe).
- Each readout is computed at send time, for the moment Stripe bills (not a fixed weekday hour).
- Going live: the owner activates Stripe (business details, bank account; they type these), re-creates the prices in live mode (same lookup keys), gives the Worker its secret key and webhook secret, onboards sp4cetime.store for Email Sending, and points the domain at the Worker. Sales tax (GST/HST once over CA$30,000 a year; elsewhere as required) is the owner's to register for; Stripe Tax can collect it.
- Physical goods (T-shirt, printed calendar) later through a print-on-demand service, each with its own ADR.
