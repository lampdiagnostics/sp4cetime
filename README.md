# sp4cetime · Galactic Calendar

**Map any timeline on the path the solar system is already traveling.**

sp4cetime is a zoomable map of time drawn as the real motion of the solar system. The Sun is always *now*, travelling at 230 km/s along its path around the galaxy; the planets and the Moon wind around that path as spirals, in their true orientation, from the Sun's birth (−4.6 billion years) to the end of its main-sequence life (+5 billion years). Time and distance grids flow past the Sun as the present moves. A 3D **Fly mode** puts you inside the solar system at true scale and in real sunlight, under the real sky, and out to the whole Milky Way, its central black hole and its neighbour galaxies.

Version 0.3.0 (public beta) · 1 November 2026 · solo, part-time project (Lamp Diagnostics) with AI help.
Live at [sp4cetime.org](https://sp4cetime.org) once deployed. (Versions carry a leading zero until the public launch, which will be 1.0.)

## Where it is going

The direction, in order (detail in [docs/PLAN.md](docs/PLAN.md) and [DECISIONS.md](DECISIONS.md)):

1. **A truthful instrument first.** Real positions where they are known, honest labels where they are modelled, nothing invented. Every measure is an arc on a sphere (degrees, minutes, seconds), every view is north-up with the Sun in sight. One scale only: true.
2. **Stories (the Library).** Events placed on the timeline, gathered into stories that play as guided flights. Paths (guided flights through chosen views) come first, in 0.3.0. One file format (`.sp4ce.json`) for downloads, share links and curated Library entries.
3. **Sharing.** Read-only links and embeds; local-first storage, no accounts until people ask for sync. Screenshots, GIFs and videos already work (0.2.0), watermarked "@sp4cetime.org".
4. **Pro tier**, before any marketplace: sells output, polish and privacy (story videos, posters, private links, unbranded embeds, extra themes), never a truer picture. Free users always see the same science.
5. Year two, only if wanted: theme editor, accounts and sync, education licence, creator marketplace.
6. **Four modes** (the 4 in sp4cetime): Galactic (built), then Planetary (detailed Earth, Moon and Mars from public geodata; imaginary planets), Cellular and Atomic, all on one model of spheres and skins. To-do lists: [docs/ROADMAP.md](docs/ROADMAP.md); the spheres: [docs/SPHERES.md](docs/SPHERES.md).

What exists today (0.3.0) is the instrument (the calendar, Fly mode, the sky, the galaxy, and capture) and paths: presentations flown through it. It is a toy as much as a tool; the owner's next step is to show it publicly. Stories, sharing links and Pro are not built yet.

## 0.3.0: paths through time and space

A **path** is a presentation, Prezi-style: a sequence of chosen views of the map, and the viewer flies from one to the next.

**Making a path** (not in Presentation mode). Go to a place in the map and press **Return**. A dialog asks: *Start a path? Name it.* Confirm, and what is on screen becomes **START**. Travel to a different time, place and view and press Return again: the same dialog asks you to confirm the current view as **POINT 1**, with an optional caption and a choice to **stop making the path after this point**. Go on for POINT 2, 3 …; the point you stop at is **END**. (In the dialog, Return confirms and Esc cancels.)

**A point is exactly what is on screen** when Return is pressed, in any view: calendar, Fly or galaxy; the moment and the time zoom; the camera (position, direction, size, field of view); the theme; round or full window; which planets and elements are shown; whether the boxes and labels are showing (the space-bar state); whether time is running or paused, and at what speed and direction. Arriving at the point puts all of that back.

**Presenting.** A **Present** button, built into the Capture button (bottom centre; presentations are one of the things people will capture), starts and stops Presentation mode, with a drop-down of saved paths to choose from. In Presentation mode the viewer *flies* between points; nothing disappears at one point and reappears at the next. **Return** or **→** goes on to the next point; **←** goes back to the previous one. After arriving, the viewer is free to look around, move and zoom; then Return or either arrow **only flies them back to that point**, and the next press continues along the path. Each point of a loaded path has a point box describing its view, position, time and view angle, and showing its caption.

**Transitions.** Every change between points is shaped to be as beautiful as it can be, not just interpolated: calendar ↔ Fly ↔ galaxy, Dark ↔ Bright ↔ Colour, round ↔ full, boxes and labels appearing and going. Time and distance change by equal factors in equal steps (as the warp does), so a jump of a billion years or of 40 kpc reads as clearly as a day or a few km; directions turn with easing. Each kind of transition is designed and checked by eye in screenshots and Capture videos. With reduced motion, short cross-fades.

**Storage.** Paths are files: light `.sp4ce.json` (version 2: a name and a list of points with their view, moment, place and mode; numbers rounded; the look only where it differs). People download theirs and upload them again to present or continue them; no accounts. The browser keeps a copy (IndexedDB) so the list survives a reload; example paths ship in `public/paths/` (listed in `index.json`). Cloud storage and sync could be Premium later.

**Code.** `src/core/path.ts` (schema, `.sp4ce.json` validation, the time-flight curve, with property tests across ±5 Gyr), `src/app/flights.ts` (flying between points), `src/app/pathStore.ts` (IndexedDB, export, import), `PathDialog.tsx`, and the wiring in `App.tsx`, `Pane.tsx`, `GalacticCanvas.tsx` and `FlyView.tsx`. The design and its reasons: [ADR-0017](docs/adr/0017-paths.md).

**Status:** built (all seven steps), checked in headless Chromium in the calendar, Fly and the galaxy; waiting for the owner to try it on the Mac before tagging `v0.3.0`.

## Next goal: the public beta, with 0.3.0

0.3.0 (paths, smooth recording, the beta basics) lives on the owner's Mac (git, no remote yet). Going live means putting it on GitHub and on sp4cetime.org. An AI assistant can do most of this through the Claude app's built-in browser and a GitHub connection; the owner approves anything that publishes, changes an account or touches DNS, and passwords and tokens are always typed by the owner.

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
3. **Check the live site** on a laptop, a phone and a tablet, in Safari, Chrome and Firefox: calendar, Fly mode (WebGL), sky, galaxy, the three themes, round and full window, keyboard controls, reduced motion, and **capture** (screenshot, GIF, video).
4. **Beta basics** (done in 0.3.0):
   - [x] "? How to" has the instructions, every credit, and *About this beta*: what it is, the accuracy tiers, privacy (no accounts, no cookies, no tracking; settings and paths stay in the browser), and feedback to **hello@sp4cetime.org**.
   - [x] The accuracy tier is shown again in the top-left box (Ephemeris, Modelled or Schematic, for the moment in the middle of the view).
   - [x] Link preview: Open Graph and X card tags with `public/og.png` (1200 × 630).
   - [x] "Beta" in the title box and the page title; `robots.txt`; `_headers` (long caching for built files, basic security headers); no source maps on the public site.
   - [ ] **Email**: set up `hello@sp4cetime.org` with Cloudflare Email Routing (free; forwards to the owner's inbox) once the domain is on Cloudflare.
   - Phones: one full-screen view; touch flying (a thumb stick, gyroscope looking) is not built yet.
   - Later, optional: Plausible for page counts and Sentry for error reports (both noted in the plan); the privacy note must change if they are added.
5. **Label it "Beta"** in the corner and in the page title (done).
6. **Tag the release** `v0.3.0` (its CHANGELOG entry is written).
7. **Announce** to a small group first (teachers, science communicators, @Geosophyy and @techartist_ whose work inspired it), with a short screen recording made with Capture, then more widely.

## Then (0.4.0): "Stand here", the sky over a place (signs and houses)

The first piece of *Sky on your day* (DECISIONS §1), and the first example of **Planetary mode**: a person standing on a planet is a sphere on that planet's surface skin (docs/SPHERES.md), as a cell will be a sphere in Cellular mode and an atom in Atomic mode. Built into the instrument as an honest view of the real sky over a place, with astrology's houses as a clearly labelled overlay.

**Sign and house, in one line each.** A planet's **sign** is where it sits along the zodiac (its ecliptic longitude seen from Earth's centre): the same for everyone on Earth at that moment. Its **house** is where it sits relative to *one person's horizon* at *one place and time*: the horizon and the meridian of that spot divide the sky into 12 sectors, which sweep the whole sky once a day as Earth turns. So signs need only a date; houses need a date, an exact time and a place.

**The geometry.** At latitude φ and longitude L, with local sidereal time θ = Greenwich sidereal time + L and obliquity ε = 23.44°:
- **Ascendant** (cusp of house 1): where the eastern horizon cuts the ecliptic: λ = atan2(cos θ, −(sin θ cos ε + tan φ sin ε)). **Descendant** (house 7) opposite.
- **Midheaven, MC** (cusp of house 10): where the meridian cuts the ecliptic overhead: λ = atan2(sin θ, cos θ cos ε). **IC** (house 4) opposite.
- **House systems**: Whole Sign (house 1 is the sign holding the Ascendant) and Equal (cusps every 30° from the Ascendant) first; Placidus (trisecting the times points take to rise and culminate) later. Placidus is undefined inside the polar circles; there the view says so.
- Height above the ground does not change the houses (they follow the vertical through the spot beneath you); planets are taken from Earth's centre (the Moon's position shifts up to ~1° by place, shown as a note).
- In the spheres model (docs/SPHERES.md) a place's horizon is a frame on Earth's surface skin: its latitude and longitude give the zenith, and the skin's spin turns it once a sidereal day.

