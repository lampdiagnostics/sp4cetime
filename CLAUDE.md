# Working on sp4cetime

Context for AI coding assistants (and humans). Read this before changing code.

## What this is

A static web app: a zoomable time canvas from −4.6 Gyr to +5 Gyr, with the Sun's galactic path as a central line and Earth/Moon helices around it. Plan and rationale: `docs/PLAN.md`, `docs/adr/`.

## Commands

- `npm run check` — typecheck + tests + build. Must pass before every commit.
- `npm run dev` — local server.
- `npm test` — tests only.

## Rules

1. **`src/core/` is pure TypeScript.** No React, no DOM except the canvas context passed into `drawFrame`. Everything there is unit-testable in Node. `src/fly/` holds the 3D Fly mode (Three.js), loaded only when entered.
2. **Never put deep time into a single number for screen maths.** Use the `Time` type (`src/core/time.ts`). Convert to x only via `timeToX`/`xToTime` in `camera.ts`, which subtract the camera centre first.
3. **Never use JavaScript `Date` for model time.** It only covers ±273,000 years. `Date` is allowed only at the edges: reading the clock (`fromUnixMs`) and calling astronomy-engine inside the ephemeris tier.
4. **Every frame is a pure function of (camera, theme, now, grid offset).** No accumulated animation state in the renderer. Rotation, positions and labels derive from time.
5. **Be honest about accuracy.** Anything shown beyond the ephemeris tier must say it is modelled or schematic (`src/core/models.ts`).
6. **Themes are data.** Add or change looks in `content/themes/*.json`; `parseTheme` validates them. A theme never changes where things are, only how they look.
7. **Test the maths hardest.** New core code comes with tests. Prefer property tests (fast-check) across the full ±5 Gyr range over a few hand-picked cases.
8. **Few dependencies.** Adding one needs a line in an ADR saying why.
9. **Small commits to `main`, always deployable.** CI runs `typecheck`, `test`, `build` and gzipped JS budgets: 150 KB for the calendar, 200 KB for the on-demand Fly mode chunk (Three.js).

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Years are astronomical internally (year 0 = 1 BCE). Display goes through `formatYear` / `formatTime`.
- Constants with published uncertainty live in `src/core/constants.ts` with the range in a comment.
- Keep the `aria-label`s and keyboard controls working when changing the UI.
