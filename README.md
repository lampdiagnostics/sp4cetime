# sp4cetime · Galactic Calendar

**Map any timeline on the path the solar system is already traveling.**

sp4cetime is a zoomable map of time drawn as the real motion of the solar system. The Sun is always *now*, travelling at 230 km/s along its path around the galaxy; the planets and the Moon wind around that path as spirals, in their true orientation, from the Sun's birth (−4.6 billion years) to the end of its main-sequence life (+5 billion years). Time and distance grids flow past the Sun as the present moves. A 3D **Fly mode** puts you inside the solar system at true scale and in real sunlight, under the real sky, and out to the whole Milky Way, its central black hole and its neighbour galaxies.

Version 0.4.2 · 4 November 2026 · solo, part-time project (Lamp Diagnostics) with AI help.
Live at [sp4cetime.org](https://sp4cetime.org). (Versions carry a leading zero until the public launch, which will be 1.0.)

## Where it is going

The direction, in order (detail in [docs/PLAN.md](docs/PLAN.md) and [DECISIONS.md](DECISIONS.md)):

1. **A truthful instrument first.** Real positions where they are known, honest labels where they are modelled, nothing invented. Every measure is an arc on a sphere (degrees, minutes, seconds), every view is north-up with the Sun in sight. One scale only: true.
2. **Stories (the Library).** Events placed on the timeline, gathered into stories that play as guided flights. Paths (guided flights through chosen views) come first, in 0.3.0. One file format (`.sp4ce.json`) for downloads, share links and curated Library entries.
3. **Sharing.** Read-only links and embeds; local-first storage, no accounts until people ask for sync. Screenshots, GIFs and videos already work (0.2.0), watermarked "@sp4cetime.org".
4. **Pro tier**, before any marketplace: sells output, polish and privacy (story videos, posters, private links, unbranded embeds, extra themes), never a truer picture. Free users always see the same science.
5. Year two, only if wanted: theme editor, accounts and sync, education licence, creator marketplace.
6. **Four modes** (the 4 in sp4cetime): Galactic (built), then Planetary (detailed Earth, Moon and Mars from public geodata; imaginary planets), Cellular and Atomic, all on one model of spheres and skins. To-do lists: [docs/ROADMAP.md](docs/ROADMAP.md); the spheres: [docs/SPHERES.md](docs/SPHERES.md).

What exists today (0.3.0) is the instrument (the calendar, Fly mode, the sky, the galaxy, and capture) and paths: presentations flown through it. It is a toy as much as a tool; the owner's next step is to show it publicly. Stories, sharing links and Pro are not built yet.

## 0.3.0: paths through time and space

A **path** is a presentation, Prezi-style: a sequence of chosen views of the map, and the viewer flies from one to the next.

**Making a path** (not in Presentation mode). Go to a place in the map and press **Return**. A dialog asks: *Start a path? Name it.* Confirm, and what is on screen becomes **START**. Travel to a different time, place and view and press Return again: the same dialog asks you to confirm the current view as **POINT 1**, with an optional caption and a choice to **stop making the path after this point**. Go on for POINT 2, 3 …; the point you stop at is **END**. (In the dialog, Return confirms and Esc cancels.)

**A point is exactly what is on screen** when Return is pressed, in any view: calendar, Fly or galaxy; the moment and the time zoom; the camera (position, direction, size, field of view); the theme; round or full window; which planets and elements are shown; whether the boxes and labels are showing (the space-bar state); whether time is running or paused, and at what speed and direction. Arriving at the point puts all of that back.

**Presenting.** The **▷ Paths** button (beside ◉ Capture) lists the saved paths: **▶ Go** flies one and records it, then offers the Download package; **Shift** plays it without recording (Shift again stops). In Presentation mode the viewer *flies* between points; nothing disappears at one point and reappears at the next. **Return** or **→** goes on to the next point; **←** goes back to the previous one. After arriving, the viewer is free to look around, move and zoom; then Return or either arrow **only flies them back to that point**, and the next press continues along the path. Each point of a loaded path has a point box describing its view, position, time and view angle, and showing its caption.

**Transitions.** Every change between points is shaped to be as beautiful as it can be, not just interpolated: calendar ↔ Fly ↔ galaxy, Dark ↔ Bright ↔ Colour, round ↔ full, boxes and labels appearing and going. Time and distance change by equal factors in equal steps (as the warp does), so a jump of a billion years or of 40 kpc reads as clearly as a day or a few km; directions turn with easing. Each kind of transition is designed and checked by eye in screenshots and Capture videos. With reduced motion, short cross-fades.

**Storage.** Paths are files: light `.sp4ce.json` (version 2: a name and a list of points with their view, moment, place and mode; numbers rounded; the look only where it differs). People download theirs and upload them again to present or continue them; no accounts. The browser keeps a copy (IndexedDB) so the list survives a reload; example paths ship in `public/paths/` (listed in `index.json`). Cloud storage and sync could be Premium later.

**Code.** `src/core/path.ts` (schema, `.sp4ce.json` validation, the time-flight curve, with property tests across ±5 Gyr), `src/app/flights.ts` (flying between points), `src/app/pathStore.ts` (IndexedDB, export, import), `PathDialog.tsx`, and the wiring in `App.tsx`, `Pane.tsx`, `GalacticCanvas.tsx` and `FlyView.tsx`. The design and its reasons: [ADR-0017](docs/adr/0017-paths.md).

**Status:** built and released in 0.3.0 (tag `v0.3.0`), checked in headless Chromium in the calendar, Fly and the galaxy.

## Going live (0.3.0)

0.3.0 is the public beta, **live at [sp4cetime.org](https://sp4cetime.org)** since 1 November 2026. The code is open source (see **Licence** below) at [github.com/lampdiagnostics/sp4cetime](https://github.com/lampdiagnostics/sp4cetime). The owner approves anything that publishes, changes an account or touches DNS, and types every password and token.

How it is set up (done):
1. **GitHub.** `lampdiagnostics/sp4cetime`, public; CI (typecheck, tests, build, bundle budgets) runs on every push. Claude's GitHub app has access to this repository only.
2. **Cloudflare Workers.** The Worker `sp4cetime` builds from GitHub on every push to `main` (build `npm run build`, deploy `npx wrangler deploy`, `NODE_VERSION=22`; `wrangler.jsonc` serves `dist` as a single-page app). Temporary address: sp4cetime.lampdiagnostics.workers.dev.
3. **Domain.** `sp4cetime.org` and `www.sp4cetime.org` attached as custom domains, HTTPS automatic.
4. **Page counts.** Cloudflare Web Analytics: anonymous, no cookies, no personal data (said so in *About this beta*).
5. **Email.** Email Routing: `hello@sp4cetime.org` forwards to the owner's inbox (finish: add the Email Routing DNS records, verify the inbox).

Still to do: tags `v0.1.0`, `v0.2.0`, `v0.3.0`, `v0.3.1` and releases on GitHub (pushed by the owner from the Mac: cloud sessions cannot push tags or make releases); the device checks (docs/ROADMAP.md, "after the launch").

What goes up: everything git tracks. `.gitignore` keeps out `node_modules/`, `dist/`, `.env` files, logs and `.DS_Store`.

## Opening sp4cetime.store: the money trail

Where it stands (2 November 2026, v0.4.0): the shop and the coffee buttons are built, tested and on GitHub; everything is set up in Stripe's **sandbox** ("Lamp Diagnostics sandbox", test mode) and works there; nothing takes real money yet. sp4cetime.com, .io and .ai already redirect to sp4cetime.org.

How the money moves, once live: a buyer pays on Stripe's own checkout page (card, Apple Pay, Google Pay, Link) → Stripe holds it, minus its fee (about 2.9% + 30¢ a card payment; small payments like a $0.99 background lose about a third) → Stripe pays out to the bank account on a rolling schedule (first payout about a week after the first sale, then every few days). Prices are in US dollars; Stripe converts to Canadian dollars at payout unless a USD bank account is added. Coffees work the same way through a Payment Link and need nothing from the shop.

Step by step, in order. The owner signs in and types every password, key, ID and bank detail; Claude does the rest in the browser or through the Stripe connector:

- [ ] **0. The bank** (owner): call the bank so it accepts deposits from Stripe (Stripe Payments Canada) to the business account, and ask whether it needs anything (a business account, a merchant letter).
- [ ] **1. Activate Stripe** (owner): dashboard › Activate payments. Business type (sole proprietor, Lamp Diagnostics), the business number if any, identity check, the bank account for payouts. Public details: name "sp4cetime", statement descriptor "SP4CETIME", a support email (receipts reply to it), the website sp4cetime.org.
- [ ] **2. Connect live mode to Claude** (owner): in the Stripe connector, add the live account (the connector's "manage accounts" link), so the next session can work in live mode.
- [ ] **3. Live products and prices** (Claude): the same lookup keys as the sandbox (`card` 399, `wedding` 1999, `calendar` 599, `screensaver` 199, `phone` 99, `readout_week` and `readout_month` 399 recurring, `coffee` pay what you like, US$1–500, starting at $5).
- [ ] **4. Coffee link live** (Claude, then the owner pulls): a live Payment Link for `coffee` (submit type donate, thank-you message); its https://donate.stripe.com/… address into `COFFEE_URL` in `src/app/shop.ts` (and `wrangler.store.jsonc`); commit, and the ☕ buttons appear on sp4cetime.org. **The first money can come from here, before the shop opens.** (Sandbox test link to try now: https://donate.stripe.com/test_dRm6oB0rW9og1HD0YxdfG00, card 4242 4242 4242 4242.)
- [ ] **5.** **Customer portal** (Claude in the browser, owner approves): Stripe › Settings › Billing › Customer portal: allow cancelling; copy its login link into `PORTAL_URL` in `wrangler.store.jsonc`.
- [ ] **6.** **Cloudflare Worker** (Claude in the browser, owner approves): Workers & Pages › Create › import the GitHub repo again as a second Worker, **sp4cetime-store**: build command `npm run build:shop`, deploy command `npx wrangler deploy -c wrangler.store.jsonc`. It takes the custom domains sp4cetime.store and www.sp4cetime.store.
- [ ] **7.** **Secrets** (owner types them) (Worker › Settings › Variables and secrets, type Secret): `STRIPE_SECRET_KEY` (a restricted key is best: write access to Checkout Sessions, read to Prices, Subscriptions) and `STRIPE_WEBHOOK_SECRET`.
- [ ] **8.** **Webhook** (Claude, owner copies the secret into step 7): Stripe › Developers › Webhooks › add `https://sp4cetime.store/api/stripe-webhook`, event `invoice.paid`; its signing secret is `STRIPE_WEBHOOK_SECRET`.
- [ ] **9.** **Email** (owner approves the plan; Claude onboards the domain): Cloudflare › Email Service › Email Sending › onboard sp4cetime.store (adds SPF, DKIM, DMARC). Sending to anyone needs the Workers Paid plan (US$5/month).
- [ ] **10.** **Open it** (Claude, then a real test purchase by the owner): set `SHOP_OPEN = true` in `src/app/shop.ts` (✶ Customize turns on); buy one of each with a real card and refund it.
- [ ] **11.** **Tax** (owner): GST/HST registration becomes required once sales pass CA$30,000 in four quarters (small supplier); before that, optional. Stripe Tax can add it at checkout later.
- [ ] **12.** **Words** (owner): short terms, refunds (digital files: refund on request, say within 14 days) and a privacy note in the owner's words, linked from the shop footer.

Run it locally: `npm run dev:shop` (http://localhost:5174; the API needs `npx wrangler dev -c wrangler.store.jsonc` with a `.dev.vars` file holding test keys, never committed).

## 0.4.0: Starsigns and sp4cetime.store (released 2 November 2026)

0.4.0 shipped ✶ Starsigns (free) and the shop (waiting for live payments, above). "Stand here" below, the instrument's ground view, carries on in 0.5.0.

The whole to-do list is in [docs/ROADMAP.md](docs/ROADMAP.md). 0.4.0 has two halves on one engine:

**✶ Starsigns** (owner, 2–3 November 2026; ADR-0018, ADR-0019). The dialog opens on now and here: date, local time, place (or latitude and longitude), house system. **▶ Go** saves the path (listed in **▷ Paths**), flies it and records it (an MP4 made for X), in four poses: on top of the world facing the Sun; around the sky, pausing 2 s over each group of planets (named with their signs); landing in a field at the place, facing the highest point of the zodiac, held 5 s; then the field drops away from your feet while the sky tilts until the whole zodiac rings the view as on the printed chart, every body a coloured disc, held 5 s. A clock caption bottom right starts at your moment and ticks on through the tour; from the landing, the place (`Winnipeg   Lat 49-52-59 N   Lon 97-09-58 W`) sits above it. At the end the **Download package** pops up: **⤓ Download** (free, one .zip: the MP4, a PDF of the last frame with every sign and house by name around the wheel, and the path token), **✶ Customize** and **☕ Buy me a coffee** (both to sp4cetime.store, where Stripe takes the payment). Everything else on screen stays as you set it in the menus. **▷ Paths** lists your paths, with ▶ Go and a drop box for path tokens; **◉ Capture** is six tiles: picture, GIF or video, each small (for X) or large (hi-res). sp4cetime.org shows no prices; the shop, sp4cetime.store, opens after the money trail above.

**How precise must the place be?** The Ascendant moves about 1° for every 4 minutes of time, and a place 1° of longitude further east (about 70 km at Winnipeg's latitude) shifts it by the same 1°. A town's centre (within 10–20 km of a birth) moves it about a quarter of a degree, under the whole degrees shown; the birth time matters far more (each minute is about ¼°). Hospitals are welcome as names people know, not for precision; street intersections add nothing that shows.

**Built so far:** the house maths (`houses.ts`, about an arcsecond against astronomy-engine); signs from the equinox of the viewed date in both views; Earth's first surface skin (coastlines, lakes, borders); ✶ Starsigns with its path, house overlay, PDF and recording. **Still to do:** sp4cetime.store (provider, checkout, one Worker route), the transparent planet and a time range around the moment.

"Stand here" is the instrument's side of it:

The first piece of *Sky on your day* (DECISIONS §1), and the first example of **Planetary mode**: a person standing on a planet is a sphere on that planet's surface skin (docs/SPHERES.md), as a cell will be a sphere in Cellular mode and an atom in Atomic mode. Built into the instrument as an honest view of the real sky over a place, with astrology's houses as a clearly labelled overlay.

**Sign and house, in one line each.** A planet's **sign** is where it sits along the zodiac (its ecliptic longitude seen from Earth's centre): the same for everyone on Earth at that moment. Its **house** is where it sits relative to *one person's horizon* at *one place and time*: the horizon and the meridian of that spot divide the sky into 12 sectors, which sweep the whole sky once a day as Earth turns. So signs need only a date; houses need a date, an exact time and a place.

**The geometry.** At latitude φ and longitude L, with local sidereal time θ = Greenwich apparent sidereal time + L and ε the true obliquity of the date (about 23.44° now; `src/core/houses.ts` computes it, with longitudes from the equinox of the date, not of 2000):
- **Ascendant** (cusp of house 1): where the eastern horizon cuts the ecliptic: λ = atan2(cos θ, −(sin θ cos ε + tan φ sin ε)). **Descendant** (house 7) opposite.
- **Midheaven, MC** (cusp of house 10): where the meridian cuts the ecliptic overhead: λ = atan2(sin θ, cos θ cos ε). **IC** (house 4) opposite.
- **House systems**: Whole Sign (house 1 is the sign holding the Ascendant) and Equal (cusps every 30° from the Ascendant) first; Placidus (trisecting the times points take to rise and culminate) later. Placidus is undefined inside the polar circles; there the view says so.
- Height above the ground does not change the houses (they follow the vertical through the spot beneath you); planets are taken from Earth's centre (the Moon's position shifts up to ~1° by place, shown as a note).
- In the spheres model (docs/SPHERES.md) a place's horizon is a frame on Earth's surface skin: its latitude and longitude give the zenith, and the skin's spin turns it once a sidereal day.

**The design (owner, 1 November 2026):**
1. **Signs, from above**: as now: stand over the planet and look around; each body's name says the sign it is in, seen from where you are.
2. **Houses, from a dialog**: a dialog asks for
   - **a place on Earth's surface**: latitude and longitude in degrees, minutes, seconds and fractions of a second (a place known less precisely, a town or a country, is taken at its middle point; the dialog says so);
   - **a time frame**: a single moment (time stopped there), or a range, e.g. the hour around a birth, in which the sky moves as it did in that hour, playing live or sped up, and looping.
3. **On the ground** at that place: the horizon as a ring, the meridian, the ecliptic with the signs, the 12 houses as tinted wedges on the sky; each body's label reads e.g. "Mars · 14° Leo · house 10". Over the time frame the houses wheel across the sky.
4. **Transparent planet**: a toggle makes the planet under you see-through, so all 12 houses and every planet, the Sun and the Moon can be seen from where you stand, including those below the horizon.
5. **From outside** (optional view): Earth with the horizon as a disc tangent at the place, the house planes fanning from it like orange segments, and a line from Earth to each body crossing them.
6. **✶ Starsigns** (ADR-0018): a free path (signs from above, then houses from the ground, then the wheel), its video and card free; customising on sp4cetime.store. (Later, the flat chart wheel as a poster.)
7. **Honest labels**: positions are astronomy (real sky, ephemeris tier); signs are tropical (from the equinox) and sit ≈24° from the constellations of the same name; houses and their meanings are astrology, labelled as such. Interpretations and horoscope links belong to the paid package (sp4cetime.store), not the free instrument.
8. **Maths in `src/core/houses.ts`** (built) with property tests (sidereal time against Meeus and astronomy-engine; the Ascendant on the eastern horizon and the MC on the meridian; houses sweep 360° in a sidereal day): Whole Sign and Equal first, Placidus later (undefined inside the polar circles; the view says so). Our own code, no Swiss Ephemeris (AGPL unless licensed).
9. **Points remember it**: a path's point stores the place, the time frame and the house system (CLAUDE.md rule 16), so a path can fly to "your sky on the day you were born".
10. **The skin carries it**: in the spheres model, every attribute of a sphere (a place, its houses, a person's data) is coded in a skin (docs/SPHERES.md).

### A live link (screen saver)

`sp4cetime.org/?live` opens one view with no boxes and time running (or loops a path), so the site is also a screen saver and a live wallpaper (docs/ROADMAP.md, "Screen saver").

## The universe skin: to do

Built in 0.4.3 ([ADR-0021](docs/adr/0021-nearby-galaxies-and-expansion.md)): the 500 nearest galaxies at their measured places, the galaxy web ruled in light years, the expansion of space between groups (ΛCDM; Elements › Expansion of space) and the mass-only universe (Teaching options). Still to do, in rough order:

- [ ] **Redshift colours**: an Elements toggle tinting each galaxy by the z of the light reaching the Sun at the time shown (1 + z = a(now)/a(then)); truthfully faint in the Local Volume (z ≈ 0.002 at 8 Mpc) and said so, growing over billions of years; a version for each theme (Bright: warmer ink).
- [ ] **The flight ruler**: flying from one galaxy to another, the straight line between them ruled in light years and the distance left counting down in the HUD.
- [ ] **A seed path**: the Local Volume from outside at −4.6 billion years, then time running forward a billion years a second while the bridges stretch (and the same in the mass-only universe, for comparison).
- [ ] **The warp's third rung**: zoom out past the Milky Way's domain to the nearby galaxies, zoom in on a galaxy to fly to it (today: Go to, flying out, or clicking a name).
- [ ] **Discs at their true tilts**: position angles from HyperLEDA (licence first); today every disc faces you.
- [ ] **Honest marks**: each line's light-year marks carry its distance uncertainty (5–10% for star-by-star distances, far more for those from speed alone), and galaxies with rough distances drawn as such.
- [ ] **Groups from the catalogue's group lists** (today: each galaxy's main neighbour with tidal index Θ1 > 0, and everything within 1 Mpc as the Local Group), and the galaxies' own motions (a few hundred km/s) over hundreds of millions of years.
- [ ] **The spheres model in code**: each galaxy a sphere carried on the universe sphere's skin file (docs/SPHERES.md), loaded only when in view.
- [ ] **A bigger catalogue later**: the 2MASS Redshift Survey (~44,000 galaxies) or Cosmicflows-4, as coarser tiles of the same skin, for the clip's view of a web hundreds of millions of light years across (licences first).
- [ ] **Checks**: screenshots in all three themes and on a phone, a Capture video of the bridges stretching, and the frame rate on a phone with 500 discs and the web.

## 0.5.0: the spheres and the 500 galaxies (next)

Planned in [docs/SPHERES.md](docs/SPHERES.md). Everything is a sphere inside a bigger sphere, from the universe (conjectural, not drawn) to galaxies, stars, planets, moons, people, cells, molecules and atoms. Spheres never turn; only their skins do, and each child's motion is kept in a skin of its parent. The viewer is a sphere too, and only what it can see is loaded. 0.5.0 builds the model in code and its first big use: **the ~500 nearest galaxies** (Updated Nearby Galaxy Catalog), drawn flat at true size, joined by a **galaxy web ruled in light years**, so a flight from one galaxy to another counts down the light years; and **the viewer's skins** (a flying figure or a ship, first or third person).

Everything else not yet built is on the to-do list in [docs/ROADMAP.md](docs/ROADMAP.md): events and stories, the screen saver, the four modes.

## Run it

Requires Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload (restart it after installing packages) |
| `npm test` | Unit and property tests (Vitest + fast-check) |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run build` | Production build into `dist/` |
| `npm run check` | All three of the above; run before every commit |

## Using it

**One window, three views, one set of controls.** The calendar opens first, in a round window (▭ Full for the whole screen; phones are always full screen). ✦ Fly and ◎ Galaxy (top right) take you into 3D, and so does clicking the name of the Sun, a planet or the Moon, which flies you to just above it. In Fly mode, back away past 1,000 AU to warp out to the whole galaxy; zoom in on it, fly at the Sun or click it to warp back. The same boxes sit in the same corners in every view:

- **Top left**: the title, date and GMT time; in Fly and the galaxy also your position on a sphere you choose (nearest body, the Sun, or the galaxy around Sgr A*): latitude and longitude in °′″, distance in its radii, x y z, cruise speed.
- **Top right**: ● Now / Back to now, the theme (Dark, Bright, Colour), Calendar · ✦ Fly · ◎ Galaxy, ◯ Round / ▭ Full.
- **Bottom left**: SPACE (Go to: Solar system, Geostationary orbit, Low Earth orbit, Earth & Moon, Moon, Mars, Jupiter, Saturn, Sun, Whole galaxy); VIEW (Planets, Centre: Sun or Earth); ELEMENTS (Spirals, Strobe, Orbits, Time grid, Space grid, Constellations, Zodiac, Galaxy marks).
- **Bottom right**: TIME (zoom: Minute, Hour, Day, Week, Month, Year, Decade, Century, Galactic year, Sun's life); SPEED: **▶ Play · speed and direction (Live, or ◀/▶ a minute … a century each second) · ❚❚ Pause** (choosing a speed holds time still until ▶ Play); the space grid's **scale bar** (two of its brown dashed lines and the km between them); **? How to** (instructions and credits).
- **Layout** (every screen since 0.4.0, as on phones): the date at the top left; ● Now, ✦ Fly, ✶ Starsigns and ◯ Round / ▭ Full at the top right; ◉ Capture and ☰ More at the bottom. ☰ More opens one box at a time under **Time**, **Space** and **Display**; the boxes described below live there.
- **Keys:** **Space** does one thing only, in every view and whatever has the focus: the first press hides the controls, the second all text, the third brings everything back (**H** is the same; also **Elements › Controls / Text and labels**, for phones). Nothing else shows or hides them: a path's points never do. **Shift** on its own plays the path by itself; Shift again stops. An arrow key takes over (→ next, ← back) until Shift plays on from there.
- **Bottom centre** (always on screen, never in a capture): the eye (also the H key, or a tap on empty space on a phone: hide the boxes, then all labels, then bring them back) **◉ Capture** (six tiles: picture, GIF, video, each small for X or large) and **▷ Paths** (two menus). While ▶ Go records a path its running time and **■ Stop** show here; it stops by itself at the end of the path.

**Calendar** (the default view), with the real sky behind it, turned so the Sun's current sign is behind the Sun.

- Drag empty space to rotate the solar system (up/down rolls, sideways turns). The sky turns with it.
- Grab the Sun to move it anywhere; slide along its line to move through time (also ←/→ or horizontal scroll). **N** returns to now.
- Scroll or pinch (or [ and ]) make the solar system larger or smaller; Shift + scroll or pinch (or +/−) zoom time, from about a minute to the Sun's whole life. Each gesture does one thing; zooming holds the Sun in place. Orbits are in their true proportions and orientation.
- **Centre: Earth** makes it geocentric: Earth's path is the straight line, the Sun coils around it, and the planets loop back (retrograde).
- **Strobe** (Elements): the whole solar system's pose freezes behind the present so many times a year (1–24): whole numbers draw still polygons, in-between numbers turn lap by lap. Click a frozen pose to go back to that moment.
- The Sun's sign is written under the Sun ("☉ Sun in ♏︎ Scorpio"), the Moon's in its name on its path ("Moon in ♑︎ Capricorn").

**Fly** (✦ Fly, or click a name). You are in the solar system, in 3D, at true scale.

- Click the view to steer with the mouse, as in Minecraft (Esc lets go). **W** flies toward whatever is in the middle of the view, S backs away, A/D slide sideways, R up, F down (R/F too), Ctrl five times faster. Speed is half your height above the nearest body each second.
- Drag or scroll to look around where you stand; pinch to widen or narrow the view; Shift + scroll or pinch zooms time (the units of the time and space grids, a ruler along the Sun's line).
- Click a name to fly there: you turn to face it, close in, and arrive just above its north pole. Names give apparent size and, with Zodiac on, the sign the body is in seen from where you are. Distant bodies get a dot in their path's colour. Labels never show through a body in front of them.
- Every spiral runs out to the vanishing point.

**Whole galaxy** (◎ Galaxy). Past 1,000 AU from the Sun you warp out, past light speed, until the whole Milky Way (a labelled model made of stars, 3D, with a dust lane, the bar and the Fermi bubbles) lies in front of you. The Sun's path is highlighted from any angle, with its whole life (≈42 overlapping turns, bobbing through the disc and swinging in and out) and a light-year ruler. Sgr A* (the black hole) and the Local Group neighbours (Andromeda, Triangulum, the Magellanic Clouds, M32, M110) are labelled; click one to fly there.

**The nearby galaxies** (Go to › The nearby galaxies, 52 million light years out): the 500 nearest galaxies at their measured places and true sizes (discs modelled; Updated Nearby Galaxy Catalog), joined by a web ruled in light years (Elements › Galaxy web). Point at a galaxy for its distance, how it was measured and how long ago its light left; click its name to fly there. With Elements › Expansion of space on (ΛCDM), run time over billions of years: the space between groups stretches, while groups held by gravity stay whole (ADR-0021).

**Teaching options** (Elements › Teaching options, off by default): truer pictures that are heavier to draw. **Mass-only universe (Friedmann 1922)** spreads the galaxies as a universe of matter alone would (always slowing; ours has been speeding up for 6 billion years). **Barycentre** moves the 230 km/s straight line to the solar system's centre of mass and lets the Sun, and every path with it, wobble around it (up to about 2.2 solar radii, mostly Jupiter and Saturn; modelled).

**Capture** (◉ Capture, bottom centre, straight to Downloads): **P** a screenshot (PNG at screen resolution), **G** a 5-second GIF (time plays while it records, then pauses), **V** a video until V again or a click on its running time: an MP4 drawn at the video's full resolution and made to pop a little (brighter, a touch more contrast and colour), with sound (what you hear, or silence). **G** GIFs are 800 px at 20 frames a second, thin lines thickened so they survive, in true time. What is on screen is recorded, the boxes too if they are showing; the Capture button never is. Watermark "@sp4cetime.org" unless turned off. **Video size**: Hi-res for desktop screens (up to 4K) or **For X** (1080p, ready to post: below; a Starsigns video carries a soft white-noise bed); remembered, and used by ✶ Starsigns' ◉ Record too. For screen savers: set a view and a speed, hide the boxes with H, ▶ Play, then V.

**Paths** (presentations). Go anywhere and press **Return**: name the path, and what is on screen becomes START. Travel (in time, in space, into another view, another look) and press Return for POINT 1, 2 …, with a caption if you like; tick "Stop making the path after this point" for END (or press Finish beside Capture). **▷ Paths** lists your paths: ▶ Go flies from point to point, never cutting, and records it (Shift: without recording); **Return** or **→** next, **←** back, **Esc** stops. Look around at a point and the next press first flies you back to it. Each point's box shows its caption, view, moment, place and direction. Paths are small `.sp4ce.json` files (each point holds the camera's place, direction and field of view, the moment, how time runs and the look): **⤓ Download** yours to keep them, drop one on ▷ Paths to fly it or **✎ Continue** adding points (no account needed; this browser also keeps a copy). The app comes with an example, *A first tour*.

### Posting on X

Videos at **Video size › For X** (Capture menu, or beside the Starsigns package) are made to X's rules ([ADR-0020](docs/adr/0020-video-for-x-and-sound.md)), so they upload as they are, on a free account too (up to 2 min 20 s; Premium allows hours):

| X wants | A sp4cetime video |
| --- | --- |
| MP4 container, index at the front | MP4, moov before mdat ("fast start") |
| H.264 video (not HEVC, VP9) | H.264 High profile (level 4.0) |
| AAC-LC sound; a sound track at all | AAC-LC stereo, 48 kHz, 160 kbit/s, always there (silence if nothing is heard) |
| Constant frame rate, ideally 30 | Exactly 30 frames a second (frame n stamped n/30 s) |
| 4:2:0 pixels (yuv420p), even sides, progressive | yes |
| At most 1920 × 1200, aspect 1:2.39 to 2.39:1 | The screen's shape within 1920 × 1080 (upright 1080 × 1920); don't record a window wider than 2.39:1 |
| Closed groups of pictures | A keyframe every 2 seconds |
| Bitrate | About 12 Mbit/s at 1080p (X allows 25) |

It needs WebCodecs: current Chrome, Edge or Safari. Firefox has no AAC encoder, so its videos carry a silent sound track (still accepted). Hi-res (4K) is not for X. An older browser falls back to its own recorder; if X refuses a file, note X's exact message and re-encode it:

```
ffmpeg -i input.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -ac 2 -movflags +faststart output.mp4
```

(With no sound track at all, add `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000` as a second input and `-shortest`.) To check a file: `ffprobe -v error -show_entries stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,sample_rate,channels -of compact file.mp4` should print `h264|High|yuv420p|…|30/1` and `aac|LC|48000|2`.

## Layout

```
src/core/     Pure TypeScript: time, camera, ticks, orbits, spheres, sky maths, calendar renderer.
src/app/      React UI: App (the page), Pane (the window and its boxes), capture (GIF encoder and its worker, the X-ready video encoder), sound, menus.
src/fly/      Fly mode and the galaxy (Three.js), loaded only when opened.
content/      Themes as validated JSON.
public/       Sky data, Milky Way, galaxy, Earth and Moon maps (with credits).
scripts/      Python scripts that rebuild public/ data from their sources.
docs/         ROADMAP.md (to-do lists, the four modes), SPHERES.md (the spheres model), PLAN.md, adr/, archive/, reference/.
```

- [CLAUDE.md](CLAUDE.md): rules and context for anyone (human or AI) changing the code, and how to start a new chat. [AGENTS.md](AGENTS.md) points other tools to it.
- [DECISIONS.md](DECISIONS.md): every decision with its reason, and the owner's stated preferences.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.

## Accuracy

Shown on screen in three tiers: **Ephemeris** within ±3,000 years (astronomy-engine for planets, Moon, rotation; JPL Keplerian elements in the calendar), **Modelled** within ±10,000 years (mean orbits), **Schematic** beyond (shapes and orientation right, phase illustrative). The Sun's galactic path is straight in the calendar and Fly mode; the whole-galaxy view (with the Sun's whole-life orbit) is a model. Zodiac signs are tropical, measured from the J2000 equinox (≈0.4° off today's). See [ADR-0005](docs/adr/0005-accuracy-tiers.md).

## Deploy (Cloudflare)

Static files only. Cloudflare → Workers & Pages → connect the GitHub repo; build command `npm run build`, output `dist`. Or `npm run build && npx wrangler deploy` (uses `wrangler.jsonc`). Add `sp4cetime.org` as the custom domain and redirect the `.com`, `.io` and `.ai` domains to it.

## Licence

- **Code**: [Apache License 2.0](LICENSE), with a [NOTICE](NOTICE): use it, change it, build it into your own work, commercial or not; keep the NOTICE and please credit "Based on sp4cetime (https://sp4cetime.org) by Lamp Diagnostics".
- **Documentation** (this README, DECISIONS, the docs, the example paths): [CC BY 4.0](LICENSE-docs.md): share and adapt with credit.
- **The name** "sp4cetime", its title and logo, and the domain: trademarks, not licensed ([TRADEMARK.md](TRADEMARK.md)). Forks get their own name.
- **Data** in `public/` keeps its own licences (listed in NOTICE and Credits below).
- Who did what: [AUTHORS.md](AUTHORS.md) (vision, design and direction by Lamp Diagnostics; implementation with AI assistance).

## Credits

Also in the app, under ? How to.

- Inspired by the galactic-motion visualization shared by [@Geosophyy](https://x.com/Geosophyy/status/2115404526002041035).
- The strobe (frozen poses): Techartist's dancer worldline, [@techartist_](https://x.com/techartist_/status/2114819625242529992).
- The expanding universe: a clip by [Astronomy Today (@astronomytodayy)](https://x.com/astronomytodayy/status/2117602707322306826). The nearby galaxies: the Updated Nearby Galaxy Catalog (Karachentsev, Makarov & Kaisina 2013, AJ 145, 101), via NASA HEASARC.
- Colour Mode's palette: the ultra-vivid city at sunset in "chasing" by [@hi_personality](https://x.com/hi_personality/status/2117011977658876093).
- Other inspirations: NASA's Fermi bubbles (Fermi Gamma-ray Space Telescope), Google Earth's zoom into Street View (the warp), Minecraft's creative-mode flying.
- Stars, constellations, Milky Way outline: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause; licence in `public/sky/`), from Hipparcos and the IAU figures.
- Milky Way and Moon maps: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0). Earth: NASA Blue Marble (public domain). See `public/textures/CREDITS.md`.
- Ephemerides: [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT); JPL approximate Keplerian elements. 3D: [three.js](https://threejs.org) (MIT).