**The design (owner, 1 November 2026):**
1. **Signs, from above**: as now: stand over the planet and look around; each body's name says the sign it is in, seen from where you are.
2. **Houses, from a dialog**: a dialog asks for
   - **a place on Earth's surface**: latitude and longitude in degrees, minutes, seconds and fractions of a second (a place known less precisely, a town or a country, is taken at its middle point; the dialog says so);
   - **a time frame**: a single moment (time stopped there), or a range, e.g. the hour around a birth, in which the sky moves as it did in that hour, playing live or sped up, and looping.
3. **On the ground** at that place: the horizon as a ring, the meridian, the ecliptic with the signs, the 12 houses as tinted wedges on the sky; each body's label reads e.g. "Mars · 14° Leo · house 10". Over the time frame the houses wheel across the sky.
4. **Transparent planet**: a toggle makes the planet under you see-through, so all 12 houses and every planet, the Sun and the Moon can be seen from where you stand, including those below the horizon.
5. **From outside** (optional view): Earth with the horizon as a disc tangent at the place, the house planes fanning from it like orange segments, and a line from Earth to each body crossing them.
6. **The birthday product**: two videos, made with Capture and paths: one from above the planet showing the **signs**, one from ground level showing the **houses**, over the chosen time frame. (Later, the flat chart wheel as a poster.)
7. **Honest labels**: positions are astronomy (real sky, ephemeris tier); signs are tropical (from the equinox) and sit ≈24° from the constellations of the same name; houses and their meanings are astrology, labelled as such. Interpretations and horoscope links belong to the separate *Sky on your day* product, not the instrument.
8. **Maths in `src/core/houses.ts`** with property tests (Ascendant and MC against published examples; cusps in order; houses sweep 360° in a sidereal day): Whole Sign and Equal first, Placidus later (undefined inside the polar circles; the view says so). Our own code, no Swiss Ephemeris (AGPL unless licensed).
9. **Points remember it**: a path's point stores the place, the time frame and the house system (CLAUDE.md rule 16), so a path can fly to "your sky on the day you were born".
10. **The skin carries it**: in the spheres model, every attribute of a sphere (a place, its houses, a person's data) is coded in a skin (docs/SPHERES.md).

### A live link (screen saver)

`sp4cetime.org/?live` opens one view with no boxes and time running (or loops a path), so the site is also a screen saver and a live wallpaper (docs/ROADMAP.md, "Screen saver").

Decide at the beta whether the repository becomes public (add a `LICENSE`, e.g. MIT; the data in `public/` keeps its own licences). After 0.4.0: the spheres model (0.5), then events and stories, the rest of the Library; see [docs/ROADMAP.md](docs/ROADMAP.md).

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

**Paths** (presentations). Go anywhere and press **Return**: name the path, and what is on screen becomes START. Travel (in time, in space, into another view, another look) and press Return for POINT 1, 2 …, with a caption if you like; tick "Stop making the path after this point" for END (or press Finish beside Capture). **◉ Capture · ▷ Present** lists your paths: Present flies from point to point, never cutting; **Return** or **→** next, **←** back, **Esc** stops. Look around at a point and the next press first flies you back to it. Each point's box shows its caption, view, moment, place and direction. Record a presentation with V. Paths are small `.sp4ce.json` files: **⤓ Download** yours to keep them, **⤒ Upload** one to present it or **✎ Continue** adding points (no account needed; this browser also keeps a copy). The app comes with an example, *A first tour*.

## Layout

```
src/core/     Pure TypeScript: time, camera, ticks, orbits, spheres, sky maths, calendar renderer.
src/app/      React UI: App (the page), Pane (the window and its boxes), capture, GIF encoder, menus.
src/fly/      Fly mode and the galaxy (Three.js), loaded only when opened.
content/      Themes as validated JSON.
public/       Sky data, Milky Way, galaxy, Earth and Moon maps (with credits).
scripts/      Python scripts that rebuild public/ data from their sources.
docs/         ROADMAP.md (to-do lists, the four modes), SPHERES.md (the spheres model), PLAN.md, adr/, archive/, reference/.
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
