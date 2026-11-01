# Roadmap and to-do lists

What comes next, as working lists. The reasons and the owner's preferences are in [DECISIONS.md](../DECISIONS.md); the 12-month critique is in [PLAN.md](PLAN.md) (its phase order predates this file; where they differ, this file wins). Updated 1 November 2026.

## The four modes: what the 4 in sp4cetime means

sp4cetime is one instrument at four scales, each built on public data and the same rule: show what is known, label what is modelled, invent nothing.

| Mode | Scale | Data | Status |
| --- | --- | --- | --- |
| **Galactic** | the galaxy down to the planets' paths | public astronomy data (Hipparcos, IAU, JPL, astronomy-engine) | built (0.1–0.3) |
| **Planetary** | a planet's surface, from orbit to the ground | public geodata (NASA, ESA, USGS, Copernicus); optional commercial 3D tiles | to do |
| **Cellular** | a living cell and its parts | public biology databases | to do (year two at the earliest) |
| **Atomic** | molecules, atoms, their particles | public chemistry and physics databases | to do (year two at the earliest) |

The spheres model ([SPHERES.md](SPHERES.md)) is what joins them: a cell and an atom are spheres inside a planet's sphere, with skins, addresses and paths like any other, so one path could fly from the galaxy to a molecule.

## Near term

### 0.3.0 — paths and the public beta
- [x] Return makes a path; Present in the Capture button; flights between points; point box.
- [x] Paths are light, readable `.sp4ce.json` files (version 2): download, upload, ✎ Continue; example paths ship in `public/paths/`.
- [x] Smooth video recording (even frames, 1080p by default, "Sharp" for 4K; boxes refreshed only when they change).
- [x] Smooth on more devices: the drawing resolution adapts to the device (lower while frames are slow); dead code removed (√ fit in 3D, dial windows, unused styles).
- [x] Beta basics: Beta label, accuracy tier shown again, About / privacy / feedback (hello@sp4cetime.org), link preview image, `_headers`, `robots.txt`, no public source maps.
- [ ] Tag `v0.3.0`; GitHub (private); Cloudflare project and sp4cetime.org (README.md "Next goal"); Cloudflare Email Routing for hello@sp4cetime.org.
- [ ] Check the live site on a laptop, a phone and a tablet (Safari, Chrome, Firefox); announce to a small group.
- [ ] More example paths (life of the Sun, Earth's deep history, the planets' retrograde loops).

