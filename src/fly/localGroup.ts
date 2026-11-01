/**
 * Around the Milky Way: its central black hole, and a few neighbours in the Local Group.
 *
 * Sgr A*: 4.15 million solar masses (GRAVITY Collaboration 2019), so a Schwarzschild
 * radius of 12.3 million km and a shadow ~2.6 times that, ringed with light as in the Event
 * Horizon Telescope's 2022 image. It sits at the galaxy's centre (core/spheres.ts).
 *
 * The neighbours are placed at their measured positions and distances, turned to their
 * measured tilts where known (inclination and position angle of the disc), and drawn
 * from simple models of how such galaxies look: a spiral's bulge and arms, an irregular's
 * bar and star-forming clumps, an elliptical's smooth glow. Their detailed looks are
 * modelled, not photographed.
 */
import * as THREE from 'three';
import { KM_PER_PARSEC } from '../core/constants';
import type { Vec3 } from '../core/geometry';
import { eqDir, toEcl } from '../core/skyfigures';
import type { SkyStyle } from '../core/theme';
import { threeColour } from './sky';

const KM_PER_KPC = KM_PER_PARSEC * 1000;
const LY_PER_KPC = 3261.56;

/** Sgr A*, the black hole at the centre of the Milky Way. */
export const SGR_A_MASS_SUNS = 4.15e6;
/** Schwarzschild radius, km (2.953 km per solar mass). */
export const SGR_A_RS_KM = SGR_A_MASS_SUNS * 2.953;
/** Radius of its shadow (√27 / 2 Schwarzschild radii), km. */
export const SGR_A_SHADOW_KM = (Math.sqrt(27) / 2) * SGR_A_RS_KM;
/** How close you can come: three Schwarzschild radii (the innermost stable orbit). */
export const SGR_A_KEEP_OUT_KM = 3 * SGR_A_RS_KM;

export interface LocalGalaxy {
  readonly name: string;
  /** Equatorial position, degrees (J2000). */
  readonly ra: number;
  readonly dec: number;
  readonly kpc: number;
  readonly diameterKpc: number;
  readonly kind: 'spiral' | 'irregular' | 'elliptical';
  /** Disc tilt to our line of sight and the major axis's angle east of north, degrees (0 for face-on). */
  readonly inclination: number;
  readonly pa: number;
  /** Ellipticals: short axis / long axis. Spirals: arms and pitch (degrees). */
  readonly axis?: number;
  readonly arms?: number;
  readonly pitch?: number;
  readonly bulge?: number;
  readonly seed: number;
}

