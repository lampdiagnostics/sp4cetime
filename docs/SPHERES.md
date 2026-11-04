# The spheres: the model under every view

Status: **draft specification**, from the owner's descriptions (1 and 3 November 2026). Nothing here is built yet beyond what `src/core/spheres.ts` already does; the open questions at the end need the owner's answers before it becomes an ADR and code (planned for 0.5.0, see [ROADMAP.md](ROADMAP.md)).

## The idea in the owner's words, made exact

- Everything is a sphere inside a bigger sphere: the universe holds the galaxies, a galaxy holds its stars, a star its planets, a planet its moons and its living things, a living thing its cells, a cell its molecules, a molecule its atoms.
- **Every sphere is a perfect sphere, and it never rotates.** Its equator lies in the x–y plane through its centre, its poles point along ±z. All spheres share the same x, y, z directions. Spheres move relative to one another (their centres move), but they never turn, spin or change shape.
- **Every sphere moves with its parent** (owner: "slaves to" the sphere above): its centre is given relative to its parent's centre, so when the parent moves, everything inside it comes along.
- **Only skins move.** Each sphere carries skins: shells at a chosen radius, outside or inside, that can be painted or drawn on. A skin turns at a known angle (the direction of its pole), spin (where its prime meridian is) and speed (how fast it turns). A skin is made of many **segments** (pieces of the surface: a tile, a country, a sign of the zodiac) and **3D layers** (heights above and below it): Earth's surface skin holds the map, the relief, the oceans and the clouds as segments and layers of one skin, not as separate skins (owner, 3 November 2026). The zodiac is a skin of the Sun's sphere.
- **Any point anywhere can be stated relative to every sphere**: how far from its centre (in its radii) and at what latitude and longitude (in degrees, minutes and seconds).
- **The viewer is the point everything is seen from**: a position (an address on the spheres around it), a direction of view, and motion, on a phone, a desktop or a VR headset. Only the spheres, and the parts of spheres, that the viewer can see are loaded, so travel stays smooth and steady.

## 0. Precedents: has this been done before?

Parts of it, many times; the whole of it, not that we know of. The model borrows from four traditions.

