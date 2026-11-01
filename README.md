# sp4cetime · Galactic Calendar

**Map any timeline on the path the solar system is already traveling.**

sp4cetime is a zoomable map of time drawn as the real motion of the solar system. The Sun is always *now*, travelling at 230 km/s along its path around the galaxy; the planets and the Moon wind around that path as spirals, in their true orientation, from the Sun's birth (−4.6 billion years) to the end of its main-sequence life (+5 billion years). Time and distance grids flow past the Sun as the present moves. A 3D **Fly mode** puts you inside the solar system at true scale and in real sunlight, under the real sky, and out to the whole Milky Way, its central black hole and its neighbour galaxies.

Version 0.2.0 · 31 October 2026 · solo, part-time project (Lamp Diagnostics) with AI help.
Live at [sp4cetime.org](https://sp4cetime.org) once deployed. (Versions were renumbered with a leading zero: the release tagged `v1.0` is 0.1.0; this is 0.2.0. The public launch will be 1.0.)

## Where it is going

The direction, in order (detail in [docs/PLAN.md](docs/PLAN.md) and [DECISIONS.md](DECISIONS.md)):

1. **A truthful instrument first.** Real positions where they are known, honest labels where they are modelled, nothing invented. Every measure is an arc on a sphere (degrees, minutes, seconds), every view is north-up with the Sun in sight. One scale only: true.
2. **Stories (the Library).** Events placed on the timeline, gathered into stories that play as guided flights. One file format (`.sp4ce.json`) for downloads, share links and curated Library entries.
3. **Sharing.** Read-only links and embeds; local-first storage, no accounts until people ask for sync. Screenshots, GIFs and videos already work (0.2.0), watermarked "@sp4cetime.org".
4. **Pro tier**, before any marketplace: sells output, polish and privacy (story videos, posters, private links, unbranded embeds, extra themes), never a truer picture. Free users always see the same science.
5. Year two, only if wanted: theme editor, accounts and sync, education licence, creator marketplace.

What exists today (0.2.0) is the instrument: the calendar, Fly mode, the sky, the galaxy, and capture. It is a toy as much as a tool; the owner's next step is to show it publicly. Stories, sharing links and Pro are not built yet.

## Next goal (0.3.0): release to GitHub, then a public beta

0.2.0 lives only on the owner's Mac (git, tagged `v0.2.0`, no remote yet). 0.3.0 puts it on GitHub and live on sp4cetime.org as a public beta. An AI assistant can do most of this through the Claude app's built-in browser and a GitHub connection; the owner approves anything that publishes, changes an account or touches DNS, and passwords and tokens are always typed by the owner.

### Part 1: release to GitHub

1. **Sign in.** The owner signs in to GitHub and Cloudflare in the Claude app's built-in browser.
2. **Create the repository.** On github.com: New repository, name `sp4cetime`, **Private** (the business plan is in `docs/PLAN.md` and `DECISIONS.md`; there is no licence yet). Don't add a README, .gitignore or licence; the folder has them.
3. **Push the code and the tags.** Either:
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

What goes up: everything git tracks. `.gitignore` keeps out `node_modules/`, `dist/`, `.env` files, logs and `.DS_Store`.

### Part 2: public beta on sp4cetime.org

1. **Cloudflare project.** Cloudflare → Workers & Pages → Create → connect the `sp4cetime` GitHub repository (the owner approves GitHub's permission screen). Build command `npm run build`, output directory `dist`, Node 22. Every push to `main` then deploys; every pull request gets a preview URL.
2. **Domain.** Add `sp4cetime.org` as the project's custom domain (move the domain's DNS to Cloudflare if it isn't there). Redirect `sp4cetime.com`, `.io` and `.ai` to `.org`.
3. **Check the live site** on a laptop, a phone and a tablet, in Safari, Chrome and Firefox: calendar, Fly mode (WebGL), sky, galaxy, the three themes, round and full window, keyboard controls, reduced motion, and **capture** (screenshot, GIF, video: the view must appear in each, not only the boxes; see DECISIONS §6).
4. **Beta basics before announcing:**
   - The "? How to" pop-up already has instructions and every credit; add a short About (what it is, the accuracy tiers).
   - A privacy note: no accounts, no tracking beyond privacy-friendly page counts, settings stay in the browser.
   - A way to send feedback (an email address or a form).
   - A link preview: Open Graph / X card tags with a striking image (a strobe or retrograde screenshot).
   - Phones: one full-screen view already; touch flying (a thumb stick, gyroscope looking) is not built yet.
   - Optional: Plausible for page counts and Sentry for error reports (both noted in the plan).
5. **Label it "Beta"** in the corner and in the page title.
6. **Tag the release** `v0.3.0` and write its CHANGELOG entry.
7. **Announce** to a small group first (teachers, science communicators, @Geosophyy and @techartist_ whose work inspired it), with a short screen recording made with Capture, then more widely.

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

**One window, three views, one set of controls.** The calendar opens first, in a round window (▭ Full for the whole screen; phones are always full screen). ✦ Fly and ◎ Galaxy (top right) take you into 3D, and so does clicking the name of the Sun, a planet or the Moon, which flies you to just above it. In Fly mode, back away past 1,000 AU to warp out to the whole galaxy; zoom in on it, fly at the Sun or click it to warp back. The same boxes sit in the same corners in every view:

- **Top left**: the title, date and GMT time; in Fly and the galaxy also your position on a sphere you choose (nearest body, the Sun, or the galaxy around Sgr A*): latitude and longitude in °′″, distance in its radii, x y z, cruise speed.
- **Top right**: ● Now / Back to now, the theme (Dark, Bright, Colour), Calendar · ✦ Fly · ◎ Galaxy, ◯ Round / ▭ Full.
- **Bottom left**: SPACE (Go to: Solar system, Geostationary orbit, Low Earth orbit, Earth & Moon, Moon, Mars, Jupiter, Saturn, Sun, Whole galaxy); VIEW (Planets, Centre: Sun or Earth); ELEMENTS (Spirals, Strobe, Orbits, Time grid, Space grid, Constellations, Zodiac, Galaxy marks).
- **Bottom right**: TIME (zoom: Minute, Hour, Day, Week, Month, Year, Decade, Century, Galactic year, Sun's life); SPEED: **▶ Play · speed and direction (Live, or ◀/▶ a minute … a century each second) · ❚❚ Pause** (choosing a speed holds time still until ▶ Play); the space grid's **scale bar** (two of its brown dashed lines and the km between them); **? How to** (instructions and credits).
- **Bottom centre** (always on screen, never in a capture): the eye (also the space bar: hide the boxes, then all labels, then bring them back) and **◉ Capture**.

**Calendar** (the default view), with the real sky behind it, turned so the Sun's current sign is behind the Sun.

- Drag empty space to rotate the solar system (up/down rolls, sideways turns). The sky turns with it.
- Grab the Sun to move it anywhere; slide along its line to move through time (also ←/→ or horizontal scroll). **N** returns to now.
- Scroll or pinch (or [ and ]) make the solar system larger or smaller; Shift + scroll or pinch (or +/−) zoom time, from about a minute to the Sun's whole life. Each gesture does one thing; zooming holds the Sun in place. Orbits are in their true proportions and orientation.
- **Centre: Earth** makes it geocentric: Earth's path is the straight line, the Sun coils around it, and the planets loop back (retrograde).
- **Strobe** (Elements): the whole solar system's pose freezes behind the present so many times a year (1–24): whole numbers draw still polygons, in-between numbers turn lap by lap. Click a frozen pose to go back to that moment.
- The Moon's and the Sun's signs are marked on the sky ("☾ Moon in ♋︎ Cancer").

**Fly** (✦ Fly, or click a name). You are in the solar system, in 3D, at true scale.

- Click the view to steer with the mouse, as in Minecraft (Esc lets go). **W** flies toward whatever is in the middle of the view, S backs away, A/D slide sideways, Space up, Shift down (R/F too), Ctrl five times faster. Speed is half your height above the nearest body each second.
- Drag or scroll to look around where you stand; pinch to widen or narrow the view; Shift + scroll or pinch zooms time (the units of the time and space grids, a ruler along the Sun's line).
- Click a name to fly there: you turn to face it, close in, and arrive just above its north pole. Names give apparent size and, with Zodiac on, the sign the body is in seen from where you are. Distant bodies get a dot in their path's colour. Labels never show through a body in front of them.
- Every spiral runs out to the vanishing point.

**Whole galaxy** (◎ Galaxy). Past 1,000 AU from the Sun you warp out, past light speed, until the whole Milky Way (a labelled model made of stars, 3D, with a dust lane, the bar and the Fermi bubbles) lies in front of you. The Sun's path is highlighted from any angle, with its whole life (≈42 overlapping turns, bobbing through the disc and swinging in and out) and a light-year ruler. Sgr A* (the black hole) and the Local Group neighbours (Andromeda, Triangulum, the Magellanic Clouds, M32, M110) are labelled; click one to fly there.

**Capture** (◉ Capture, bottom centre, straight to Downloads): **P** a screenshot (PNG at screen resolution), **G** a 5-second GIF (time plays while it records, then pauses), **V** a video (MP4 where the browser can, else WebM; until V again or a click on its running time). What is on screen is recorded, the boxes too if they are showing; the Capture button never is. Watermark "@sp4cetime.org" unless turned off. For screen savers: set a view and a speed, hide the boxes with the space bar, ▶ Play, then V.

## Layout

```
src/core/     Pure TypeScript: time, camera, ticks, orbits, spheres, sky maths, calendar renderer.
src/app/      React UI: App (the page), Pane (the window and its boxes), capture, GIF encoder, menus.
src/fly/      Fly mode and the galaxy (Three.js), loaded only when opened.
content/      Themes as validated JSON.
public/       Sky data, Milky Way, galaxy, Earth and Moon maps (with credits).
scripts/      Python scripts that rebuild public/ data from their sources.
docs/         PLAN.md (critique and 12-month plan), adr/ (one file per decision), archive/, reference/.
```

- [CLAUDE.md](CLAUDE.md): rules and context for anyone (human or AI) changing the code, and how to start a new chat. [AGENTS.md](AGENTS.md) points other tools to it.
- [DECISIONS.md](DECISIONS.md): every decision with its reason, and the owner's stated preferences.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.

## Accuracy

Shown on screen in three tiers: **Ephemeris** within ±3,000 years (astronomy-engine for planets, Moon, rotation; JPL Keplerian elements in the calendar), **Modelled** within ±10,000 years (mean orbits), **Schematic** beyond (shapes and orientation right, phase illustrative). The Sun's galactic path is straight in the calendar and Fly mode; the whole-galaxy view (with the Sun's whole-life orbit) is a model. Zodiac signs are tropical, measured from the J2000 equinox (≈0.4° off today's). See [ADR-0005](docs/adr/0005-accuracy-tiers.md).

## Deploy (Cloudflare)

Static files only. Cloudflare → Workers & Pages → connect the GitHub repo; build command `npm run build`, output `dist`. Or `npm run build && npx wrangler deploy` (uses `wrangler.jsonc`). Add `sp4cetime.org` as the custom domain and redirect the `.com`, `.io` and `.ai` domains to it.

## Credits

Also in the app, under ? How to.

- Inspired by the galactic-motion visualization shared by [@Geosophyy](https://x.com/Geosophyy/status/2115404526002041035).
- The strobe (frozen poses): Techartist's dancer worldline, [@techartist_](https://x.com/techartist_/status/2114819625242529992).
- Other inspirations: NASA's Fermi bubbles (Fermi Gamma-ray Space Telescope), Google Earth's zoom into Street View (the warp), Minecraft's creative-mode flying.
- Stars, constellations, Milky Way outline: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause; licence in `public/sky/`), from Hipparcos and the IAU figures.
- Milky Way and Moon maps: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0). Earth: NASA Blue Marble (public domain). See `public/textures/CREDITS.md`.
- Ephemerides: [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT); JPL approximate Keplerian elements. 3D: [three.js](https://threejs.org) (MIT).
