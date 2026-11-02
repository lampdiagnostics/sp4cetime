/**
 * The real sky as seen from the solar system: a sphere at infinity around you,
 * like a planetarium dome that covers every direction. It holds the 5,000 stars
 * visible to the eye (Hipparcos, to magnitude 6) in their true colours, the Milky
 * Way, the constellation figures, and the zodiac along the ecliptic.
 *
 * It has no depth: it turns with your view but never comes closer, however far
 * you fly (at these distances the stars do not visibly shift).
 * Its look comes from the theme's sky style: light on black (Dark), neon (Colour), or a
 * negative in dark ink on paper (Bright), where brighter means darker.
 * Data: d3-celestial (BSD-3-Clause), built by scripts/build_sky.py.
 */
import * as THREE from 'three';
import { ECL_TO_EQ, ECL_TO_GAL, type Vec3 } from '../core/geometry';
import { parseColour } from '../core/colour';
import { eclDir, eqDir, GALACTIC_MARKS, SIGNS, toEcl } from '../core/skyfigures';
import type { SkyStyle } from '../core/theme';

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
  /** Degrees the signs have slid from their J2000 places by the viewed date (houses.ts skyOfDate). */
  readonly equinoxShift?: number;
  /** A Starsigns chart: the place's horizon and its 12 houses on the sky (directions in the ecliptic frame). */
  readonly chart?: SkyChart | null;
}

export interface SkyChart {
  /** Straight up at the place (unit, ecliptic frame): the horizon is the great circle 90° from it. */
  readonly zenith: Vec3;
  /** The 12 house cusps as directions on the ecliptic, house 1 first. */
  readonly cusps: readonly Vec3[];
  /** Where each house's number goes (the middle of the house, just below the zodiac band). */
  readonly middles: readonly Vec3[];
  readonly asc: Vec3;
  readonly mc: Vec3;
  /** Changes when the chart does (the geometry is rebuilt only then). */
  readonly key: string;
}

export { GALACTIC_MARKS, SIGNS } from '../core/skyfigures';

export interface SkyLabel {
  /** Direction, ecliptic frame (unit vector). */
  readonly dir: Vec3;
  readonly text: string;
  readonly kind: 'star' | 'constellation' | 'zodiacFigure' | 'sign' | 'galactic' | 'house';
}

// The sky is drawn first with depth testing off, so its size does not matter as long as it
// is beyond the near plane (at most 1,000 km) and inside the far one; a modest radius keeps
// the GPU's arithmetic precise.
const SKY_KM = 1e5;
const DEG = Math.PI / 180;

export { eqDir, toEcl } from '../core/skyfigures';

/**
 * A theme colour as a Three.js colour (alpha dropped). For our own shaders (`raw`, the
 * default) the numbers go to the screen as they are, as in the calendar's canvas; for
 * Three's built-in materials and the background (`raw` false) they are read as sRGB, which
 * those convert back on output. Either way the screen shows the theme's exact colour.
 */
export function threeColour(c: string, raw = true): THREE.Color {
  const { rgb } = parseColour(c);
  return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, raw ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace);
}

/**
 * Blending for things drawn behind the bodies. Light on a dark sky adds; ink on a light
 * sky is laid over it by its alpha. Either way it stays in the opaque pass (transparent
 * false), drawn first, so the bodies always cover it.
 */
export function skyBlending(m: THREE.Material, ink: boolean): void {
  if (ink) {
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
  } else {
    m.blending = THREE.AdditiveBlending;
  }
  m.transparent = false;
  m.needsUpdate = true;
}

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

