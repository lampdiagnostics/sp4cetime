# ADR-0014: The Sun's real orbit around the galaxy: bobbing and swinging

Status: accepted (0.2.0)

## Context

The Sun does not move in the galactic plane: it oscillates up and down through the disc as it orbits. The owner asked for that sine wave, at its real phase if known.

## Decision

Simple harmonic motion fitted to present measurements (`src/core/bob.ts`): height above the midplane now 20.8 ± 0.3 pc (Bennett & Bovy 2019, Gaia DR2, arXiv:1809.03507); vertical velocity +7.25 km/s, toward the north galactic pole (Schönrich, Binney & Dehnen 2010); period 85 Myr (estimates span ~60–90 Myr; 85 ± 4 Myr with a ~102 pc swing in arXiv:1009.4190). These give an amplitude of ±102 pc and a phase: the Sun crossed the midplane going up ~2.8 Myr ago and is highest (~102 pc north) in ~18.5 Myr. The epoch is J2000.

**Where it is shown: only the galaxy view.** In the calendar and Fly the bob would tilt every path by ~1.8° and is invisible as a wave at their scales; the owner judged it too complicated for the benefit, so they stay straight along the in-plane direction of rotation.

**The whole life, as a rosette.** In the galaxy view the Sun's path is drawn for its whole life, from its birth 4.6 Gyr ago to 5 Gyr ahead (~42 turns of ~230 Myr), as one thin faint line of overlapping loops (12,000 points), with the last 100 Myr highlighted and the next 50 Myr dashed. Besides the bob, the orbit swings in and out (`src/core/galacticOrbit.ts`, epicycle approximation, flat rotation curve so κ = √2·Ω): the Sun's motion relative to circular, 11.1 km/s toward the centre and 12.24 km/s faster than circular (Schönrich, Binney & Dehnen 2010), puts its guiding centre at 8.61 kpc and its radial swing at ±0.52 kpc (8.09–9.13 kpc), one in-and-out every ~163 Myr against ~230 Myr per turn, so the loops are non-concentric and never close. The disc, its stars and the bubbles are drawn with their midplane 20.8 pc below the Sun now (`discCentre`).

## Consequences

The model runs unchanged over 9.6 billion years, which no real orbit does: stars migrate in radius over billions of years in ways not known for the Sun, and the period of the bob is uncertain (60–90 Myr). It is labelled a model on screen. The calendar and Fly keep the circular, in-plane line of travel at 230 km/s.
