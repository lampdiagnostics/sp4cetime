# ADR-0018: Starsigns free on sp4cetime.org; customising on sp4cetime.shop

Status: accepted in part (2 November 2026; revised twice that evening: no prices on the main site). The path, the card and the recording are built; the shop, its customisation page and its payment provider are the owner's to set up.

## Context

0.4.0 adds **✶ Starsigns** (owner, 2 November 2026; first called "the Astrology gift"). A dialog takes a date, a local time and a place (a town is taken at its centre: "Winnipeg" projects from the middle of town). It makes a **path** (ADR-0017) that anyone can play for free: the **signs**, the planets floating over the world seen from space, then the **houses**, seen from the place itself. **Everything on sp4cetime.org is free and shows no price** (owner, 2 November 2026, after trying $0.99, $1.99 and $1.49): playing the path, its video (◉ Capture), the inside of a birthday card (one page) and the path as `.sp4ce.json`. The site carries only **☕ Buy us a coffee!** (a Stripe Payment Link, the amount the buyer's choice) and **✶ Customize**, which leads to **sp4cetime.shop**: cards and videos customised for occasions (birthdays, a birth, a wedding, this very moment), names and artwork, GIFs, PDFs, SVG posters, screen savers, templates (e.g. for personality types), and later other people's templates and paths.

This keeps DECISIONS §1: the free instrument shows real positions, signs and houses, labelled as astronomy and astrology; what is sold is the finished film and sheet, never a truer picture.

## Decision

1. **A path like any other.** `src/core/starsigns.ts` turns a reading (`src/core/reading.ts`) into the owner's four steps: above Earth's north pole facing the Sun; the planets in as few views as hold them (`groupDirections`), each picked out in turn (`look.highlight`); down to the place looking straight up (the sky coloured by the Sun's altitude); up, Earth dropping away, to the 3D chart wheel (`src/fly/wheel.ts`), each body picked out with its house. It is saved with the person's other paths (Present, ⤓ Download as `.sp4ce.json`), so it is free to keep, share and replay. Its points carry the chart (`look.chart`: place, house system), so they restore it (CLAUDE.md rule 16).
2. **The house overlay** belongs to the instrument: in 3D, with a chart on, the place's horizon, the 12 house boundaries, ASC and MC are drawn on the sky, and each body's label gains its degree and house ("Mars · ♋ 23° Cancer · house 9"). Elements › Starsigns houses turns it off.
3. **The package.** The video is the path played on its own and recorded by Capture (`recordVideo`; a hold at each point; about 30–40 seconds; captions and the @sp4cetime.org mark included). The PDF is written by our own small writer (`src/core/pdf.ts`, standard fonts, no dependency) and laid out in `src/core/starsignsPdf.ts`; a free preview carries a PREVIEW mark.
4. **The shop customises and sells.** "✶ Customize" opens `sp4cetime.shop` with the order in the URL *fragment* (`#starsigns=…`), which browsers never send to a server: no birth data reaches a server, a log or the payment provider. After paying, the shop page makes the same package in the browser (the same code) and downloads it. One small Cloudflare Worker route asks the provider whether the checkout was paid (the secret key lives in the Worker's settings). Until the shop is up (`SHOP_OPEN` in `src/app/shop.ts`), the button is greyed and says the shop is coming. The coffee button shows once `COFFEE_URL` holds the Stripe Payment Link.
5. **Honesty.** The free site gives the whole instrument and its Starsigns output; the shop sells customisation and extra formats, never a truer picture (DECISIONS §1). The code is open source.
6. **The first server code** is that one Worker route, on the shop's domain; sp4cetime.org stays static. No accounts, no database: the provider's record is the receipt.

## Payment provider (owner to choose)

Approximate fees on a **US$1.99** sale (at US$1.49 the fixed parts weigh more: Stripe keeps about US$1.18, Lemon Squeezy or Paddle about US$0.92, Gumroad about US$0.50) (the providers' pages, November 2026; check before signing up):

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
- To do: hospitals first in the place search (a CC0 or CC BY list the owner downloads); a sped-up GIF and SVG pictures; the shop page with its customisation (name, artwork) and Worker, the provider account, terms, refunds and a privacy note (the owner's accounts and words; Claude prepares, the owner approves anything that publishes or touches money); a partner's horoscope text if one is chosen.
