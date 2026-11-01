# ADR-0012: Sky themes everywhere, labels behind bodies, and the warp to the galaxy

Status: accepted (0.2.0)

## Context

Fly mode always drew a dark sky whatever the calendar's theme, and the light theme's sky in the calendar was too faint to see. Labels (HTML over the WebGL canvas) showed through planets. The whole-galaxy view was a separate button, and getting there from the solar system meant a long continuous flight; the Sun's path through the galaxy was not shown.

## Decision

**Themes.** Renamed Dark Mode, Bright Mode, Colour Mode (ids `dark`, `bright`, `colour`; old saved ids map across). Each theme has a `sky` block (`SkyStyle`, validated by `parseTheme`): Fly's space colour; `ink` (a negative sky); star tint and mix; Milky Way faint/bright colours and strength; line colours for figures, zodiac, galactic marks and the Sun's path; label colours and halo. The calendar backdrop, Fly's sky, the galaxy disc and the path all read it, so the three looks match across calendar, Fly and galaxy, and can be switched live in Fly mode. Ink is drawn with ordinary alpha blending in the opaque pass (CustomBlending, `transparent: false`), so it stays behind the bodies like the additive light it replaces.

**Labels.** Each frame Fly computes every body's outline on screen (a disc, plus an ellipse for rings). A sky label (at infinity) is hidden if its box meets any outline; a grid or galaxy label only if the body is nearer than the label's point; a body's label only behind nearer bodies. Sky labels try four spots (as placed, above, below, left) to keep clear of stars brighter than magnitude 3.2, and hide if none is free. Widths are estimated from text length, so no layout is read per frame.

**The Sun's path.** A circle around Sgr A* through the Sun, in the plane of the Sun's radius and the galactic pole, travelled toward l = 90° at 230 km/s (8.178 kpc: one orbit ≈ 218 Myr, consistent with the space grid's 1° ≈ 607,000 years). Drawn as camera-facing ribbons of constant pixel width, depth test off, above the disc, so it reads from any angle. Labelled a circular model; the real orbit is slightly eccentric and bobs through the plane (DECISIONS §6).

**The warp.** Moving out past 1,000 AU from the Sun starts a warp to `warpOutVantage`: on the ray from the Sun along the heading (tipped at least 20° out of the galactic plane so the disc is never edge-on), 42 kpc from Sgr A* (the 40 kpc disc fits a 60° view), looking at Sgr A*, galactic north up. Heading straight at the Sun (within 4°) from outside 1,000 AU, zooming in to within 7 kpc of the galaxy's disc, or clicking the Sun's label, warps back to 6 AU in front of the Sun. Any flight between places whose distances from the Sun differ more than 10⁴ times is also a warp. A warp interpolates the logarithm of distance from the Sun and turns the direction smoothly (`warpPoint`), so speed grows exponentially and the existing distance-based cross-fade (sky out, galaxy in, 300–3,000 ly) plays through continuously; a slight widening of the lens, a vignette and the speed in light speeds make it read as acceleration. Warps take 3.6 s and are not interrupted by input; with reduced motion they are instant and the vignette is off.

**The galaxy in 3D.** The face-on map gives the light at each place in the plane; the shader marches 72 steps through a 40 × 40 × 8 kpc box and integrates the vertical profile exactly per step (so the thin layers never alias): 88% thin disc (scale height 0.30 kpc, rising to 0.95 kpc in the bulge/bar, flaring ×1.7 beyond 11 kpc) and 12% thick disc (0.9 kpc), with dust (0.12 kpc) absorbing in proportion to the light. Face-on this returns the map (slightly dimmed by dust); edge-on the light piles up into a thin disc with a dark lane and a boxy bulge, as in NGC 891 and NGC 4565. Values follow Bland-Hawthorn & Gerhard (2016, ARA&A 54, 529). The volume is drawn from its back faces so it renders from inside too.

**Fermi bubbles.** Two lathe-shaped shells on the centre, 7.7 kpc (25,000 ly) tall and 6.6 kpc across at their widest (about ±50° of latitude and ±20° of longitude as seen from the Sun; Su, Slatyer & Finkbeiner 2010, ApJ 724, 1044), faint inside and brighter at the rim. A model of their outline, not of their gamma-ray brightness; the look (glowing magenta fill, bright whitening rim; in Dark Mode a more saturated galaxy with a golden core and bluer arms) follows NASA Goddard's illustrations (SVS 10688, 10691). The Whole galaxy destination looks from 25° above the plane on the Sun's side, 42 kpc from Sgr A*.

**Colour spaces.** Theme colours go raw to our own shaders (as on the calendar's canvas) and as sRGB to Three's built-in materials and the background, which convert on output, so the screen shows the theme's exact colours in both. In Bright, stars are solid dots sized and weighted exactly as in the calendar.

## Consequences

The Galaxy button is gone from the calendar; the galaxy is reached from Fly mode. Fly's bundle grows by a few KB (≈152 KB gzipped, budget 200 KB). The warp threshold, arrival distance and minimum tilt are constants in `src/fly/flight.ts` and `src/fly/galaxy.ts`, with tests.
