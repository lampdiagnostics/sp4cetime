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

## Update (v0.7)

- **Edge to edge.** Path ranges are no longer clipped to the screen before adding each orbit's sideways reach, and a segment is dropped only when it lies wholly off one side of the screen, never when it crosses it. Sample counts per turn are no longer capped (large turns are evaluated directly, a few thousand points at most), so paths never thin out or vanish when zoomed in.
- **No viewing cursor.** The centre line and hollow markers shown when looking ahead or back are gone.
- **Rotation both ways.** Dragging empty space rotates: up/down rolls about the line of travel, sideways turns it (yaw, ±75°). A turn foreshortens the line of travel by cos(yaw), and the time axis with it, so the picture stays a true projection. Grabbing the Sun moves it anywhere; grabbing its line slides through time. Shift + arrow keys turn; arrow keys move through time.
- **Centred on a planet**, the grids are centred on that planet's present, as they are on the Sun's otherwise.

## Update (v0.8)

- **One view change at a time.** A wheel or trackpad gesture picks its action from its first event (pinch or vertical = zoom, horizontal = time, Option = space zoom, Shift = turn or roll) and keeps it until the wheel has been still for 220 ms. A rotation drag locks to turning or rolling after 6 px. Wheel input is ignored while a drag is in progress.
- **Zoom holds the Sun.** Every zoom (wheel, pinch, keys, presets) is anchored at the Sun's position on screen, so zooming can never carry it away.

## Consequences

- Consecutive frames with no input differ only in the breathing glow of the burning tips (measured).
- Simpler code: no refinement, no exaggeration bookkeeping.
