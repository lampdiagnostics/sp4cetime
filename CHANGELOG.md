# Changelog

## 0.3.0 — 2026-10-30

Stable spirals, burning fuses, two grids.

- Spirals for every chosen body run into past and future at every zoom. Samples are anchored to fixed points on each orbit, so coils no longer shimmer or change thickness. Very dense coils are drawn at a readable minimum width, labelled on screen. Spirals can be switched off.
- The Sun, planets and Moon burn like fuses: a bright tip with a glowing, fading trail along each path.
- Time grid and space grid are separate overlays, both on by default. The space grid is fixed in space, so in live mode it sweeps past the Sun exactly like the time grid; a legend gives its spacing (km, AU, light years).
- Opens live at the present moment; clock shown in GMT.
- 49 tests; clock labels now include the date when a view spans more than a day.

## 0.2.0 — 2026-10-30

Spatial model, live time, round window.

- All eight planets and Pluto from JPL Keplerian elements, checked against astronomy-engine (≤ 0.2°). Pick any set from the Planets menu; Moon, orbit rings and names are optional.
- Orbits drawn in their true 3D orientation relative to the Sun's galactic motion (orbital axis ~30° from the direction of travel). Drag up/down (or ↑/↓, or Shift+scroll) to turn the view around the line of travel; the time axis never moves.
- Wireframe orbit rings around the Sun at the centre time.
- Orbit scale modes: √ fit, linear, and true scale against distance travelled.
- Live mode: the present stays at the centre and the axis flows past at one second per second. Dragging sideways leaves live mode; Now returns to it.
- Grid lines now sit exactly on the axis ticks, with nested minor lines; the old random grid drift is gone.
- Ticks down to single seconds.
- Distance axis: distance the Sun travels from where it is now, in km, AU and light years.
- Round window with controls in the four corners (toggle to full screen). Zoom presets fit the window.
- 41 tests.

## 0.1.0 — 2026-10-30

First prototype (Phase 1 groundwork).

- Deep-time `Time` type: exact to the second across the Sun's whole life.
- Camera with camera-relative maths, zoom about the cursor, clamped to the Sun's lifetime.
- Adaptive ticks from minutes to billions of years, calendar-aligned.
- Central Sun line, Earth helix (front/back depth), Moon helix, level-of-detail band when orbits are too dense.
- Earth position and Moon phase from astronomy-engine within ±3,000 years; mean orbits and schematic tiers beyond, labelled on screen.
- Galactic background that turns once per galactic year (230 Myr) as you scrub.
- Moving background grid, paused automatically for `prefers-reduced-motion`, with a manual pause.
- Three data-driven themes: Scientific, Minimal Line Art, Synthwave Neon.
- Drag, wheel, pinch and keyboard controls; zoom presets; phone layout.
- 26 unit and property tests; CI workflow; Cloudflare static deploy config.