### 0.4.0 — "Stand here": the sky over a place (signs and houses); a live link
The first example of Planetary mode (a person on Earth's surface is a sphere on its skin). Full design in README.md "Then (0.4.0)".
- [ ] Signs from above, as now (each body's name gives its sign seen from where you are).
- [ ] Houses dialog: a place (latitude and longitude in degrees, minutes, seconds and fractions; a less precise place taken at its middle point) and a time frame (one moment, time stopped; or a range, e.g. the hour around a birth, playing live or sped up, looping).
- [ ] Ground view: horizon, meridian, ecliptic and signs, 12 house wedges, labels "Mars · 14° Leo · house 10"; a toggle makes the planet transparent so all 12 houses and every body show from where you stand.
- [ ] Optional view from outside (horizon disc, house planes, lines to each body); later the flat chart wheel.
- [ ] Birthday product: two videos (signs from above; houses from the ground) over the time frame, via paths and Capture.
- [ ] `src/core/houses.ts` (Ascendant, MC, Whole Sign and Equal; Placidus later), property-tested; honest labels; points remember place, time frame and house system.
- [ ] A shareable "live" link: `sp4cetime.org/?live` (see Screen saver below).

### 0.5 — the spheres model
- [ ] Owner answers the open questions in SPHERES.md (frame, sphere size, galaxy root, time, inner skins).
- [ ] ADR-0018; `Sphere` and `Skin` in `src/core/spheres.ts` with property tests; read-outs show sphere address and skin (map) position.
- [ ] 2D painting on skins: an image or GeoJSON layer on any sphere, from a file (local first, like paths).

### 0.6 — events and stories (the rest of the Library)
- [ ] Events on the timeline (DECISIONS §1 "Library"); a story = events + a path.
- [ ] Optional: read an `.ics` calendar file and place its events on the timeline (a file, not calendar sync; DECISIONS §1 keeps sync a non-goal).

## Products from the same engine

### Screen saver and live wallpaper
- [ ] **Live mode** (web, free): a URL that opens one view with no boxes and time running, e.g. `?live&view=fly&dest=earthMoon&speed=3600&theme=dark`, or `?live&path=a-first-tour` to loop a path. Works at once in [WebViewScreenSaver](https://github.com/wojteeek/webviewscreensaver) (macOS screen saver showing any web page) and [Plash](https://github.com/Joehuu/Plash) (a web page as the macOS desktop wallpaper).
- [ ] Optional slow camera drift for screen savers (DECISIONS §6 "autopilot camera").
- [ ] **Packaged screen saver** (paid, later): a native macOS `.saver` and a Windows `.scr`, each a thin web view around an offline copy of the app, sold directly (Lemon Squeezy or Paddle, as planned for Pro).

### Desktop widget and calendar layer
- [ ] macOS/iOS widgets (WidgetKit) are snapshots refreshed on a schedule, not live 3D: a small native app could render "today on the Sun's path" (the date, the Moon's phase, the signs) as an image a few times a day. Later, only if wanted.
- [ ] HTML widget engines such as [Übersicht](https://maketecheasier.com/customize-mac-desktop-ubersicht/) can show the live page as a desktop widget now (via Live mode).
- [ ] "A layer on an existing calendar": rather than drawing inside Apple or Google Calendar (not possible from a web app), bring calendars in: `.ics` import (0.6) and, much later, an `.ics` export of a story's events.

### Sky on your day (birthdays and astrology)
See the owner's notes in DECISIONS §1. Built as a separate, clearly labelled product on the same engine, so sp4cetime itself stays a truthful instrument.
- [ ] Date (and optionally time and place) → a path: from the galaxy down to Earth on that day, standing above Earth, the planets in their signs.
- [ ] Signs: already computed (tropical, ecliptic longitude). Houses need the time and place of birth: the ascendant and midheaven from local sidereal time and latitude; house systems Whole Sign and Equal first (simple), Placidus later. Our own code with tests; avoid Swiss Ephemeris unless its commercial licence (CHF 700) is bought, because its AGPL licence would require publishing the whole app's source.
- [ ] Output: a poster (print resolution), a short video, a share card; "Read your horoscope" links out to an established site.
- [ ] First earner: the personalised poster or video, sold as a one-off (see DECISIONS §1 "First earners").

### Premium (later)
- [ ] Cloud library: your paths and stories kept online and synced across devices (needs accounts; until then files are the store).
- [ ] Pro features as in DECISIONS §1 (4K video, posters, private links, unbranded embeds, themes).

## Planetary mode (to do)

Fly to Earth, the Moon or Mars and keep going down to the ground; build imaginary planets. First example: "Stand here" in 0.4.0 (a person, a sphere on Earth's surface skin, with the sky's houses around them). In Planetary mode each organism is a sphere; in Cellular mode each cell; in Atomic mode each atom; every attribute of a sphere is coded in its skin (SPHERES.md).
- [ ] Skins with relief (SPHERES.md §5): elevation models as tiled height fields.
  - Moon: LRO LOLA elevation and LROC imagery (NASA, public domain).
  - Mars: MGS MOLA elevation, Mars Express HRSC and Viking colour mosaics (NASA/ESA, check each licence).
  - Earth: Copernicus DEM or SRTM elevation, NASA Blue Marble imagery (public domain).
- [ ] Level of detail: quad-tree tiles in skin coordinates; floating origin all the way down to metres.
- [ ] Optional: Google Photorealistic 3D Tiles for cities (Map Tiles API: billed per root tileset request, about $6 per 1,000 after a free 1,000 a month; coverage mainly major cities; Google's terms and attribution apply). An add-on layer, never the base, so the free mode stays on open data.
- [ ] **Imaginary planets**: a sphere with a radius, a skin (painted or uploaded picture, later relief) and an orbit or a fixed place; clearly labelled imaginary (e.g. the asteroid B 612 and the other small planets of *The Little Prince*). Saved as files, like paths.
- [ ] Manipulate: paint on skins, drop markers and labels, measure arcs and distances on the surface.

## Cellular mode (to do, year two at the earliest)
- [ ] Decide the first subject (a human cell? a bacterium?) and the scale bridge from Planetary (a person on Earth's surface → a cell).
- [ ] Sources to evaluate (licences first): Allen Cell Explorer (cell structure, 3D), Human Protein Atlas (where proteins sit in the cell), EMDB and the Cell Image Library (microscopy), Protein Data Bank (molecules, shared with Atomic).
- [ ] Spheres and skins for organelles (nucleus, mitochondria), labelled models where shapes are averaged.

## Atomic mode (to do, year two at the earliest)
- [ ] Molecules from the Protein Data Bank (public, free) and PubChem (public domain); atoms and their orbitals; the periodic table (IUPAC data); spectra from NIST.
- [ ] Honest scales: atoms as spheres of their measured radii, orbitals as probability clouds (labelled as such), the nucleus 100,000 times smaller.
- [ ] Paths across scales: galaxy → planet → cell → molecule → atom, as one flight through the spheres.
