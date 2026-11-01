# The spheres: the model under every view

Status: **draft specification** (1 November 2026), from the owner's description. Nothing here is built yet beyond what `src/core/spheres.ts` already does; the open questions at the end need the owner's answers before it becomes an ADR and code (planned for 0.5, see [ROADMAP.md](ROADMAP.md)).

## The idea in the owner's words, made exact

- The galaxy is a sphere. The Sun, each planet and each moon is a sphere inside it (the planets inside the Sun's, the Moon inside Earth's).
- **Every sphere is a perfect sphere, and it never rotates.** Its equator lies in the x–y plane through its centre, its poles point along ±z. All spheres share the same x, y, z directions. Spheres move relative to one another (their centres move), but they never turn, spin or change shape.
- **Only skins move.** Each sphere carries skins: shells at a chosen radius, outside or inside, that can be painted or drawn on. A skin turns at a known angle (the direction of its pole), spin (where its prime meridian is) and speed (how fast it turns). Earth's map is a skin; the clouds could be another; the zodiac is a skin of the Sun's sphere.
- **Any point anywhere can be stated relative to every sphere**: how far from its centre (in its radii) and at what latitude and longitude (in degrees, minutes and seconds).

## 1. One frame for every sphere

Because no sphere rotates, one inertial frame **F** (x, y, z) serves them all.

