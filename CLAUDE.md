# Working on sp4cetime

Context for any AI assistant (Claude, GPT, Gemini, Grok, a local model) or human picking this project up cold. Read this file, then [DECISIONS.md](DECISIONS.md). Together they replace the history of the conversations that built v1.0; you should not need anything else to start. [README.md](README.md) has the general direction; [docs/adr/](docs/adr/) has the reasoning behind each architectural choice; `git log` and [CHANGELOG.md](CHANGELOG.md) have the history.

## What this is (in five lines)

- A static web app: a zoomable map of time drawn as the solar system's real motion. The Sun is always *now*, travelling at 230 km/s; planets and the Moon wind around its path as spirals, from −4.6 Gyr to +5 Gyr.
- **Calendar** (Canvas 2D, `src/core` + `src/app`): the round-window timeline, with the real sky behind it.
- **Fly mode** (Three.js, `src/fly`, lazy-loaded): true-scale 3D solar system, real sky, zodiac, Earth/Moon surfaces, and a whole-galaxy view.
- Positions are measured as arcs (°′″) on nested spheres: galaxy (Sgr A*), Sun, each body.
- Owner: one person, part-time (Lamp Diagnostics). Next goal (v2): release to GitHub, then a public beta (steps in README.md, "Goal for v2"). After that: the Library (stories), DECISIONS.md §1.

## Commands

- `npm install` then `npm run dev` (http://localhost:5173). Restart the dev server after dependencies change.
- `npm run check`: typecheck + tests + build. **Must pass before every commit.**
- `npm test`: tests only (Vitest + fast-check).
- `python3 scripts/build_sky.py …`, `build_textures.py …`, `build_galaxy.py`: rebuild `public/` data (usage in each file's header; needs Pillow and NumPy). Outputs are committed.

## Where things live

| Path | What |
| --- | --- |
| `src/core/time.ts` | `Time = { day, sec }` from 2000-01-01 00:00 UTC; civil dates, formatting. |
| `src/core/camera.ts`, `ticks.ts` | Calendar camera (time ↔ x), time ticks and the space grid (arcs of the galactic circle). |
| `src/core/geometry.ts`, `planets.ts`, `models.ts` | Frames (ecliptic, galactic, travel, view), Keplerian orbits, accuracy tiers, Moon phase. |
| `src/core/render.ts` | The calendar renderer: `drawFrame(ctx, input)`. Pure apart from the canvas context. |
| `src/core/bodies.ts` | True positions and orientations of every body (astronomy-engine), radii, flattening. |
| `src/core/spheres.ts` | Nested spheres, arc positions, DMS formatting, ray–sphere hits. |
| `src/core/paths3d.ts`, `skymap.ts` | Fly-mode spirals and grid marks; the calendar sky's perspective lens. |
| `src/core/constants.ts` | Physical constants, each with its published range. |
| `src/app/` | React UI: `App.tsx` (corners, settings, mode switch), `GalacticCanvas.tsx` (gestures, frame loop), `skyBackdrop.ts`, `settings.ts` (localStorage). |
| `src/fly/` | `FlyView.tsx` (loop, input, HUD), `scene.ts`, `flight.ts` (poses, destinations), `overlays.ts`, `sky.ts`, `galaxy.ts`. |
| `content/themes/*.json` | Themes as data, validated by `parseTheme`. |
| `public/sky`, `public/textures` | Star catalogue, Milky Way, galaxy model, Earth and Moon maps, with licences and credits. |

## Rules

1. **`src/core/` is pure TypeScript.** No React, no DOM except the canvas context passed into `drawFrame`. Everything there is unit-testable in Node. Anything needing images or WebGL lives in `src/app` or `src/fly` and is passed in.
2. **Never put deep time into a single number for screen maths.** Use `Time`. Convert to x only via `timeToX`/`xToTime`, which subtract the camera centre first.
3. **Never use JavaScript `Date` for model time.** It only covers ±273,000 years. `Date` is allowed only at the edges: reading the clock (`fromUnixMs`) and astronomy-engine inside the ephemeris tier.
4. **Every frame is a pure function of (camera, theme, now, view offsets).** No accumulated animation state in renderers. Rotation, positions and labels derive from time.
5. **Be honest about accuracy.** Beyond the ephemeris tier, say "modelled" or "schematic" on screen. Models (the whole galaxy) are labelled as models. Never invent surface detail; never hide science behind Pro.
6. **Themes are data.** A theme never changes where things are, only how they look. Fly mode always uses a dark theme.
7. **Test the maths hardest.** New core code comes with tests; prefer property tests across the full ±5 Gyr range.
8. **Few dependencies.** Adding one needs a line in an ADR saying why. Current runtime deps: react, astronomy-engine, three.
9. **Small commits to `main`, always deployable.** CI runs typecheck, test, build and gzipped JS budgets: 150 KB calendar, 200 KB Fly chunk.
10. **Fly mode precision:** positions are computed in double precision relative to the camera (floating origin) before reaching the GPU; keep huge objects' on-GPU coordinates small (the sky is a 10⁵ km sphere drawn first with depth off; the galaxy is drawn shrunk toward the camera). Near plane scales with distance.
11. **Measure in arcs.** New distance read-outs use arcs on a sphere (°′″) plus radii, via `spheres.ts`, not raw km.
12. **Every default view: in front of the body, north up, the Sun in view** (`frontView` in `flight.ts`).

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Years are astronomical internally (year 0 = 1 BCE). Display through `formatYear` / `formatTime`. Clock is GMT.
- Constants with published uncertainty go in `src/core/constants.ts` with the range in a comment.
- Keep `aria-label`s and keyboard controls working. Respect `prefers-reduced-motion`.
- UI text and docs in plain language; Canadian/British spelling is fine.
- Each version: bump `package.json`, add a CHANGELOG entry written for the user, update or add an ADR for architectural changes.

## Working with the owner

- They describe what they want to see, often visually ("like a planetarium", "like a video game character"). Build it, show screenshots, then ask. Their stated preferences are in DECISIONS.md §4; keep them unless told otherwise.
- They work on a Mac in `~/sp4cetime` and run `npm run dev` themselves. If you work from a Linux sandbox linked to that folder: **never run `npm install`/`npm ci` in their folder from Linux** (it breaks native binaries on the Mac). Verify in a copy elsewhere; tell them to run `npm install` when dependencies change.
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

**Library / stories (the next phase)**

> In sp4cetime (read CLAUDE.md and DECISIONS.md, especially §1 "Library"), start the Library: the `.sp4ce.json` schema for events, stops and stories (schema-versioned, validated like themes), adding an event by tapping the Sun line, event pins and spans on the calendar, and saving to IndexedDB with file export/import. Pure schema and maths in `src/core` with tests; UI in `src/app`.

**v2: GitHub and public beta**

> In sp4cetime (read CLAUDE.md, then the "Goal for v2" section of README.md), help me release to GitHub and then launch the public beta. Use the built-in browser where I'm signed in; ask me before anything that publishes, changes an account or touches DNS; I type any passwords or tokens myself. Work through the steps in order and tick them off in the README as they are done.

**Release**

> In sp4cetime, prepare release [version]: `npm run check`, update CHANGELOG.md and package.json, make sure README/DECISIONS/ADRs reflect what changed, then commit and tag `v[version]`.

## Definition of done

- `npm run check` passes; new maths has tests; bundle budgets hold.
- Visual changes checked in screenshots in both the calendar and Fly mode where relevant.
- CHANGELOG entry and version bump; ADR for architectural changes; DECISIONS.md updated if a decision or preference changed.
- Credits and licences recorded for any new data or images.
