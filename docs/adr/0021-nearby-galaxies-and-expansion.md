# ADR-0021: The nearest 500 galaxies, the galaxy web, and the universe's expansion skin

Status: accepted (4 November 2026, 0.4.3). Built ahead of the rest of 0.5.0 at the owner's request ("let's do the 500 now").

## Context

docs/SPHERES.md §9 planned the ~500 nearest galaxies, a web joining them ruled in light years, and the expanding universe as a skin of the universe sphere. The owner asked for the universe skin together with a "mass-only" view among the Teaching options. Until now the only galaxies drawn were six Local Group members, all held together by gravity, so an honest expansion model would have moved nothing; the catalogue had to come first.

## Decision

1. **Data:** the Updated Nearby Galaxy Catalog (Karachentsev, Makarov & Kaisina 2013), as NASA HEASARC serves it (`heasarc_neargalcat.tdat`, tables 1 and 2 joined, marked public), kept in `scripts/data/`. CDS VizieR was unreachable from the owner's network and the cloud. `scripts/build_galaxies.py` keeps the nearest 500 with a distance (out to 7.6 Mpc, 24.8 million light years): name, RA, Dec, distance and method, linear diameter, type, absolute B magnitude, tidal index Θ1, main neighbour → `public/sky/galaxies.json` (33 KB, fetched with the galaxy view, outside the JS budget). Credits: `public/sky/CREDITS-galaxies.md`, NOTICE.
2. **Core** (`src/core/galaxies.ts`, tested): parse and validate; heliocentric positions (RA, Dec, distance → ecliptic J2000 km); **groups** by union-find over main-neighbour links with Θ1 > 0 (inside the neighbour's sphere of influence), plus everything within 1 Mpc of the Milky Way as the Local Group; each group led by its brightest member; **bridges** as Prim's minimum spanning tree over the group leads from the Milky Way, so the web is connected; marks every 1, 2 or 5 × 10ⁿ light years; honest labels (distance method and its precision, "seen as it was N million years ago"); catalogue names written as people do (MESSIER081 → M81).
3. **Cosmology** (`src/core/cosmology.ts`, tested): flat ΛCDM (Planck 2018: H₀ 67.4, Ωm 0.315; radiation left out), a(t) = (Ωm/ΩΛ)^⅓ sinh^⅔(3/2 √ΩΛ H₀ t); and the **matter-only universe** (Friedmann 1922, Einstein–de Sitter), a(t) = (t/t₀)^⅔ with the same H₀ today. Both are 1 now; ages 13.8 and 9.7 billion years; a ≈ 0.70 / 0.65 at the Sun's birth; redshift 1 + z = a(received)/a(emitted).
4. **The expansion skin:** each group lead's distance from the Milky Way's centre is scaled by a(t); members keep their offset from their lead; the Local Group never stretches (bound). A pure function of the time shown (rule 4). Positions are otherwise today's (peculiar motions of a few hundred km/s are not modelled), so this is a model over billions of years, labelled "expansion modelled".
5. **Drawing** (`src/fly/nearbyGalaxies.ts`): one instanced mesh of face-on discs (the catalogue has no position angles), true diameter, at least 9 px, tinted by type and brightness ("discs modelled"); Bright draws them as ink; the web as line segments with marks as points, one shrink factor for all lines (so they stay straight) and per-disc shrink toward the camera (floating origin, rule 10); names for the largest on screen; bridge lengths in light years; click a name to fly there; the six hand-drawn Local Group galaxies are not drawn twice.
6. **Controls:** Go to › **The nearby galaxies** (16 Mpc out, the same direction as the whole-galaxy view); Elements › **Galaxy web, in light years** and **Expansion of space** (both on); Teaching options › **Mass-only universe (Friedmann 1922)**, off (it turns Expansion on). All three are in `PointLook` (rule 16), and a point's camera may now be up to 3×10²¹ km away (it was 10²⁰, which ruled out any point among the galaxies).

## Consequences

- The warp's third rung is reached by Go to, by flying out, or by clicking a name; there is no automatic warp beyond the Milky Way yet.
- Still to do from SPHERES.md §9: redshift colours, the flight ruler counting down in the HUD, discs at their true tilts (needs position angles, e.g. HyperLEDA), the spheres model in code, the viewer's skins.
- The expansion is visible only over hundreds of millions of years or more; at today's moment both universes agree.
