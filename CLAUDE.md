# Working on sp4cetime

Context for any AI assistant (Claude, GPT, Gemini, Grok, a local model) or human picking this project up cold. Read this file, then [DECISIONS.md](DECISIONS.md). Together they replace the history of the conversations that built 0.1.0 and 0.2.0; you should not need anything else to start. [README.md](README.md) has the general direction; [docs/adr/](docs/adr/) has the reasoning behind each architectural choice; `git log` and [CHANGELOG.md](CHANGELOG.md) have the history.

## What this is (in five lines)

- A static web app: a zoomable map of time drawn as the solar system's real motion. The Sun is always *now*, travelling at 230 km/s; planets and the Moon wind around its path as spirals, from −4.6 Gyr to +5 Gyr.
- **Calendar** (Canvas 2D, `src/core` + `src/app`): the round-window timeline, with the real sky behind it.
- **Fly mode** (Three.js, `src/fly`, lazy-loaded): true-scale 3D solar system, real sky, zodiac, Earth/Moon surfaces, and the whole galaxy (stars, Fermi bubbles, the Sun's whole-life path, Sgr A*, the Local Group). Reached by ✦ Fly / ◎ Galaxy or by clicking a name; the same controls as the calendar.
- **Capture** (`src/app/capture.ts`, `gif.ts`, `CaptureMenu.tsx`): screenshot (P), GIF (G), video (V) of what is on screen, watermarked.
- Positions are measured as arcs (°′″) on nested spheres: galaxy (Sgr A*), Sun, each body.
- Owner: one person, part-time (Lamp Diagnostics). Current version **0.3.1**, the public beta on sp4cetime.org: paths through time and space (ADR-0017), smooth recording, adaptive resolution; 0.3.1 made phones first (a clear opening screen, game-style touch controls). Tags: `v0.3.1` is pushed by the owner from the Mac (cloud sessions cannot push tags); `v0.1.0`–`v0.3.0` are still to add. Open source: code Apache 2.0, docs CC BY 4.0, name a trademark (README.md "Licence"). Everything not done is on the to-do list in docs/ROADMAP.md; 0.4.0 is in progress: "Stand here" and ✶ Starsigns (README.md "0.4.0", ADR-0018).

## Commands

- `npm install` then `npm run dev` (http://localhost:5173). Restart the dev server after dependencies change.
- `npm run check`: typecheck + tests + build. **Must pass before every commit.**
- `npm test`: tests only (Vitest + fast-check).
- `python3 scripts/build_sky.py …`, `build_textures.py …`, `build_galaxy.py`, `build_earth_lines.py …`: rebuild `public/` data (usage in each file's header; needs Pillow and NumPy). Outputs are committed.

## Where things live

| Path | What |
| --- | --- |
| `src/core/time.ts` | `Time = { day, sec }` from 2000-01-01 00:00 UTC; civil dates, formatting. |
| `src/core/camera.ts`, `ticks.ts` | Calendar camera (time ↔ x), time ticks and the space grid (km along the Sun's path; `formatKm`). |
| `src/core/geometry.ts`, `planets.ts`, `models.ts` | Frames (ecliptic, galactic, travel, view), Keplerian orbits, accuracy tiers, Moon phase. |
| `src/core/render.ts` | The calendar renderer: `drawFrame(ctx, input)` → labels, strobe poses, Sun position, space-grid scale. Geocentric mode, strobe, edge pointers. Pure apart from the canvas context. |
| `src/core/galacticOrbit.ts`, `bob.ts` | The Sun's whole-life galactic orbit (epicycle) and vertical bob, for the galaxy view. |
| `src/core/skyfigures.ts`, `colour.ts` | Zodiac signs, constellation and galaxy-mark data shared by both views (`turnSigns` turns the signs to the equinox of date); colour helpers. |
| `src/core/houses.ts` | Signs and houses: true obliquity, precession and nutation to the equinox of date, sidereal time from `Time`, Ascendant, MC, Whole Sign and Equal houses, a place's zenith. |
| `src/core/places.ts`, `reading.ts`, `starsigns.ts` | ✶ Starsigns: towns with centres and time zones (`public/places.json`), a reading (every body's sign, degree, house), the free path made from it. |
| `src/core/pdf.ts`, `starsignsPdf.ts` | A small PDF writer (standard fonts, no dependency) and the Starsigns sheet. |
| `src/core/bodies.ts` | True positions and orientations of every body (astronomy-engine), radii, flattening. |
| `src/core/spheres.ts` | Nested spheres, arc positions, DMS formatting, ray–sphere hits. |
| `src/core/paths3d.ts`, `skymap.ts` | Fly-mode spirals and grid marks; the calendar sky's perspective lens. |
| `src/core/constants.ts` | Physical constants, each with its published range. |
| `src/core/path.ts` | Paths: points (everything on screen), `.sp4ce.json` validation, the van Wijk–Nuij time-flight curve. |
| `src/app/` | React UI. `App.tsx`: the page (shared clock with speed and pause, theme, the show/hide state (H, the eye, a tap), top-right box, the phone dock, eye and Capture). `Pane.tsx`: the window (calendar ↔ 3D, its settings, the top-left, bottom-left and bottom-right boxes, portalled into the page, ? How to text and credits, scale bar). `GalacticCanvas.tsx` (gestures, frame loop, label and pose clicks), `skyBackdrop.ts` (sky, figures, names), `settings.ts` (localStorage), `ElementsPicker`, `PlanetPicker`, `HelpButton` (centred pop-up), `CaptureMenu` + `capture.ts` (screen capture) + `gif.ts` (our GIF encoder). Starsigns: `StarsignsDialog.tsx` (lazy), `zones.ts` (local time → UTC), `shop.ts` (price, shop link; `SHOP_OPEN`). Paths: `flights.ts` (flying between points), `pathStore.ts` (files: download, upload, examples; IndexedDB copy), `PathDialog.tsx` (Return); Presentation mode, keys and the point box in `App.tsx`. |
| `src/fly/` | The 3D view (Fly and the galaxy), no controls of its own: `FlyView.tsx` (loop, Minecraft-style input, journeys to bodies, labels with signs, HUD), `scene.ts` (renderer keeps its frame for capture), `flight.ts` (poses, destinations, warps, speed), `overlays.ts` (spirals sampled to the vanishing point, orbits, ruler grids, scale bar), `sky.ts`, `galaxy.ts` (stars, haze, bubbles, the Sun's path and whole-life orbit), `localGroup.ts` (Sgr A*, neighbour galaxies), `earthLines.ts` (Earth's line skin: coastlines, lakes, borders). |
| `shop/`, `vite.shop.config.ts`, `wrangler.store.jsonc` | sp4cetime.store (ADR-0019): the shop page (`Shop.tsx`, `DesignForm.tsx`, `make.ts` makes each product's files in the browser) and its Worker (`worker.ts`: Stripe Checkout, paid orders, the readout webhook and email). Core: `catalog.ts` (products, prices, designs, astrologers), `transits.ts` (readouts), `almanac.ts` + `calendarPdf.ts`, `wallArt.ts` + `screensaver.ts`. `npm run dev:shop`, `npm run build:shop`. |
| `content/themes/*.json` | Themes as data, validated by `parseTheme`. |
| `public/sky`, `public/textures` | Star catalogue, Milky Way, galaxy model, Earth and Moon maps, Earth's coastline and border lines (`scripts/build_earth_lines.py`), with licences and credits. |
| `public/paths/` | Example paths as `.sp4ce.json` files, listed in `index.json` (shown under Examples in the Present menu). |
| `docs/ROADMAP.md`, `docs/SPHERES.md` | To-do lists by version and the four modes (Galactic, Planetary, Cellular, Atomic); the draft spheres-and-skins model. |

## Rules

1. **`src/core/` is pure TypeScript.** No React, no DOM except the canvas context passed into `drawFrame`. Everything there is unit-testable in Node. Anything needing images or WebGL lives in `src/app` or `src/fly` and is passed in.
2. **Never put deep time into a single number for screen maths.** Use `Time`. Convert to x only via `timeToX`/`xToTime`, which subtract the camera centre first.
3. **Never use JavaScript `Date` for model time.** It only covers ±273,000 years. `Date` is allowed only at the edges: reading the clock (`fromUnixMs`) and astronomy-engine inside the ephemeris tier.
4. **Every frame is a pure function of (camera, theme, now, view offsets).** No accumulated animation state in renderers. Rotation, positions and labels derive from time.
5. **Be honest about accuracy.** Beyond the ephemeris tier, say "modelled" or "schematic" on screen. Models (the whole galaxy) are labelled as models. Never invent surface detail; never hide science behind Pro.
6. **Themes are data.** A theme never changes where things are, only how they look. The three themes (Dark, Bright, Colour) apply equally to the calendar, Fly mode and the whole galaxy; each has a `sky` block (`SkyStyle` in `src/core/theme.ts`). Bright's sky is a negative (dark ink on paper).
7. **Test the maths hardest.** New core code comes with tests; prefer property tests across the full ±5 Gyr range.
8. **Few dependencies.** Adding one needs a line in an ADR saying why. Current runtime deps: react, astronomy-engine, three.
9. **Small commits to `main`, always deployable.** CI runs typecheck, test, build and gzipped JS budgets: 150 KB calendar, 200 KB Fly chunk.
10. **Fly mode precision:** positions are computed in double precision relative to the camera (floating origin) before reaching the GPU; keep huge objects' on-GPU coordinates small (the sky is a 10⁵ km sphere drawn first with depth off; the galaxy is drawn shrunk toward the camera). Near plane scales with distance.
11. **Measure in arcs.** New distance read-outs use arcs on a sphere (°′″) plus radii, via `spheres.ts`, not raw km.
12. **Every default view: in front of the body, north up, the Sun in view** (`frontView` in `flight.ts`). Clicking a body's name is the exception: above its north pole (`aboveNorth`).
13. **Three views, one set of controls** (ADR-0013). Calendar first; ✦ Fly and ◎ Galaxy buttons; clicking a name flies just above that body; in Fly, zooming out warps to the galaxy and zooming in on it warps back. New controls go in the boxes (`Pane.tsx`, or `App.tsx` if shared) and must mean something in every view.
14. **One scale: true** (ADR-0016). No compressed scales; they change directions, so planets would sit in the wrong sign.
15. **Capture records what is on screen** and never the capture controls: mark any control that must stay out with `data-no-capture`; keep the WebGL renderer's `preserveDrawingBuffer`.
16. **A path's point is everything on screen** (ADR-0017). Anything new that changes what is seen (a setting, a camera, a look) must be added to `PathPoint` (and its validation) so points restore it, and flights must move to it without a cut.

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Years are astronomical internally (year 0 = 1 BCE). Display through `formatYear` / `formatTime`. Clock is GMT.
- Constants with published uncertainty go in `src/core/constants.ts` with the range in a comment.
- Keep `aria-label`s and keyboard controls working. Respect `prefers-reduced-motion`.
- UI text and docs in plain language; Canadian/British spelling is fine.
- **Licences**: code Apache 2.0, docs CC BY 4.0 (README.md "Licence"). Anything added must be compatible: permissive code (MIT, BSD, Apache), data in the public domain or CC BY; no GPL or AGPL code. Record each new source in NOTICE (and `public/**/CREDITS.md` for data).
- Each version: bump `package.json` (0.x.y until the public launch, which is 1.0), add a CHANGELOG entry written for the user, update or add an ADR for architectural changes, tag `v0.x.y`.

## Working with the owner

- They describe what they want to see, often visually ("like a planetarium", "like a video game character"). Build it, show screenshots, then ask. Their stated preferences are in DECISIONS.md §4; keep them unless told otherwise.
- They work on a Mac in `~/sp4cetime` and run `npm run dev` themselves (often in their own browser; which one matters for capture). If you work from a Linux sandbox linked to that folder: **never run `npm install`/`npm ci` in their folder from Linux** (it breaks native binaries on the Mac). Verify in a copy elsewhere (e.g. `rsync -a --exclude node_modules --exclude dist --exclude .git ~/mnt/sp4cetime/ ~/work/sp/` with its own `npm install`); tell them to run `npm install` when dependencies change.
- Big patches are easiest written in the cloud workspace and sent to the Mac's Linux shell as gzip + base64 Python scripts that assert each replacement matches exactly once.
- They ask in short bursts, often several changes at once, and change their minds after trying things (dials, play/pause placement, scales). Do what was asked, say plainly what you could not verify, and keep DECISIONS §4 current.
- Verify visual work with real screenshots (Playwright + Chromium) before saying it works. Headless software WebGL is slow; judge looks there, not speed.
- When a source image or dataset is needed, prefer public-domain or permissive licences, record the source and licence in `public/**/CREDITS.md` or a LICENSE file, and build it with a script in `scripts/`.

## Starting a new conversation

Paste one of these as the first message (adjust the bracketed parts). They are model-agnostic.

**General start**

> You are working on sp4cetime, a static web app (Vite, React, TypeScript, Canvas 2D, Three.js). Read CLAUDE.md and DECISIONS.md in the repo first and follow their rules. Then: [task]. Run `npm run check` before you finish, show me screenshots of anything visual, and summarise what changed in plain language. Bump the version and add a CHANGELOG entry if you change behaviour.

**New feature**

> In sp4cetime (read CLAUDE.md and DECISIONS.md first), I want [what I want to see or do]. Before coding, tell me in a few lines how it fits the existing design (calendar vs Fly mode, which files, any new dependency or data source and its licence). Then build it with tests for any new maths, verify with screenshots, and record any architectural decision as a new ADR in docs/adr/.

**Bug or something looks wrong**

> In sp4cetime (read CLAUDE.md first), [what I see, where, and what I expected]. Reproduce it first (a test or a screenshot), then fix the cause rather than the symptom, and add a test that would have caught it.

**Library / events and stories (after the beta)**

> In sp4cetime (read CLAUDE.md and DECISIONS.md, especially §1 "Library"), start the Library: the `.sp4ce.json` schema for events, stops and stories (schema-versioned, validated like themes), adding an event by tapping the Sun line, event pins and spans on the calendar, and saving to IndexedDB with file export/import. Pure schema and maths in `src/core` with tests; UI in `src/app`.

**Going live (GitHub and sp4cetime.org)**

> In sp4cetime (read CLAUDE.md, then the "Going live" section of README.md), help me release to GitHub and launch on sp4cetime.org. Use the built-in browser where I'm signed in; ask me before anything that publishes, changes an account or touches DNS; I type any passwords or tokens myself. Work through the steps in order and tick them off in the README as they are done.

**0.4.0: Stand here (signs and houses)**

> In sp4cetime (read CLAUDE.md, DECISIONS.md and the "0.4.0" section of README.md and docs/ROADMAP.md), build "Stand here" as designed there: the house maths in `src/core/houses.ts` with property tests first, then the dialog (place in degrees, minutes, seconds; a time frame), the ground view with house wedges and a transparent planet, and points that remember it. Verify with screenshots and a video of each view.

**Release**

> In sp4cetime, prepare release [version]: `npm run check`, update CHANGELOG.md and package.json, make sure README/DECISIONS/ADRs reflect what changed, then commit and tag `v[version]`.

## Definition of done

- `npm run check` passes; new maths has tests; bundle budgets hold.
- Visual changes checked in screenshots in both the calendar and Fly mode where relevant.
- CHANGELOG entry and version bump; ADR for architectural changes; DECISIONS.md updated if a decision or preference changed.
- Credits and licences recorded for any new code, data or images (NOTICE, `public/**/CREDITS.md`).
