/**
 * The real sky as seen from the solar system: a sphere at infinity around you,
 * like a planetarium dome that covers every direction. It holds the 5,000 stars
 * visible to the eye (Hipparcos, to magnitude 6) in their true colours, the Milky
 * Way, the constellation figures, and the zodiac along the ecliptic.
 *
 * It has no depth: it turns with your view but never comes closer, however far
 * you fly (at these distances the stars do not visibly shift).
 * Data: d3-celestial (BSD-3-Clause), built by scripts/build_sky.py.
 */
import * as THREE from 'three';
import { ECL_TO_EQ, type Vec3 } from '../core/geometry';

export interface SkyData {
  readonly stars: readonly number[]; // ra, dec, mag, b−v, …
  readonly names: ReadonlyArray<{ name: string; ra: number; dec: number; mag: number }>;
  readonly constellations: ReadonlyArray<{
    id: string;
    name: string;
    ra: number;
    dec: number;
    zodiac: boolean;
    lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  }>;
}

export interface SkyOptions {
  readonly constellations: boolean;
  readonly zodiac: boolean;
}

export interface SkyLabel {
  /** Direction, ecliptic frame (unit vector). */
  readonly dir: Vec3;
  readonly text: string;
  readonly kind: 'star' | 'constellation' | 'zodiacFigure' | 'sign';
}

const SKY_KM = 1e12;
const DEG = Math.PI / 180;

/** The twelve signs of the (tropical) zodiac, from the March equinox, 30° each. */
export const SIGNS = [
  ['♈︎', 'Aries'],
  ['♉︎', 'Taurus'],
  ['♊︎', 'Gemini'],
  ['♋︎', 'Cancer'],
  ['♌︎', 'Leo'],
  ['♍︎', 'Virgo'],
  ['♎︎', 'Libra'],
  ['♏︎', 'Scorpio'],
  ['♐︎', 'Sagittarius'],
  ['♑︎', 'Capricorn'],
  ['♒︎', 'Aquarius'],
  ['♓︎', 'Pisces'],
] as const;

/** Equatorial right ascension / declination (degrees) → unit vector, equatorial frame. */
export const eqDir = (ra: number, dec: number): Vec3 => {
  const a = ra * DEG, d = dec * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
/** Equatorial → ecliptic (J2000). */
export const toEcl = (v: Vec3): Vec3 => [
  ECL_TO_EQ[0][0] * v[0] + ECL_TO_EQ[1][0] * v[1] + ECL_TO_EQ[2][0] * v[2],
  ECL_TO_EQ[0][1] * v[0] + ECL_TO_EQ[1][1] * v[1] + ECL_TO_EQ[2][1] * v[2],
  ECL_TO_EQ[0][2] * v[0] + ECL_TO_EQ[1][2] * v[1] + ECL_TO_EQ[2][2] * v[2],
];
/** Ecliptic longitude / latitude (degrees) → unit vector, ecliptic frame. */
const eclDir = (lon: number, lat: number): Vec3 => {
  const a = lon * DEG, b = lat * DEG;
  return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
};

/** Star colour from its B−V index (blue-white hot stars to orange cool ones), softened toward white. */
function starColour(bv: number): THREE.Color {
  const stops: Array<[number, number, number, number]> = [
    [-0.4, 0.61, 0.69, 1.0],
    [0.0, 0.79, 0.84, 1.0],
    [0.4, 1.0, 0.96, 0.92],
    [0.8, 1.0, 0.87, 0.72],
    [1.2, 1.0, 0.8, 0.6],
    [2.0, 1.0, 0.7, 0.45],
  ];
  const x = Math.max(-0.4, Math.min(2, bv));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1]![0]) i++;
  const [x0, r0, g0, b0] = stops[i]!, [x1, r1, g1, b1] = stops[i + 1]!;
  const t = (x - x0) / (x1 - x0);
  const mix = (a: number, b: number): number => 0.75 * (a + (b - a) * t) + 0.25;
  return new THREE.Color(mix(r0, r1), mix(g0, g1), mix(b0, b1));
}

