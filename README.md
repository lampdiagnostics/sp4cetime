# sp4cetime · Galactic Calendar

**Map any timeline on the path the solar system is already traveling.**

sp4cetime is a zoomable map of time drawn as the real motion of the solar system. The Sun is always *now*, travelling at 230 km/s along its path around the galaxy; the planets and the Moon wind around that path as spirals, in their true orientation, from the Sun's birth (−4.6 billion years) to the end of its main-sequence life (+5 billion years). Time and distance grids flow past the Sun as the present moves. A 3D **Fly mode** puts you inside the solar system at true scale and in real sunlight, under the real sky, and out to a view of the whole Milky Way.

Version 1.0 · October 2026 · solo, part-time project (Lamp Diagnostics) with AI help.
Live at [sp4cetime.org](https://sp4cetime.org) once deployed.

## Where it is going

The direction, in order (detail in [docs/PLAN.md](docs/PLAN.md) and [DECISIONS.md](DECISIONS.md)):

1. **A truthful instrument first.** Real positions where they are known, honest labels where they are modelled, nothing invented. Every measure is an arc on a sphere (degrees, minutes, seconds), every view is north-up with the Sun in sight.
2. **Stories (the Library).** Events placed on the timeline, gathered into stories that play as guided flights. One file format (`.sp4ce.json`) for downloads, share links and curated Library entries.
3. **Sharing.** Read-only links and embeds; local-first storage, no accounts until people ask for sync.
4. **Pro tier**, before any marketplace: sells output, polish and privacy (video/GIF export of stories, posters, private links, unbranded embeds, extra themes), never a truer picture. Free users always see the same science.
5. Year two, only if wanted: theme editor, accounts and sync, education licence, creator marketplace.

What exists today (v1.0) is the instrument: the calendar, Fly mode, the sky and the galaxy. Stories, sharing and Pro are not built yet.

## Goal for v2: release to GitHub, then a public beta

v1.0 lives only on the owner's Mac (git, tagged `v1.0`, no remote yet). v2 puts it on GitHub and live on sp4cetime.org as a public beta. An AI assistant can do most of this through the Claude app's built-in browser and a GitHub connection; the owner approves anything that publishes, changes an account or touches DNS, and passwords and tokens are always typed by the owner.

### Part 1: release to GitHub

1. **Sign in.** The owner signs in to GitHub and Cloudflare in the Claude app's built-in browser.
2. **Create the repository.** On github.com: New repository, name `sp4cetime`, **Private** (the business plan is in `docs/PLAN.md` and `DECISIONS.md`; there is no licence yet). Don't add a README, .gitignore or licence; the folder has them.
3. **Push the code and the `v1.0` tag.** Either:
   - **Connect GitHub to Claude** (claude.ai → Settings → Connectors → GitHub, with access to `sp4cetime`), then the assistant pushes, now and for every later version; or
   - **Once, in Terminal on the Mac:**
     ```sh
     brew install gh            # if needed
     gh auth login              # GitHub.com, HTTPS, log in with the browser
     cd ~/sp4cetime
     git remote add origin https://github.com/YOUR-USERNAME/sp4cetime.git
     git push -u origin main --follow-tags
     ```
     (Or in one step: `gh repo create sp4cetime --private --source=. --push && git push --tags`.)
4. **Check CI.** On GitHub → Actions, the workflow in `.github/workflows/ci.yml` (typecheck, tests, build, bundle budgets) should pass on `main`.

What goes up: everything git tracks (about 90 files, 2.6 MB). `.gitignore` keeps out `node_modules/`, `dist/`, `.env` files, logs and `.DS_Store`.

### Part 2: public beta on sp4cetime.org

1. **Cloudflare project.** Cloudflare → Workers & Pages → Create → connect the `sp4cetime` GitHub repository (the owner approves GitHub's permission screen). Build command `npm run build`, output directory `dist`, Node 22. Every push to `main` then deploys; every pull request gets a preview URL.
2. **Domain.** Add `sp4cetime.org` as the project's custom domain (move the domain's DNS to Cloudflare if it isn't there). Redirect `sp4cetime.com`, `.io` and `.ai` to `.org`.
3. **Check the live site** on a laptop, a phone and a tablet, in Safari, Chrome and Firefox: calendar, Fly mode (WebGL), sky, galaxy, the three themes, round and full window, keyboard controls, reduced motion.
4. **Beta basics before announcing:**
   - A short About page or panel: what it is, the accuracy tiers, the @Geosophyy credit and the data credits.
   - A privacy note: no accounts, no tracking beyond privacy-friendly page counts, settings stay in the browser.
   - A way to send feedback (an email address or a form).
   - Optional: Plausible for page counts and Sentry for error reports (both noted in the plan).
5. **Label it "Beta"** in the corner and in the page title.
6. **Tag the release** `v2.0` and write its CHANGELOG entry.
7. **Announce** to a small group first (teachers, science communicators, friends), collect feedback, then post more widely.

Decide at this point whether the repository becomes public (add a `LICENSE`, e.g. MIT; the data in `public/` keeps its own licences). After the beta: the Library (stories) is the next phase; see [DECISIONS.md](DECISIONS.md) §1.

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

**Calendar** (opens first). Round window, controls in the corners, the real sky behind it.

- Drag empty space to rotate the solar system (up/down rolls, sideways turns). The sky turns with it.
- Grab the Sun to move it anywhere; slide along its line to move through time (also ←/→ or horizontal scroll). **N** returns to now.
- Scroll, pinch or +/− zoom time (from about a minute to the Sun's whole life). Option/Alt + scroll or [ and ] zoom into space. Each gesture does one thing; zooming holds the Sun in place.
- Toggles: Spirals, Orbits, Time grid, Space grid; planet picker; scale (√ fit, linear, true); centre on any planet; three themes.

**Fly** (✦ Fly). You are in the solar system, at true scale.

- Drag to look; click any name to face it; W A S D move, R/F up/down, Q/E roll, Shift faster, scroll or pinch forward. Z/X change the lens (wide to ×60).
- Destinations: Solar system (the calendar's own view), Geostationary orbit, Low Earth orbit, Earth & Moon, Moon, Mars, Jupiter, Saturn, Sun, Whole galaxy. Each opens in front of the body, north up, the Sun in view.
- Time: live, paused, or 1 min / 1 h / 1 day per second.
- "Position on" reads your place as an arc on a sphere (nearest body, the Sun, or the galaxy around Sgr A*), in degrees, minutes and seconds; point at a body to read latitude and longitude.
- Sky toggles: Constellations, Zodiac, Galaxy marks (centre, anticentre, l 90°/270°).

**◎ Galaxy** opens Fly mode 40 kpc above the Milky Way (a labelled model), with the Sun marked; fly in continuously to the solar system.

## Layout

```
src/core/     Pure TypeScript: time, camera, ticks, orbits, spheres, sky maths, calendar renderer.
src/app/      React UI: the calendar, settings, sky backdrop.
src/fly/      Fly mode (Three.js), loaded only when opened.
content/      Themes as validated JSON.
public/       Sky data, Milky Way, galaxy, Earth and Moon maps (with credits).
scripts/      Python scripts that rebuild public/ data from their sources.
docs/         PLAN.md (critique and 12-month plan), adr/ (one file per decision), archive/, reference/.
```

- [CLAUDE.md](CLAUDE.md): rules and context for anyone (human or AI) changing the code. [AGENTS.md](AGENTS.md) points other tools to it.
- [DECISIONS.md](DECISIONS.md): every decision with its reason, and the owner's stated preferences.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.

## Accuracy

Shown on screen in three tiers: **Ephemeris** within ±3,000 years (astronomy-engine for planets, Moon, rotation; JPL Keplerian elements in the calendar), **Modelled** within ±10,000 years (mean orbits), **Schematic** beyond (shapes and orientation right, phase illustrative). The Sun's galactic path is modelled as straight over the spans shown; the whole-galaxy view is a schematic model. See [ADR-0005](docs/adr/0005-accuracy-tiers.md).

## Deploy (Cloudflare)

Static files only. Cloudflare → Workers & Pages → connect the GitHub repo; build command `npm run build`, output `dist`. Or `npm run build && npx wrangler deploy` (uses `wrangler.jsonc`). Add `sp4cetime.org` as the custom domain and redirect the `.com`, `.io` and `.ai` domains to it.

## Credits

- Inspired by the galactic-motion visualization shared by [@Geosophyy](https://x.com/Geosophyy/status/2115404526002041035).
- Stars, constellations, Milky Way outline: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause; licence in `public/sky/`), from Hipparcos and the IAU figures.
- Milky Way and Moon maps: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0). Earth: NASA Blue Marble (public domain). See `public/textures/CREDITS.md`.
- Ephemerides: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT). 3D: [three.js](https://threejs.org) (MIT).
