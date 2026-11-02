# ADR-0018: The astrology gift, previewed free, sold on sp4cetime.shop

Status: proposed (2 November 2026). The payment provider is the owner's choice (below).

## Context

0.4.0 adds an **Astrology** button (owner, 2 November 2026): a dialog takes a time and a place, and the app makes a short video showing the **signs** (the planets floating over the world, seen from above) and the **houses** (from the place itself, or the middle of a less precise place: "Winnipeg" projects from the centre of town). At the end comes a **printable, customisable PDF** listing every body's sign and house for that date and place, with links to horoscope text (free sources, or a partner). The package costs **$0.99**, bought on **sp4cetime.shop**. People can **preview the gift in the free version**; a button takes them to the shop to download it.

This reconciles DECISIONS §1 ("interpretations and horoscope links in a separate, clearly labelled product on the same engine"): the free instrument shows real positions, signs and houses, labelled as astronomy and astrology; the paid package adds the finished video, the PDF and the horoscope links.

## Decision

1. **Same engine, two doors.** The dialog, the maths (`src/core/houses.ts`), the flight and the rendering run in the browser on sp4cetime.org. The preview plays there at once: the full video at screen resolution with a *Preview* mark, and the PDF's first page.
2. **The shop only sells and unlocks.** "Get the package · $0.99" opens `sp4cetime.shop` with the chart in the URL *fragment* (`#d=…`), which browsers never send to a server, so no birth data reaches a server, a log or the payment provider. The shop page shows what will be made, then goes to a hosted checkout.
3. **After paying**, the checkout returns to `sp4cetime.shop/done?session=…`. One small Cloudflare Worker route asks the payment provider whether that session was paid (the secret key lives in the Worker's settings, never in the page). If it was, the page renders the full-quality video (1080p, no Preview mark, the @sp4cetime.org watermark kept small) and the PDF in the browser and downloads them, with a link that works again for 7 days from the same browser.
4. **Honesty.** The code is open source, so the paywall is a convenience, not a lock: people pay for the finished package and to support the project. The PDF and the video say which parts are astronomy (positions, signs as measured from the equinox of the date) and which are astrology (houses, meanings), and credit the horoscope source.
5. **The first server code.** A1 said "no backend". This adds one Worker route (payment check) on the shop's domain; sp4cetime.org stays static. No accounts, no database: the payment provider's record is the receipt.

## Payment provider (owner to choose)

At $0.99 the fixed part of each fee dominates (figures from the providers' pages, November 2026; check before signing up):

| Provider | Fee | On a $0.99 sale | Sales tax |
| --- | --- | --- | --- |
| Stripe (Checkout or Payment Links), Canadian account | 2.9% + C$0.30; +0.8% for cards from abroad; +2% if currency is converted | about C$0.33 (≈ a third) | You register and remit (GST/HST once over C$30,000 in four quarters; other countries' digital-sales rules); Stripe Tax can calculate it (+0.5%) |
| Stripe Managed Payments (Stripe as merchant of record; grew out of its purchase of Lemon Squeezy) | Stripe's fee + 3.5% | about C$0.36 | Stripe is the seller of record and handles tax worldwide. Check that Canadian sellers are eligible |
| Lemon Squeezy or Paddle (merchant of record) | 5% + US$0.50 | about US$0.55 (more than half) | Handled for you |

Recommendation: **Stripe**, with Managed Payments if it is open to a Canadian seller (tax handled, about a third of the price in fees); plain Stripe Checkout otherwise, while sales are small and mostly Canadian. Consider a price of $1.99 or a bundle: at $0.99 any provider keeps a third or more. (Not tax or financial advice; check with an accountant.)

## Consequences

- New: `src/core/houses.ts` (done), the place lookup (a gazetteer of towns with their centres, public data), the Astrology dialog and the video path (`src/app`), a PDF writer (in the browser; a small permissive library or our own, ADR line needed), the shop page and its Worker (a separate small site, or a route of this one).
- Payments, refunds and the shop's terms and privacy note need the owner's accounts and words; Claude prepares, the owner approves anything that publishes or touches money.
