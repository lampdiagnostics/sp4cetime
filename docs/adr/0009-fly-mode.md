# ADR-0009: Fly mode

Status: accepted (v0.10)

## Context

The calendar shows paths through time; bodies are markers that stay the same size when you zoom. People want to float in space and look at the planets close up: Earth and the Moon from geostationary orbit, with the Moon's real phase and real sunlight.

## Decision

A separate **Fly mode**, entered from the calendar, rendered in 3D.

- **Three.js** (one new dependency) for WebGL. Writing a WebGL renderer by hand would be more code to get right than the whole calendar. It is loaded only when Fly mode opens (a lazy chunk with its own 200 KB gzip budget), so the calendar stays as light and fast as before.
- **True sizes, distances and lighting.** Units are kilometres. One point light at the Sun, no fake fill light beyond a faint ambient, so the night side is dark and phases are real.
- **Positions and orientation:** astronomy-engine (VSOP87 / lunar theory) within ±3000 years, IAU rotation models for poles and spin; outside that, the Keplerian model and the mean Moon, as in the calendar's accuracy tiers.
- **Floating origin and a logarithmic depth buffer.** Positions are computed in double precision relative to the camera, then handed to the GPU, so a few-metre precision holds next to Earth while Neptune is 4.5 billion km away.
- **The camera rides with a body** (inertial, or turning with it — at Earth that is geostationary), so time can run fast without leaving you behind. The anchor switches to whichever body you fly close to.
- **Honest looks:** plain colours with latitude/longitude graticules, no invented surface textures. Public-domain NASA maps can be added later as an opt-in.
- Time in Fly mode runs live by default, with Pause and faster rates, and starts at the calendar's present moment.

## Consequences

- One more dependency (three, MIT) and a second rendering path to maintain. Core maths (`src/core/bodies.ts`, `src/fly/flight.ts`) is pure and tested in Node.
- Requires WebGL; without it Fly mode says so and the calendar still works.

## Update (v0.11): the calendar's overlays in 3D

Spirals, orbits, the Sun's line and both grids are drawn in Fly mode at true scale (`src/core/paths3d.ts`). A moment τ away sits 230 km/s × τ along the Sun's line of travel, so each body's path is a helix. Paths are sampled from the Keplerian model (cheap enough to rebuild every frame) and shifted to pass exactly through each body's true position now, with samples packed quadratically around the present so the line never visibly misses the body. Everything is rebuilt each frame relative to the camera in double precision. Fly mode opens on the calendar's own view: the Sun centred, the future to the right.
