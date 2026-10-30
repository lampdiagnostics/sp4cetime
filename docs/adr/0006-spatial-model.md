# ADR-0006: Spatial model — real orbits in their true orientation

Status: accepted · 2026-10-30

## Context

The helix should be geometrically honest (wireframe, real orbital elements, real tilt) while zooming stays instant. Drawing must cost the same at any zoom or date.

## Decision

**Orbits.** Mercury–Neptune and Pluto from JPL's Keplerian elements for approximate positions (Standish, Table 1, J2000 ecliptic; Earth = Earth–Moon barycentre). Tested against astronomy-engine for 1800–2050: worst error 0.01° (inner planets) to 0.2° (Saturn, whose perturbations by Jupiter the simple elements omit). Beyond ±3,000 years the slow rates are frozen and only the mean longitude advances (schematic tier, labelled on screen). Kepler's equation is solved by Newton's method (≤ 5 steps for e < 0.3).

**Orientation.** Orbit positions are rotated ecliptic → equatorial → galactic (Hipparcos matrix) → the travel frame, whose X axis is the Sun's direction of galactic rotation (l = 90°, b = 0°), Y the north galactic pole, Z toward the galactic centre. The orbital plane's axis then sits ~30° from the direction of travel (the plane ~60° to it), which is why the paths corkscrew. The Moon is drawn in the ecliptic plane (its 5° tilt is omitted).

**Projection.** Screen x = time position + the orbit's X offset; screen y = −Y offset; Z decides front/back. The only view rotation allowed is a roll about the line of travel (vertical drag, ↑/↓). Rolling never moves anything along X, so ticks, zoom and panning stay exact. The default roll shows the orbits most open.

**Scale.** Three modes: *√ fit* (shapes and orientation true, sizes √-compressed to fit the window), *linear* (true proportions, enlarged), *true* (orbit size against distance travelled at 230 km/s; 1 AU = 7.5 days of travel, so it changes with zoom). The mode is always named on screen.

**Cost.** Elements are evaluated once per frame at the camera centre; samples advance by mean motion over camera-relative dt. Each helix is sampled at most every pixel (½ px when the Moon needs it) and becomes a band once an orbit is narrower than 4 px. Nine bodies plus the Moon held a 16.7 ms median frame while zooming in headless software rendering.

## Consequences

- Geometry is testable without a browser (`geometry.test.ts`).
- The galactic "direction of travel" uses circular rotation only; the Sun's ~20 km/s peculiar motion and its bobbing through the galactic plane are not yet modelled.
- Adding a body is one row of elements plus a theme colour.
