# ADR-0013: Three views, one set of controls

Status: accepted (0.2.0)

## Context

The calendar, Fly mode and the whole galaxy were three screens with different controls. The owner wants the same controls everywhere, the calendar first, and the views reached by buttons, by clicking a body, and (between Fly and the galaxy) by zooming. A first version of 0.2.0 made the calendar the bridge between the other two (zoom out of the calendar to the galaxy, zoom in to Fly, back out of Fly to the calendar); the owner reversed that, and asked for the lens selector to go.

## Decision

**Navigation.** The calendar opens first. ✦ Fly enters 3D at the calendar's own view (`overviewView`: 3.2 AU from the Sun along the calendar's view axes, its up as up, turned as the calendar is turned). ◎ Galaxy enters there and warps out at once. Clicking a name in the calendar (the Sun, a planet or the Moon; `LabelBox` in `render.ts`) or in 3D flies to just above that body's north pole (`aboveNorth`: 1.4 radii from the centre), upright (its north up) and facing the Sun, with the Sun 22° above the centre of the view and the body below (its centre at most 68° down, so it is always at your feet; over the Sun, facing Earth); this replaces "Stay over one spot". In Fly, backing out past 1,000 AU warps to the galaxy (ADR-0012); zooming in to within 7 kpc of the galaxy's disc, flying at the Sun, or clicking it warps back to 6 AU in front of the Sun. Calendar returns to the calendar. The calendar's time zoom stops at its limits as before.

**One shell.** `App` holds every control and the shared state: settings, a simulated clock (rate × real time, used by both views), and the readouts. The calendar canvas and the 3D view are stacked and cross-fade (0.45 s; none with reduced motion); the inactive one keeps its state but draws nothing. The 3D view (`FlyView`) has no controls of its own: it takes props and numbered commands (`enter`, `go`, `above`, `face`, `dolly`, `level`) and reports a readout. It is still a lazy chunk, loaded 1.5 s after the calendar first draws so that entering it is instant.

**The same controls in every view.** Sky toggles draw on the calendar's sky too (shared definitions in `src/core/skyfigures.ts`). Time speed runs the shared clock (the Sun still marks the present). In 3D, √ fit maps distance from the Sun r → √(r · 1 AU) for bodies, orbits and spirals (around the Sun, not along the line of travel; the Moon keeps its true distance from Earth; sizes stay true) and says so; linear and true are real distances. The 3D paths are not limited by the zoom presets: each coil is drawn as far along the line of travel as the window can show (from now to the camera's place along the line, plus 40 × its distance from the line, at least 0.5 AU), with 24 samples per turn (150–6,000 each way; evenly spaced once there is more than a turn). Space zoom moves the camera in 3D; Reset view levels it (north up). The lens is removed: 3D is always a 60° view, matching the calendar's sky.

**The galaxy as stars.** 90,000 points drawn by rejection sampling from the face-on map (seeded, so the same every time), with heights from the thin and thick discs, coloured golden in the bulge and blue-white in the arms with ~3.5% red nebulae; the ray-marched volume stays as a faint haze (42%) and the dust lane. Nothing is placed outside the disc box, and the sky seen from the Sun is fully faded, so intergalactic space is empty.

**Showing and hiding.** The space bar (captured before any focused button sees it, ignored while typing) or the eye button at top centre cycles: everything → no controls (the four corners' controls go; the readout stays) → no text at all (`ViewOptions.text` makes the calendar's frame draw no text, sky names included, and offer no clickable names; in 3D the label layers are hidden) → everything.

**Galaxy labels.** Only the Sun's path is labelled, on a backing in the theme's path colour; the picture carries the rest.

**Gestures.** Calendar: scroll or pinch resizes the solar system (space zoom 0.1–500× the fit); Shift + scroll or pinch zooms time; dragging turns it; sideways scroll pans through time; each gesture is locked to one action until the wheel rests. Fly: dragging orbits; scroll looks around; pinch changes the field of view (0.5–100°) without moving; Shift + scroll or pinch zooms time (the calendar's zoom, shared); dragging orbits (`orbitAround`) the most prominent body within 35° of the middle of the view (largest apparent radius for its angle from the middle; else the nearest; far out, Sgr A*), keeping it fixed on screen, 0.004 rad per px; this replaces Q/E roll (Reset view levels you). W A S D move.

**Fly's grids are a ruler.** In 3D the time and space grids are not at true scale (at true scale a minute of travel is 14,000 km, invisible from any useful place). They are a ruler along the Sun's line: lines a quarter of the camera's distance from the line apart (always visible), each gap one step of time chosen from the shared zoom (a sixth of the span: 10 s at Minute), moving with the simulated clock so a line crosses the Sun when the clock reads its label (`rulerTimeMarks`, `rulerSpaceMarks`). Changing TIME changes the ruler's units and drift speed, nothing else. The space grid is in km (1, 2, 5 × 10ⁿ, as in the calendar again, replacing ADR-0010's arcs) and is not labelled line by line; it states its spacing once near the top. In the galaxy view, the Sun's path has a ruler every 10,000 light years (13.0 Myr of travel at 230 km/s): there, distance and time are read in the same unit.

## Consequences

The main bundle grows by ~4 KB (≈115 KB gzipped, budget 150) and the 3D chunk is fetched on every visit after 1.5 s. Supersedes Fly's own control panel and "Stay over one spot" (ADR-0009).