export function createSky(scene: THREE.Scene, data: SkyData, milkyWay: THREE.Texture, pixelRatio: number, style: SkyStyle) {
  const disposables: Array<{ dispose(): void }> = [];
  /** 1 near the Sun; fades to 0 far away, where this sky (seen from here) no longer applies. */
  const fadeU = { value: 1 };
  const inkU = { value: style.ink ? 1 : 0 };
  let current = style;
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
  const mwU = {
    map: { value: milkyWay },
    fade: fadeU,
    ink: inkU,
    faint: { value: threeColour(style.milkyWayFaint) },
    bright: { value: threeColour(style.milkyWayBright) },
    strength: { value: style.milkyWayStrength },
  };
  const mwMat = new THREE.ShaderMaterial({
    uniforms: mwU,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float fade;
      uniform float ink;
      uniform vec3 faint;
      uniform vec3 bright;
      uniform float strength;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float l = atan(d.y, d.x);
        float b = asin(clamp(d.z, -1.0, 1.0));
        // Galactic centre in the middle of the map, longitude increasing to the left.
        vec2 uv = vec2(fract(0.5 - l / 6.28318530718), 0.5 + b / 3.14159265359);
        float v = texture2D(map, uv).r;
        // The theme's faint colour in the thin arms, its bright colour toward the bulge.
        vec3 tint = mix(faint, bright, smoothstep(0.35, 0.9, v));
        if (ink > 0.5) {
          // A negative: ink laid on the paper, darker where the sky is brighter.
          gl_FragColor = vec4(tint, clamp(pow(v, 0.75) * strength * fade, 0.0, 1.0));
        } else {
          gl_FragColor = vec4(tint * v * strength * fade, 1.0);
        }
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  skyBlending(mwMat, style.ink);
  const mwGeo = new THREE.SphereGeometry(1, 96, 48);
  const mw = new THREE.Mesh(mwGeo, mwMat);
  behind(mw, -20);
  gal.add(mw);
  disposables.push(mwMat, mwGeo, milkyWay);

  // Stars: size and brightness from magnitude, colour from B−V.
  const n = data.stars.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), lightA = new Float32Array(n);
  // In ink (Bright) stars are drawn exactly as in the calendar's sky (src/app/skyBackdrop.ts):
  // solid dots of the same size and strength, not glows, which vanish on paper.
  const inkSize = new Float32Array(n), inkLight = new Float32Array(n);
  const bright: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, bv] = [data.stars[i * 4]!, data.stars[i * 4 + 1]!, data.stars[i * 4 + 2]!, data.stars[i * 4 + 3]!];
    const d = eqDir(ra, dec);
    pos.set(d, i * 3);
    const c = starColour(bv);
    // Brighter stars are larger and brighter, with a wider gap between bright and faint.
    lightA[i] = Math.min(1, 0.3 + 1.5 * 10 ** (-0.3 * mag));
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 2.0 + 12 * 10 ** (-0.3 * (mag + 1.5));
    inkSize[i] = 1.1 * 1.25 * (1.1 + 7 * 10 ** (-0.3 * (mag + 1.5)));
    inkLight[i] = mag > 5.5 ? 0 : Math.min(1, 0.45 + 1.5 * 10 ** (-0.3 * mag));
    if (mag < 3.2) bright.push(toEcl(d));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('light', new THREE.BufferAttribute(lightA, 1));
  starGeo.setAttribute('inkSize', new THREE.BufferAttribute(inkSize, 1));
  starGeo.setAttribute('inkLight', new THREE.BufferAttribute(inkLight, 1));
  const starU = {
    pixelRatio: { value: pixelRatio },
    fade: fadeU,
    ink: inkU,
    tint: { value: threeColour(style.starTint) },
    tintMix: { value: style.starTintMix },
    strength: { value: style.starStrength },
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starU,
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float light;
      attribute float inkSize;
      attribute float inkLight;
      attribute vec3 color;
      uniform float pixelRatio;
      uniform float ink;
      varying vec3 vColor;
      varying float vLight;
      varying float vPx;
      void main() {
        vColor = color;
        vLight = ink > 0.5 ? inkLight : light;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vPx = max(1.0, (ink > 0.5 ? inkSize : size) * pixelRatio);
        gl_PointSize = vPx;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vLight;
      varying float vPx;
      uniform float fade;
      uniform float ink;
      uniform vec3 tint;
      uniform float tintMix;
      uniform float strength;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        vec3 c = mix(vColor, tint, tintMix);
        if (ink > 0.5) {
          // A solid dot with an antialiased edge, as the calendar draws them.
          float a = 1.0 - smoothstep(1.0 - 2.0 / vPx, 1.0, r);
          gl_FragColor = vec4(c, clamp(a * vLight * strength * fade, 0.0, 1.0));
        } else {
          // A bright core and a soft halo.
          float a = (1.0 - smoothstep(0.15, 0.55, r)) + 0.35 * (1.0 - smoothstep(0.3, 1.0, r));
          gl_FragColor = vec4(c * a * vLight * strength * fade, 1.0);
        }
      }`,
    depthTest: false,
    depthWrite: false,
  });
  skyBlending(starMat, style.ink);
  const starPoints = new THREE.Points(starGeo, starMat);
  behind(starPoints, -19);
  eq.add(starPoints);
  disposables.push(starGeo, starMat);

  type LineKind = 'figures' | 'zodiac' | 'galactic';
  const lineMats: Array<{ m: THREE.LineBasicMaterial; kind: LineKind; opacity: number }> = [];
  const styleLine = (l: (typeof lineMats)[number]): void => {
    const base = threeColour(current[l.kind], false);
    const f = fadeU.value;
    if (current.ink) {
      // Ink is a little stronger, as dark lines on paper read fainter.
      l.m.color.copy(base);
      l.m.opacity = Math.min(1, l.opacity * 1.3 * f);
    } else {
      // Additive with the colour pre-dimmed, so it stays in the opaque pass behind the bodies.
      l.m.color.copy(base).multiplyScalar(l.opacity * f);
      l.m.opacity = 1;
    }
  };
  const lineSet = (pts: number[], kind: LineKind, opacity: number, parent: THREE.Group): THREE.LineSegments => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ depthTest: false, depthWrite: false });
    skyBlending(m, current.ink);
    const entry = { m, kind, opacity };
    lineMats.push(entry);
    styleLine(entry);
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
  const figures = lineSet(figure(false), 'figures', 0.32, eq);
  const zodiacFigures = lineSet(figure(true), 'zodiac', 0.6, eq);

  // The zodiac: the ecliptic, the band 8° either side, and the twelve 30° signs.
  const band: number[] = [];
  const circle = (lat: number): void => {
    for (let l = 0; l < 360; l += 2) band.push(...eclDir(l, lat), ...eclDir(l + 2, lat));
  };
  circle(0);
  const edges: number[] = [];
  for (let l = 0; l < 360; l += 2) edges.push(...eclDir(l, 8), ...eclDir(l + 2, 8), ...eclDir(l, -8), ...eclDir(l + 2, -8));
  for (let k = 0; k < 12; k++) for (let b = -8; b < 8; b += 2) edges.push(...eclDir(k * 30, b), ...eclDir(k * 30, b + 2));
  const ecliptic = lineSet(band, 'zodiac', 0.55, ecl);
  const signs = lineSet(edges, 'zodiac', 0.22, ecl);

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
  const galLines = lineSet(galPts, 'galactic', 0.5, gal);
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
  // The signs are counted from the equinox of the viewed date: their lines turn about the
  // ecliptic pole and their names move with them (rebuilt only when the shift changes).
  let signShift = 0;
  const signLabelsAt = (shift: number): SkyLabel[] =>
    SIGNS.map(([glyph, name], k) => ({ dir: eclDir(k * 30 + 15 - shift, 9.5), text: `${glyph} ${name}`, kind: 'sign' }));
  let signLabels = signLabelsAt(0);

  // A Starsigns chart: the horizon ring and the house boundaries, rebuilt when the chart changes.
  let chartLines: THREE.LineSegments | null = null;
  let chartKey = '';
  let chartLabels: SkyLabel[] = [];
  const setChart = (c: SkyChart | null | undefined): void => {
    const key = c?.key ?? '';
    if (key === chartKey) return;
    chartKey = key;
    if (chartLines) {
      ecl.remove(chartLines);
      chartLines.geometry.dispose();
      const i = lineMats.findIndex((l) => l.m === chartLines!.material);
      if (i >= 0) lineMats.splice(i, 1);
      (chartLines.material as THREE.Material).dispose();
      chartLines = null;
    }
    chartLabels = [];
    if (!c) return;
    const pts: number[] = [];
    // The horizon: the great circle 90° from the zenith.
    const z = c.zenith;
    const a: Vec3 = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cr = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const nrm = (p: Vec3): Vec3 => {
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      return [p[0] / l, p[1] / l, p[2] / l];
    };
    const u = nrm(cr(z, a)), w = cr(z, u);
    const ring = (k: number): Vec3 => {
      const t = (k / 180) * Math.PI;
      return [u[0] * Math.cos(t) + w[0] * Math.sin(t), u[1] * Math.cos(t) + w[1] * Math.sin(t), u[2] * Math.cos(t) + w[2] * Math.sin(t)];
    };
    for (let k = 0; k < 360; k += 1) pts.push(...ring(k), ...ring(k + 1));
    // Each house boundary: a line across the zodiac band (perpendicular to the ecliptic) at the cusp.
    for (const d of c.cusps) {
      const lon = Math.atan2(d[1], d[0]) * (180 / Math.PI);
      for (let b = -14; b < 14; b += 2) pts.push(...eclDir(lon, b), ...eclDir(lon, b + 2));
    }
    chartLines = lineSet(pts, 'zodiac', 0.85, ecl);
    chartLabels = [
      ...c.middles.map((dir, i) => ({ dir, text: `House ${i + 1}`, kind: 'house' as const })),
      { dir: c.asc, text: '↑ ASC', kind: 'house' as const },
      { dir: c.mc, text: 'MC', kind: 'house' as const },
    ];
  };

  return {
    /** Directions (ecliptic) of the brighter stars, which labels keep clear of. */
    brightStars: bright as readonly Vec3[],
    /** Restyle for another theme; nothing moves. */
    setStyle(s: SkyStyle): void {
      current = s;
      inkU.value = s.ink ? 1 : 0;
      mwU.faint.value = threeColour(s.milkyWayFaint);
      mwU.bright.value = threeColour(s.milkyWayBright);
      mwU.strength.value = s.milkyWayStrength;
      starU.tint.value = threeColour(s.starTint);
      starU.tintMix.value = s.starTintMix;
      starU.strength.value = s.starStrength;
      skyBlending(mwMat, s.ink);
      skyBlending(starMat, s.ink);
      for (const l of lineMats) {
        skyBlending(l.m, s.ink);
        styleLine(l);
      }
    },
    /** How much of this sky to show (0–1): it is the sky as seen from the solar system. */
    setFade(f: number): void {
      if (f === fadeU.value) return;
      fadeU.value = f;
      lineMats.forEach(styleLine);
      eq.visible = ecl.visible = gal.visible = f > 0.002;
    },
    /** Show or hide parts; returns the labels to place. */
    update(o: SkyOptions): SkyLabel[] {
      if (fadeU.value < 0.3) return [];
      figures.visible = o.constellations;
      zodiacFigures.visible = o.constellations || o.zodiac;
      ecliptic.visible = signs.visible = o.zodiac;
      galLines.visible = o.galactic;
      setChart(o.chart);
      if (chartLines) chartLines.visible = !!o.chart;
      const shift = o.equinoxShift ?? 0;
      if (Math.abs(shift - signShift) > 0.005) {
        signShift = shift;
        signs.rotation.z = (-shift * Math.PI) / 180;
        signLabels = signLabelsAt(shift);
      }
      return [
        ...(o.constellations ? [...starLabels, ...conLabels.filter((l) => l.kind === 'constellation')] : []),
        ...(o.constellations || o.zodiac ? conLabels.filter((l) => l.kind === 'zodiacFigure') : []),
        ...(o.zodiac ? signLabels : []),
        ...(o.galactic ? galLabels : []),
        ...chartLabels,
      ];
    },
    dispose(): void {
      scene.remove(eq, ecl, gal);
      disposables.forEach((d) => d.dispose());
    },
  };
}
