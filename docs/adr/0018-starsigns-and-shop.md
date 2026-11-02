# ADR-0018: Starsigns, a free path; its video and PDF sold on sp4cetime.shop

Status: accepted in part (2 November 2026). The path, the PDF and the recording are built; the shop and its payment provider are the owner's to set up.

## Context

0.4.0 adds **✶ Starsigns** (owner, 2 November 2026; first called "the Astrology gift"). A dialog takes a date, a local time and a place (a town is taken at its centre: "Winnipeg" projects from the middle of town). It makes a **path** (ADR-0017) that anyone can play for free: the **signs**, the planets floating over the world seen from space, then the **houses**, seen from the place itself. The **video** of that path and a **printable, customisable PDF** (every body's sign, degree and house, the Ascendant and Midheaven, a chart wheel, links to read more) are the paid package: **US$1.99** on **sp4cetime.shop**.

This keeps DECISIONS §1: the free instrument shows real positions, signs and houses, labelled as astronomy and astrology; what is sold is the finished film and sheet, never a truer picture.

## Decision

1. **A path like any other.** `src/core/starsigns.ts` turns a reading (`src/core/reading.ts`) into a six-point path: START, the calendar at the moment; Earth from space with the planets labelled by sign; high over the place; standing there facing the Ascendant on the eastern horizon, the houses drawn on the sky; looking up to the Midheaven; END, Earth and the zodiac. It is saved with the person's other paths (Present, ⤓ Download as `.sp4ce.json`), so it is free to keep, share and replay. Its points carry the chart (`look.chart`: place, house system), so they restore it (CLAUDE.md rule 16).
2. **The house overlay** belongs to the instrument: in 3D, with a chart on, the place's horizon, the 12 house boundaries, ASC and MC are drawn on the sky, and each body's label gains its degree and house ("Mars · ♋ 23° Cancer · house 9"). Elements › Starsigns houses turns it off.
3. **The package.** The video is the path played on its own and recorded by Capture (`recordVideo`; a hold at each point; about 30–40 seconds; captions and the @sp4cetime.org mark included). The PDF is written by our own small writer (`src/core/pdf.ts`, standard fonts, no dependency) and laid out in `src/core/starsignsPdf.ts`; a free preview carries a PREVIEW mark.
4. **The shop sells and unlocks.** "⤓ Get the video and the PDF · US$1.99" opens `sp4cetime.shop` with the order in the URL *fragment* (`#starsigns=…`), which browsers never send to a server: no birth data reaches a server, a log or the payment provider. After paying, the shop page makes the same package in the browser (the same code) and downloads it. One small Cloudflare Worker route asks the provider whether the checkout was paid (the secret key lives in the Worker's settings). Until the shop takes payments (`SHOP_OPEN` in `src/app/shop.ts`), the button says the shop opens soon; in development (`npm run dev`) it makes the package without paying, so the owner can try it.
5. **Honesty.** The code is open source, so the paywall is a convenience, not a lock: people pay for the finished package and to support the project. Anyone can play the path and record it with ◉ Capture themselves; the shop says so.
6. **The first server code** is that one Worker route, on the shop's domain; sp4cetime.org stays static. No accounts, no database: the provider's record is the receipt.

## Payment provider (owner to choose)

Approximate fees on a **US$1.99** sale (the providers' pages, November 2026; check before signing up):

| Provider | Fee | Kept of US$1.99 | Sales tax |
| --- | --- | --- | --- |
| Stripe (Checkout or Payment Links), Canadian account | 2.9% + C$0.30; +0.8% foreign cards; +2% currency conversion | about US$1.65 | You register and remit (GST/HST past C$30,000 in four quarters; other countries' rules for digital sales); Stripe Tax can calculate (+0.5%) |
| Stripe Managed Payments (Stripe as merchant of record) | Stripe's fee + 3.5% | about US$1.58 | Stripe handles it worldwide; check that Canadian sellers are eligible |
| Lemon Squeezy or Paddle (merchant of record) | 5% + US$0.50 | about US$1.39 | Handled |
| Gumroad (merchant of record since 2025) | 10% + US$0.50, plus card processing | about US$0.95 | Handled; payouts outside the US via PayPal |

Recommendation: **Stripe**, Managed Payments if open to a Canadian seller (tax handled), plain Checkout otherwise. Gumroad sells fixed files; a made-to-order package would need its licence keys, an extra step for the buyer. (Not tax or financial advice.)

## Consequences

- Built: `houses.ts`, `places.ts` (Natural Earth towns with time zones), `reading.ts`, `starsigns.ts`, `pdf.ts`, `starsignsPdf.ts`; `src/app/zones.ts`, `StarsignsDialog.tsx` (loaded on first open), `shop.ts`; the chart overlay in `src/fly/sky.ts` and `FlyView.tsx`.
- Found on the way: Earth was drawn turned up to 180° for dates before 2000 (its pole's reported right ascension flips); fixed in `bodies.ts` and tested against astronomy-engine's Sun altitudes, 1600–2400.
- To do: the shop page and Worker, the provider account, terms, refunds and a privacy note (the owner's accounts and words; Claude prepares, the owner approves anything that publishes or touches money); a partner's horoscope text if one is chosen.
