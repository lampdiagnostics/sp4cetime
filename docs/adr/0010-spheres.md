# ADR-0010: Nested spheres and arc positions

Status: accepted (v0.12)

## Context

Distances in km and AU are hard to feel at these scales, and they hide the geometry: everything here is a body turning on, or travelling around, the centre of something else. The owner asked for all positions to be expressed as arcs of circles (degrees, minutes, seconds) measured from the centre of interacting spheres, with north up.

## Decision

- **Spheres, nested.** The galaxy sphere is centred on Sagittarius A* (8.178 kpc from the Sun, GRAVITY 2019; published 8.0–8.3 kpc), with the IAU galactic axes. The Sun's sphere is centred on the Sun, with the ecliptic axes. Each planet's and the Moon's sphere is centred on the body and turns with it (IAU rotation models), so longitude and latitude are geographic.
- **Every point has x, y, z and an arc position** on any sphere: longitude and latitude in degrees, minutes and seconds seen from that sphere's centre, and distance in that sphere's radii (`src/core/spheres.ts`). Internally positions stay in km, in double precision; arcs are derived, never stored.
- **Perfect spheres, with variation recorded.** Each sphere is perfect; how the real body differs (flattening, IAU 2015) is data in `bodies.ts` and shown alongside, not drawn.
- **The space grid is arc of the Sun's galactic circle.** Lines are spaced in seconds, minutes and degrees of arc around Sgr A* and labelled with the Sun's galactic longitude seen from Sgr A*. 1° of that circle is about 607,000 years of travel at 230 km/s. The calendar's "distance from the Sun" read-out uses the same arcs.
- **Apparent sizes, not distances, on labels.** A body's label gives the angle it fills from where you are.
- **Default views: in front of the body, north up, the Sun in view.** The camera stays in the body's equatorial plane (so the geostationary view is truly geostationary), the body left of centre and the Sun right, as far apart as the window allows. Saturn's view is raised 18° so the rings show.

## Consequences

- The Sun's path is still modelled as straight over the spans shown; arcs along it are distance ÷ 8.178 kpc, exact for a circular galactic orbit.
- With the Sun in view, bodies are seen partly from their night side: phases are true, so a planet may be a crescent.
- Arc positions with many decimals are only as good as the model behind them; the accuracy tiers (ADR-0005) still apply.
