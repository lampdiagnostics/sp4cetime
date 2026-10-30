/**
 * The Milky Way seen from outside, at true scale and in its true place: a disc
 * 40 kpc across centred on Sgr A*, in the galactic plane. It is a schematic model
 * (public/sky/galaxy.jpg, scripts/build_galaxy.py), since no one has seen our
 * galaxy from outside. It fades in as you leave the Sun's neighbourhood, as the
 * sky seen from the Sun (sky.ts) fades out.
 */
import * as THREE from 'three';
import { KM_PER_PARSEC } from '../core/constants';
import { ECL_TO_GAL, KM_PER_LIGHT_YEAR, type Vec3 } from '../core/geometry';
import { galaxySphere } from '../core/spheres';
import type { Time } from '../core/time';

export const KM_PER_KPC = KM_PER_PARSEC * 1000;
/** Half the width of the galaxy map, kpc (see scripts/build_galaxy.py). */
const HALF_KPC = 20;
/** Spiral pitch and arm radii at the Sun's azimuth, kpc (as in the map). */
const PITCH = (12 * Math.PI) / 180;
const ARMS: ReadonlyArray<readonly [string, number, number]> = [
  ['Perseus Arm', 10.0, 200],
  ['Sagittarius–Carina Arm', 7.16, 215],
  ['Scutum–Centaurus Arm', 5.13, 250],
  ['Norma Arm', 3.67, 290],
  ['Outer Arm', 3.67 * Math.exp(Math.tan(PITCH) * 2 * Math.PI), 120],
];

export interface GalaxyLabel {
  readonly pos: Vec3;
  readonly text: string;
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
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Galactocentric (X along galactic x, Y along galactic y, in the plane), kpc → heliocentric ecliptic km. */
function galToEcl(centre: Vec3, X: number, Y: number, Z = 0): Vec3 {
  const g = [ECL_TO_GAL[0], ECL_TO_GAL[1], ECL_TO_GAL[2]];
  return [0, 1, 2].map((i) => centre[i]! + (g[0]![i]! * X + g[1]![i]! * Y + g[2]![i]! * Z) * KM_PER_KPC) as unknown as Vec3;
}

export function createGalaxy(scene: THREE.Scene, map: THREE.Texture) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const size = 2 * HALF_KPC * KM_PER_KPC;
  // Map columns run along galactic +y and rows (downward) along galactic +x, so the
  // plane's x axis is galactic y and its y axis is galactic −x; its normal is the
  // north galactic pole.
  const gx = new THREE.Vector3(...ECL_TO_GAL[0]), gy = new THREE.Vector3(...ECL_TO_GAL[1]), gz = new THREE.Vector3(...ECL_TO_GAL[2]);
  const basis = new THREE.Matrix4().makeBasis(gy.clone().multiplyScalar(size), gx.clone().multiplyScalar(-size), gz);

  return {
    /** Place the disc for this moment and camera; returns labels while it is visible. */
    update(now: Time, cam: Vec3): GalaxyLabel[] {
      const c = galaxySphere(now).centre;
      const fade = galaxyFade(Math.hypot(...cam));
      mat.opacity = fade;
      mesh.visible = fade > 0.002;
      // Drawn shrunk toward the camera by the same factor in size and distance, so it
      // looks exactly the same but the GPU never interpolates across 10^18 km (which
      // loses the texture). Nothing else is visible at these scales, so depth is moot.
      const rel = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]];
      const shrink = 1e6 / Math.max(1, Math.hypot(...rel));
      mesh.matrix.copy(basis).scale(new THREE.Vector3(shrink, shrink, shrink)).setPosition(rel[0]! * shrink, rel[1]! * shrink, rel[2]! * shrink);
      mesh.matrixWorldNeedsUpdate = true;
      if (fade < 0.5) return [];
      const k = Math.tan(PITCH);
      return [
        { pos: c, text: 'Sgr A* · the galaxy’s central black hole' },
        { pos: [0, 0, 0], text: '☉ The Sun (you are here)' },
        ...ARMS.map(([name, a, deg]) => {
          const phi = (deg * Math.PI) / 180;
          const r = a * Math.exp(k * (phi - Math.PI));
          return { pos: galToEcl(c, r * Math.cos(phi), r * Math.sin(phi)), text: name };
        }),
      ];
    },
    dispose(): void {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
      map.dispose();
    },
  };
}

/** Where to stand to see the whole galaxy: above the north galactic pole, the Sun toward the bottom. */
export function galaxyVantage(now: Time): { pos: Vec3; target: Vec3; up: Vec3 } {
  const c = galaxySphere(now).centre;
  const pos = galToEcl(c, 0, 0, 40);
  return { pos, target: c, up: [ECL_TO_GAL[0][0], ECL_TO_GAL[0][1], ECL_TO_GAL[0][2]] };
}