/** A few Local Group galaxies (positions and distances from NED; tilts from the literature where known). */
export const LOCAL_GROUP: readonly LocalGalaxy[] = [
  { name: 'Andromeda Galaxy (M31)', ra: 10.6847, dec: 41.269, kpc: 765, diameterKpc: 46.6, kind: 'spiral', inclination: 77, pa: 38, arms: 2, pitch: 8, bulge: 0.22, seed: 31 },
  { name: 'Triangulum Galaxy (M33)', ra: 23.4621, dec: 30.6599, kpc: 840, diameterKpc: 18.7, kind: 'spiral', inclination: 55, pa: 23, arms: 2, pitch: 22, bulge: 0.06, seed: 33 },
  { name: 'Large Magellanic Cloud', ra: 80.8939, dec: -69.7561, kpc: 49.97, diameterKpc: 9.9, kind: 'irregular', inclination: 35, pa: 170, seed: 1 },
  { name: 'Small Magellanic Cloud', ra: 13.1867, dec: -72.8286, kpc: 62.4, diameterKpc: 5.8, kind: 'irregular', inclination: 60, pa: 45, seed: 2 },
  { name: 'M32', ra: 10.6743, dec: 40.8652, kpc: 763, diameterKpc: 2.0, kind: 'elliptical', inclination: 0, pa: 170, axis: 0.75, seed: 32 },
  { name: 'M110 (NGC 205)', ra: 10.092, dec: 41.6853, kpc: 824, diameterKpc: 5.0, kind: 'elliptical', inclination: 0, pa: 170, axis: 0.5, seed: 110 },
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Where a galaxy is (heliocentric ecliptic, km) and how its disc lies (u along the major axis, v across, n its pole). */
export function placeGalaxy(g: LocalGalaxy): { pos: Vec3; u: Vec3; v: Vec3; n: Vec3 } {
  const DEG = Math.PI / 180;
  const los = eqDir(g.ra, g.dec);
  const ra = g.ra * DEG, dec = g.dec * DEG;
  const east: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const north: Vec3 = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const pa = g.pa * DEG, inc = g.inclination * DEG;
  const major: Vec3 = [0, 1, 2].map((i) => Math.cos(pa) * north[i]! + Math.sin(pa) * east[i]!) as unknown as Vec3;
  const minorSky: Vec3 = [0, 1, 2].map((i) => -Math.sin(pa) * north[i]! + Math.cos(pa) * east[i]!) as unknown as Vec3;
  const n = unit([0, 1, 2].map((i) => Math.cos(inc) * los[i]! + Math.sin(inc) * minorSky[i]!) as unknown as Vec3);
  const u = unit(major);
  const v = unit(cross(n, u));
  const d = toEcl(los);
  const km = g.kpc * KM_PER_KPC;
  return { pos: [d[0] * km, d[1] * km, d[2] * km], u: toEcl(u), v: toEcl(v), n: toEcl(n) };
}

/** A modelled picture of a galaxy, face-on, on black. */
function galaxyTexture(g: LocalGalaxy): THREE.CanvasTexture {
  const S = 512, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  const r = rng(g.seed);
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - r() * 0.999)) * Math.cos(2 * Math.PI * r());
  const glow = (x: number, y: number, rad: number, stops: Array<[number, string]>): void => {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    ctx.fillStyle = gr;
    ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  };
  const dot = (x: number, y: number, size: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
  };
  const star = (): string => {
    const k = r();
    if (k < 0.05) return `rgba(255, ${110 + Math.round(40 * r())}, ${130 + Math.round(40 * r())}, 0.9)`; // glowing gas
    if (k < 0.6) return `rgba(${170 + Math.round(40 * r())}, ${195 + Math.round(30 * r())}, 255, ${0.35 + 0.5 * r()})`;
    return `rgba(255, ${225 + Math.round(25 * r())}, ${190 + Math.round(40 * r())}, ${0.3 + 0.5 * r()})`;
  };
  if (g.kind === 'spiral') {
    glow(C, C, C * 0.95, [[0, 'rgba(150, 165, 210, 0.30)'], [0.6, 'rgba(120, 135, 190, 0.10)'], [1, 'rgba(0, 0, 0, 0)']]);
    const arms = g.arms ?? 2, k = Math.tan(((g.pitch ?? 12) * Math.PI) / 180), r0 = 0.12;
    for (let i = 0; i < 14000; i++) {
      const arm = i % arms;
      const t = Math.sqrt(r());
      const rad = r0 + (0.93 - r0) * t;
      const th = (arm * 2 * Math.PI) / arms + Math.log(rad / r0) / k + gauss() * 0.22;
      const rr = rad * (1 + gauss() * 0.05);
      dot(C + rr * C * Math.cos(th), C + rr * C * Math.sin(th), 0.5 + 1.1 * r() ** 3, star());
    }
    const b = (g.bulge ?? 0.15) * C;
    glow(C, C, b * 2.4, [[0, 'rgba(255, 236, 200, 1)'], [0.25, 'rgba(255, 215, 160, 0.7)'], [1, 'rgba(0, 0, 0, 0)']]);
  } else if (g.kind === 'irregular') {
    glow(C, C, C * 0.9, [[0, 'rgba(170, 180, 220, 0.30)'], [1, 'rgba(0, 0, 0, 0)']]);
    // A bar, then lumpy clouds of young stars.
    const bar = r() * Math.PI;
    for (let i = 0; i < 5000; i++) {
      const along = gauss() * 0.3, across = gauss() * 0.08;
      dot(C + C * (along * Math.cos(bar) - across * Math.sin(bar)), C + C * (along * Math.sin(bar) + across * Math.cos(bar)), 0.5 + r() ** 3, star());
    }
    for (let k = 0; k < 28; k++) {
      const cx = C + gauss() * C * 0.32, cy = C + gauss() * C * 0.32, sz = 0.04 + 0.08 * r();
      for (let i = 0; i < 260; i++) dot(cx + gauss() * sz * C, cy + gauss() * sz * C, 0.5 + 1.2 * r() ** 4, star());
    }
  } else {
    const q = g.axis ?? 0.8;
    ctx.save();
    ctx.translate(C, C);
    ctx.scale(1, q);
    glow(0, 0, C * 0.95, [[0, 'rgba(255, 238, 205, 1)'], [0.08, 'rgba(255, 225, 180, 0.75)'], [0.35, 'rgba(240, 205, 160, 0.25)'], [1, 'rgba(0, 0, 0, 0)']]);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The black hole's shadow and its ring of light, brighter on the side coming toward us. */
function blackHoleTexture(): THREE.CanvasTexture {
  const S = 512, C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  // Half the texture spans 12 Schwarzschild radii; the shadow is 2.6 of them.
  const shadow = (2.6 / 12) * C;
  const halo = ctx.createRadialGradient(C, C, shadow, C, C, C);
  halo.addColorStop(0, 'rgba(255, 170, 70, 0.85)');
  halo.addColorStop(0.12, 'rgba(255, 120, 40, 0.35)');
  halo.addColorStop(0.45, 'rgba(200, 70, 30, 0.08)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);
  const ring = ctx.createLinearGradient(C - shadow, 0, C + shadow, 0);
  ring.addColorStop(0, 'rgba(255, 245, 210, 1)');
  ring.addColorStop(1, 'rgba(255, 150, 60, 0.7)');
  ctx.strokeStyle = ring;
  ctx.lineWidth = shadow * 0.22;
  ctx.beginPath();
  ctx.arc(C, C, shadow * 1.06, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.beginPath();
  ctx.arc(C, C, shadow * 0.96, 0, 2 * Math.PI);
  ctx.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface Hoverable {
  readonly centre: Vec3;
  readonly radiusKm: number;
  readonly text: string;
}

export function createLocalGroup(scene: THREE.Scene, style: SkyStyle) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const makeMat = (map: THREE.Texture): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, opacity: { value: 0 }, ink: { value: 0 }, inkColour: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float opacity;
        uniform float ink;
        uniform vec3 inkColour;
        varying vec2 vUv;
        void main() {
          vec3 t = texture2D(map, vUv).rgb;
          float lum = max(t.r, max(t.g, t.b));
          if (ink > 0.5) gl_FragColor = vec4(inkColour, clamp(pow(lum, 0.8) * opacity * 1.2, 0.0, 1.0));
          else gl_FragColor = vec4(t * opacity * 1.6, 1.0);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const galaxies = LOCAL_GROUP.map((g) => {
    const place = placeGalaxy(g);
    const tex = galaxyTexture(g);
    const mat = makeMat(tex);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    scene.add(mesh);
    const D = g.diameterKpc * KM_PER_KPC;
    return {
      g,
      place,
      mat,
      tex,
      mesh,
      D,
      text: `${g.name} · ${(g.kpc * LY_PER_KPC).toLocaleString('en-US', { maximumSignificantDigits: 2 })} light years away`,
    };
  });

  const bhTex = blackHoleTexture();
  const bhMat = new THREE.MeshBasicMaterial({ map: bhTex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const bh = new THREE.Mesh(geo, bhMat);
  bh.matrixAutoUpdate = false;
  bh.frustumCulled = false;
  bh.renderOrder = 6;
  scene.add(bh);
  const BH_SIZE = 24 * SGR_A_RS_KM;

  const setStyle = (s: SkyStyle): void => {
    for (const x of galaxies) {
      x.mat.uniforms.ink!.value = s.ink ? 1 : 0;
      x.mat.uniforms.inkColour!.value = threeColour(s.milkyWayBright);
      x.mat.blending = s.ink ? THREE.NormalBlending : THREE.AdditiveBlending;
      x.mat.needsUpdate = true;
    }
  };
  setStyle(style);

  /** A plane through `centre` facing the camera (for things that look the same from every side). */
  const facing = (rel: Vec3): { u: Vec3; v: Vec3; n: Vec3 } => {
    const n = unit(rel);
    const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = unit(cross(ref, n));
    return { u, v: cross(n, u), n };
  };
  const placeMesh = (m: THREE.Mesh, rel: Vec3, u: Vec3, v: Vec3, n: Vec3, w: number, h: number): void => {
    const shrink = 1e6 / Math.max(1, Math.hypot(...rel));
    m.matrix.makeBasis(
      new THREE.Vector3(...u).multiplyScalar(w * shrink),
      new THREE.Vector3(...v).multiplyScalar(h * shrink),
      new THREE.Vector3(...n).multiplyScalar(shrink),
    );
    m.matrix.setPosition(rel[0] * shrink, rel[1] * shrink, rel[2] * shrink);
    m.matrixWorldNeedsUpdate = true;
  };

  return {
    setStyle,
    /**
     * Place everything for this camera. `centre` is Sgr A*; `fade` how much of the outside
     * view shows; `pxAngle` the view's radians per pixel.
     */
    update(cam: Vec3, centre: Vec3, fade: number, pxAngle: number): void {
      const on = fade > 0.002;
      for (const x of galaxies) {
        x.mesh.visible = on;
        x.mat.uniforms.opacity!.value = fade;
        if (!on) continue;
        const rel = sub(x.place.pos, cam);
        if (x.g.kind === 'elliptical') {
          const f = facing(rel);
          // Never smaller than a few pixels, so it can be found.
          const D = Math.max(x.D, 10 * pxAngle * Math.hypot(...rel));
          placeMesh(x.mesh, rel, f.u, f.v, f.n, D, D);
        } else {
          const D = Math.max(x.D, 14 * pxAngle * Math.hypot(...rel));
          placeMesh(x.mesh, rel, x.place.u, x.place.v, x.place.n, D, D);
        }
      }
      // The black hole is only 0.16 AU across, so from afar it is drawn as a marker at
      // least 16 px wide (its shadow and ring), growing to its true size as you come close.
      // It always faces you.
      const rel = sub(centre, cam);
      bh.visible = on || Math.hypot(...rel) < 1e5 * BH_SIZE;
      bhMat.opacity = Math.max(fade, Math.hypot(...rel) < 1e5 * BH_SIZE ? 1 : 0);
      const f = facing(rel);
      const size = Math.max(BH_SIZE, 16 * pxAngle * Math.hypot(...rel));
      placeMesh(bh, rel, f.u, f.v, f.n, size, size);
    },
    /** Names, placed just beside each thing; clicking one flies you there. */
    labels(centre: Vec3): Array<{ pos: Vec3; text: string; action: string }> {
      return [
        { pos: centre, text: 'Sgr A* · the central black hole', action: 'goto:bh' },
        ...galaxies.map((x, i) => ({ pos: x.place.pos, text: x.g.name, action: `goto:${i}` })),
      ];
    },
    /**
     * Where to go to have a look: near the black hole (60 Schwarzschild radii out, on your
     * side of it), or a neighbour from above its disc at a slant (an elliptical from your
     * side), far enough to see all of it. Looking at it, its north (or the galaxy's) up.
     */
    vantage(target: string, cam: Vec3, centre: Vec3, galacticNorth: Vec3): { pos: Vec3; target: Vec3; up: Vec3 } | null {
      const toward = (c: Vec3, dist: number): Vec3 => {
        const d = unit(sub(cam, c));
        return [c[0] + d[0] * dist, c[1] + d[1] * dist, c[2] + d[2] * dist];
      };
      if (target === 'bh') return { pos: toward(centre, 60 * SGR_A_RS_KM), target: centre, up: galacticNorth };
      const x = galaxies[Number(target)];
      if (!x) return null;
      if (x.g.kind === 'elliptical') return { pos: toward(x.place.pos, 2.2 * x.D), target: x.place.pos, up: galacticNorth };
      const { n, v } = x.place;
      // 40° from the disc's pole, on the side facing the Sun, so the face we see from home is the one we visit.
      const side = n[0] * -x.place.pos[0] + n[1] * -x.place.pos[1] + n[2] * -x.place.pos[2] >= 0 ? 1 : -1;
      const dir = unit([0, 1, 2].map((i) => side * n[i]! * Math.cos(0.7) + v[i]! * Math.sin(0.7)) as unknown as Vec3);
      const dist = 1.3 * x.D;
      const pos: Vec3 = [x.place.pos[0] + dir[0] * dist, x.place.pos[1] + dir[1] * dist, x.place.pos[2] + dir[2] * dist];
      return { pos, target: x.place.pos, up: [side * n[0], side * n[1], side * n[2]] };
    },
    /** Distance to the nearest of these (the black hole, a neighbour galaxy), km, for flying speed. */
    clearanceKm(pos: Vec3, centre: Vec3): number {
      let d = Math.hypot(...sub(pos, centre)) - SGR_A_KEEP_OUT_KM;
      for (const x of galaxies) d = Math.min(d, Math.hypot(...sub(pos, x.place.pos)) - 0.1 * x.D);
      return Math.max(1, d);
    },
    /** Never inside the innermost stable orbit of the black hole. */
    keepOut(pos: Vec3, centre: Vec3): Vec3 {
      const r = sub(pos, centre);
      const d = Math.hypot(...r);
      if (d >= SGR_A_KEEP_OUT_KM || d === 0) return pos;
      const k = SGR_A_KEEP_OUT_KM / d;
      return [centre[0] + r[0] * k, centre[1] + r[1] * k, centre[2] + r[2] * k];
    },
    /** What the pointer can name: the black hole and the neighbours. */
    hoverables(centre: Vec3): Hoverable[] {
      return [
        { centre, radiusKm: SGR_A_SHADOW_KM * 1.3, text: `Sgr A* · the galaxy’s central black hole · ${(SGR_A_MASS_SUNS / 1e6).toFixed(2)} million suns` },
        ...galaxies.map((x) => ({ centre: x.place.pos, radiusKm: x.D / 2, text: x.text })),
      ];
    },
    dispose(): void {
      for (const x of galaxies) {
        scene.remove(x.mesh);
        x.mat.dispose();
        x.tex.dispose();
      }
      scene.remove(bh);
      bhMat.dispose();
      bhTex.dispose();
      geo.dispose();
    },
  };
}