**Recommendation: F = ecliptic J2000** (the app's world frame today): x toward the March equinox of J2000, z toward the north ecliptic pole. With that choice:
- every planet's orbit lies close to the equator of the Sun's sphere, and the zodiac is exactly the band of ±8° around that equator;
- the calendar, Fly mode and the paths already use it, so nothing has to be converted;
- Earth's own tilt (23.44°) and the galaxy's (the galactic plane is tilted about 60° to the ecliptic) live where they belong: on the skins.

(Alternatives, for the owner: the ICRF equatorial frame, in which the IAU publishes rotation models, or galactic axes, in which the galaxy looks level. Either works mathematically; ecliptic is the least change and reads best for the solar system.)

## 2. What a sphere is

```ts
interface Sphere {
  id: string;                 // 'galaxy', 'sun', 'earth', 'moon', 'little-prince-b612', …
  parent: string | null;      // the sphere it moves within ('earth' for the Moon, 'galaxy' for the Sun)
  radius: number;             // R, km: the body's mean radius (the "1 radius" of every read-out)
  domain: number;             // D, km: how far its sphere of influence reaches (Hill sphere); decides which sphere you are "in"
  centre(t: Time): Vec3;      // its centre relative to its parent's centre, in F, km (an ephemeris or a model)
  skins: Skin[];
  properties: Record<string, unknown>; // mass, flattening (recorded, never drawn), albedo, labels, sources…
}
```

Typical values: galaxy R = 50,000 ly (radius of the disc), centred on Sgr A*; Sun R = 695,700 km, D ≈ 1 ly (the Oort cloud edge); Earth R = 6,371 km, D ≈ 1.5 million km; Moon R = 1,737 km, D ≈ 60,000 km.

The centre of a sphere in F is the sum along its chain of parents: C_Moon(t) = C_galaxy + c_Sun(t) + c_Earth(t) + c_Moon(t). In practice positions are kept relative to the nearest sphere and only summed when needed, in double precision, camera-relative (CLAUDE.md rule 10), because the chain spans from 10⁻³ km to 10¹⁸ km.

## 3. Where a point is, on any sphere

For a point P at time t and a sphere S, let **v = P − C_S(t)** (in F). Then:

- distance in radii: **ρ = |v| / R_S**
- latitude: **φ = asin(v_z / |v|)**, from −90° (south pole) to +90°
- longitude: **λ = atan2(v_y, v_x)**, from 0° to 360°, measured from F's x direction

and back again: **P = C_S(t) + R_S · ρ · (cos φ cos λ, cos φ sin λ, sin φ)**.

So **any point has an address on every sphere**: (Galaxy: ρ, φ, λ), (Sun: ρ, φ, λ), (Earth: ρ, φ, λ), … One address fixes the point; all the others follow. And because all spheres share their axes, **going from one sphere's address to another's is only a shift of centre**, never a rotation:

v_B = v_A + (C_A(t) − C_B(t))

This is what makes the model simple: interactions between spheres are additions of vectors, and every angle is directly comparable with every other.

## 4. Skins: what moves

```ts
interface Skin {
  id: string;                 // 'surface', 'clouds', 'graticule', 'zodiac', 'user:my-trip'
  radius: number;             // km from the centre: R for the surface, more for an outer skin, less for an inner one
  side: 'outer' | 'inner';    // seen from outside (a globe) or from inside (a dome, a planetarium, the sky)
  pole(t: Time): Vec3;        // the skin's spin axis in F (the "known angle"); may drift slowly (precession)
  spin(t: Time): number;      // W: where its prime meridian is, degrees (the "spin"), = W0 + Ẇ·d
  paint: Paint[];             // what is drawn on it (section 5)
}
```

Its orientation at time t is the rotation **Q_K(t)** taking skin coordinates to F: tilt the skin's z axis onto `pole(t)`, then turn it by W about that axis. A point's **skin coordinates** (latitude and longitude on the map: Earth's geographic coordinates, the Moon's selenographic ones) are those of **v' = Q_K(t)⁻¹ v**.

For real bodies this is exactly the IAU WGCCRE rotation model: the pole's right ascension and declination α₀(T), δ₀(T) and the prime meridian W(d) = W₀ + Ẇ·d (d in days since J2000), converted from equatorial to ecliptic F by the obliquity. astronomy-engine already provides these (`RotationAxis`); `bodies.ts` uses them today as each body's axes.

Every skin moves with a known angle, spin and speed, and so stays a pure function of time (CLAUDE.md rule 4): no skin keeps state.

Notable skins:
- **Earth's surface**: pole tilted 23.44° from F's z, one turn per sidereal day (W rate 360.9856235° a day).
- **The sky (celestial sphere)**: an inner skin of the Sun's sphere at "infinite" radius; it does not spin (only precesses over millennia). Stars, constellations and the Milky Way are painted on it.
- **The zodiac**: the band ±8° around the equator of the Sun's sphere, fixed (tropical signs measured from the equinox; precession moves it 1° every ~72 years).
- **The galaxy's skin**: carries the galactic coordinates (pole at RA 192.86°, Dec +27.13°; longitude 0° toward Sgr A*), the arms and the dust lane.
- **A user's skin**: anything a person paints or uploads (section 5), on any sphere, at any radius.

## 5. Painting skins

**Now (2D):** a skin's paint is a picture in its own coordinates: an equirectangular image (longitude across, latitude down), or vector marks (points, lines, areas, labels) given as latitude and longitude, each with an optional time range during which it shows. Layers stack by radius, with transparency. Inner skins are seen mirror-wise from inside, so their pictures are flipped when drawn. User data fits directly: a GeoJSON file on Earth's surface skin (its longitude and latitude are the skin's), a photo as a texture on an imaginary planet, a drawing on the sky.

**Later (3D, to be defined):** a skin with relief, its radius varying with position, r(φ′, λ′) = r_K + h(φ′, λ′), from an elevation model (MOLA for Mars, LOLA for the Moon, Copernicus or SRTM for Earth); then meshes in skin coordinates (3D tiles of cities, an imaginary planet's buildings); then volumes for interiors. All tiled as a quad-tree in skin coordinates, so detail loads only where you are looking.

## 6. How spheres interact

- **Which sphere you are in**: the smallest sphere whose domain D contains you. Read-outs and Fly mode's "nearest" use it, and hand over smoothly at domain edges.
- **Seeing**: a ray from the eye meets spheres and skins (ray–sphere intersection, already in `spheres.ts`); nearer spheres hide farther ones and their labels.
- **Light and shadow**: each sphere's lit half faces the Sun's centre; phases follow; an eclipse is a sphere entering another's shadow cone.
- **Projection between spheres**: the direction from one sphere's centre to another's lands on the first sphere's skins. Projecting every planet's centre from Earth's centre onto the zodiac skin gives the sign each planet is in, as seen from Earth (what the app shows today). Projecting onto Earth's surface skin's local horizon at a place gives the astrological houses (see ROADMAP, "Sky on your day").
- **Angles between things**: the angle between two points as seen from any sphere's centre (the Moon and the Sun seen from Earth; two planets seen from the Sun) is just the angle between two vectors in F.

## 7. What changes in the code (when built)

- `spheres.ts` grows into this model: `Sphere`, `Skin`, `addressOn(sphere, P, t)`, `pointFrom(sphere, ρ, φ, λ, t)`, `skinCoords(skin, P, t)`, `sphereIn(P, t)`. The galaxy, Sun and body spheres of ADR-0010 become instances of it.
- ADR-0010 says a body's sphere "turns with the body"; in this model the sphere stays fixed and the **skin** turns. The read-out then shows both: the fixed address on the sphere, and the map position on its surface skin.
- Paths (ADR-0017) gain nothing new: a point's camera is already anchored on a body; with this model it can be anchored on any sphere or skin.
- Tests: round trip P → (ρ, φ, λ) → P on every sphere across ±5 Gyr; going between two spheres equals shifting by the difference of centres; skin rotations stay orthonormal; skin spin rates reproduce sidereal days.

## Open questions for the owner

1. **Which frame is F?** Ecliptic J2000 (recommended), equatorial ICRF, or galactic.
2. **A sphere's size**: the body's radius (so "2 radii out" means one radius above the surface), with the domain as a separate number (recommended); or the domain as the sphere.
3. **Does the galaxy sphere move?** Around the Local Group, or is it the fixed root?
4. **Time as a dimension**: the calendar draws the Sun's sphere unrolled along its path through time. Should a sphere's address include time (ρ, φ, λ, t), so a point of a path is one address?
5. **Inner skins**: what goes on them first (the sky, a planetarium dome for presentations, the inside of Earth)?
