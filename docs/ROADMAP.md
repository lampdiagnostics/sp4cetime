# Roadmap and to-do lists

What comes next, as working lists. The reasons and the owner's preferences are in [DECISIONS.md](../DECISIONS.md); the 12-month critique is in [PLAN.md](PLAN.md) (its phase order predates this file; where they differ, this file wins). Updated 3 November 2026. Push in batches after substantial progress; 0.4.2 is pushed at once (owner, 4 November 2026).

## The four modes: what the 4 in sp4cetime means

sp4cetime is one instrument at four scales, each built on public data and the same rule: show what is known, label what is modelled, invent nothing.

| Mode | Scale | Data | Status |
| --- | --- | --- | --- |
| **Galactic** | the galaxy down to the planets' paths | public astronomy data (Hipparcos, IAU, JPL, astronomy-engine) | built (0.1–0.3.0) |
| **Planetary** | a planet's surface, from orbit to the ground | public geodata (NASA, ESA, USGS, Copernicus); optional commercial 3D tiles | to do |
| **Cellular** | a living cell and its parts | public biology databases | to do (year two at the earliest) |
| **Atomic** | molecules, atoms, their particles | public chemistry and physics databases | to do (year two at the earliest) |

The spheres model ([SPHERES.md](SPHERES.md)) is what joins them: a cell and an atom are spheres inside a planet's sphere, with skins, addresses and paths like any other, so one path could fly from the galaxy to a molecule.

## 0.3.0 — done (the public beta)

Everything built so far is 0.3.0 (0.1 and 0.2 are in CHANGELOG.md):
- [x] The instrument: the calendar, Fly mode, the real sky, the whole galaxy with Sgr A* and the Local Group, three themes, true scale only, capture (screenshot, GIF, video).
- [x] Paths: Return makes a path; Present in the Capture button; flights between points (calendar, Fly, galaxy, looks dissolving); point box with captions.
- [x] Paths are light, readable `.sp4ce.json` files (version 2): download, upload, ✎ Continue; example paths can ship in `public/paths/` ("A first tour" was taken down in 0.4.0).
- [x] Smooth video recording (even frames, 1080p by default, "Sharp" for 4K).
- [x] Smooth on more devices: drawing resolution adapts to the device; dead code removed.
- [x] Beta basics: Beta label, accuracy tier shown, About / privacy / feedback (hello@sp4cetime.org), link preview image, `_headers`, `robots.txt`, no public source maps.
- [x] Open source: code under Apache 2.0 with a NOTICE, documentation under CC BY 4.0, the name kept as a trademark (LICENSE, NOTICE, LICENSE-docs.md, TRADEMARK.md, AUTHORS.md).
- [x] Pre-launch review for bugs; fixes in CHANGELOG.md.
- [x] Pushed to GitHub (public) and live on sp4cetime.org via Cloudflare Workers (README.md "Going live"), with anonymous page counts by Cloudflare Web Analytics.

## Heading into 0.5.0 (written 3 November 2026, end of the 0.4.0 session)

How to work (owner): commit changes locally as they are made; push to GitHub, and so to sp4cetime.org, only after substantial progress.

