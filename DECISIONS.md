# Decisions

The specifics: what was decided, why, and where it lives in the code. Each architectural decision has a full record in [docs/adr/](docs/adr/); this file is the index plus everything that is not architecture (product, interaction, the owner's stated preferences). History of how it got here is in [CHANGELOG.md](CHANGELOG.md) and `git log`. The original Grok-era decision log is kept in `docs/archive/grok/` for reference only; where it disagrees with this file, this file wins.

Status: 0.2.0, 31 October 2026. Versions carry a leading zero until the public launch, which will be 1.0. Next: 0.3.0, paths through time and space.

## 1. Product

| Decision | Detail |
| --- | --- |
| Who builds it | One person, part-time (~15–20 h/week), with AI help. Plans and scope are sized for that. |
| What it is | An instrument for seeing time as the solar system's real motion, then a tool for telling stories on it (timelines and presentations). Not a calendar app, not a Gantt chart. |
| Non-goals | No calendar sync, no real-time collaboration, no native apps, no accounts until people ask for sync. |
| Business order | Free tool → **Pro tier first** (owner's choice) → education licence → creator marketplace (year two, only if users already share for free). |
| Free vs Pro | Give away the universe; charge for what people make with it. Free: everything that helps explore or understand (all bodies, live mode, ±5 Gyr, all tiers, themes, stories on the device, public links with a small mark, screenshots, GIFs and videos of the live view with the @sp4cetime.org watermark). Pro (~$4/month or $36/year): presenter tools, private links and unbranded embeds, 4K video/GIF of stories, print posters, extra themes and theme editor, premium story packs. **Never gate a feature by hiding science.** |
| First earners | "Galactic birthday" card (free, shareable; poster/video one-time ~$5), video export of stories (rendered in the browser), the galactic clock (live mode at minute zoom as a full-screen clock). |
| Payments | A merchant of record (Lemon Squeezy or Paddle) issuing licence keys, checked once and stored on the device. No server needed for Pro. |
| Library (paths first, in 0.3.0) | A story = events (title, time or range, uncertainty, kind moment/span/era, note, link/image, source, tags, colour) + stops (camera views: events shown, zoom, roll, planets, scale, caption, hold time). Flights between stops are computed, not stored. One `.sp4ce.json` format, schema-versioned, for downloads, share links and curated entries. Seed stories: life of the Sun, Earth's deep history, the human story, space exploration, your galactic birthday. |
| Roadmap | [docs/PLAN.md](docs/PLAN.md): six two-month phases to a 1.0 public launch by 29 Oct 2027. **0.3.0 goal: paths through time and space** (Prezi-style presentations: START, POINT 1, 2 …, END, flown between; README.md "Next goal"). **0.4.0: release to GitHub (private first), then a public beta** on sp4cetime.org via Cloudflare, step by step in README.md. After that: events and stories (the rest of the Library). PLAN.md's phases predate this order; presentation paths moved up from its phase 3. The owner sees it as "more of a toy than a tool" for now and plans to show it on X (with Capture recordings) and on their website. |
| Paths (0.3.0) | Go to a time, place and view, press Return: START; travel, Return: POINT 1, POINT 2 …; the last is END. Return (outside Presentation mode) opens a dialog: start a path and name it; at each later Return, confirm the view as the next point, add a caption, or stop after it (END). A point is exactly what is on screen: view, time and zoom, camera, theme, window, planets and elements, boxes and labels, time running or paused and its speed. Present is built into the Capture button, with a drop-down of saved paths. Presentation mode flies between points (never cuts): Return or → next, ← previous; after wandering, a press only flies back to the point and the next press continues. Each point has a box with its view, position, time, view angle and caption. Paths stored on the device (IndexedDB, `.sp4ce.json`) for now; cloud with accounts later; then a library of ready-made presentations and a marketplace. A point is a Library stop; flights are computed. Detail in README.md "Next goal". |
| Content | Capture (0.2.0) is also for making content: screen savers and posts. Watermark by default. |

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
| A9 | Dev server pre-bundles `three` (`optimizeDeps.include`); Fly mode has an error boundary. | A lazily discovered dependency stalled the dev server ("Loading the solar system…"). | CHANGELOG 0.0.10.1 |
| A10 | The page (`App.tsx`) holds what is shared (the present and its speed, the theme, the space-bar state, Capture); one window (`Pane.tsx`) holds a view (calendar, Fly, galaxy) with its settings, camera and corner boxes, portalled into the page. | Made several round "dial" windows possible; those were built, tried and removed as clunky, but the split stayed (it is cleaner). | [0016](docs/adr/0016-capture-play-true-scale.md) |
| A11 | Capture in the browser, no dependency: views copied from their canvases (WebGL keeps its frame, `preserveDrawingBuffer`; a view that copies empty is read back pixel by pixel), the HTML boxes painted in one by one from styled copies drawn through SVG `foreignObject`, Fly's labels painted per frame; our own GIF encoder (median cut, LZW); video through `MediaRecorder` (MP4 where possible). | Records what is on screen, boxes included, without the capture button; no screen-share prompt. | [0016](docs/adr/0016-capture-play-true-scale.md) |

## 3. Science and geometry

| Decision | Value / detail | Record |
| --- | --- | --- |
| Accuracy tiers | Ephemeris ±3,000 yr; Modelled ±10,000 yr; Schematic beyond. Always labelled on screen. | [0005](docs/adr/0005-accuracy-tiers.md) |
| Sources | astronomy-engine (VSOP87-class planets, lunar theory, IAU rotation) in the ephemeris tier; JPL approximate Keplerian elements (rates frozen beyond ±30 centuries) for the calendar and beyond. | [0005](docs/adr/0005-accuracy-tiers.md), [0006](docs/adr/0006-spatial-model.md) |
| The Sun's motion | 230 km/s (galactic rest frame) toward galactic longitude 90°, modelled as a straight line over the spans shown. Galactic year 230 Myr. | `constants.ts` |
| Frames | Ecliptic J2000 (world); galactic (Hipparcos matrix); travel frame X = direction of travel (l 90°), Y = north galactic pole, Z = toward the galactic centre. Calendar view = roll then yaw of the travel frame. | [0006](docs/adr/0006-spatial-model.md) |
| The Sun is now | The Sun always marks the present; there is no "now" line. Grids are fixed in time and space and flow past the Sun (e.g. a gridline at 14:55:00 crosses the Sun at that GMT moment). Clock is GMT. | [0007](docs/adr/0007-coils-and-fuses.md) |
| Spirals | True pitch; fixed samples per turn at mean anomaly 2πk/N; fade to a density-shaded band when turns are closer than ~8–24 px; always edge to edge; single even-width lines snapped to device pixels. | [0008](docs/adr/0008-simple-paths.md) |
| Scale | **One scale: true** (0.2.0). Fly mode and the galaxy: true distances, sizes and sunlight. Calendar: orbits in true proportion and orientation, sized by pinch/scroll. √ fit and linear were removed: √ fit pulled the planets in toward the Sun, which also turned the direction they are seen in from Earth (Neptune at 2° Aries was drawn in the Pisces box). | [0016](docs/adr/0016-capture-play-true-scale.md) |
| Fly mode scale | True sizes, distances and sunlight in km; one point light at the Sun, faint ambient; floating origin (positions relative to the camera in double precision); logarithmic depth; near plane scales with distance (≤1,000 km); far plane 10²⁰ km. | [0009](docs/adr/0009-fly-mode.md) |
| 3D paths | Fly-mode spirals: a moment τ away sits 230 km/s × τ along the line of travel; Keplerian paths shifted to pass exactly through each body's true position now, samples packed quadratically around the present; rebuilt every frame. | [0009](docs/adr/0009-fly-mode.md) |
| Nested spheres | Every position is an arc on a sphere, in degrees/minutes/seconds, plus distance in that sphere's radii and x, y, z: galaxy sphere centred on Sgr A* (8.178 kpc; galactic axes; radius 50,000 ly), the Sun's sphere (ecliptic axes), each body's sphere (turns with the body; geographic lon/lat). Spheres are perfect; real flattening is recorded as variation. | [0010](docs/adr/0010-spheres.md) |
| The Sun's galactic orbit | Galaxy view only: the whole life (−4.6 to +5 Gyr, ~42 turns) as overlapping loops. Bob: simple harmonic, 20.8 pc now (Bennett & Bovy 2019), +7.25 km/s, 85 Myr → ±102 pc. Radial: epicycle, 11.1 km/s inward and +12.24 km/s (Schönrich et al. 2010), guiding centre 8.61 kpc, ±0.52 kpc, ~163 Myr. Calendar and Fly stay straight. | [0014](docs/adr/0014-vertical-bob.md) |
| Space grid | Kilometres along the Sun's path, 1, 2 or 5 × a power of ten, fixed in space; no per-line labels; a **scale bar** in the bottom-right box (two of the grid's brown dashed lines as far apart as on screen, the km above; in Fly a round fraction or multiple of the spacing so it fits). In Fly the grid is a ruler whose units follow TIME, so its km are the ruler's. In the galaxy view the Sun's path carries a ruler every 10,000 light years (~13 Myr of travel), stated in a sentence. | [0010](docs/adr/0010-spheres.md), [0013](docs/adr/0013-one-instrument.md) |
| Labels | Fly-mode body labels show apparent angular size, not distance. | [0010](docs/adr/0010-spheres.md) |
| Real sky | Hipparcos stars to mag 6 (true colours from B−V), the 88 IAU figures, ecliptic, zodiac band ±8° and twelve tropical signs (30° boxes from the J2000 equinox), galactic equator with centre, anticentre and l 90°/270°. A sphere at infinity, no parallax. Signs are tropical, so they sit ≈24° from the constellations of the same name (precession): Neptune in 2026 is in the sign Aries but in front of the stars of Pisces; both are shown truthfully. | [0009](docs/adr/0009-fly-mode.md) |
| Milky Way | Photographic all-sky map (Solar System Scope, CC BY 4.0), stars filtered out, faint range stretched, blended with the d3-celestial outline; galactic coordinates. | [0009](docs/adr/0009-fly-mode.md) |
| Calendar sky | The same 60° perspective lens as Fly mode, looking into the screen; turns with the view's roll and yaw; matches Fly's Solar system view star for star. (A whole-sky disc was tried and rejected: it bent the Milky Way into a ring.) Over deep time the sky does not spin (the galactic centre stays at l 0° from the Sun). | [0011](docs/adr/0011-calendar-sky.md) |
| Whole galaxy | Schematic face-on model, 40 kpc across, centred on Sgr A*: four 12° log-spiral arms (Perseus ~10.0, Sagittarius–Carina ~7.2, Scutum–Centaurus ~5.1, Norma/Outer ~3.7/13.9 kpc at the Sun's azimuth), Orion Spur, bar and bulge. Fades in beyond ~300 ly from the Sun as the Sun's sky fades out. Labelled as a model. Part of Fly mode (no separate button). In 3D (0.2.0): thin disc 0.30 kpc scale height (0.95 in the bulge/bar, flaring outward), thick disc 0.9 kpc (12%), dust 0.12 kpc giving an edge-on dark lane; ray-marched with exact vertical integration. Fermi bubbles: two shells 7.7 kpc (25,000 ly) tall, 6.6 kpc wide. | [0009](docs/adr/0009-fly-mode.md), [0012](docs/adr/0012-warp-and-sky-themes.md) |
| The Sun's galactic path | Drawn on the whole galaxy as a circle around Sgr A* through the Sun (230 km/s at 8.178 kpc, one orbit ≈ 218 Myr), highlighted: last 100 Myr bright, next 50 Myr dashed, marks every 50 Myr; constant screen width so it reads from any angle. Labelled a circular model. | [0012](docs/adr/0012-warp-and-sky-themes.md) |
| Three views, one set of controls | Calendar opens first; ✦ Fly and ◎ Galaxy buttons; clicking the Sun's, a planet's or the Moon's name flies just above its north pole, upright, facing the Sun with the body at your feet. In Fly, past 1,000 AU → galaxy; zoom in on the galaxy → solar system. No lens selector. The 3D view is a lazily loaded chunk with no controls of its own. | [0013](docs/adr/0013-one-instrument.md) |
| Warp | Past 1,000 AU from the Sun (moving out) Fly warps to 42 kpc from Sgr A* along the heading, tipped ≥20° out of the plane; flying at the Sun (within 4°) or zooming within 7 kpc of the galaxy's disc from outside warps back to 6 AU in front of it. Warps interpolate the log of distance from the Sun (equal factors in equal steps), 3.6 s, uninterruptible; speed shown in light speeds; instant with reduced motion. | [0012](docs/adr/0012-warp-and-sky-themes.md) |
| Geocentric calendar | Centre: Earth subtracts Earth's offset from every path at each moment: Earth's path straight, the Sun's coiling around it, planets in retrograde loops. Calendar only (in Fly, retrograde appears by itself). | `render.ts` |
| Strobe | Poses at fixed calendar moments (whole steps of a year/N), so they stay put while time runs; each body's poses joined by straight lines (the polygons are aliasing, kept on purpose); click a pose to jump the present there. | `render.ts` (`drawStrobe`) |
| Black hole and Local Group | Sgr A* 4.15 million suns, shadow √27/2 Rs, a marker ≥16 px from afar; M31, M33, LMC, SMC, M32, M110 at real positions and tilts, looks modelled; labelled, click to fly there. | [0015](docs/adr/0015-zodiac-flying-local-group.md) |
| Surfaces | Earth (NASA Blue Marble) and Moon (Solar System Scope) maps, low resolution; other bodies plain colours with latitude/longitude graticules. Texture longitude 0 = the IAU prime meridian. | [0009](docs/adr/0009-fly-mode.md) |
| Key constants | GEO radius 42,164 km; Moon mean distance 384,400 km; obliquity 23.4392911°; Sgr A* at l 359.9442°, b −0.0462°. Constants with spread live in `src/core/constants.ts` with the range in a comment. | `constants.ts` |

## 4. Interaction (the owner's stated preferences)

These came directly from the owner's feedback and should be kept unless they say otherwise.

- **The Sun is always the present moment**; the grids move past it, not the other way round. No "Now" line, no centre cursor, no ghost circles.
- **Round window** with all controls in the corners (a Full option exists). One window only: several round "dial" windows were built and removed ("too clunky and ugly"). Phones: one full-screen view, never round.
- **Spirals are simple and stable**: same look at every zoom, edge to edge, no flicker, no fragments, even line thickness (no ribbon effect). When too dense, a shaded band, not noise.
- **Spirals, orbits, time grid and space grid are toggles**, shared between calendar and Fly mode, in the **Elements** drop-down (with Strobe, Constellations, Zodiac, Galaxy marks). If a body is shown and Spirals is on, its spiral is always drawn.
- **Boxes**: title box = title, date, time (plus position in 3D); SPACE / TIME / SPEED as drop-downs; VIEW heading over Planets and Centre; instructions in a "? How to" pop-up centred on screen, with every inspiration and credit; space bar: hide boxes → hide labels → show all.
- **Time**: Speed menu chooses speed and direction only (Live by default) and holds time still; ▶ Play and ❚❚ Pause beside it. Every reload opens the calendar, round, Dark, Sun-centred, Minute, live.
- **Capture**: P screenshot, G 5-second GIF (plays, records, pauses), V video until V again or a click on its running time; straight to Downloads; records the screen as seen (boxes if showing), never the capture button; watermark "@sp4cetime.org" by default. The Capture button stays on screen when everything else is hidden.
- **Paths, Prezi-style** (0.3.0): Return sets START, POINT 1, 2 …, END at the current time, place and view; a dialog names the path and confirms each point (with a caption, and a choice to stop after it). A point is exactly what is on screen, theme and running or paused time included. **Present** is built into the Capture button. In Presentation mode Return and → go forward, ← goes back, and the viewer always flies between points. After wandering at a point, a press only flies back to the point; the next press continues.
- **Every transition is made beautiful**, not just interpolated: between views (calendar, Fly, galaxy), themes, window shapes, and boxes or labels appearing.
- **Centre** offers only the Sun or Earth; Earth = geocentric calendar.
- **Flying**: W flies where you look (the middle of the view); clicking a name is a visible journey there; every place is reachable; S is backward (so screenshot is P).
- **One gesture, one action.** A trackpad gesture zooms *or* scrolls *or* rotates, locked until it ends. Rotation works both ways (roll and turn).
- **Zoom holds the Sun in place**; the Sun can't be lost off screen. The Sun can be grabbed and moved anywhere; it stays the centre of the grid.
- **Fly mode like a game character**: fly freely, see bodies close up, true illumination and Moon phase.
- **Every default view: standing in front of the body, north up, the Sun in view.** Geostationary is exactly geostationary.
- **Measure in arcs** (degrees, minutes, seconds) on interacting spheres, not km.
- **The real sky** as the background in both modes, like a planetarium dome covering every direction; include the zodiac; mark the Galactic Centre, Anticentre and the halfway points.
- **Three looks everywhere**: Dark Mode, Bright Mode, Colour Mode, the same in the calendar, Fly mode and the whole galaxy. In Bright the sky is a negative: stars and Milky Way as dark ink, brighter = darker.
- **Labels stay behind things**: planets (and rings) and bright stars are never covered by sky or grid labels.
- **Three views, one set of controls**: Calendar opens first; ✦ Fly and ◎ Galaxy buttons; in Fly, zoom out → Galaxy, zoom in on the galaxy → solar system. (A first 0.2 version made the calendar the bridge between them; reversed.) Every control is available in every view; no lens selector.
- **True scale only**; no compressed or "fit" scales (they distort what you see).
- **Click a body's name** (the Sun, a planet, the Moon) to stand just above its north pole, upright, facing the Sun, the body at your feet (replaces "Stay over one spot").
- **The Sun's line is the thickest line** in every view; paths are thicker than grid and sky lines.
- **The galaxy is made of stars**, with nothing visible outside it: intergalactic space is empty.
- The Sun's path through the galaxy is highlighted from any angle; the warp is past light speed, like Google Earth to Street View in reverse.
- **Readable controls**: in Fly mode, light text on dark panels in Dark and Colour, dark text on light panels in Bright.
- **Wireframe honesty** over decoration: plain colours and graticules unless a real map exists.
- Plain-language UI text and docs; British/Canadian spelling is fine ("centre", "colour").

## 5. Process

- `npm run check` (typecheck, tests, build) must pass before every commit; CI also enforces the bundle budgets.
- Tests hardest on maths: property tests (fast-check) across the full ±5 Gyr range where it applies.
- Small commits to `main`, each always deployable; commit messages say what changed for the user.
- Verify visual changes with real screenshots (Playwright + Chromium), not just tests. From a cloud session linked to the Mac: build in the Linux copy, copy `dist/` into the Mac folder, stage it into the cloud container, serve it there and drive Chromium (WebGL via SwiftShader); delete `dist/` from the Mac folder afterwards.
- **Never run `npm install`/`npm ci` inside the owner's Mac folder from a Linux shell**: it installs Linux native binaries (rolldown) and breaks `npm run dev` on the Mac. Verify in a copy elsewhere instead, and ask the owner to run `npm install` on the Mac when dependencies change.
- Restart `npm run dev` after dependencies change.

## 6. Known limits and open questions

- The Sun's galactic path is straight in the model; over tens of Myr it is really an orbit (and bobs through the plane). Deep-time views say so.
- Today's star positions are shown at all times; stars drift out of their constellations over ~100,000 years.
- Fly mode needs WebGL; without it, it says so and the calendar still works.
- Zodiac signs use the J2000 equinox (≈0.4° off today's; more over millennia). Next: equinox of the viewed date for boxes and labels.
- Phones: one full-screen view; no touch flying yet (ideas: floating thumb stick, gyroscope looking, tap to travel).
- Not yet built: Library/stories, sharing links, Pro, accessibility list view, presentation mode, screenshot tests in CI, Sentry/Plausible, autopilot camera for screen savers.
