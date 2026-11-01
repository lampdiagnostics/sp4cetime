# ADR-0016: Capture, one window, Play and Pause, true scale only

Status: accepted (0.2.0)

## Context

The owner wants to make content from sp4cetime (posts, screen savers): screenshots, GIFs and videos of exactly what is on screen, boxes included when they are showing, with a watermark, and without the capture control itself. They also tried several round windows on one screen (like a car's dials) and asked to remove them again; asked for speed to be chosen separately from starting time; and, after a planet was drawn in the wrong zodiac box, asked to drop every scale but true.

## Decision

**Page and window.** `App.tsx` is the page: the present (base, speed, paused), the theme, the space-bar state, the top-right box, and the always-visible tools at the bottom centre (the eye and ◉ Capture). `Pane.tsx` is the window: one view (calendar, Fly, galaxy) with its settings and camera; its corner boxes are rendered into the page with a portal. Multiple panes (dials) were built on this split and removed; the split stays.

**Time.** The Speed menu sets speed and direction (Live = real time, default) and holds time still; ▶ Play runs it at that speed, ❚❚ Pause stops it; Back to now returns to live. A GIF plays, records 5 s and pauses.

**Capture** (`capture.ts`, `gif.ts`, `CaptureMenu.tsx`), all in the browser, no new dependency:
- Each view's canvas is drawn into the capture canvas. The WebGL renderer keeps its frame (`preserveDrawingBuffer: true`). Each view is first test-drawn small; if it comes back fully transparent (some browsers with GPU or WebGL canvases), it is read back pixel by pixel instead (`readPixels` / `getImageData`).
- Fly mode's HTML labels and markers are painted per frame from their computed styles.
- The boxes (`.corner`) are painted one by one: a deep copy with every computed style written inline, drawn through an SVG `foreignObject` image at device resolution, refreshed about once a second while recording. One box per image, so nothing but a box can ever cover the view. Anything marked `data-no-capture` (the eye, Capture) is left out.
- The watermark "@sp4cetime.org" is drawn last, bottom right (on by default).
- GIF: our own encoder (one median-cut palette from the first frame, nearest-colour cache, LZW, looping), 640 px, 15 fps, encoded frame by frame. Video: `canvas.captureStream` + `MediaRecorder`, MP4 (H.264) where supported else WebM, screen resolution up to 4K wide, 30 fps, 8–60 Mbit/s.
- Keys: P, G, V. (S is flying backward in Fly mode.)

**True scale only.** √ fit (and linear) are removed. √ fit moved planets toward the Sun along their heliocentric direction, which changes the direction seen from anywhere else: from Earth on 1 Nov 2026 Neptune (true 1.7°, Aries) was drawn at 355.8° in the Pisces box, Jupiter (Leo) in Virgo. Fly mode and the galaxy are true scale. The calendar keeps the orbits' true proportions and orientation, sized by the space zoom; its old "true" mode (orbit size tied to 230 km/s of travel at the time zoom) would put them far off screen at most zooms. A camera-relative "sightlines" correction for √ fit was built and dropped with √ fit.

## Consequences

- Capture is verified in headless Chrome (views, boxes, watermark, GIF, MP4); on the owner's Mac it once recorded only the boxes. The read-back fallback and per-box painting are meant to fix that; it must be checked in Safari and Chrome before the beta.
- `foreignObject` drops pseudo-elements and backdrop blur in the boxes' pictures; box popovers open at capture time are clipped to their box.
- With true proportions the inner planets are small when the outer ones are shown; pinch in, or leave the outer planets out.
