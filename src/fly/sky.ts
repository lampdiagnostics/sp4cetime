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
import { ECL_TO_EQ, ECL_TO_GAL, type Vec3 } from '../core/geometry';

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
  readonly galactic: boolean;
}

/** Galactic longitudes marked on the sky, with their names. */
export const GALACTIC_MARKS: ReadonlyArray<readonly [number, string]> = [
  [0, 'Galactic Centre · Sgr A*'],
  [90, 'l 90° · the Sun’s direction of travel'],
  [180, 'Galactic Anticentre'],
  [270, 'l 270° · behind the Sun'],
];

export interface SkyLabel {
  /** Direction, ecliptic frame (unit vector). */
  readonly dir: Vec3;
  readonly text: string;
  readonly kind: 'star' | 'constellation' | 'zodiacFigure' | 'sign' | 'galactic';
}

// The sky is drawn first with depth testing off, so its size does not matter as long as it
// is inside the camera's range; a small radius keeps the GPU's arithmetic precise.
const SKY_KM = 1000;
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

export async function loadSky(base: string): Promise<{ data: SkyData; milkyWay: THREE.Texture }> {
  const [data, milkyWay] = await Promise.all([
    fetch(`${base}sky/sky.json`).then((r) => {
      if (!r.ok) throw new Error(`sky.json: ${r.status}`);
      return r.json() as Promise<SkyData>;
    }),
    new THREE.TextureLoader().loadAsync(`${base}sky/milkyway.jpg`),
  ]);
  // No mipmaps: the map wraps at l = ±180°, and mipmap selection would draw a seam there.
  milkyWay.generateMipmaps = false;
  milkyWay.minFilter = THREE.LinearFilter;
  milkyWay.wrapS = THREE.RepeatWrapping;
  return { data, milkyWay };
}

export function createSky(scene: THREE.Scene, data: SkyData, milkyWay: THREE.Texture, pixelRatio: number) {
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
  const gal = new THREE.Group(); // galactic frame (x to the galactic centre, z to the north galactic pole)
  gal.matrixAutoUpdate = false;
  gal.matrix.makeBasis(
    new THREE.Vector3(...ECL_TO_GAL[0]),
    new THREE.Vector3(...ECL_TO_GAL[1]),
    new THREE.Vector3(...ECL_TO_GAL[2]),
  );
  gal.matrix.scale(new THREE.Vector3(SKY_KM, SKY_KM, SKY_KM));
  scene.add(eq, ecl, gal);
  const behind = (o: THREE.Object3D, order: number): void => {
    o.renderOrder = order;
    o.frustumCulled = false;
  };

  // Milky Way: a photographic map in galactic coordinates, looked up by direction.
  const mwMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: milkyWay } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float l = atan(d.y, d.x);
        float b = asin(clamp(d.z, -1.0, 1.0));
        // Galactic centre in the middle of the map, longitude increasing to the left.
        vec2 uv = vec2(fract(0.5 - l / 6.28318530718), 0.5 + b / 3.14159265359);
        float v = texture2D(map, uv).r;
        // Warmer toward the bright bulge, cooler in the faint arms.
        vec3 tint = mix(vec3(0.55, 0.62, 0.85), vec3(0.95, 0.88, 0.78), smoothstep(0.35, 0.9, v));
        gl_FragColor = vec4(tint * v * 0.5, 1.0);
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    // Drawn first, in the opaque pass, so bodies always cover it.
    blending: THREE.AdditiveBlending,
  });
  const mwGeo = new THREE.SphereGeometry(1, 96, 48);
  const mw = new THREE.Mesh(mwGeo, mwMat);
  behind(mw, -20);
  gal.add(mw);
  disposables.push(mwMat, mwGeo, milkyWay);

  // Stars: size and brightness from magnitude, colour from B−V.
  const n = data.stars.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, bv] = [data.stars[i * 4]!, data.stars[i * 4 + 1]!, data.stars[i * 4 + 2]!, data.stars[i * 4 + 3]!];
    const d = eqDir(ra, dec);
    pos.set(d, i * 3);
    const c = starColour(bv);
    // Brighter stars are larger and brighter, with a wider gap between bright and faint.
    const light = Math.min(1, 0.3 + 1.5 * 10 ** (-0.3 * mag));
    col.set([c.r * light, c.g * light, c.b * light], i * 3);
    size[i] = 2.0 + 12 * 10 ** (-0.3 * (mag + 1.5));
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
        // A bright core and a soft halo.
        float a = (1.0 - smoothstep(0.15, 0.55, r)) + 0.35 * (1.0 - smoothstep(0.3, 1.0, r));
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

  // The galaxy: its equator (b = 0) and four marks around it: the centre (Sgr A*),
  // the anticentre, and the two points halfway between, 90° either side, one of
  // which (l = 90°, in Cygnus) is the way the Sun is travelling.
  const galDir = (l: number, b: number): Vec3 => {
    const a = l * DEG, c = b * DEG;
    return [Math.cos(c) * Math.cos(a), Math.cos(c) * Math.sin(a), Math.sin(c)];
  };
  const galPts: number[] = [];
  for (let l = 0; l < 360; l += 1.5) if (Math.floor(l / 3) % 2 === 0) galPts.push(...galDir(l, 0), ...galDir(l + 1.5, 0));
  const ring = (l: number, r: number): void => {
    for (let k = 0; k < 48; k++) {
      const a0 = (k / 48) * 2 * Math.PI, a1 = ((k + 1) / 48) * 2 * Math.PI;
      galPts.push(...galDir(l + r * Math.cos(a0), r * Math.sin(a0)), ...galDir(l + r * Math.cos(a1), r * Math.sin(a1)));
    }
  };
  for (const l of [0, 90, 180, 270]) {
    ring(l, 1.6);
    ring(l, l === 0 ? 3.2 : 0.6);
  }
  const galLines = lineSet(galPts, 0xb9a7ff, 0.5, gal);
  const toEclFromGal = (v: Vec3): Vec3 => [
    ECL_TO_GAL[0][0] * v[0] + ECL_TO_GAL[1][0] * v[1] + ECL_TO_GAL[2][0] * v[2],
    ECL_TO_GAL[0][1] * v[0] + ECL_TO_GAL[1][1] * v[1] + ECL_TO_GAL[2][1] * v[2],
    ECL_TO_GAL[0][2] * v[0] + ECL_TO_GAL[1][2] * v[1] + ECL_TO_GAL[2][2] * v[2],
  ];
  const galLabels: SkyLabel[] = GALACTIC_MARKS.map(([l, text]) => ({ dir: toEclFromGal(galDir(l, 3.5)), text, kind: 'galactic' }));

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
      galLines.visible = o.galactic;
      return [
        ...(o.constellations ? [...starLabels, ...conLabels.filter((l) => l.kind === 'constellation')] : []),
        ...(o.constellations || o.zodiac ? conLabels.filter((l) => l.kind === 'zodiacFigure') : []),
        ...(o.zodiac ? signLabels : []),
        ...(o.galactic ? galLabels : []),
      ];
    },
    dispose(): void {
      scene.remove(eq, ecl, gal);
      disposables.forEach((d) => d.dispose());
    },
  };
}