**Old cosmology.** Nested spheres are the oldest picture of the heavens: Eudoxus and Aristotle's homocentric spheres, Ptolemy's spheres carrying epicycles, the armillary sphere, Dante's nine heavens, Kepler's *Mysterium Cosmographicum* (planetary spheres nested between the five regular solids). There the spheres themselves turned and carried the planets. sp4cetime reverses that: the spheres stay still in direction and only their skins turn. The old idea of microcosm and macrocosm (and Bohr's "planetary" atom of 1913) is the same instinct at every scale; the instrument must not imply that an atom is a little solar system, so Atomic mode labels orbitals as probability clouds (ROADMAP).

**Journeys through the scales.** Kees Boeke's book *Cosmic View* (1957), the Eameses' film *Powers of Ten* (1977), *Cosmic Voyage* (1996), *Cosmic Eye* (2012) and Cary Huang's *Scale of the Universe* all fly one continuous path from the very large to the very small. They are films or fixed zooms; sp4cetime makes the same journey freely navigable, at true scale, in time as well as space.

**Physics.** Laplace's *sphere of influence* and Hill's sphere decide which body a point "belongs" to; spaceflight planning uses them as **patched conics** (Kerbal Space Program made them famous), handing a craft from one sphere to the next at the boundary. That is exactly the `domain` below. JPL's SPICE toolkit and Celestia chain reference frames body to body the same way.

**Graphics.** Every 3D engine (three.js included: `Object3D` children move with their parent) is a **scene graph**, a tree of nested frames. The closest precedent to this model is **OpenSpace** (Linköping University, the American Museum of Natural History and NYU; open source), built to show the whole known universe in planetariums. Its **dynamic scene graph** (Axelsson et al., *Computer Graphics Forum* 2017) solves the precision problem this model will meet: the camera is attached to whichever object it is near, and that object becomes the origin of the coordinates, so the numbers stay precise from spacecraft to galaxy clusters. Its "globe browsing" loads planetary surface tiles only where the camera looks (Bladin et al. 2018). Earlier, Uniview's "ScaleGraph" (Klashed et al. 2010) did similar work. Gaia Sky (open source) shows hundreds of millions of stars and already packages the nearby-galaxy catalogue proposed in section 9. Surface tiling follows Google Earth and Cesium's 3D Tiles (a quad-tree, finer tiles where the screen needs them); HEALPix (astronomy) and S2 (Google) are tried ways of cutting a sphere into equal tiles.

**Video games.** Today's space and open-world games face the same two problems (numbers that lose precision far from the origin, and worlds too big to load at once), and their answers look a lot like spheres:
- **Kerbal Space Program** (2015) is the clearest case. Each planet and moon has a **sphere of influence**, and a craft is under the pull of exactly one at a time, handed from sphere to sphere at the boundary (patched conics). To stay precise it keeps the player's ship near the origin and moves the universe around it (a **floating origin**), as sp4cetime's Fly mode does. Distant planets are drawn in a separate, shrunk "scaled space" and only swapped for the full planet up close.
- **Outer Wilds** (2019) simulates a whole small solar system in real time and also keeps the player at the centre, moving the planets instead.
- **Elite Dangerous** (2014) holds a model of the Milky Way with hundreds of billions of star systems, generated from rules except where real catalogues exist. Nearing a planet, flight switches into a frame that **turns with the planet**, so you descend onto a surface that is spinning under you: the game's version of moving with a skin.
- **Star Citizen** nests **physics grids**: a ship's interior is its own little world, carried by the ship, which is carried by a planet's frame, which moves around its star. A person walking inside a ship is attached to the ship, not to the planet; nested spheres in all but name. It streams only the objects near the player ("object container streaming").
- **No Man's Sky** (2016) and **SpaceEngine** generate whole planets and galaxies from rules and refine them in tiles as you approach, so there is no loading screen between space and the ground.
- **Microsoft Flight Simulator** (2020) streams the whole Earth from map and photogrammetry data in tiles, finest where you are flying; **Minecraft** loads its world in chunks around the player (cubes, not spheres), and its "Far Lands" were a famous precision bug at 12.5 million blocks out.
- The engines followed: **Unreal Engine 5** switched to 64-bit "Large World Coordinates" and streams the world in a grid (World Partition); Unity projects use floating-origin scripts.

What sp4cetime takes from them: one home sphere at a time with a handover at the edge (KSP), the viewer always at the origin (KSP, Outer Wilds), children carried by their parent (Star Citizen), tiles refining as you approach (No Man's Sky, Flight Simulator), and the third-person view of the player (Minecraft, section 8). What it does not take: rule-generated detail. Games invent what is not known; sp4cetime leaves it plain and labels it (rule 5).

**What is new in sp4cetime**, as far as we know:
1. **Spheres never rotate; only skins do.** Scene graphs rotate their nodes. Here every sphere in the universe shares one set of axes, so going from one sphere's address to another's is a shift of centre, never a rotation (section 3). Rotation lives only where it is real: on skins.
2. **One address on every sphere at once**, in arcs (°′″) and radii, for every point, from the universe to an atom.
3. **Time as the other axis.** The calendar unrolls the Sun's sphere along its path through time; a path's point is an address in space *and* time.
4. **The same model for astronomy, geography, biology and chemistry**: the four modes are one tree.

Things to learn from OpenSpace before building: its precision analysis, how it hands the camera between objects without jumps, and its tile loading. Its code is open source; check its licence before borrowing any of it (we can only take MIT, BSD or Apache code; README "Licence").

## 1. One frame for every sphere

Because no sphere rotates, one inertial frame **F** (x, y, z) serves them all.

**Recommendation: F = ecliptic J2000** (the app's world frame today): x toward the March equinox of J2000, z toward the north ecliptic pole. With that choice:
- every planet's orbit lies close to the equator of the Sun's sphere, and the zodiac is exactly the band of ±8° around that equator;
- the calendar, Fly mode and the paths already use it, so nothing has to be converted;
- Earth's own tilt (23.44°) and the galaxy's (the galactic plane is tilted about 60° to the ecliptic) live where they belong: on the skins.

Galaxy catalogues give positions in equatorial or supergalactic coordinates; they are turned into F once, when the data is built (a fixed rotation, in the build script).

(Alternatives, for the owner: the ICRF equatorial frame, in which the IAU publishes rotation models, or galactic axes, in which the galaxy looks level. Either works mathematically; ecliptic is the least change and reads best for the solar system.)

## 2. The tree of spheres

Owner, 3 November 2026:

| Level | Sphere | Moves with | Typical radius R | Now (0.4) | Next |
| --- | --- | --- | --- | --- | --- |
| 0 | **Universe** | nothing (the root) | unknown | not drawn | a notional root, no centre (below) |
| 1 | **Galaxies** | the universe | Milky Way ~50,000 ly; dwarfs ~1,000 ly | Milky Way (3D model) + 6 Local Group neighbours | **0.5.0: the ~500 nearest, flat, linked by light-year rulers** (section 9) |
| 2 | **Stars** | their galaxy | Sun 695,700 km | the Sun; Hipparcos stars as points on the sky | later: fly to other stars as their spheres fill in |
| 3 | **Planets** | their star | Earth 6,371 km | 8 planets | skins more and more detailed (Planetary mode) |
| 4a | **Moons** | their planet | Moon 1,737 km | the Moon | other moons |
| 4b | **Organisms** | their planet (Earth only) | ~1 m (a person) | the Starsigns place (a point, not yet a sphere) | "Stand here" (0.5.0) |
| 5 | **Cells** | their organism | ~10 µm (human); 0.15 µm (*Mycoplasma*) | — | Cellular mode |
| 6 | **Molecules** | their cell | ~1–10 nm (a protein) | — | Atomic mode |
| 7 | **Atoms** | their molecule | ~0.1 nm | — | Atomic mode |

From the nearest 500 galaxies (about 2.5 × 10²³ m) to an atom (10⁻¹⁰ m) is about 33 powers of ten. No single number format spans that, which is why positions are always kept relative to a nearby sphere (section 8).

**The universe as root** (owner, 3 November 2026): conjectural, and not shown in the viewer. Its size and centre are unknown (the observable universe is a sphere around *us*, not around a centre), so it is not useful for maths. But the galaxies are still its children: the universe sphere's skin file holds their positions, as every parent's does (below). Its working centre, the 0, 0, 0 the galaxies are measured from, is the Milky Way's centre (Sgr A*), which is where the data is measured from anyway; that is a convention, not a claim about where the universe's centre is, and it says so.

### Every child hangs from its parent's centre, and its motion is in the parent's skin

Owner, 3 November 2026: there is only one way to be attached. **Every child sphere's centre is a radius and a direction from its parent's centre** (the parent's 0, 0, 0), and **all of its motion is stored in a skin of the parent**, in that skin's file. The Moon and a person standing on Earth are the same kind of thing: each is at some radius from Earth's centre, in some direction, and that radius and direction change with time as the skin that carries them says.

- **The Moon** is a mark on Earth's **orbit skin**: a skin that does not spin with the ground; its file holds the Moon's track (radius ≈ 60 Earth radii, latitude and longitude changing over the month, from the ephemeris).
- **A person** is a mark on Earth's **surface skin**: radius 1 Earth radius (plus their height), a fixed latitude and longitude on the map; the skin spins once a sidereal day, and carries them round.
- **Earth** is a mark on the Sun's orbit skin; **the Sun** a mark on the Milky Way's; **the Milky Way and the other galaxies** marks on the universe's. Cells will be marks on an organism's inner skins, molecules on a cell's, atoms on a molecule's.

So a child's centre is always found the same way: take the parent's centre, ask the parent's skin for the child's (ρ, φ, λ) at time t, turn that by the skin's orientation (section 5), and add. **The child sphere itself never rotates**: its own axes stay parallel to F. Which way a person faces, or how a cell is turned, is one of the child's own skins.

This makes the skin file the single place where everything about how a sphere's children move is kept: an ephemeris for planets and moons, a place on a map for a person, a catalogue for galaxies.

## 3. What a sphere is

```ts
interface Sphere {
  id: string;                 // 'universe', 'milky-way', 'm31', 'sun', 'earth', 'moon', 'person:starsigns', …
  parent: string | null;      // the sphere it is a child of ('earth' for the Moon and for a person, 'milky-way' for the Sun); null for the universe
  carrier: string;            // which of the parent's skins holds its motion ('orbits' for the Moon, 'surface' for a person)
  radius: number;             // R, km: the body's mean radius (the "1 radius" of every read-out)
  domain: number;             // D, km: how far its influence reaches (Hill sphere); decides which sphere you are "in"; contains all its children
  skins: Skin[];              // its own skins, which carry its children in turn
  tier: 'ephemeris' | 'measured' | 'modelled' | 'schematic' | 'imaginary';  // honest labels (rule 5)
  properties: Record<string, unknown>; // mass, flattening (recorded, never drawn), albedo, labels, sources…
}
```

Typical values: Milky Way R = 50,000 ly (radius of the disc), centred on Sgr A*; Sun R = 695,700 km, D ≈ 1 ly (the Oort cloud edge); Earth R = 6,371 km, D ≈ 1.5 million km; Moon R = 1,737 km, D ≈ 60,000 km.

A sphere has no `centre()` of its own: its centre relative to its parent is **c(t) = Q_K(t) · R_parent · ρ(t) · (cos φ cos λ, cos φ sin λ, sin φ)**, with (ρ, φ, λ)(t) read from its carrier skin K's file and Q_K that skin's orientation (section 5). The centre in F is the sum along its chain of parents: C_Moon(t) = C_MilkyWay + c_Sun(t) + c_Earth(t) + c_Moon(t). In practice positions are kept relative to the nearest sphere and only summed when needed, in double precision, viewer-relative (CLAUDE.md rule 10).

**The domain is the sphere's bounding sphere**: everything inside a sphere (its children, their children, every skin) lies within D of its centre. This is what makes visibility cheap (section 8): if a sphere's domain cannot be seen, nothing in it can.

## 4. Where a point is, on any sphere

For a point P at time t and a sphere S, let **v = P − C_S(t)** (in F). Then:

- distance in radii: **ρ = |v| / R_S**
- latitude: **φ = asin(v_z / |v|)**, from −90° (south pole) to +90°
- longitude: **λ = atan2(v_y, v_x)**, from 0° to 360°, measured from F's x direction

and back again: **P = C_S(t) + R_S · ρ · (cos φ cos λ, cos φ sin λ, sin φ)**.

So **any point has an address on every sphere**: (Galaxy: ρ, φ, λ), (Sun: ρ, φ, λ), (Earth: ρ, φ, λ), … One address fixes the point; all the others follow. And because all spheres share their axes, **going from one sphere's address to another's is only a shift of centre**, never a rotation:

v_B = v_A + (C_A(t) − C_B(t))

This is what makes the model simple: interactions between spheres are additions of vectors, and every angle is directly comparable with every other.

## 5. Skins: what moves

```ts
interface Skin {
  id: string;                 // 'surface', 'orbits', 'zodiac', 'sky', 'user:my-trip'
  radius: number;             // km from the centre: R for the surface, more for an outer skin, less for an inner one
  side: 'outer' | 'inner';    // seen from outside (a globe) or from inside (a dome, a planetarium, the sky)
  pole(t: Time): Vec3;        // the skin's spin axis in F (the "known angle"); may drift slowly (precession)
  spin(t: Time): number;      // W: where its prime meridian is, degrees (the "spin"), = W0 + Ẇ·d
  segments: Segment[];        // its pieces and layers (section 6): each a region of the skin, a range of heights, and what is drawn there
  children: Track[];          // the child spheres it carries: each one's (ρ, φ, λ) over time, in the skin's own coordinates
}

interface Track {
  child: string;              // the child sphere's id
  at(t: Time): { rho: number; lat: number; lon: number }; // fixed for a person on the ground; an ephemeris for a moon; a catalogue row for a galaxy
  source: string; tier: string;  // where the numbers come from, and how sure they are
}
```

A skin is stored as a light file (a **skin file**, like a path file): its pole, spin and radius, its segments and layers, and the tracks of the children it carries. Real ephemerides (astronomy-engine) are referenced by name rather than copied in.

Its orientation at time t is the rotation **Q_K(t)** taking skin coordinates to F: tilt the skin's z axis onto `pole(t)`, then turn it by W about that axis. A point's **skin coordinates** (latitude and longitude on the map: Earth's geographic coordinates, the Moon's selenographic ones) are those of **v' = Q_K(t)⁻¹ v**.

For real bodies this is exactly the IAU WGCCRE rotation model: the pole's right ascension and declination α₀(T), δ₀(T) and the prime meridian W(d) = W₀ + Ẇ·d (d in days since J2000), converted from equatorial to ecliptic F by the obliquity. astronomy-engine already provides these (`RotationAxis`); `bodies.ts` uses them today as each body's axes.

Every skin moves with a known angle, spin and speed, and so stays a pure function of time (CLAUDE.md rule 4): no skin keeps state.

Notable skins:
- **Earth's surface**: pole tilted 23.44° from F's z, one turn per sidereal day (W rate 360.9856235° a day). People are carried here, each at a fixed latitude and longitude.
- **Orbit skins** (one per parent: the universe's, the Milky Way's, the Sun's, Earth's …): do not spin; their files hold the tracks of the bodies in orbit or in place around the parent (the Moon around Earth, the planets around the Sun, the galaxies in the universe).
- **The sky (celestial sphere)**: an inner skin of the Sun's sphere at "infinite" radius; it does not spin (only precesses over millennia). Stars, constellations and the Milky Way are painted on it.
- **The zodiac**: the band ±8° around the equator of the Sun's sphere (tropical signs measured from the equinox of date; precession moves it 1° every ~72 years).
- **The universe's expansion skin** (0.5.0, section 9): does not spin; it scales the distances on the universe's orbit skin by a(t), leaving bound groups whole.
- **A galaxy's skin**: carries its own coordinates (for the Milky Way, galactic longitude and latitude: pole at RA 192.86°, Dec +27.13°; longitude 0° toward Sgr A*), its arms and dust lane; for the flat galaxies of section 9, a picture turned to the galaxy's real tilt.
- **A user's segments**: anything a person paints or uploads (section 6) becomes segments and layers of a sphere's skin, on any sphere, at any height.

## 6. Segments and layers: painting skins

Owner, 3 November 2026: **a skin can have many segments and 3D layers.** A segment is a region of the skin (a tile, a country, a sign, a cell's membrane patch); a layer is a range of heights in it (the sea floor below, the ground, the oceans' surface, the clouds above, the air's glow). Clouds are therefore not a separate skin but a layer of Earth's surface skin, turning with it (and, when moving clouds are drawn, a layer whose paint changes with time). Every segment turns with its skin; what differs between them is only where they are and what they hold.

```ts
interface Segment {
  id: string;                 // 'land', 'coastlines', 'clouds', 'tile:3/5/2', 'sign:aries'
  region: Region;             // the whole skin, a latitude/longitude box, a polygon, or a tile of the quad-tree
  layer: { from: number; to: number };  // heights above (+) or below (−) the skin's radius, km; 0..0 for a flat paint
  paint: Paint[];             // pictures, vector marks, relief, meshes (below), each with an optional time range
  source: string; tier: string;
}
```

**Now (2D):** a segment's paint is a picture in the skin's coordinates: an equirectangular image (longitude across, latitude down), or vector marks (points, lines, areas, labels) given as latitude and longitude, each with an optional time range during which it shows. Layers stack by height, with transparency. Inner skins are seen mirror-wise from inside, so their pictures are flipped when drawn. User data fits directly: a GeoJSON file as a segment of Earth's surface skin (its longitude and latitude are the skin's), a photo as a texture on an imaginary planet, a drawing on the sky.

**A flat skin** (owner, 3 November 2026, for distant galaxies): a single segment, a picture on a flat disc through the sphere's centre, turned by the skin's pole, rather than on a shell. The cheapest skin there is; it is what distant objects get until they are worth more.

**Later (3D, to be defined):** a layer with relief, its radius varying with position, r(φ′, λ′) = r_K + h(φ′, λ′), from an elevation model (MOLA for Mars, LOLA for the Moon, Copernicus or SRTM for Earth); then meshes in skin coordinates (3D tiles of cities, an imaginary planet's buildings); then volumes for interiors. All are segments tiled as a quad-tree in skin coordinates, so detail loads only where you are looking (section 8): a tile is just a small segment.

## 7. Everything is a sphere, and its skin carries what it is

Owner, 1 November 2026: the model reaches down every scale. In **Planetary** mode each organism (a person standing somewhere on Earth) is a sphere on the planet's surface skin; in **Cellular** mode each cell is a sphere; in **Atomic** mode each atom is a sphere. **All attributes of any sphere are coded in its skin**: a person's sphere carries their place, the time frame of a birth and the houses around them (the first example, "Stand here", 0.5.0); a cell's skin its membrane and what is known of it; an atom's skin its element and state. The sphere itself stays a plain, fixed sphere with a centre and a radius; what it is lives in its skins.

## 8. The viewer, and loading only what can be seen

Owner, 3 November 2026: the viewer is the point from which all the spheres are observed, through a phone, a desktop or a VR headset; their maths is joined to the spheres' maths, and only what is visible is loaded, so travel is seamless and never jittery.

### The viewer is a sphere too

```ts
interface Viewer {
  home: string;               // the sphere the viewer is "in" (smallest domain containing them)
  position: Vec3;             // relative to home's centre, in F, km (double precision)
  look: Vec3;                 // unit vector: where the viewer is looking
  up: Vec3;                   // which way is up on screen (north up by default, CLAUDE.md rule 12)
  fov: number;                // field of view, degrees (per eye in VR)
  velocity: Vec3;             // km/s, for loading ahead
  eyes?: [Vec3, Vec3];        // VR: the two eye offsets from the head (WebXR); a phone may add its gyroscope to `look`
}
```

The viewer is a sphere of radius zero with an address on every sphere (section 4): the top-left read-out already shows it on the nearest body, the Sun or the galaxy. Phones, desktops and headsets differ only in where `look` comes from (mouse, touch, gyroscope, head) and how many eyes are drawn. Like any child, the viewer is carried by a skin of its home sphere: standing on Earth it rides the surface skin (it turns with the ground); flying in space it rides the orbit skin (it does not).

### The viewer's own skins: seeing yourself (owner, 3 November 2026)

The viewer is a sphere, so it can wear skins too: a **flying figure** (a simple humanoid), a **spaceship**, or none. A key (and a button in Display) switches between:
1. **First person** (the default, as now): the view from the viewer's eye.
2. **Third person**, as in Minecraft's camera toggle: the camera sits behind and a little above the viewer, looking past them in the same direction, so you see the figure or ship and what it is looking at.
3. (Later, perhaps) **facing the viewer**, from in front.

Rules for it:
- **True scale** (rule 14): the figure is about 2 m tall and the ship a few tens of metres; the third-person camera sits a few body-lengths behind. Out in space that is still a sensible view: you see the ship and, beyond it, everything it is heading for. (A marker of fixed screen size, like Sgr A*'s, is the alternative if the true-size figure feels lost; open question 7.)
- **The viewer's maths does not change**: its address, look and home sphere are the eye's, as now; the third-person camera is only an offset behind it, and labels and read-outs stay the eye's.
- The figure turns to the look direction and leans into turns; it is a skin, so its looks follow the theme (rule 6) and its paint can be the visitor's own later.
- **A path's point remembers it** (rule 16): first or third person and which skin; flights move the camera between them smoothly.
- **Capture records it** like anything else on screen (rule 15). A Starsigns path could show *you* standing in the field (the person's sphere of "Stand here" wearing the figure).

### Precision: the viewer is always the origin

Doubles keep about 16 digits. Measured from the Milky Way's centre, 16 digits of a galaxy 25 million light years away resolve about 30,000 km; measured from Earth's centre they resolve a nanometre. So, as in OpenSpace's dynamic scene graph and as Fly mode already does (rule 10):
1. Everything is computed relative to the viewer's **home** sphere, in doubles.
2. Each frame, positions are taken relative to the viewer and only then handed to the GPU, in single precision.
3. When the viewer crosses into a new sphere's domain, `home` changes and `position` is re-expressed (a vector addition, section 4). To stop it flickering back and forth at the edge, the handover has a margin (enter at 0.9 D, leave at 1.1 D).

### Each frame: walk the tree, skip what cannot be seen

The nesting does most of the work: **a sphere's domain contains all its children**, so the tree is its own index of what is where.

Starting from the root, for each sphere:
1. **Out of view?** If its domain lies outside the cone of view, skip it *and everything inside it*. (A sphere against a cone is a few multiplications.)
2. **Too small to see?** Its apparent size is its angle across: 2·asin(D / distance). Below about a pixel, draw it as a dot or a label at most, and do not open its children: no cell of a person is visited while the person is smaller than a pixel. This one test is what lets one tree hold galaxies and atoms.
3. **Hidden?** If a nearer opaque sphere covers it (a planet in front of a moon), skip it (the ray–sphere tests in `spheres.ts`).
4. **Otherwise**, draw it at the level of detail its apparent size needs, and visit its children.

### Skins load in tiles, finest only where you look

Each skin's segments are cut into tiles in a quad-tree (or HEALPix, which gives equal-area tiles): the whole skin as one low-resolution tile, each tile splitting into four finer ones. A tile is split only when it is in view and its error on screen would be more than a pixel or two (the method of Google Earth and 3D Tiles). Tiles come from files outside the JS budget, like today's maps.

### Smooth, not jittery

- **Never wait for data.** While a finer tile loads, the coarser one is drawn; when it arrives it fades in over a few frames (no popping).
- **Load ahead.** The velocity says where the viewer will be in a second or two; tiles there are requested first. During a path's flight the whole route is known before it starts (ADR-0017), so everything along it can be fetched in advance; the flight to a galaxy can start its tiles loading the moment it is chosen.
- **Hysteresis everywhere**: a level of detail switches up at one size and down at a smaller one, so nothing flickers at a boundary.
- **Budgets per frame**: a fixed time for loading and building; what does not fit waits for the next frame. Memory is a cache: least recently seen tiles are dropped first.
- **Still a pure function** (rule 4): what is drawn depends only on the viewer, the time and the theme; the cache only decides how sharp it is yet.
- **VR** needs a steady 72–90 frames a second for two eyes, so the pixel thresholds above are looser there, and loading leans harder on prediction.

## 9. First use, 0.5.0: the ~500 nearest galaxies

Owner, 3 November 2026: amp up the galaxies to about 500 of the nearest; flat pictures for now; linked to each other by a ruler or grid in light years, so that when flying from one to another the light years travelled are shown along the way.

**Data.** The **Updated Nearby Galaxy Catalog** (Karachentsev, Makarov and Kaisina 2013, *Astronomical Journal* 145, 101) lists 869 galaxies with individual distances within 11 Mpc (about 36 million light years) or slow enough to be that close; the authors' online database has since grown to over a thousand. The nearest 500 lie within roughly 7–8 Mpc (to be checked when the data is built). For each galaxy it gives position, distance and how it was measured, diameter, brightness, tilt-related quantities and its strongest neighbour (the "main disturber"). It is published through NASA's HEASARC and CDS VizieR; Gaia Sky already ships it. **Licence to confirm** before building (NASA archive copies are generally public; credit the authors in `public/**/CREDITS.md` either way). Built by a new `scripts/build_galaxies.py` into `public/sky/`, turned into F.

**Each galaxy** is a sphere at level 1 (parent: the universe; position from the Milky Way's centre), radius from its catalogue diameter, true scale (rule 14). Its first skin is **flat**: a disc tinted by type and brightness, turned to its real tilt where known, a plain face-on disc where not, labelled *picture modelled* (rule 5; only the position and size are measured). The six Local Group neighbours keep their current looks. Seen from inside the Milky Way, the others are dots on the sky skin until they are close enough to matter.

**The galaxy web, ruled in light years** (owner, 3 November 2026: wanted). The galaxies are joined by a web of faint lines, each line carrying marks in light years like the space grid (1, 2 or 5 × a power of ten, brown dashed, a scale bar), so the distances between galaxies can be read anywhere in it:
1. **Group lines**: each galaxy to its main neighbour from the catalogue, so the groups (the Local Group, M81's, Centaurus A's, the Sculptor group …) read as clusters.
2. **Bridges**: the shortest lines that join the groups into one connected web (a minimum spanning tree over the groups' main galaxies), so there is a ruled way from any galaxy to any other.
3. **The flight ruler**: when flying from one galaxy to another, the straight line between them is ruled the same way, the count of light years running down as you pass the marks, with the distance left in the HUD. If the flight follows the web, the web's own marks are used.

The web is a picture of distances, not a physical thing: the Elements toggle and the label say "lines join each galaxy to its nearest large neighbour".

**Honest labels.**
- **Distances are uncertain**, typically 5–10% for the best (tip of the red giant branch, Cepheids) and much more for those measured from speed alone; the label says which, and the ruler's marks carry the same uncertainty.
- **We see each galaxy as it was**: light from 25 million light years left 25 million years ago. Each label can say so ("seen as it was 25 Myr ago"), which fits an instrument of time.
- Positions are today's; galaxies move a few hundred km/s, so over hundreds of millions of years in the calendar they would drift. Schematic beyond the near past, like the stars (DECISIONS §6).

**Warp.** Today the warp goes from the solar system to the whole Milky Way. The galaxies add a third rung: zoom out past the Milky Way's domain to the Local Volume; zoom in on a galaxy to fly to it.

### Loading the galaxy library, step by step

Who does what: **owner** = on the Mac; **Claude** = in the cloud copy (the cloud workspace cannot reach the astronomy archives, so the owner downloads the data).

1. **Choose and check the source** (Claude, then owner approves). Confirm the Updated Nearby Galaxy Catalog's licence and credit line (HEASARC and VizieR pages); if it is unclear, write to HEASARC or use the HEASARC copy as NASA public data. Read the catalogue's ReadMe and list the columns we need: name, RA, Dec, distance and its method, diameter, morphological type, brightness, inclination, main neighbour. If the position angle (which way a disc is turned on the sky) is missing, plan to fill it from HyperLEDA (check its terms) or leave those discs face-on and say so.
2. **Download** (owner). From VizieR (catalogue J/AJ/145/101), "all columns", as a tab-separated or CSV file; save it as `scripts/data/ungc.tsv` (raw sources are kept out of `public/`; commit it if its licence allows, else note where it came from).
3. **Write `scripts/build_galaxies.py`** (Claude), in the style of the other build scripts (header with usage, source and licence):
   - read the file; drop rows without a distance; keep the nearest 500 (or all within a round distance, open question 8);
   - position: RA, Dec and distance → x, y, z from the Sun → subtract Sgr A*'s position (8.178 kpc toward l 359.9442°, b −0.0462°) → turn into F (ecliptic J2000) → kilometres and light years;
   - size: radius from the catalogue diameter at its distance; tilt: the disc's pole from inclination and position angle, where known;
   - look: a tint from the type (spiral, elliptical, irregular, dwarf) and a brightness from the absolute magnitude;
   - honesty: distance method and its typical error, "velocity distance" flagged, light travel time (= distance in light years);
   - the web: each galaxy's main-neighbour line, then the bridges (minimum spanning tree over the groups' main galaxies), stored as pairs of ids;
   - match the six Local Group galaxies already drawn (M31, M33, LMC, SMC, M32, M110) by name, so they keep their looks and are not drawn twice; the Milky Way itself is left out (it is the root of the numbers).
4. **Write the output** (Claude): `public/sky/galaxies.json` (about 500 rows, rounded; tens of KB gzipped, fetched only when the galaxy view opens, outside the JS budget) as the **Milky Way's and universe's orbit-skin file**: each row a track (ρ, φ, λ from the working centre) plus the sphere's radius, pole, tint and tier. Add the source to `public/sky/CREDITS.md` and NOTICE.
5. **Core** (Claude): `src/core/galaxies.ts`: the row type, validation (like `parseTheme`), light-year marks along a line (sharing `ticks.ts`'s 1-2-5 steps), the light-travel-time label; property tests: positions round-trip, every web line's marks add up to its length, the web is connected.
6. **Fly mode** (Claude): in `src/fly/localGroup.ts` load the file and draw each galaxy as a flat tilted disc (one instanced mesh for all 500, so it costs one draw call), with a dot and a label when small; the web and its marks in `overlays.ts`; click a name to fly there (as now for the Local Group); the warp's third rung; labels hidden behind nearer discs.
7. **Controls and paths** (Claude): Elements › **Galaxy web** toggle; the HUD's distance-left during a flight; the toggle and the camera's galaxy added to `PathPoint` and its validation (rule 16).
8. **Themes** (Claude): discs and web in Dark, Bright (dark ink on paper) and Colour (rule 6).
9. **Check** (Claude): `npm run check`; screenshots of the Local Volume from outside, a flight from the Milky Way to M81 with its ruler running down, the web in all three themes, and a phone; a short Capture video of the flight.
10. **Record** (Claude): ADR-0020 (the galaxy library, the working centre, the web), CHANGELOG, ROADMAP, DECISIONS (the owner's choices here); commit locally; push with the rest of 0.5.0 when the owner agrees.

### The expanding universe: the universe's expansion skin

Owner, 4 November 2026: part of 0.5.0. Inspired by a clip by Astronomy Today ([@astronomytodayy](https://x.com/astronomytodayy/status/2117602707322306826), 3 November 2026; the source, owner): a clump of galaxies in a universe filled only with matter (Friedmann, 1922), the space between them stretching and their light reddening. It is credited as an inspiration (in ? How to and README Credits, like @Geosophyy's); nothing from the clip itself is shipped, since no licence is stated. The instrument draws the same idea from its own maths and the real galaxies.

**Where it lives.** Expansion is a skin of the universe sphere, as the model wants: no sphere changes or turns; only the tracks on the universe's skin grow. A galaxy's distance is **ρ(t) = ρ_comoving · a(t)**, its latitude and longitude fixed, where a(t) is the scale factor (1 now). The skin file names a cosmology rather than listing keyframes, so it stays a pure function of time (rule 4).

**The maths** (`src/core/cosmology.ts`, pure, property-tested):
- a(t) from the Friedmann equation for **ΛCDM** (Planck 2018: H₀ 67.4 km/s/Mpc, Ωm 0.315, ΩΛ 0.685, age 13.8 Gyr; in `constants.ts` with their ranges). Friedmann's matter-only universe (the clip's) is left out for now (owner, 4 November 2026).
- Redshift of light seen at t from a galaxy whose light left at t_e: **1 + z = a(t) / a(t_e)**.
- Tests: a(now) = 1 and ȧ/a now = H₀; ä < 0 before and ä > 0 after the turn to acceleration (~6 Gyr ago); a(t) rises across ±5 Gyr; light-travel times agree with the "seen as it was" labels.
- Over the calendar (ΛCDM): a ≈ 0.70 at the Sun's birth (−4.6 Gyr), ≈ 1.38 at +5 Gyr. Distances between unbound galaxies were about 30% smaller when the Sun formed.

**Honest about what does not expand.** Gravitationally bound groups (the Local Group, M81's, Centaurus A's …) keep their physical size; and within 5–8 Mpc the galaxies' own motions (a few hundred km/s) are as large as the expansion. So only the distances **between** groups scale with a(t): the web's bridges stretch and their light-year marks spread apart over billions of years, while group lines and their marks stay put. Groups come from the catalogue. Label: "expansion modelled (ΛCDM); groups held together by gravity are not stretched"; schematic beyond the near past, like the stars.

**Redshift colours.** An Elements toggle tints each galaxy by the z of the light reaching the Sun at the time shown. Truthfully drawn it is faint in the Local Volume (z ≈ 0.002 at 8 Mpc) and the label says so; it grows across billions of years of calendar time, where it is real. Each theme has its own version (Bright: warmer ink, not glowing red; rule 6).

**Controls and paths.** Elements › **Expansion** and **Redshift** are added to `PathPoint` and its validation (rule 16). A seed path shows it: the Local Volume from outside at −4.6 Gyr, then time running forward a billion years a second while the bridges stretch.

**Later, beyond 0.5.0.** The clip's view, a web hundreds of millions of light years across, needs a bigger catalogue (the 2MASS Redshift Survey, ~44,000 galaxies, or Cosmicflows-4; licences first), loaded as coarser tiles of the same skin (section 8).

**Steps** (after step 9 of the galaxy library above, before its step 10): `cosmology.ts` and its tests; group membership in `galaxies.json` (from `build_galaxies.py`); tracks scaled by a(t) in `galaxies.ts` with bound groups held; the toggles, labels and themes; the seed path; the credit to @astronomytodayy in ? How to (`Pane.tsx`) and README; screenshots and a Capture video of the bridges stretching; an ADR (with the galaxy library's ADR-0020, or its own, ADR-0021).

## 10. How spheres interact

- **Which sphere you are in**: the smallest sphere whose domain D contains you (section 8). Read-outs and Fly mode's "nearest" use it, and hand over smoothly at domain edges.
- **Seeing**: a ray from the eye meets spheres and skins (ray–sphere intersection, already in `spheres.ts`); nearer spheres hide farther ones and their labels.
- **Light and shadow**: each sphere's lit half faces its star's centre; phases follow; an eclipse is a sphere entering another's shadow cone.
- **Projection between spheres**: the direction from one sphere's centre to another's lands on the first sphere's skins. Projecting every planet's centre from Earth's centre onto the zodiac skin gives the sign each planet is in, as seen from Earth (what the app shows today). Projecting onto the local horizon of a person's sphere on Earth's surface skin gives the astrological houses (Starsigns, "Stand here").
- **Angles between things**: the angle between two points as seen from any sphere's centre (the Moon and the Sun seen from Earth; two planets seen from the Sun; two galaxies seen from ours) is just the angle between two vectors in F.

## 11. What changes in the code (when built)

- `spheres.ts` grows into this model: `Sphere`, `Skin`, `Viewer`, `addressOn(sphere, P, t)`, `pointFrom(sphere, ρ, φ, λ, t)`, `skinCoords(skin, P, t)`, `sphereIn(P, t)` (with the handover margin), `visible(sphere, viewer)` (the cone and size tests). The galaxy, Sun and body spheres of ADR-0010 become instances of it.
- ADR-0010 says a body's sphere "turns with the body"; in this model the sphere stays fixed and the **skin** turns. The read-out then shows both: the fixed address on the sphere, and the map position on its surface skin.
- Skin files (section 5) become the one place a sphere's children's motion is stored; `bodies.ts` and `planets.ts` become the ephemeris behind the Sun's and Earth's orbit skins.
- `src/fly/localGroup.ts` becomes the loader for the galaxies of section 9, with the flight ruler and the galaxy web in `overlays.ts`.
- The viewer's skins and the third-person camera (section 8) in `src/fly/FlyView.tsx` and `flight.ts`, remembered by `PathPoint`.
- Paths (ADR-0017) gain nothing new: a point's camera is already anchored on a body; with this model it can be anchored on any sphere or skin, including another galaxy.
- Tests: round trip P → (ρ, φ, λ) → P on every sphere across ±5 Gyr; going between two spheres equals shifting by the difference of centres; skin rotations stay orthonormal; skin spin rates reproduce sidereal days; a child carried by a spinning skin goes round once a sidereal day, one carried by an orbit skin does not; every child lies inside its parent's domain; a sphere culled by `visible` has no visible child.
- Bundle budget: the walk and the culling are small; the galaxy list (~500 rows) is data in `public/`, fetched when the galaxy view opens.

## Open questions for the owner

1. **Which frame is F?** Ecliptic J2000 (recommended), equatorial ICRF, or galactic.
2. **A sphere's size**: the body's radius (so "2 radii out" means one radius above the surface), with the domain as a separate number (recommended); or the domain as the sphere.
3. **The universe's working centre**: answered in part (owner, 3 November 2026: conjectural, not shown, galaxies still its children). Measure from the Milky Way's centre (recommended), or from the Local Group's centre of mass?
4. **Time as a dimension**: the calendar draws the Sun's sphere unrolled along its path through time. Should a sphere's address include time (ρ, φ, λ, t), so a point of a path is one address?
5. **Inner skins**: what goes on them first (the sky, a planetarium dome for presentations, the inside of Earth, the cosmic background on the universe's)?
6. **Skin files**: one file per skin (Earth's surface, Earth's orbits …), or one file per sphere holding all its skins?
7. **The viewer's figure**: true size (a 2 m figure, a ship of tens of metres) or a marker of fixed screen size? Which comes first, the flying figure or the ship? Which key toggles the view (Minecraft uses F5; a browser may take it, so perhaps V is taken by video and C or T instead)?
8. **The galaxies**: the nearest 500 by distance, or every galaxy within a round distance (say 25 million light years, whatever the count)?
9. **Stars**: you said leave them as they are for now. When they become spheres, the nearest few hundred (with planets, where known) first?
10. **The expanding universe**: answered (owner, 4 November 2026): ΛCDM only; no matter-only option for now. (The clip's source is Astronomy Today, @astronomytodayy; answered 4 November 2026.)
