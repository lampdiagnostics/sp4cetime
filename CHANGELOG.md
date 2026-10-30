# Changelog

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
