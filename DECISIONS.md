# Decisions

The specifics: what was decided, why, and where it lives in the code. Each architectural decision has a full record in [docs/adr/](docs/adr/); this file is the index plus everything that is not architecture (product, interaction, the owner's stated preferences). History of how it got here is in [CHANGELOG.md](CHANGELOG.md) and `git log`. The original Grok-era decision log is kept in `docs/archive/grok/` for reference only; where it disagrees with this file, this file wins.

Status: v1.0, 30 October 2026.

## 1. Product

| Decision | Detail |
| --- | --- |
| Who builds it | One person, part-time (~15–20 h/week), with AI help. Plans and scope are sized for that. |
| What it is | An instrument for seeing time as the solar system's real motion, then a tool for telling stories on it (timelines and presentations). Not a calendar app, not a Gantt chart. |
| Non-goals | No calendar sync, no real-time collaboration, no native apps, no accounts until people ask for sync. |
| Business order | Free tool → **Pro tier first** (owner's choice) → education licence → creator marketplace (year two, only if users already share for free). |
| Free vs Pro | Give away the universe; charge for what people make with it. Free: everything that helps explore or understand (all bodies, live mode, ±5 Gyr, all scales and tiers, themes, stories on the device, public links with a small mark, PNG screenshot). Pro (~$4/month or $36/year): presenter tools, private links and unbranded embeds, 4K video/GIF of stories, print posters, extra themes and theme editor, premium story packs. **Never gate a feature by hiding science.** |
| First earners | "Galactic birthday" card (free, shareable; poster/video one-time ~$5), video export of stories (rendered in the browser), the galactic clock (live mode at minute zoom as a full-screen clock). |
| Payments | A merchant of record (Lemon Squeezy or Paddle) issuing licence keys, checked once and stored on the device. No server needed for Pro. |
| Library (next to build) | A story = events (title, time or range, uncertainty, kind moment/span/era, note, link/image, source, tags, colour) + stops (camera views: events shown, zoom, roll, planets, scale, caption, hold time). Flights between stops are computed, not stored. One `.sp4ce.json` format, schema-versioned, for downloads, share links and curated entries. Seed stories: life of the Sun, Earth's deep history, the human story, space exploration, your galactic birthday. |
| Roadmap | [docs/PLAN.md](docs/PLAN.md): six two-month phases to a 1.0 public launch by 29 Oct 2027 (this code's "v1.0" is the instrument, not that launch). **v2 goal: release to GitHub (private first), then a public beta on sp4cetime.org via Cloudflare** — step by step in README.md. After that: Timelines/Library. |

## 2. Architecture

| # | Decision | Why | Record |
| --- | --- | --- | --- |
| A1 | Static single-page app: Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No Next.js, no backend. | One interactive canvas needs no server. Cloudflare serves static files free. | [0002](docs/adr/0002-static-spa.md) |
| A2 | Time is `{ day, sec }` from 2000-01-01 00:00 UTC, never a single float or a JS `Date`. All screen maths is camera-relative (subtract the camera's time first). | `Date` covers ±273,000 years; a double of seconds loses 1 s precision past ~285 Myr. Integer days are exact to ±2.4×10¹³ years. | [0001](docs/adr/0001-time-model.md) |
| A3 | Calendar drawn with plain Canvas 2D from a pure, framework-free `src/core`. | Thousands of procedural points per frame; testable in Node. | [0003](docs/adr/0003-canvas-2d.md) |
| A4 | Local-first: settings and (later) stories in the browser; files for export. | Privacy for teachers; no accounts. | [0004](docs/adr/0004-local-first.md) |
| A5 | Fly mode is a separate, lazy-loaded Three.js (WebGL) chunk with its own size budget. Calendar ≤150 KB gzipped JS, Fly ≤200 KB, enforced in CI. | 3D needs WebGL; the calendar must stay light. | [0009](docs/adr/0009-fly-mode.md) |
| A6 | Every frame is a pure function of (camera, theme, now, view offsets). No accumulated animation state. | Reproducible frames; presentations replay exactly. | CLAUDE.md rule 4 |
| A7 | Few dependencies, each justified: react, astronomy-engine, three. Dev: vite, vitest, fast-check, typescript. | Every library is a future chore. | ADRs |
| A8 | Data assets are built by scripts (`scripts/*.py`, Pillow + NumPy) from named sources, committed to `public/`, and fetched at runtime outside the JS budget. | Reproducible, licensed, cacheable. | [0009](docs/adr/0009-fly-mode.md), [0011](docs/adr/0011-calendar-sky.md) |
| A9 | Dev server pre-bundles `three` (`optimizeDeps.include`); Fly mode has an error boundary. | A lazily discovered dependency stalled the dev server ("Loading the solar system…"). | CHANGELOG 0.10.1 |

## 3. Science and geometry

| Decision | Value / detail | Record |
| --- | --- | --- |
| Accuracy tiers | Ephemeris ±3,000 yr; Modelled ±10,000 yr; Schematic beyond. Always labelled on screen. | [0005](docs/adr/0005-accuracy-tiers.md) |
| Sources | astronomy-engine (VSOP87-class planets, lunar theory, IAU rotation) in the ephemeris tier; JPL approximate Keplerian elements (rates frozen beyond ±30 centuries) for the calendar and beyond. | [0005](docs/adr/0005-accuracy-tiers.md), [0006](docs/adr/0006-spatial-model.md) |
| The Sun's motion | 230 km/s (galactic rest frame) toward galactic longitude 90°, modelled as a straight line over the spans shown. Galactic year 230 Myr. | `constants.ts` |
| Frames | Ecliptic J2000 (world); galactic (Hipparcos matrix); travel frame X = direction of travel (l 90°), Y = north galactic pole, Z = toward the galactic centre. Calendar view = roll then yaw of the travel frame. | [0006](docs/adr/0006-spatial-model.md) |
| The Sun is now | The Sun always marks the present; there is no "now" line. Grids are fixed in time and space and flow past the Sun (e.g. a gridline at 14:55:00 crosses the Sun at that GMT moment). Clock is GMT. | [0007](docs/adr/0007-coils-and-fuses.md) |
| Spirals | True pitch; fixed samples per turn at mean anomaly 2πk/N; fade to a density-shaded band when turns are closer than ~8–24 px; always edge to edge; single even-width lines snapped to device pixels. | [0008](docs/adr/0008-simple-paths.md) |
| Scale modes (calendar) | √ fit (default), linear, true (orbit size against 230 km/s of travel). Named on screen. | [0006](docs/adr/0006-spatial-model.md) |
| Fly mode scale | True sizes, distances and sunlight in km; one point light at the Sun, faint ambient; floating origin (positions relative to the camera in double precision); logarithmic depth; near plane scales with distance (≤1,000 km); far plane 10²⁰ km. | [0009](docs/adr/0009-fly-mode.md) |
| 3D paths | Fly-mode spirals: a moment τ away sits 230 km/s × τ along the line of travel; Keplerian paths shifted to pass exactly through each body's true position now, samples packed quadratically around the present; rebuilt every frame. | [0009](docs/adr/0009-fly-mode.md) |
| Nested spheres | Every position is an arc on a sphere, in degrees/minutes/seconds, plus distance in that sphere's radii and x, y, z: galaxy sphere centred on Sgr A* (8.178 kpc; galactic axes; radius 50,000 ly), the Sun's sphere (ecliptic axes), each body's sphere (turns with the body; geographic lon/lat). Spheres are perfect; real flattening is recorded as variation. | [0010](docs/adr/0010-spheres.md) |
| Space grid | Arcs of the Sun's circle around Sgr A* (″, ′, °), labelled with the Sun's galactic longitude seen from Sgr A* (~179°56′39″ in 2026). 1° ≈ 607,000 years of travel. | [0010](docs/adr/0010-spheres.md) |
| Labels | Fly-mode body labels show apparent angular size, not distance. | [0010](docs/adr/0010-spheres.md) |
| Real sky | Hipparcos stars to mag 6 (true colours from B−V), the 88 IAU figures, ecliptic, zodiac band ±8° and twelve tropical signs (J2000 equinox), galactic equator with centre, anticentre and l 90°/270°. A sphere at infinity, no parallax. | [0009](docs/adr/0009-fly-mode.md) |
| Milky Way | Photographic all-sky map (Solar System Scope, CC BY 4.0), stars filtered out, faint range stretched, blended with the d3-celestial outline; galactic coordinates. | [0009](docs/adr/0009-fly-mode.md) |
| Calendar sky | The same 60° perspective lens as Fly mode, looking into the screen; turns with the view's roll and yaw; matches Fly's Solar system view star for star. (A whole-sky disc was tried and rejected: it bent the Milky Way into a ring.) Over deep time the sky does not spin (the galactic centre stays at l 0° from the Sun). | [0011](docs/adr/0011-calendar-sky.md) |
| Whole galaxy | Schematic face-on model, 40 kpc across, centred on Sgr A*: four 12° log-spiral arms (Perseus ~10.0, Sagittarius–Carina ~7.2, Scutum–Centaurus ~5.1, Norma/Outer ~3.7/13.9 kpc at the Sun's azimuth), Orion Spur, bar and bulge. Fades in beyond ~300 ly from the Sun as the Sun's sky fades out. Labelled as a model. | [0009](docs/adr/0009-fly-mode.md) |
| Surfaces | Earth (NASA Blue Marble) and Moon (Solar System Scope) maps, low resolution; other bodies plain colours with latitude/longitude graticules. Texture longitude 0 = the IAU prime meridian. | [0009](docs/adr/0009-fly-mode.md) |
| Key constants | GEO radius 42,164 km; Moon mean distance 384,400 km; obliquity 23.4392911°; Sgr A* at l 359.9442°, b −0.0462°. Constants with spread live in `src/core/constants.ts` with the range in a comment. | `constants.ts` |

## 4. Interaction (the owner's stated preferences)

These came directly from the owner's feedback and should be kept unless they say otherwise.

- **The Sun is always the present moment**; the grids move past it, not the other way round. No "Now" line, no centre cursor, no ghost circles.
- **Round window** with all controls in the corners (a Full option exists).
- **Spirals are simple and stable**: same look at every zoom, edge to edge, no flicker, no fragments, even line thickness (no ribbon effect). When too dense, a shaded band, not noise.
- **Spirals, orbits, time grid and space grid are toggles**, shared between calendar and Fly mode.
- **One gesture, one action.** A trackpad gesture zooms *or* scrolls *or* rotates, locked until it ends. Rotation works both ways (roll and turn).
- **Zoom holds the Sun in place**; the Sun can't be lost off screen. The Sun can be grabbed and moved anywhere; it stays the centre of the grid.
- **Fly mode like a game character**: fly freely, see bodies close up, true illumination and Moon phase.
- **Every default view: standing in front of the body, north up, the Sun in view.** Geostationary is exactly geostationary.
- **Measure in arcs** (degrees, minutes, seconds) on interacting spheres, not km.
- **The real sky** as the background in both modes, like a planetarium dome covering every direction; include the zodiac; mark the Galactic Centre, Anticentre and the halfway points.
- **Readable controls**: light text on dark panels in Fly mode whatever the theme.
- **Wireframe honesty** over decoration: plain colours and graticules unless a real map exists.
- Plain-language UI text and docs; British/Canadian spelling is fine ("centre", "colour").

## 5. Process

- `npm run check` (typecheck, tests, build) must pass before every commit; CI also enforces the bundle budgets.
- Tests hardest on maths: property tests (fast-check) across the full ±5 Gyr range where it applies.
- Small commits to `main`, each always deployable; commit messages say what changed for the user.
- Verify visual changes with real screenshots (Playwright + Chromium), not just tests.
- **Never run `npm install`/`npm ci` inside the owner's Mac folder from a Linux shell**: it installs Linux native binaries (rolldown) and breaks `npm run dev` on the Mac. Verify in a copy elsewhere instead, and ask the owner to run `npm install` on the Mac when dependencies change.
- Restart `npm run dev` after dependencies change.

## 6. Known limits and open questions

- The Sun's galactic path is straight in the model; over tens of Myr it is really an orbit (and bobs through the plane). Deep-time views say so.
- Today's star positions are shown at all times; stars drift out of their constellations over ~100,000 years.
- Fly mode needs WebGL; without it, it says so and the calendar still works.
- Not yet built: Library/stories, sharing, Pro, accessibility list view, presentation mode, screenshot tests in CI, Sentry/Plausible.