### 0.5.0 to-do
- [ ] **Publish on GitHub:** push the `v0.4.0` tag from the Mac (`git push -f origin v0.4.0`), make a **GitHub Release** for v0.4.0 with the CHANGELOG entry; add the missing tags and releases v0.1.0–v0.3.0 (and v0.3.1's release). From now on, push in batches after substantial progress, then tag and release.
- [ ] **The money trail** (README.md "Opening sp4cetime.store: the money trail"): 0 the bank, 1 activate Stripe, 2 live mode in the Stripe connector, 3 live prices, 4 live coffee link (☕ turns on at once), 5–10 portal, the Worker on sp4cetime.store, secrets, webhook, email, open; 11 tax, 12 terms, refunds and privacy in the owner's words.
- [ ] Turn ✶ Customize back on in the Starsigns dialog when the shop opens (`SHOP_OPEN`), and the shop's own checks: a real order of each product, a real readout email.
- [ ] **Stand here** (README.md "0.4.0", rest of the design): the ground view as an instrument of its own (house wedges on the sky, a transparent-planet toggle in Elements, a time frame playing an hour), points remembering it; Placidus with honest labels.
- [ ] Starsigns: the night field brighter (the ground can hardly be seen at night); the planets to show in 3D during the path even when only Mercury–Mars are ticked? (the owner decides: the rule is that menus decide what is on screen).
- [ ] Hospitals first in the place search (a Wikidata CC0 list the owner downloads; the cloud cannot reach it).
- [ ] Live link / screen saver (`?live`), GIF and SVG posters for the package, sharing links.
- [ ] Phones: gyroscope looking, tap to travel. A check on a real phone and tablet of everything changed in 0.4.0 (compact layout, Round on phones, Starsigns, package download on iOS).
- [ ] **The spheres and the galaxies** (owner, 3 November 2026; design in [SPHERES.md](SPHERES.md), rewritten for 0.4.2):
  - [ ] Owner answers the open questions at the end of SPHERES.md (frame, sphere size, the universe's working centre, time, inner skins, skin files, the viewer's figure and key, 500 galaxies or a round distance, stars later); record them in DECISIONS §4 and an ADR.
  - [ ] The model in code: `Sphere`, `Skin` (with the tracks of the children it carries), `Viewer` in `src/core/spheres.ts`; addresses on every sphere; skin files; property tests (SPHERES.md §11).
  - [ ] Visibility: walk the tree, skip spheres out of view or smaller than a pixel; home-sphere handover with a margin (SPHERES.md §8).
  - [ ] **The ~500 nearest galaxies**: follow "Loading the galaxy library, step by step" (SPHERES.md §9): the licence checked, the owner downloads the Updated Nearby Galaxy Catalog, `scripts/build_galaxies.py`, `public/sky/galaxies.json`, `src/core/galaxies.ts`, flat tilted discs in Fly mode, the warp's third rung.
  - [ ] **The galaxy web ruled in light years**: group lines, bridges joining the groups, the flight ruler counting down; an Elements toggle that points remember.
  - [ ] **The expanding universe** (owner, 4 November 2026; SPHERES.md §9, "The expanding universe"): the universe's expansion skin, `src/core/cosmology.ts` (ΛCDM), bridges between groups stretching with a(t) while bound groups hold, Expansion and Redshift toggles that points remember, a seed path.
  - [ ] Honest labels: distance method and uncertainty; "seen as it was N million years ago".
  - [ ] **The viewer's skins**: a flying figure or a ship; first and third person (a key and a Display button); points remember it.
  - [ ] Stars stay as they are (owner); flying to other stars comes later, as their spheres fill in.
- [ ] Then events and stories.

### Bugs and loose ends to fix
- [ ] **Package on iPhone/iPad:** Safari's video recording and .zip download are untested; Safari records MP4 only in recent versions.
- [ ] **Package memory:** a hi-res (4K) recording is held in memory and copied once to make the .zip; long or 4K packages could strain phones. Consider small video by default on phones.
- [ ] **Cross-fades:** names now vanish and fade back in when a presentation changes look (the snapshot leaves them out); a true name-by-name cross-fade would be nicer.
- [ ] **Old saved paths** from before the four poses (6-point and 30-point Starsigns paths, with highlights) still sit in ▷ Present in browsers that made them; offer to clear them, or mark them old.
- [ ] **The first flight** of a path (from wherever you are to its START) can take 10–15 s; shorten it.
- [ ] **Ground at eye height:** Earth's sphere is drawn with flat facets, so the ground can sit up to ~2 km below the eye at the horizon; finer tessellation near the camera.
- [ ] **Labels:** on the wheel, the Sun's and Mercury's names can still touch when within a few degrees; the top-left box is cut to "SP4CETIM…" on narrow phones.
- [ ] **A property test** (planet grouping) once ran past its time limit under load in `npm run check`; give it fewer runs or a longer limit.
- [ ] **Readouts:** the webhook's email path is tested with a mock only; test with Stripe's test events and Cloudflare Email Service once set up.
- [ ] **Keys:** check Shift-to-present and Space-to-hide on Windows and in Firefox and Safari (only Chromium tested).

## 0.4.0 — done 2 November 2026; what is left is the to-do list

Everything not done yet. The first block is the next version; the rest stays on the list until it is picked up.

### Next: after the launch
- [ ] Cloudflare Email Routing: hello@sp4cetime.org forwarding to the owner's inbox (rule and destination set; DNS records and the inbox verification to finish).
- [ ] Tags v0.1.0, v0.2.0, v0.3.0, v0.3.1 and releases on GitHub (Releases page); the owner pushes tags from the Mac (cloud sessions cannot).
- [x] Redirect sp4cetime.com, .io and .ai to sp4cetime.org (Cloudflare Bulk Redirects, 0.4.0).
- [ ] Check the live site on a laptop, a phone and a tablet (Safari, Chrome, Firefox): calendar, Fly, galaxy, themes, round and full, keys, reduced motion, capture, paths.
- [ ] Announce to a small group (teachers, science communicators, @Geosophyy, @techartist_) with a Capture recording.
- [ ] More example paths (life of the Sun, Earth's deep history, the planets' retrograde loops).
- [x] Phones: touch flying: a floating thumb stick, drag to look, pinch forward/back, two-finger slide; a clear opening screen (Now, Fly, Capture, ☰ More) (0.3.1).
- [ ] Phones: gyroscope looking (hold the phone up to the sky), tap to travel.
- [ ] Optional: Sentry error reports (update the privacy note if added). Page counts: Cloudflare Web Analytics, on since launch.
- [ ] Screenshot tests in CI; an accessibility list view; presenter notes and auto-advance for paths.

### Next (0.4.0): ✶ Starsigns
Owner, 2 November 2026. Design and payment options in [ADR-0018](adr/0018-starsigns-and-shop.md).
- [x] `src/core/houses.ts`: true obliquity, precession and nutation to the equinox of date, apparent sidereal time, Ascendant, MC, Whole Sign and Equal houses; tested against Meeus and astronomy-engine (about an arcsecond).
- [x] Signs from the equinox of the viewed date, in both views (sign lines and names turn with precession; body labels use longitudes of date).
- [x] Place lookup: type a town, get its centre and time zone (Natural Earth populated places, public domain, 7,342 towns); or latitude and longitude in degrees, minutes, seconds; the local time turned into UTC with the zone's history (daylight saving, skipped and doubled hours).
- [x] **✶ Starsigns** button and dialog (renamed from Astrology): date, local time (or "I don't know the time"), place; Whole Sign or Equal houses; a table of every body's sign, degree, house and retrograde, the Ascendant and MC; "Go to this moment" sets the map there. (`src/core/reading.ts`, `places.ts`; `src/app/zones.ts`, `AstrologyDialog.tsx`.)
- [x] Where the button lives: top right on computers; on phones at the top beside Now and Fly, a twinkling ✶ (owner, 2 Nov). ✶ Create Path in the dialog (opens in ▷ Present); ◉ Capture and ▷ Present at the bottom.
- [x] Fixed on the way: Earth was drawn turned up to 180° for dates before 2000 (now within 0.05° of astronomy-engine, 1600–2400).
- [x] A **free path** from the reading (six points: calendar, Earth from space with signs, over the place, the Ascendant on the eastern horizon, the Midheaven, END), saved with the person's paths; played on its own.
- [x] The house overlay in 3D: the place's horizon, house boundaries and numbers, ASC and MC; body labels with degree and house; path points remember it.
- [x] The video: the path recorded by Capture (about 30–40 s, captions included).
- [x] The PDF (our own writer): every body's sign, degree and house, Ascendant and MC, a chart wheel, the place and time; title, name, Letter or A4, paper or night; astronomy and astrology labelled; links to free reading (astro.com, Cafe Astrology); a partner's text later.
- [x] Free on sp4cetime.org, no prices: ✶ Create Path (run from ▷ Present), ⤓ Download package (PDF + MP4 + token in one .zip), ⤓ the card (the inside, one page), ⤓ the path (.json). **✶ Customize** → sp4cetime.store (the order in the link's fragment; enabled when `SHOP_OPEN`). **☕ Buy us a coffee!** shows once `COFFEE_URL` holds a Stripe Payment Link.
- [x] Dialog (owner, 2 Nov): opens on now and here; Go first; Place / Lat / Lon with a transit-style completer and nearest-town lookup; blank time = noon; houses by number and name.
- [x] The path's four steps (pole facing the Sun; planet groups picked out one by one; the sky over the place, coloured for the hour; the wheel with each house), the 3D chart wheel, a soft highlight.
- [x] The card PDF: folds to 5 × 7 in (Letter) or A6 (A4), inside in landscape; free one-sided (inside only); the two-sided card with a cover kept for the shop.
- [ ] Hospitals first in the place search: needs a licence-compatible list (Wikidata, CC0; or GeoNames, CC BY) downloaded by the owner (not reachable from the cloud workspace); nearest intersections not needed (town centres are within a fraction of a degree for houses).
- [ ] A sped-up GIF and SVG pictures (the wheel, the cover) for the package; the shop's customisation page (name, artwork).
- [x] ☕ Buy us a coffee! beside each free download (built; a sandbox Payment Link works). - [ ] The live link, after the bank and Stripe activation (README.md "the money trail" steps 0–4).
- [x] **sp4cetime.store** (owner, 2 Nov 2026; ADR-0019), a separate small site on the same engine, built and working in Stripe's sandbox:
  - [x] Card (occasion, names, message; two-sided), wedding pack, sky calendar, screensaver (animated page and desktop pictures), phone background; live previews, cart, Stripe Checkout, files made after payment.
  - [x] Starsigns readouts by email (weekly or monthly), astrologers linked.
  - [ ] **Go live**: README.md "Opening sp4cetime.store: the money trail" (bank, Stripe activation, live prices, coffee link, Worker, secrets, webhook, email, open).
  - [ ] Later: artwork and video customisation, sped-up GIFs, SVG posters; physical goods (T-shirt, printed calendar) through print on demand.
  - [ ] Templates (e.g. for personality types), then a marketplace where others offer their templates and paths (Library and creator marketplace, DECISIONS §1).

### Next (0.5.0): "Stand here", the sky over a place (signs and houses)
The first example of Planetary mode (a person on Earth's surface is a sphere on its skin). Full design in README.md "0.4.0".
- [ ] Signs from above, as now (each body's name gives its sign seen from where you are).
- [ ] Houses dialog: a place (latitude and longitude in degrees, minutes, seconds and fractions; a less precise place taken at its middle point) and a time frame (one moment, time stopped; or a range, e.g. the hour around a birth, playing live or sped up, looping).
- [ ] Ground view: horizon, meridian, ecliptic and signs, 12 house wedges, labels "Mars · 14° Leo · house 10"; a toggle makes the planet transparent so all 12 houses and every body show from where you stand.
- [ ] Optional view from outside (horizon disc, house planes, lines to each body); later the flat chart wheel.
- [ ] ✶ Starsigns above is the birthday product (its horoscope text is in the paid package, not the free instrument).
- [x] `src/core/houses.ts` (Ascendant, MC, Whole Sign and Equal), property-tested.
- [ ] Placidus (undefined inside the polar circles); honest labels; points remember place, time frame and house system. No Swiss Ephemeris (its AGPL is incompatible with Apache 2.0 unless licensed).

### Next: a live link (screen saver)
- [ ] `sp4cetime.org/?live` (see Screen saver below).

### On the list: the spheres model
- [ ] Owner answers the open questions in SPHERES.md (now part of 0.5.0, above).
- [x] 0.4.3 (local, not pushed yet): the Sun's stop brisk (2 s), the field as a silhouette (black at night, dark green by day), a white-noise bed throughout, a calm final wheel.
- [x] 0.4.2: videos made for X (WebCodecs + our MP4 writer: H.264 High, constant 30 fps, AAC sound always, 1080p; ADR-0020), recordings that pop, GIFs that keep thin lines and true timing, sound (silence in space; crickets and distant traffic on the ground), the Starsigns landing in a field that drops away, each body looked at once.
- [x] SPHERES.md rewritten (0.4.2): the tree from the universe to atoms, children carried by their parent's skins, the viewer and visibility, precedents, the galaxy plan.
- [ ] An ADR; `Sphere` and `Skin` in `src/core/spheres.ts` with property tests; read-outs show sphere address and skin (map) position.
- [ ] 2D painting on skins: an image or GeoJSON layer on any sphere, from a file (local first, like paths).
- [x] Zodiac signs from the equinox of the viewed date (0.4.0).
- [ ] Star proper motion over ~100,000 years.

### On the list: events and stories (the rest of the Library)
- [ ] Events on the timeline (DECISIONS §1 "Library"); a story = events + a path.
- [ ] Optional: read an `.ics` calendar file and place its events on the timeline (a file, not calendar sync; DECISIONS §1 keeps sync a non-goal).
- [ ] Share links (read-only) and embeds.

### On the list: products from the same engine

#### Screen saver and live wallpaper
- [ ] **Live mode** (web, free): a URL that opens one view with no boxes and time running, e.g. `?live&view=fly&dest=earthMoon&speed=3600&theme=dark`, or `?live&path=a-first-tour` to loop a path. Works at once in [WebViewScreenSaver](https://github.com/wojteeek/webviewscreensaver) (macOS screen saver showing any web page) and [Plash](https://github.com/Joehuu/Plash) (a web page as the macOS desktop wallpaper).
- [ ] Optional slow camera drift for screen savers (DECISIONS §6 "autopilot camera").
- [ ] **Packaged screen saver** (paid, later): a native macOS `.saver` and a Windows `.scr`, each a thin web view around an offline copy of the app, sold directly (Lemon Squeezy or Paddle, as planned for Pro).

#### Desktop widget and calendar layer
- [ ] macOS/iOS widgets (WidgetKit) are snapshots refreshed on a schedule, not live 3D: a small native app could render "today on the Sun's path" (the date, the Moon's phase, the signs) as an image a few times a day. Later, only if wanted.
- [ ] HTML widget engines such as [Übersicht](https://maketecheasier.com/customize-mac-desktop-ubersicht/) can show the live page as a desktop widget now (via Live mode).
- [ ] "A layer on an existing calendar": rather than drawing inside Apple or Google Calendar (not possible from a web app), bring calendars in: `.ics` import (after the spheres model) and, much later, an `.ics` export of a story's events.

#### Sky on your day (birthdays and astrology)
See the owner's notes in DECISIONS §1. Built as a separate, clearly labelled product on the same engine, so sp4cetime itself stays a truthful instrument.
- [ ] Date (and optionally time and place) → a path: from the galaxy down to Earth on that day, standing above Earth, the planets in their signs.
- [ ] Signs: already computed (tropical, ecliptic longitude). Houses need the time and place of birth: the ascendant and midheaven from local sidereal time and latitude; house systems Whole Sign and Equal first (simple), Placidus later. Our own code with tests; no Swiss Ephemeris unless its professional licence (CHF 700) is bought, because its AGPL licence cannot be combined with the app's Apache 2.0 licence.
- [ ] Output: a poster (print resolution), a short video, a share card; "Read your horoscope" links out to an established site.
- [ ] First earner: the personalised poster or video, sold as a one-off (see DECISIONS §1 "First earners").

#### A sp4cetime connector for Claude (and other AI assistants)
- [ ] An MCP connector (a small server, or a static API on Cloudflare) that answers questions with the instrument's own maths: "what was the sky when I was born?" → positions, signs, houses (with a time and place), the accuracy tier, and a link that opens that moment and place on sp4cetime.org (a path or a `?live` view).
- [ ] Listed in Anthropic's Claude directory of connectors so other Claude users can add it; one more way people find sp4cetime.
- [ ] Builds on "Stand here" (`src/core/houses.ts`) and the spheres model; pure `src/core` maths reused as-is. Licences as the rest (Apache 2.0); honest labels carried into every answer.

#### Premium (later)
- [ ] Cloud library: your paths and stories kept online and synced across devices (needs accounts; until then files are the store).
- [ ] Pro features as in DECISIONS §1 (4K video, posters, private links, unbranded embeds, themes).

### On the list: Planetary mode

Fly to Earth, the Moon or Mars and keep going down to the ground; build imaginary planets.
- [x] Earth's first surface skin (0.4.0): coastlines, big lakes and country borders as light lines on the globe in 3D (Natural Earth, public domain), an Elements toggle that path points remember.
- [ ] 2D painting on Earth's skin: a light picture or GeoJSON layer from a file (the place of a chart marked; later, anyone's map). First example: "Stand here" in 0.4.0 (a person, a sphere on Earth's surface skin, with the sky's houses around them). In Planetary mode each organism is a sphere; in Cellular mode each cell; in Atomic mode each atom; every attribute of a sphere is coded in its skin (SPHERES.md).
- [ ] Layers with relief (SPHERES.md §6): elevation models as tiled height fields.
  - Moon: LRO LOLA elevation and LROC imagery (NASA, public domain).
  - Mars: MGS MOLA elevation, Mars Express HRSC and Viking colour mosaics (NASA/ESA, check each licence).
  - Earth: Copernicus DEM or SRTM elevation, NASA Blue Marble imagery (public domain).
- [ ] Level of detail: quad-tree tiles in skin coordinates; floating origin all the way down to metres.
- [ ] Optional: Google Photorealistic 3D Tiles for cities (Map Tiles API: billed per root tileset request, about $6 per 1,000 after a free 1,000 a month; coverage mainly major cities; Google's terms and attribution apply). An add-on layer, never the base, so the free mode stays on open data.
- [ ] **Imaginary planets**: a sphere with a radius, a skin (painted or uploaded picture, later relief) and an orbit or a fixed place; clearly labelled imaginary (e.g. the asteroid B 612 and the other small planets of *The Little Prince*). Saved as files, like paths.
- [ ] Manipulate: paint on skins, drop markers and labels, measure arcs and distances on the surface.

#### Earth through time: a skin that changes with the clock
Owner, 1 November 2026: Earth's surface skin is a function of time, so speeding the clock up shows the planet changing at every scale. Other simulators (for example Riad's photorealistic Earth, @RiadEtm) are other skins on the same sphere, imported into the viewer.
- [ ] **Skins as functions of time**: a skin is a set of dated keyframes (pictures or data) and the viewer blends between the two either side of the present; each keyframe carries its source, licence and accuracy tier.
- [ ] **The clock picks the skin** (like the calendar picks its ticks): each speed shows the layer whose spacing suits it, and averages what changes too fast to see (at a decade a second the seasons would flicker ten times a second, so the yearly mean is shown).
- [ ] **Skin packs**: a light file (like a path) naming a skin's time range, keyframes, licence and tier, so others' maps and simulators can be loaded on any sphere; later, a live skin drawn by another renderer.
- [ ] The scales, each from public data and labelled honestly:

| Speed | What you see | Data (check each licence) | Tier |
| --- | --- | --- | --- |
| a day a second | day and night, clouds, city lights | NASA Black Marble (VIIRS night lights), GOES/Himawari clouds | measured |
| a month a second | the seasons: snow, ice, green-up | NASA Blue Marble Next Generation (12 monthly maps), MODIS snow and sea ice | measured |
| a decade a second | cities growing, forests cut, ice shrinking (1972 →) | Landsat (USGS, 1972 on), MODIS (2000 on), NSIDC sea ice | measured |
| a millennium a second | farming spreading, cities and empires rising and falling, the ice age ending | HYDE 3.3 (population and land use, 10,000 BCE → now); historical borders (sources to choose; some are GPL, which cannot be used); sea level and ice sheets since the last ice age | reconstructed |
| a million years a second | ice ages, the Age of Dinosaurs, continents drifting back to Pangaea (~335–175 million years ago), Snowball Earth (~720–635 million years ago) | plate reconstructions to 1 billion years (Müller, Merdith et al., EarthByte; data under CC BY), PaleoDEMs (Scotese and Wright, 2018) | reconstructed, then schematic |
| beyond 1 billion years | the young Earth | sparse evidence | schematic |

### On the list: Cellular mode (year two at the earliest)
- [ ] Decide the first subject (a human cell? a bacterium?) and the scale bridge from Planetary (a person on Earth's surface → a cell).
- [ ] Candidate first subject (owner's inspiration, 1 November 2026: an AI-made bacterium video on X; the cell is the sphere): ***Mycoplasma genitalium***, one of the smallest living cells (a near-sphere ~0.3 µm across) and the first to be modelled whole, from its genes (whole-cell model, Karr et al. 2012) to every molecule placed in 3D (Maritan et al. 2022, built with CellPACK). Built from measured parts, so it can be labelled "reconstructed", not invented; and every molecule leads on into Atomic mode via the Protein Data Bank.
- [ ] Rod-shaped and other cells: the sphere stays a sphere; the shape is a layer with relief on its skin (SPHERES.md §6), as mountains are on Earth.
- [ ] Sources to add and check: CellPACK and the Mesoscope models (Scripps; check the licence), David Goodsell's cell paintings (PDB-101, CC BY 4.0) for reference and credit.
- [ ] AI-imagined cells only as clearly labelled art, never as the instrument's own picture (rule 5).
- [ ] Sources to evaluate (licences first): Allen Cell Explorer (cell structure, 3D), Human Protein Atlas (where proteins sit in the cell), EMDB and the Cell Image Library (microscopy), Protein Data Bank (molecules, shared with Atomic).
- [ ] Spheres and skins for organelles (nucleus, mitochondria), labelled models where shapes are averaged.

### On the list: Atomic mode (year two at the earliest)
- [ ] Molecules from the Protein Data Bank (public, free) and PubChem (public domain); atoms and their orbitals; the periodic table (IUPAC data); spectra from NIST.
- [ ] Honest scales: atoms as spheres of their measured radii, orbitals as probability clouds (labelled as such), the nucleus 100,000 times smaller.
- [ ] Paths across scales: galaxy → planet → cell → molecule → atom, as one flight through the spheres.
