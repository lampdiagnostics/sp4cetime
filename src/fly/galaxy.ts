/**
 * The Milky Way seen from outside, at true scale and in its true place: a disc
 * 40 kpc across centred on Sgr A*, in the galactic plane, with real thickness: a thin
 * disc (scale height ~300 pc) and a thick disc (~900 pc, ~12% of the light), a puffed-up
 * bulge/bar toward the centre, a slight flare at the edge, and a thin dust layer
 * (~120 pc) that shows as a dark lane when seen edge-on, as in other spiral galaxies
 * (NGC 891, NGC 4565). It is drawn by marching rays through that volume, with the face-on
 * map giving the brightness at each place in the plane. Above and below the centre stand
 * the Fermi bubbles: two gamma-ray lobes ~25,000 light years (7.7 kpc) tall and ~6–7 kpc
 * wide (Su, Slatyer & Finkbeiner 2010; NASA Fermi). It is all a schematic model
 * (public/sky/galaxy.jpg, scripts/build_galaxy.py), since no one has seen our
 * galaxy from outside. It fades in as you leave the Sun's neighbourhood, as the
 * sky seen from the Sun (sky.ts) fades out.
 *
 * The Sun's path around the galaxy is drawn over it, so it can be followed from any
 * angle: its whole life, ~42 turns from its birth 4.6 billion years ago to 5 billion
 * years from now, as overlapping loops (a rosette: it swings in and out and bobs up and
 * down, src/core/galacticOrbit.ts and bob.ts), with the last 100 million years
 * highlighted. A model, run unchanged over the Sun's life.
 */
import * as THREE from 'three';
import { KM_PER_PARSEC, SUN_GALACTIC_SPEED_KM_S } from '../core/constants';
import type { SkyStyle } from '../core/theme';
import { addSeconds, SECONDS_PER_YEAR } from '../core/time';
import { bobKmAt, sunHeightKm } from '../core/bob';
import { ORBIT_PERIOD_YEARS, sunOrbitAt } from '../core/galacticOrbit';
import { SUN_AGE_YEARS, SUN_GALACTOCENTRIC_KM, SUN_REMAINING_YEARS } from '../core/constants';
import { threeColour } from './sky';
import { createLocalGroup, type Hoverable } from './localGroup';
import { ECL_TO_GAL, KM_PER_LIGHT_YEAR, type Vec3 } from '../core/geometry';
import { galaxySphere } from '../core/spheres';
import type { Time } from '../core/time';

export const KM_PER_KPC = KM_PER_PARSEC * 1000;
/** Half the width of the galaxy map, kpc (see scripts/build_galaxy.py). */
const HALF_KPC = 20;
/** Half the height of the volume the disc is drawn in, kpc (the thick disc and bulge fit well inside). */
const BOX_Z_KPC = 4;
/** Each Fermi bubble: ~25,000 light years tall, and about 6.6 kpc across at its widest (±20° of longitude from the Sun). */
export const BUBBLE_H_KPC = 7.7;
export const BUBBLE_R_KPC = 3.3;
/** How many stars draw the galaxy (each a point standing for very many real ones). */
const STAR_COUNT = 90_000;