/** Brightness of the Milky Way (0–1) at a right ascension and declination, degrees. */
export interface MilkyWayMap {
  at(ra: number, dec: number): number;
}

async function loadMilkyWay(url: string): Promise<MilkyWayMap> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const get = (x: number, y: number): number => px[(((y + H) % H) * W + ((x + W) % W)) * 4]! / 255;
  return {
    at(ra, dec) {
      // Bilinear, wrapping in right ascension.
      const fx = (((ra % 360) + 360) % 360) / 360 * W - 0.5, fy = ((90 - dec) / 180) * H - 0.5;
      const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
      const tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
      const top = get(x0, y0) * (1 - tx) + get(x0 + 1, y0) * tx;
      const bot = get(x0, y0 + 1) * (1 - tx) + get(x0 + 1, y0 + 1) * tx;
      return top * (1 - ty) + bot * ty;
    },
  };
}

export async function loadSky(base: string): Promise<{ data: SkyData; milkyWay: MilkyWayMap }> {
  const [data, milkyWay] = await Promise.all([
    fetch(`${base}sky/sky.json`).then((r) => {
      if (!r.ok) throw new Error(`sky.json: ${r.status}`);
      return r.json() as Promise<SkyData>;
    }),
    loadMilkyWay(`${base}sky/milkyway.png`),
  ]);
  return { data, milkyWay };
}

