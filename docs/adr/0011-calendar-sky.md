# ADR-0011: The real sky behind the calendar

Status: accepted (v0.15)

## Context

The calendar's background was a schematic spiral of dots. Fly mode now has the real sky; the calendar should share it, and it should turn when the solar system is turned.

## Decision

- The calendar draws the whole sky on one disc behind everything (an azimuthal equidistant projection, `src/core/skymap.ts`): the direction the calendar looks (−Z, into the screen) in the middle, the four sides halfway out (the Sun's direction of travel, galactic longitude 90°, to the right), and the direction behind the viewer around the rim. In the round window the disc is the window; full-screen it reaches the corners.
- It uses the calendar's own view matrix (roll and yaw), so dragging to rotate the solar system rotates the sky with it, exactly.
- Same data as Fly mode (`public/sky`): the photographic Milky Way and stars to magnitude 5.5. The Milky Way is re-rasterised (256 × 256, scaled smoothly) only when the view turns; stars are re-projected at the same moments and drawn each frame.
- Over deep time the sky does not spin: the Sun's travel frame turns with its orbit, and the Milky Way (seen from the Sun, the galactic centre stays at l = 0°) turns with it. Today's star positions are shown at all times; individual stars drift over ~100,000 years, which is noted as a limit.
- Light themes draw the sky as dark ink, like a star chart. Fly mode always uses a dark theme.
- Drawing needs images, so the backdrop lives in the app and is passed into `drawFrame` (`FrameInput.backdrop`); `src/core` stays free of the DOM.

## Consequences

The calendar fetches about 80 KB of sky data after it first draws; until it arrives, the old schematic background shows.
