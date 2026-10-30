# sp4cetime · Galactic Calendar

**Map any timeline on the path the solar system is already traveling.**

A zoomable canvas that runs from the Sun's formation (~4.6 billion years ago) to the end of its main-sequence life (~5 billion years from now). The Sun's path through the galaxy is the straight central line; the planets and the Moon corkscrew around it in their true orientation. Drag to move through time, scroll or pinch to zoom from seconds to billions of years. In live mode the present stays at the centre and time flows past.

Live at [sp4cetime.org](https://sp4cetime.org) (once deployed).

## Run it

Requires Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm test` | Unit and property tests (Vitest + fast-check) |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run build` | Production build into `dist/` |
| `npm run check` | All three of the above; run before every commit |

Controls: drag sideways or ←/→ to move through time; drag up/down, ↑/↓ or Shift+scroll to turn the view around the line of travel; scroll, pinch or +/− to zoom time; Option/Alt + scroll or [ and ] to zoom into space; **N** returns to now. The Sun is always the present moment; grab it to move it anywhere.

## Layout

```
src/core/      Pure TypeScript: time model, camera, ticks, astronomy, renderer. No React.
src/app/       React UI around the canvas.
content/       Themes (and later sample paths) as validated JSON.
docs/          Plan, architecture decisions (adr/), reference material.
```

The rules that keep this simple are in [CLAUDE.md](CLAUDE.md); the reasons are in [docs/adr](docs/adr).

## Deploy (Cloudflare)

The site is static files only.

- **Dashboard (recommended):** Cloudflare → Workers & Pages → Create → connect the GitHub repo. Build command `npm run build`, output directory `dist`. Every push to `main` deploys; every pull request gets a preview URL.
- **CLI:** `npm run build && npx wrangler deploy` (uses `wrangler.jsonc`).

Then add `sp4cetime.org` as a custom domain on the project, and redirect the `.com`, `.io` and `.ai` domains to it.

## Accuracy

Positions are shown in three honest tiers, labelled on screen:

- **Ephemeris** (within ±3,000 years): planets from JPL's [Keplerian elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html), the Moon's phase from [astronomy-engine](https://github.com/cosinekitty/astronomy).
- **Modelled** (within ±10,000 years): mean orbital motion.
- **Schematic** (beyond): the shape is right but the phase is illustrative. Earth's orbital phase is genuinely unknowable that far out.

Orbit orientation is always real. Orbit size has three modes, named on screen: √ fit (default), linear, and true scale against the distance travelled. See [ADR-0006](docs/adr/0006-spatial-model.md).

## Credit

Inspired by the galactic-motion visualization shared by [@Geosophyy](https://x.com/Geosophyy/status/2115404526002041035).
