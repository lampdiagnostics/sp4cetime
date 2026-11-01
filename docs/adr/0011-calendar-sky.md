# ADR-0011: The real sky behind the calendar

Status: accepted (v0.15)

## Context

The calendar's background was a schematic spiral of dots. Fly mode now has the real sky; the calendar should share it, and it should turn when the solar system is turned.

## Decision

- The calendar draws the sky behind everything through the same lens as Fly mode's camera (`src/core/skymap.ts`): a perspective view into the screen (−Z), 60° from top to bottom (in the round window, its radius spans 30°). Fly mode's opening Solar system view looks the same way with the same lens, so the two backgrounds match star for star. (v0.15 briefly used a whole-sky disc; it made the Milky Way's great circle look like a ring around the viewer, so it was replaced.)
- It uses the calendar's own view matrix (roll and yaw), so dragging to rotate the solar system rotates the sky with it, exactly.
- Same data as Fly mode (`public/sky`): the photographic Milky Way and stars to magnitude 5.5. The Milky Way is re-rasterised (a quarter of screen resolution, scaled smoothly) only when the view turns; stars are re-projected at the same moments and drawn each frame.
- Over deep time the sky does not spin: the Sun's travel frame turns with its orbit, and the Milky Way (seen from the Sun, the galactic centre stays at l = 0°) turns with it. Today's star positions are shown at all times; individual stars drift over ~100,000 years, which is noted as a limit.
- Light themes draw the sky as dark ink, like a star chart. (Since 0.2.0 each theme's `sky` block sets this, the same in Fly mode: see ADR-0012.)
- Drawing needs images, so the backdrop lives in the app and is passed into `drawFrame` (`FrameInput.backdrop`); `src/core` stays free of the DOM.

## Consequences

The calendar fetches about 80 KB of sky data after it first draws; until it arrives, the old schematic background shows.