export interface GalaxyLabel {
  readonly pos: Vec3;
  readonly text: string;
  /** Clicking this label does something: 'sun' warps back into the solar system. */
  /** Clicking this label does something: 'sun' warps back into the solar system; 'goto:…' flies there. */
  readonly action?: string;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How visible the outside view of the galaxy is at a distance from the Sun (km): 0 nearby, 1 far out. */
export function galaxyFade(kmFromSun: number): number {
  return smooth(300 * KM_PER_LIGHT_YEAR, 3000 * KM_PER_LIGHT_YEAR, kmFromSun);
}

export async function loadGalaxyMap(base: string): Promise<THREE.Texture> {
  const t = await new THREE.TextureLoader().loadAsync(`${base}sky/galaxy.jpg`);
  // Read raw: the shader below works on the image's own values, like the sky's maps.
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Galactocentric (X along galactic x, Y along galactic y, in the plane), kpc → heliocentric ecliptic km. */
function galToEcl(centre: Vec3, X: number, Y: number, Z = 0): Vec3 {
  const g = [ECL_TO_GAL[0], ECL_TO_GAL[1], ECL_TO_GAL[2]];
  return [0, 1, 2].map((i) => centre[i]! + (g[0]![i]! * X + g[1]![i]! * Y + g[2]![i]! * Z) * KM_PER_KPC) as unknown as Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (a: Vec3): Vec3 => scl(a, 1 / Math.hypot(...a));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** North galactic pole and the direction to the galactic centre, ecliptic frame. */
export const GAL_NORTH: Vec3 = [ECL_TO_GAL[2][0], ECL_TO_GAL[2][1], ECL_TO_GAL[2][2]];
const GAL_X: Vec3 = [ECL_TO_GAL[0][0], ECL_TO_GAL[0][1], ECL_TO_GAL[0][2]];
const GAL_Y: Vec3 = [ECL_TO_GAL[1][0], ECL_TO_GAL[1][1], ECL_TO_GAL[1][2]];

/**
 * How far a point (heliocentric ecliptic km) is from the galaxy's disc (40 kpc across,
 * no thickness), km: straight down to it if above it, else to its rim.
 */
export function galaxyDiscDistanceKm(now: Time, p: Vec3): number {
  const r = sub(p, galaxySphere(now).centre);
  const h = dot(r, GAL_NORTH);
  const rho = Math.hypot(dot(r, GAL_X), dot(r, GAL_Y));
  const edge = HALF_KPC * KM_PER_KPC;
  return rho <= edge ? Math.abs(h) : Math.hypot(rho - edge, h);
}

/** The Sun's angular speed around Sgr A*, radians per year (230 km/s at 8.178 kpc: one orbit ≈ 218 Myr). */
export function orbitRadPerYear(centre: Vec3): number {
  return (SUN_GALACTIC_SPEED_KM_S * SECONDS_PER_YEAR) / Math.hypot(...centre);
}

/**
 * A point on the Sun's (modelled, circular) path around Sgr A*, `years` from now
 * (negative: the past). Heliocentric ecliptic km; 0 years is the Sun itself. The
 * Sun moves toward galactic longitude 90°, clockwise seen from the north.
 */
export function sunPathPoint(centre: Vec3, years: number, now?: Time): Vec3 {
  const R = Math.hypot(...centre);
  const r = scl(centre, -1 / R); // from Sgr A* toward the Sun
  const t = unit(cross(r, GAL_NORTH)); // the way the Sun is moving
  // In and out, and a little ahead and behind, as well as round (galacticOrbit.ts).
  const o = sunOrbitAt(years * SECONDS_PER_YEAR);
  const rr = o.r * (R / SUN_GALACTOCENTRIC_KM);
  const p = add(centre, add(scl(r, rr * Math.cos(o.phi)), scl(t, rr * Math.sin(o.phi))));
  // With `now`: bobbing through the disc as it goes (src/core/bob.ts).
  return now ? add(p, scl(GAL_NORTH, bobKmAt(now, years * SECONDS_PER_YEAR))) : p;
}

/** Where to draw the galaxy's midplane from: Sgr A*, moved so the Sun is its measured height above it now. */
export function discCentre(now: Time): Vec3 {
  const c = galaxySphere(now).centre;
  return add(c, scl(GAL_NORTH, -sunHeightKm(now) - dot(c, GAL_NORTH)));
}

/** How far from Sgr A* to stand to see the whole disc (40 kpc across) in a 60° view. */
export const GALAXY_VIEW_KPC = 42;

/**
 * Where a warp out of the solar system ends: on the line from the Sun along `heading`,
 * far enough out to see the whole galaxy, looking at Sgr A*. The heading is tipped at
 * least 20° out of the galactic plane, so the disc and the Sun's path are never seen
 * exactly edge-on. North (the galaxy's) is up, unless looking almost straight along it.
 */
export function warpOutVantage(now: Time, heading: Vec3): { pos: Vec3; target: Vec3; up: Vec3 } {
  const c = galaxySphere(now).centre;
  let u = unit(heading);
  const minEl = (20 * Math.PI) / 180;
  const z = dot(u, GAL_NORTH);
  if (Math.abs(z) < Math.sin(minEl)) {
    let flat = sub(u, scl(GAL_NORTH, z));
    if (Math.hypot(...flat) < 1e-9) flat = GAL_X;
    u = add(scl(unit(flat), Math.cos(minEl)), scl(GAL_NORTH, (z < 0 ? -1 : 1) * Math.sin(minEl)));
  }
  // Solve |t·u − c| = D for the far root.
  const D = GALAXY_VIEW_KPC * KM_PER_KPC;
  const b = dot(u, c);
  const t = b + Math.sqrt(Math.max(0, b * b - dot(c, c) + D * D));
  const pos = scl(u, t);
  const view = unit(sub(c, pos));
  const up = Math.abs(dot(view, GAL_NORTH)) < 0.9 ? GAL_NORTH : GAL_X;
  return { pos, target: c, up };
}

/** A small, fast, seeded random generator (mulberry32), so the galaxy's stars are the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vertical scale height of the disc at a radius, kpc: ~0.95 in the bulge/bar, ~0.3 in the thin disc, flaring at the edge. */
export function scaleHeightKpc(R: number): number {
  const t = Math.max(0, Math.min(1, (R - 0.6) / 3.4));
  const flare = Math.max(0, Math.min(1, (R - 11) / 8));
  return (0.95 + (0.3 - 0.95) * t * t * (3 - 2 * t)) * (1 + 0.7 * flare * flare * (3 - 2 * flare));
}

/**
 * The galaxy as stars: `n` points placed where the face-on map is bright (more where it
 * is brighter), at heights drawn from the thin disc (88%) and thick disc (12%), in the
 * galaxy's own axes (kpc: x toward the centre from the Sun, y toward l = 90°, z north).
 * Colours: golden in the bulge, blue-white in the arms, with a few red glowing nebulae
 * along the arms, as in images of spiral galaxies. A schematic model, not a catalogue.
 * `bright(x, y)` gives the map's brightness (0–1) and colour at a place.
 */
export function galaxyStars(
  bright: (x: number, y: number) => readonly [number, number, number],
  n: number,
  seed = 1,
): { pos: Float32Array; colour: Float32Array; size: Float32Array } {
  const rnd = seeded(seed);
  const pos = new Float32Array(n * 3), colour = new Float32Array(n * 3), size = new Float32Array(n);
  const expo = (h: number): number => (rnd() < 0.5 ? -1 : 1) * -h * Math.log(1 - rnd() * 0.999);
  let k = 0;
  for (let tries = 0; k < n && tries < n * 400; tries++) {
    const x = (rnd() * 2 - 1) * HALF_KPC, y = (rnd() * 2 - 1) * HALF_KPC;
    const R = Math.hypot(x, y);
    if (R > HALF_KPC) continue;
    const c = bright(x, y);
    const lum = Math.max(c[0], c[1], c[2]);
    // Accept more often where the map is brighter; the bulge is crowded, the arms beaded.
    if (rnd() > lum ** 1.6) continue;
    const z = rnd() < 0.88 ? expo(scaleHeightKpc(R)) : expo(0.9);
    pos.set([x, y, Math.max(-BOX_Z_KPC, Math.min(BOX_Z_KPC, z))], k * 3);
    const bulge = Math.max(0, Math.min(1, 1 - (R - 1) / 3));
    const nebula = bulge < 0.2 && lum > 0.25 && lum < 0.8 && rnd() < 0.035;
    let col: [number, number, number];
    if (nebula) col = [1.0, 0.42 + 0.15 * rnd(), 0.35 + 0.1 * rnd()];
    else {
      const blue: [number, number, number] = [0.72 + 0.2 * rnd(), 0.82 + 0.12 * rnd(), 1.0];
      const gold: [number, number, number] = [1.0, 0.86 + 0.08 * rnd(), 0.62 + 0.12 * rnd()];
      const w = Math.max(bulge, rnd() < 0.25 ? 0.7 : 0);
      col = [0, 1, 2].map((i) => blue[i]! + (gold[i]! - blue[i]!) * w) as [number, number, number];
    }
    colour.set(col, k * 3);
    // Most stars are faint points; a few are much brighter.
    size[k] = nebula ? 2.4 + 2.5 * rnd() : 1.0 + 3.2 * rnd() ** 14;
    k++;
  }
  return { pos: pos.subarray(0, k * 3), colour: colour.subarray(0, k * 3), size: size.subarray(0, k) };
}

/** A line with a constant width on screen, rebuilt each frame (WebGL lines are 1 px). */
class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  readonly mat: THREE.ShaderMaterial;
  constructor(
    readonly n: number,
    readonly closed: boolean,
    alpha: (i: number) => number,
    private readonly halfWidthPx: number,
    dashes: number,
    order: number,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    const a = new Float32Array(n * 2), u = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      a[2 * i] = a[2 * i + 1] = alpha(i);
      u[2 * i] = u[2 * i + 1] = i / (n - 1);
    }
    g.setAttribute('alpha', new THREE.BufferAttribute(a, 1));
    g.setAttribute('along', new THREE.BufferAttribute(u, 1));
    const idx: number[] = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      idx.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1);
    }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { colour: { value: new THREE.Color() }, opacity: { value: 0 }, dashes: { value: dashes } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float along;
        varying float vAlpha;
        varying float vAlong;
        void main() {
          vAlpha = alpha;
          vAlong = along;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        uniform float opacity;
        uniform float dashes;
        varying float vAlpha;
        varying float vAlong;
        void main() {
          if (dashes > 0.0 && fract(vAlong * dashes) > 0.55) discard;
          gl_FragColor = vec4(colour, vAlpha * opacity);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }
  /** Points are camera-relative (already shrunk toward the camera); `pxAngle` is radians per pixel. */
  set(pts: readonly Vec3[], pxAngle: number): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const prev = pts[this.closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
      const next = pts[this.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
      const side = cross(sub(next, prev), p);
      const len = Math.hypot(...side);
      const w = len > 0 ? (this.halfWidthPx * pxAngle * Math.hypot(...p)) / len : 0;
      for (const [k, sgn] of [[0, 1], [1, -1]] as const) {
        this.pos[(2 * i + k) * 3] = p[0] + side[0] * w * sgn;
        this.pos[(2 * i + k) * 3 + 1] = p[1] + side[1] * w * sgn;
        this.pos[(2 * i + k) * 3 + 2] = p[2] + side[2] * w * sgn;
      }
    }
    this.attr.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Disc look per theme: 0 the picture as it is (Dark), 1 tinted (Colour), 2 a negative in ink (Bright). */
function discMode(s: SkyStyle): number {
  if (s.ink) return 2;
  return s.starTintMix > 0 ? 1 : 0;
}

/** Points along the Sun's whole-life path (~42 turns, ~78 per bob of 85 Myr). */
const LIFE_N = 12_000;
const TRAIL_N = 160;
const AHEAD_N = 90;
/** The highlighted stretch of the path: the last 100 Myr behind the Sun, the next 50 Myr ahead. */
const TRAIL_YEARS = 100e6;
const AHEAD_YEARS = 50e6;
/**
 * The ruler along the Sun's path, in light years: a mark every 10,000 ly along the
 * highlighted stretch (about 13 million years of travel apart). At this scale time and
 * distance read as one: a light year is both.
 */
export const RULER_LY = 10_000;
/** Years of travel for one ruler step (230 km/s). */
export const RULER_YEARS = (RULER_LY * KM_PER_LIGHT_YEAR) / SUN_GALACTIC_SPEED_KM_S / SECONDS_PER_YEAR;
const RULER_MARKS: readonly number[] = (() => {
  const out: number[] = [];
  for (let k = -Math.floor(TRAIL_YEARS / RULER_YEARS); k <= Math.floor(AHEAD_YEARS / RULER_YEARS); k++) if (k !== 0) out.push(k * RULER_YEARS);
  return out;
})();
/** What the ruler says about itself. */
export const RULER_STATEMENT = `Sun's path · ${RULER_LY.toLocaleString('en-US')} light years (${Math.round(RULER_YEARS / 1e5) / 10} million years of travel) between marks`;

export function createGalaxy(scene: THREE.Scene, map: THREE.Texture, style: SkyStyle) {
  // The volume: a box 40 × 40 × 8 kpc in galactic axes (kpc), rays marched through it.
  const geo = new THREE.BoxGeometry(2 * HALF_KPC, 2 * HALF_KPC, 2 * BOX_Z_KPC);
  const uniforms = {
    map: { value: map },
    opacity: { value: 0 },
    mode: { value: discMode(style) },
    faint: { value: threeColour(style.milkyWayFaint) },
    bright: { value: threeColour(style.milkyWayBright) },
    camL: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vL;
      void main() {
        vL = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float opacity;
      uniform float mode;
      uniform vec3 faint;
      uniform vec3 bright;
      uniform vec3 camL;
      varying vec3 vL;
      const float HALF = ${HALF_KPC.toFixed(1)};
      const float BOXZ = ${BOX_Z_KPC.toFixed(1)};
      // The volume is now the faint unresolved light between the stars, and the dust.
      const float HAZE = 0.42;
      // Share of a two-sided exponential (scale height h) below height z: integrates the profile exactly.
      float F(float z, float h) { return sign(z) * (1.0 - exp(-abs(z) / h)) * 0.5; }
      float P(float z, float h) { return exp(-abs(z) / h) / (2.0 * h); }
      vec3 face(vec2 xy) {
        // Map columns run along galactic +y, rows downward along +x (scripts/build_galaxy.py).
        vec2 uv = vec2(xy.y / (2.0 * HALF) + 0.5, -xy.x / (2.0 * HALF) + 0.5);
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
        return texture2D(map, uv).rgb;
      }
      void main() {
        vec3 d = normalize(vL - camL);
        vec3 inv = 1.0 / (d + sign(d) * 1e-7 + vec3(equal(d, vec3(0.0))) * 1e-7);
        vec3 t0 = (vec3(-HALF, -HALF, -BOXZ) - camL) * inv, t1 = (vec3(HALF, HALF, BOXZ) - camL) * inv;
        vec3 lo = min(t0, t1), hi = max(t0, t1);
        float tn = max(max(lo.x, lo.y), max(lo.z, 0.0));
        float tf = min(min(hi.x, hi.y), hi.z);
        if (tf <= tn) discard;
        const int N = 72;
        float ds = (tf - tn) / float(N);
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < N; i++) {
          float s0 = tn + ds * float(i);
          vec3 p0 = camL + d * s0, p1 = p0 + d * ds, pm = 0.5 * (p0 + p1);
          vec3 c = face(pm.xy);
          float R = length(pm.xy);
          // Thin disc ~0.3 kpc, puffed up to ~0.95 kpc in the bulge/bar, flaring a little at the edge.
          float h = mix(0.95, 0.30, smoothstep(0.6, 4.0, R)) * (1.0 + 0.7 * smoothstep(11.0, 19.0, R));
          float hk = 0.9;
          float hd = 0.12;
          float w, wd;
          if (abs(d.z) > 1e-3) {
            w = (0.88 * (F(p1.z, h) - F(p0.z, h)) + 0.12 * (F(p1.z, hk) - F(p0.z, hk))) / d.z;
            wd = (F(p1.z, hd) - F(p0.z, hd)) / d.z;
          } else {
            w = (0.88 * P(pm.z, h) + 0.12 * P(pm.z, hk)) * ds;
            wd = P(pm.z, hd) * ds;
          }
          float lum = max(c.r, max(c.g, c.b));
          // Dust follows the arms, thinning out in the bulge; seen edge-on it is a dark lane.
          float tau = 0.55 * lum * mix(0.35, 1.0, smoothstep(1.0, 4.0, R)) * wd;
          acc += T * c * w * exp(-0.5 * tau);
          T *= exp(-tau);
          if (T < 0.01) break;
        }
        // Face-on this gives the map back; edge-on the light piles up, so soften the brightest.
        vec3 col = acc / sqrt(1.0 + acc * acc);
        float l = max(col.r, max(col.g, col.b));
        vec3 tint = mix(faint, bright, smoothstep(0.2, 0.9, l));
        if (mode < 0.5) {
          // As in NASA's renderings: a golden core and bluer arms, more saturated than the map.
          vec3 grey = vec3(dot(col, vec3(0.3, 0.5, 0.2)));
          vec3 vivid = clamp(mix(grey, col, 2.2), 0.0, 1.0);
          vivid *= mix(vec3(0.82, 0.92, 1.12), vec3(1.1, 0.98, 0.82), smoothstep(0.35, 0.95, l));
          gl_FragColor = vec4(vivid * opacity * HAZE, 1.0);
        }
        else if (mode < 1.5) gl_FragColor = vec4(tint * l * opacity * 1.3 * HAZE, 1.0);
        else gl_FragColor = vec4(tint, clamp(pow(l, 0.8) * opacity * 1.25 * HAZE, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // The back faces are where rays leave the box, so it draws from outside or inside.
    side: THREE.BackSide,
  });
  const setBlend = (s: SkyStyle): void => {
    for (const m of [mat, bubbleMat, starMat]) {
      m.blending = s.ink ? THREE.NormalBlending : THREE.AdditiveBlending;
      m.needsUpdate = true;
    }
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  // The stars, placed by the face-on map (read once from its pixels).
  const img = map.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const lookup = (x: number, y: number): readonly [number, number, number] => {
    // Map columns along galactic +y, rows downward along +x.
    const u = Math.min(cv.width - 1, Math.max(0, Math.floor((y / (2 * HALF_KPC) + 0.5) * cv.width)));
    const v = Math.min(cv.height - 1, Math.max(0, Math.floor((x / (2 * HALF_KPC) + 0.5) * cv.height)));
    const i = (v * cv.width + u) * 4;
    return [px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255];
  };
  const field = galaxyStars(lookup, STAR_COUNT);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(field.pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(field.colour, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(field.size, 1));
  const starU = { opacity: { value: 0 }, pixelRatio: { value: 1 }, ink: { value: style.ink ? 1 : 0 }, inkColour: { value: threeColour(style.starTint) } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starU,
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float pixelRatio;
      varying vec3 vColor;
      varying float vPx;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vPx = max(1.0, size * pixelRatio);
        gl_PointSize = vPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform float ink;
      uniform vec3 inkColour;
      varying vec3 vColor;
      varying float vPx;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(max(0.0, 1.0 - 2.5 / vPx), 1.0, r);
        if (ink > 0.5) gl_FragColor = vec4(inkColour, clamp(a * 0.55 * opacity, 0.0, 1.0));
        else gl_FragColor = vec4(vColor * a * 0.85 * opacity, 1.0);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.matrixAutoUpdate = false;
  stars.frustumCulled = false;
  stars.renderOrder = 1.5;
  scene.add(stars);

  // Galactic axes in kpc: local x toward the centre (from the Sun), y toward l = 90°, z north.
  const gx = new THREE.Vector3(...ECL_TO_GAL[0]), gy = new THREE.Vector3(...ECL_TO_GAL[1]), gz = new THREE.Vector3(...ECL_TO_GAL[2]);
  const basis = new THREE.Matrix4().makeBasis(gx.clone().multiplyScalar(KM_PER_KPC), gy.clone().multiplyScalar(KM_PER_KPC), gz.clone().multiplyScalar(KM_PER_KPC));

  // The Fermi bubbles: two lobes standing on the centre, brighter at their edges (where
  // the line of sight runs along the shell), as in the gamma-ray maps.
  const lobe = (up: boolean): THREE.BufferGeometry => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      pts.push(new THREE.Vector2(BUBBLE_R_KPC * Math.sin(Math.PI * t) ** 0.6 * (0.85 + 0.15 * t), t * BUBBLE_H_KPC));
    }
    const g = new THREE.LatheGeometry(pts, 64);
    g.rotateX(up ? Math.PI / 2 : -Math.PI / 2);
    return g;
  };
  const bubbleU = { colour: { value: threeColour(style.bubbles) }, opacity: { value: 0 }, ink: { value: style.ink ? 1 : 0 } };
  const bubbleMat = new THREE.ShaderMaterial({
    uniforms: bubbleU,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform float opacity;
      uniform float ink;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // A glowing fill (front and back faces both add) with a bright, well-defined rim,
        // whitening toward the very edge, as in NASA's illustrations of the lobes.
        float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = (0.07 + 0.32 * pow(edge, 2.2) + 0.5 * pow(edge, 9.0)) * opacity;
        vec3 c = mix(colour, vec3(1.0, 0.85, 1.0), 0.45 * pow(edge, 6.0));
        if (ink > 0.5) gl_FragColor = vec4(colour, clamp(a * 1.5, 0.0, 1.0));
        else gl_FragColor = vec4(c * a, 1.0);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bubbleGeos = [lobe(true), lobe(false)];
  const bubbles = bubbleGeos.map((g) => {
    const m = new THREE.Mesh(g, bubbleMat);
    m.matrixAutoUpdate = false;
    m.frustumCulled = false;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  });
  setBlend(style);

  // The Sun's path: the whole orbit faintly, the recent past and near future highlighted.
  // The Sun's whole life: faint, thin, overlapping loops.
  const ring = new Ribbon(LIFE_N, false, () => 0.32, 0.7, 0, 3);
  const trail = new Ribbon(TRAIL_N, false, (i) => 0.15 + 0.85 * (i / (TRAIL_N - 1)) ** 1.5, 2.6, 0, 4);
  const ahead = new Ribbon(AHEAD_N, false, () => 0.95, 2.2, 7, 4);
  const ribbons = [ring, trail, ahead];
  ribbons.forEach((r) => scene.add(r.mesh));
  // Marks: the Sun now (large) and every 50 Myr along the highlighted stretch.
  const dotGeo = new THREE.BufferGeometry();
  const dotPos = new Float32Array((RULER_MARKS.length + 1) * 3);
  const dotAttr = new THREE.BufferAttribute(dotPos, 3);
  dotAttr.setUsage(THREE.DynamicDrawUsage);
  dotGeo.setAttribute('position', dotAttr);
  dotGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([14, ...RULER_MARKS.map(() => 6)]), 1));
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { colour: { value: new THREE.Color() }, opacity: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      uniform float pixelRatio;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform float opacity;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        // A ring around a solid centre, so it reads on both light and dark.
        float a = r < 0.55 ? 1.0 : (r > 0.75 ? 1.0 - smoothstep(0.85, 1.0, r) : 0.35);
        gl_FragColor = vec4(colour, a * opacity);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  dots.renderOrder = 5;
  scene.add(dots);

  // Around the galaxy: its black hole, and a few neighbours (localGroup.ts).
  const group = createLocalGroup(scene, style);
  // The light-year ruler's ticks, across the Sun's path at each mark.
  const tickPos = new Float32Array(RULER_MARKS.length * 2 * 3);
  const tickAttr = new THREE.BufferAttribute(tickPos, 3);
  tickAttr.setUsage(THREE.DynamicDrawUsage);
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', tickAttr);
  const tickMat = new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const ticks = new THREE.LineSegments(tickGeo, tickMat);
  ticks.frustumCulled = false;
  ticks.renderOrder = 5;
  scene.add(ticks);

  const applyStyle = (s: SkyStyle): void => {
    group.setStyle(s);
    tickMat.color.copy(threeColour(s.path, false));
    uniforms.mode.value = discMode(s);
    uniforms.faint.value = threeColour(s.milkyWayFaint);
    uniforms.bright.value = threeColour(s.milkyWayBright);
    setBlend(s);
    bubbleU.colour.value = threeColour(s.bubbles);
    bubbleU.ink.value = s.ink ? 1 : 0;
    starU.ink.value = s.ink ? 1 : 0;
    starU.inkColour.value = threeColour(s.starTint);
    const c = threeColour(s.path);
    ribbons.forEach((r) => r.mat.uniforms.colour!.value.copy(c));
    dotMat.uniforms.colour!.value.copy(c);
  };
  applyStyle(style);

  const sample = (centre: Vec3, from: number, to: number, n: number, now: Time): Vec3[] =>
    Array.from({ length: n }, (_, i) => sunPathPoint(centre, from + ((to - from) * i) / (n - 1), now));

  return {
    setStyle: applyStyle,
    /**
     * Place the disc and the Sun's path for this moment and camera; returns labels while
     * they are visible. `pxAngle` is the view's radians per screen pixel.
     */
    update(now: Time, cam: Vec3, pxAngle: number, pixelRatio: number): GalaxyLabel[] {
      const c = galaxySphere(now).centre;
      const fade = galaxyFade(Math.hypot(...cam));
      uniforms.opacity.value = fade;
      bubbleU.opacity.value = fade;
      const on = fade > 0.002;
      mesh.visible = on;
      bubbles.forEach((b) => (b.visible = on));
      stars.visible = on;
      starU.opacity.value = fade;
      starU.pixelRatio.value = pixelRatio;
      ribbons.forEach((r) => {
        r.mesh.visible = on;
        r.mat.uniforms.opacity!.value = fade;
      });
      dots.visible = on;
      dotMat.uniforms.opacity!.value = fade;
      dotMat.uniforms.pixelRatio!.value = pixelRatio;
      ticks.visible = on;
      tickMat.opacity = fade;
      group.update(cam, c, fade, pxAngle);
      if (!on) return [];
      // Drawn shrunk toward the camera by the same factor in size and distance, so it
      // looks exactly the same but the GPU never interpolates across 10^18 km (which
      // loses the texture). Nothing else is visible at these scales, so depth is moot.
      // The disc and its stars sit at the midplane, 20.8 pc below the Sun now.
      const cd = discCentre(now);
      const rel = sub(cd, cam);
      const shrink = 1e6 / Math.max(1, Math.hypot(...rel));
      const m = basis.clone().scale(new THREE.Vector3(shrink, shrink, shrink)).setPosition(rel[0] * shrink, rel[1] * shrink, rel[2] * shrink);
      for (const o of [mesh, stars, ...bubbles]) {
        o.matrix.copy(m);
        o.matrixWorldNeedsUpdate = true;
      }
      // The camera in the galaxy's own axes, kpc (exact, in double precision), for the rays.
      const cl = scl(sub(cam, cd), 1 / KM_PER_KPC);
      uniforms.camL.value.set(dot(cl, GAL_X), dot(cl, GAL_Y), dot(cl, GAL_NORTH));
      const local = (p: Vec3): Vec3 => scl(sub(p, cam), shrink);
      const period = ORBIT_PERIOD_YEARS;
      ring.set(sample(c, -SUN_AGE_YEARS, SUN_REMAINING_YEARS, LIFE_N, now).map(local), pxAngle);
      trail.set(sample(c, -TRAIL_YEARS, 0, TRAIL_N, now).map(local), pxAngle);
      ahead.set(sample(c, 0, AHEAD_YEARS, AHEAD_N, now).map(local), pxAngle);
      const marks = [0, ...RULER_MARKS].map((y) => local(sunPathPoint(c, y, now)));
      marks.forEach((m, i) => dotPos.set(m, i * 3));
      dotAttr.needsUpdate = true;
      // Ruler ticks: 1,500 light years long, pointing toward and away from the centre.
      const half = 750 * KM_PER_LIGHT_YEAR;
      RULER_MARKS.forEach((y, i) => {
        const p = sunPathPoint(c, y, now);
        const out = unit(sub(p, c));
        tickPos.set(local(add(p, scl(out, half))), i * 6);
        tickPos.set(local(add(p, scl(out, -half))), i * 6 + 3);
      });
      tickAttr.needsUpdate = true;
      if (fade < 0.5) return [];
      // Only the Sun's path is named: the picture speaks for itself (point at anything else to name it).
      return [
        { pos: [0, 0, 0], text: '☉ The Sun now (you are here)', action: 'sun' },
        ...group.labels(c),
        ...RULER_MARKS.map((y) => ({
          pos: add(sunPathPoint(c, y, now), scl(unit(sub(sunPathPoint(c, y, now), c)), half * 1.4)),
          text: `${y < 0 ? '−' : '+'}${(Math.round(Math.abs(y) / RULER_YEARS) * RULER_LY).toLocaleString('en-US')} ly`,
        })),
        {
          pos: sunPathPoint(c, period / 2, now),
          text: `The Sun’s path over its life · ~${Math.round((SUN_AGE_YEARS + SUN_REMAINING_YEARS) / period)} turns of ~${Math.round(period / 1e6)} Myr (a model)`,
        },
      ];
    },
    /** Distance to the black hole or a neighbour galaxy, km (for flying speed). */
    clearanceKm(pos: Vec3, now: Time): number {
      return group.clearanceKm(pos, galaxySphere(now).centre);
    },
    /** Keep out of the black hole. */
    keepOut(pos: Vec3, now: Time): Vec3 {
      return group.keepOut(pos, galaxySphere(now).centre);
    },
    /** Where to fly to see the black hole ('bh') or a neighbour galaxy (its index). */
    vantage(target: string, cam: Vec3, now: Time) {
      return group.vantage(target, cam, galaxySphere(now).centre, GAL_NORTH);
    },
    /** What the pointer can name out here. */
    hoverables(now: Time): Hoverable[] {
      return group.hoverables(galaxySphere(now).centre);
    },
    dispose(): void {
      group.dispose();
      scene.remove(ticks);
      tickGeo.dispose();
      tickMat.dispose();
      scene.remove(mesh, dots, ...ribbons.map((r) => r.mesh));
      scene.remove(...bubbles, stars);
      starGeo.dispose();
      starMat.dispose();
      bubbleGeos.forEach((g) => g.dispose());
      bubbleMat.dispose();
      geo.dispose();
      mat.dispose();
      map.dispose();
      ribbons.forEach((r) => r.dispose());
      dotGeo.dispose();
      dotMat.dispose();
    },
  };
}

/**
 * Where to stand to see the whole galaxy: 42 kpc from Sgr A*, on the Sun's side and 25°
 * above the plane, like NASA's views of the Fermi bubbles, so the disc's thickness, the
 * bulge, the bubbles and the Sun's path all show. North up.
 */
export function galaxyVantage(now: Time): { pos: Vec3; target: Vec3; up: Vec3 } {
  const c = galaxySphere(now).centre;
  const el = (25 * Math.PI) / 180;
  const k = GALAXY_VIEW_KPC;
  const pos = galToEcl(c, -k * Math.cos(el), 0, k * Math.sin(el));
  return { pos, target: c, up: GAL_NORTH };
}
