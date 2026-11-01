# ADR-0017: Paths through time and space (Prezi-style presentations)

Status: accepted (0.3.0)

## Context

The owner wants presentations made from the map itself: go to a place in time and space, in any view, press Return to make it a point; travel and press Return again for the next; then present, the viewer *flying* from point to point (never a cut). In Presentation mode Return and → go on, ← goes back; after looking around at a point, a press first flies back to that point and only the next press continues. Presentation mode lives in the Capture button, because presentations are among the things people will capture. A point is exactly what is on screen, look and running time included. Every transition should be made as beautiful as it can be. Paths are saved and chosen from a list; later they become the Library's stories, with ready-made presentations and a marketplace.

## Decision

**A point is everything on screen** (`src/core/path.ts`, `PathPoint`): the view (calendar, Fly, galaxy); the present as a `Time`; speed and whether time runs; the calendar's camera (offset from the present as an exact interval, seconds per pixel, roll, yaw, space zoom, the Sun's vertical offset); the 3D camera anchored on a body (anchor, frame, offset in km, quaternion, field of view, "up" for flying); the look (theme, round or full, space-bar state, planets, every element, strobe, centre, the sphere positions are measured on); a caption; and two plain sentences written when it was set (where, and which way it faces) for its box. The calendar's camera is kept even in 3D (it is hidden but alive), so going back to the calendar is exact.

**Paths are files**, `.sp4ce.json` (owner, 1 Nov 2026: light, downloadable, re-uploadable; no logins or server storage at first). Version 2 is a name and a list of points: `view`, `t` (the present as [days, seconds] since 2000), `rate`, `cal` (the calendar's camera), `cam` (the 3D camera, for Fly and galaxy points only), `look` (only what differs from `DEFAULT_LOOK`), optional `caption`, and plain words (`when`, `where`, `facing`) for people reading the file. Numbers are rounded to what can be seen (times to the millisecond, angles to 10⁻⁶ rad, km to 12 figures); lists of numbers sit on one line. A 7-point path is about 4 KB. Reading validates every field with plain-language errors (`parseSp4ceFile`) and still accepts the first 0.3.0 layout. Later kinds (events, stories) will use the same file with another `sp4ce` value. People ⤓ Download, ⤒ Upload and ✎ Continue (add points to an uploaded path; an example is continued as one's own copy). The browser keeps a copy (IndexedDB, `src/app/pathStore.ts`) so the list survives a reload; the app's example paths are files in `public/paths/`, listed in `index.json`. Cloud storage and sync wait for accounts and could be Premium.

**Making a path** (`App.tsx`, `PathDialog.tsx`): Return, outside Presentation mode, captures the point at that instant and opens a dialog: name the path (first time), caption, "stop after this point" (it becomes END). Esc cancels; "Discard path" asks twice. A path is saved after every point, so nothing is lost; an unfinished path can still be presented, and Finish (beside Capture) ends it at its last point.

**Flying** (`src/app/flights.ts`), always from what is on screen now:
- *Calendar*: time follows the van Wijk–Nuij optimal zoom-and-pan curve (ρ = 1.4) in "seconds across the view": it zooms out until both moments fit, glides, and zooms in, so a jump of 4.6 billion years reads like a jump of an hour. The curve is evaluated from the start for the first half and from the end (the same curve flown backward) for the second, so arrival keeps full precision after any jump. The turn, size and the Sun's place on screen move with it. Duration grows with the curve's length (1.1–6.5 s).
- *3D*: a journey to the point's camera, anchored on its body so it can be recomputed every frame while time moves: a warp when the scale changes enormously (as the existing warp), distance falling by equal factors on the destination (turning to face a new body first), or closing in on the destination among the galaxies. Field of view changes by equal factors. Short jumps in time (up to a month) run along.
- *Calendar ↔ 3D*: they meet where they already match (ADR-0011, 0013): the calendar's own view in 3D, turned as the calendar is turned. Into 3D: fly through time in the calendar, cross-fade into 3D there, then journey. Out of 3D: journey to that view, cross-fade, then fly through time.
- *A big jump in time in 3D* (over a month, unless both ends are in the galaxy view) goes by way of the calendar, where deep time can be seen passing, instead of spinning the planets into a blur.
- *Looks*: any change of look (theme, window, elements, boxes) dissolves: a picture of the screen as it was (drawn with the capture code, `drawShot`) is laid over the new look and fades out over 0.9 s as the flight begins.
- With reduced motion every leg is instant.

**Presenting**: ◉ Capture · ▷ Present opens the menu with the saved paths (Present, Export, Delete, Import). In Presentation mode a capture-phase key handler takes Return, → and ← before the calendar and Fly see them (a drop-down that still has focus does not swallow them); Esc stops. A press during a flight heads on from wherever the flight has got to. Pointer presses, wheel and other keys at a point mark it "wandered"; the next Return or arrow flies back to the point. The point's box (top centre, under the top boxes) shows its name (START, POINT n, END), place in the path, caption, and the view, moment, where and facing; it is captured (as `.pointbox`), and hidden only when all text is hidden. The status beside Capture is never captured.

**Capture during flights**: both views are captured at their current opacity while they cross-fade, and the dissolve's picture with its own, so recordings of presentations show the transitions as seen.

## Consequences

- No new dependency. Calendar bundle +7 KB gzipped (136 of 150 KB).
- `FlyView` gains an API (`getState`, `setState`, `flyTo`, `flyOverview`) given to the window through `onApi`; `GalacticCanvas` gains `getView`, `setView`, `viewWidth`. Flights are animation driven from outside the renderers; the renderers still draw each frame from their current state (rule 4).
- The boxes' own colours switch at once when the theme changes; only the views dissolve.
- Points store absolute body-anchored cameras; a path made today and replayed later shows the same moment (time is part of the point), so it always looks the same.
- A path lives in its file and in the browser that made or uploaded it; share links and the Library come later.
