# ADR-0015: The zodiac behind the Sun, Minecraft flying, Sgr A* and the Local Group

Status: accepted (0.2.0)

## Context

The zodiac is fixed on the sky sphere; the owner wants the calendar's default view to show the Sun's current sign behind it, and in Fly to see which sign each body is in from where you stand. Flying and looking around should feel like Minecraft. The galaxy view should have its black hole, which you can fly to, a few Local Group neighbours, and a visible light-year ruler.

## Decision

**Zodiac.** The calendar's sky is turned (`skyMatrix` in `render.ts`) so that in the default view it looks the way the Sun is seen from Earth now: the Sun's direction (geocentric, in the ecliptic) is behind the Sun on screen, ecliptic north up, so the Sun's current sign is there. Turning the solar system turns the sky from that home. The calendar's sky is therefore a backdrop oriented as seen from Earth, no longer matched star for star to Fly's real sky (ADR-0011's match is given up for this). In Fly, each body's name adds the sign it is in seen from where you are, worked out from true positions even in √ fit (you are placed relative to the body nearest you), when Zodiac is on.

**Minecraft flying.** A plain click on the 3D view captures the mouse (Pointer Lock; Esc releases); the mouse then steers. There is an "up" (the up of wherever you last arrived, or set by Reset view: the galaxy's north far out, a nearby body's north, else ecliptic north). Looking turns about up and tilts at most 89.5° up or down; there is never roll. W A S D move level with up; Space and Shift (while steering), or R and F, move straight up and down; Ctrl, or Shift when not steering, is faster. Scrolling looks the same way; dragging still turns you around what you see (your up turns with you). Space toggles the controls only when the mouse is not captured.

**Galaxy.** Sgr A* is drawn at the centre (`localGroup.ts`): 4.15 million suns (GRAVITY 2019), Schwarzschild radius 12.3 million km, a black shadow of radius √27/2 Rs with a ring of light brighter on one side, seen only from close by; you cannot come inside 3 Rs. Flying near the disc no longer warps you home: only flying straight at the Sun, or clicking it, does. Speed scales with the distance to the nearest thing, the black hole and neighbour galaxies included, so you can slow down near them. Neighbours, at their measured positions and distances (NED) and disc tilts where known: Andromeda (M31, 765 kpc, i 77°, PA 38°), Triangulum (M33, 840 kpc, i 55°, PA 23°), the Large and Small Magellanic Clouds (50 and 62 kpc), M32 and M110; their pictures are modelled (spiral bulge and arms, irregular bar and clumps, elliptical glow). They and the black hole are labelled (an exception the owner asked for to "only the Sun's path is named"), and clicking a label flies there: to 60 Rs from the black hole on your side of it; to 1.3 diameters from a disc galaxy, 40° from its pole on the side facing the Sun; to 2.2 diameters from an elliptical. The flight closes in by equal factors of distance (like the warp), 4 s. The black hole, 0.16 AU across, is drawn at least 16 px wide (its shadow and ring) so it can be found from afar, growing to true size up close; neighbour galaxies at least 10–14 px. The light-year ruler has ticks across the Sun's path every 10,000 ly and a label at each (−70,000 ly … +30,000 ly).

## Consequences

Pointer Lock needs a user click and is not available on touch screens, where dragging, the arrow keys and R/F remain. The Fly chunk grows to ≈156 KB gzipped (budget 200).
