# ADR-0008: Simple paths — true spacing, fixed samples, shaded bands

Status: accepted · 2026-10-30 · replaces the widened coils of ADR-0007 and the adaptive sampling of v0.5

## Context

Widened coils changed shape while zooming, and adaptive refinement changed its sample layout as you zoomed. Both read as glitches.

## Decision

- **True spacing only.** One turn per orbital period at every zoom; no widening.
- **Fixed samples.** Sample k sits at mean anomaly 2πk/N with N a power of two (64–4096), chosen so steps stay under ~2 px of time and ~4 px around the orbit. One turn of points is computed per frame and reused for every turn. Moving between zoom levels only adds or removes in-between points.
- **Shaded band when dense.** Between 24 and 8 px per turn the coil fades out and a band fades in. The band is a vertical gradient whose brightness follows the time-weighted density of the planet's height above the Sun line, so it reads as a shaded tube, brightest where the planet lingers. Below 8 px per turn only the band is drawn. The screen says so.
- **Orbits** (the circles around the Sun) have their own toggle beside **Spirals**.
- **The Sun can be grabbed** and moved anywhere. Sideways it looks ahead or back in time (as dragging always has); up and down it moves its line. The time grid, space grid and guide lines stay centred on it. Reset view brings it back.

## Consequences

- Consecutive frames with no input differ only in the breathing glow of the burning tips (measured).
- Simpler code: no refinement, no exaggeration bookkeeping.
