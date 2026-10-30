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
- **Honest looks:** plain colours with latitude/longitude graticules, no invented surface textures. (v0.14: Earth and the Moon now use real NASA-based maps; other bodies stay plain.)
- Time in Fly mode runs live by default, with Pause and faster rates, and starts at the calendar's present moment.

## Consequences

- One more dependency (three, MIT) and a second rendering path to maintain. Core maths (`src/core/bodies.ts`, `src/fly/flight.ts`) is pure and tested in Node.
- Requires WebGL; without it Fly mode says so and the calendar still works.

## Update (v0.11): the calendar's overlays in 3D

Spirals, orbits, the Sun's line and both grids are drawn in Fly mode at true scale (`src/core/paths3d.ts`). A moment τ away sits 230 km/s × τ along the Sun's line of travel, so each body's path is a helix. Paths are sampled from the Keplerian model (cheap enough to rebuild every frame) and shifted to pass exactly through each body's true position now, with samples packed quadratically around the present so the line never visibly misses the body. Everything is rebuilt each frame relative to the camera in double precision. Fly mode opens on the calendar's own view: the Sun centred, the future to the right.

## Update (v0.13): the real sky

The background is the real sky on a sphere at infinity centred on the viewer (no parallax: at these distances stars do not visibly shift). Data from d3-celestial (BSD-3-Clause, Olaf Frohn): Hipparcos stars to magnitude 6 with B−V colours, the 88 IAU constellation figures, and the Milky Way outline, converted by `scripts/build_sky.py` into `public/sky/` (about 60 KB gzipped plus a 38 KB brightness map) and fetched only when Fly mode opens, outside the JS budget. Coordinates are equatorial J2000, turned into the ecliptic frame by the obliquity. The zodiac is drawn in the ecliptic frame: the tropical signs start at the J2000 equinox. The sky is drawn first in the opaque pass with depth testing off, so every body covers it. Constellation lines are straight chords on the sphere, which from its centre are exactly the great circles between the stars.

## Update (v0.14): photographic Milky Way, galactic marks, surfaces

- The Milky Way is a photographic all-sky map (Solar System Scope, CC BY 4.0) in galactic coordinates, with point stars filtered out and its faint range stretched, blended with the d3-celestial outline (`scripts/build_textures.py`). It is looked up per pixel from the view direction, so there is no seam. The sky sphere is drawn small (1,000 km) with depth testing off: its size is irrelevant to what you see and a small radius keeps GPU interpolation exact (a 10¹² km sphere showed faceting).
- Galactic marks: the galactic equator and l = 0°, 90°, 180°, 270°.
- Earth (NASA Blue Marble, public domain) and the Moon (Solar System Scope, CC BY 4.0) are textured at 2048 × 1024 and 1024 × 512. Texture longitude −180° falls on each body's −x axis, so longitude 0 is the prime meridian of its IAU rotation model; a hover over central Australia reads about 25° S, 135° E.

## Update (v0.16): the whole galaxy

A "Whole galaxy" destination (and a ◎ Galaxy button in the calendar) puts the camera 40 kpc above the north galactic pole. The galaxy is a schematic face-on model (`scripts/build_galaxy.py`: four 12° log-spiral arms placed at their distances along the Sun's azimuth, the Orion Spur, bar and bulge), 40 kpc across, centred on Sgr A* in the galactic plane, and labelled as a model. It fades in between 300 and 3,000 light years from the Sun while the sky seen from the Sun fades out. Two precision limits shaped it: the near clipping plane now scales with distance to the nearest body (capped at 1,000 km), because with a 10 m near plane a subject 10¹⁸ km away rounds onto the far plane and is clipped; and the galaxy is drawn shrunk toward the camera by the same factor in size and distance (identical on screen), because interpolating texture coordinates across 10¹⁸ km loses them. The far plane is 10²⁰ km.