export function createSky(scene: THREE.Scene, data: SkyData, milkyWay: MilkyWayMap, pixelRatio: number) {
  const disposables: Array<{ dispose(): void }> = [];
  const eq = new THREE.Group(); // equatorial frame, turned into the ecliptic frame
  eq.matrixAutoUpdate = false;
  eq.matrix.makeBasis(
    new THREE.Vector3(...ECL_TO_EQ[0]),
    new THREE.Vector3(...ECL_TO_EQ[1]),
    new THREE.Vector3(...ECL_TO_EQ[2]),
  );
  eq.matrix.scale(new THREE.Vector3(SKY_KM, SKY_KM, SKY_KM));
  const ecl = new THREE.Group(); // ecliptic frame
  ecl.scale.setScalar(SKY_KM);
  scene.add(eq, ecl);
  const behind = (o: THREE.Object3D, order: number): void => {
    o.renderOrder = order;
    o.frustumCulled = false;
  };

  // Milky Way: a finely divided sphere whose vertices take their brightness from the
  // map (sampled here, so there is no texture seam), blended smoothly between them.
  const mwGeo = new THREE.SphereGeometry(1, 360, 180);
  const vp = mwGeo.getAttribute('position') as THREE.BufferAttribute;
  const mwCol = new Float32Array(vp.count * 3);
  for (let i = 0; i < vp.count; i++) {
    const x = vp.getX(i), y = vp.getY(i), z = vp.getZ(i);
    const b = milkyWay.at(Math.atan2(y, x) / DEG, Math.asin(Math.max(-1, Math.min(1, z))) / DEG) * 0.32;
    mwCol.set([0.62 * b, 0.68 * b, 0.86 * b], i * 3);
  }
  mwGeo.setAttribute('color', new THREE.BufferAttribute(mwCol, 3));
  const mwMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    // Drawn first, in the opaque pass, so bodies always cover it.
    blending: THREE.AdditiveBlending,
  });
  const mw = new THREE.Mesh(mwGeo, mwMat);
  behind(mw, -20);
  eq.add(mw);
  disposables.push(mwMat, mwGeo);

  // Stars: size and brightness from magnitude, colour from B−V.
  const n = data.stars.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, bv] = [data.stars[i * 4]!, data.stars[i * 4 + 1]!, data.stars[i * 4 + 2]!, data.stars[i * 4 + 3]!];
    const d = eqDir(ra, dec);
    pos.set(d, i * 3);
    const c = starColour(bv);
    const light = Math.min(1, 0.42 + 1.2 * 10 ** (-0.25 * mag));
    col.set([c.r * light, c.g * light, c.b * light], i * 3);
    size[i] = 2.2 + 5.2 * 10 ** (-0.2 * (mag + 1.5));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float pixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.25, 1.0, r);
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: false,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  behind(starPoints, -19);
  eq.add(starPoints);
  disposables.push(starGeo, starMat);

  const lineSet = (pts: number[], colour: number, opacity: number, parent: THREE.Group): THREE.LineSegments => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    // Additive with the colour pre-dimmed, so it stays in the opaque pass behind the bodies.
    const m = new THREE.LineBasicMaterial({
      color: new THREE.Color(colour).multiplyScalar(opacity),
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const l = new THREE.LineSegments(g, m);
    behind(l, -18);
    parent.add(l);
    disposables.push(g, m);
    return l;
  };

  // Constellation figures. A straight line between two stars on the sphere, seen
  // from its centre, is the great circle between them, as on a planetarium dome.
  const figure = (zodiac: boolean): number[] => {
    const pts: number[] = [];
    for (const c of data.constellations) {
      if (c.zodiac !== zodiac) continue;
      for (const line of c.lines) {
        for (let i = 1; i < line.length; i++) {
          pts.push(...eqDir(line[i - 1]![0], line[i - 1]![1]), ...eqDir(line[i]![0], line[i]![1]));
        }
      }
    }
    return pts;
  };
  const figures = lineSet(figure(false), 0x7f9bd6, 0.32, eq);
  const zodiacFigures = lineSet(figure(true), 0xf0c674, 0.6, eq);

  // The zodiac: the ecliptic, the band 8° either side, and the twelve 30° signs.
  const band: number[] = [];
  const circle = (lat: number): void => {
    for (let l = 0; l < 360; l += 2) band.push(...eclDir(l, lat), ...eclDir(l + 2, lat));
  };
  circle(0);
  const edges: number[] = [];
  for (let l = 0; l < 360; l += 2) edges.push(...eclDir(l, 8), ...eclDir(l + 2, 8), ...eclDir(l, -8), ...eclDir(l + 2, -8));
  for (let k = 0; k < 12; k++) for (let b = -8; b < 8; b += 2) edges.push(...eclDir(k * 30, b), ...eclDir(k * 30, b + 2));
  const ecliptic = lineSet(band, 0xf0c674, 0.55, ecl);
  const signs = lineSet(edges, 0xf0c674, 0.22, ecl);

  // Labels (directions in the ecliptic frame).
  const starLabels: SkyLabel[] = data.names.map((s) => ({ dir: toEcl(eqDir(s.ra, s.dec)), text: s.name, kind: 'star' }));
  const conLabels: SkyLabel[] = data.constellations.map((c) => ({
    dir: toEcl(eqDir(c.ra, c.dec)),
    text: c.name,
    kind: c.zodiac ? 'zodiacFigure' : 'constellation',
  }));
  const signLabels: SkyLabel[] = SIGNS.map(([glyph, name], k) => ({ dir: eclDir(k * 30 + 15, 9.5), text: `${glyph} ${name}`, kind: 'sign' }));

  return {
    /** Show or hide parts; returns the labels to place. */
    update(o: SkyOptions): SkyLabel[] {
      figures.visible = o.constellations;
      zodiacFigures.visible = o.constellations || o.zodiac;
      ecliptic.visible = signs.visible = o.zodiac;
      return [
        ...(o.constellations ? [...starLabels, ...conLabels.filter((l) => l.kind === 'constellation')] : []),
        ...(o.constellations || o.zodiac ? conLabels.filter((l) => l.kind === 'zodiacFigure') : []),
        ...(o.zodiac ? signLabels : []),
      ];
    },
    dispose(): void {
      scene.remove(eq, ecl);
      disposables.forEach((d) => d.dispose());
    },
  };
}
