/**
 * The ground in a Starsigns place (0.4.2): a field ringed by trees, as a flat silhouette
 * (solid black at night, solid dark green by day; no shading, no texture), standing in for
 * the place's own ground where the viewer lands. It is an illustration (the owner's
 * request), not a map: real surface detail for Earth comes with the spheres' skins
 * (docs/SPHERES.md). Units are km, in the place's own frame: x east, y north, z up, the
 * grass at z = 0. Trees stand 30 to 160 m away, in clumps with gaps, 12 to 30 m tall, so
 * from eye height they hide the lowest 5 to 30 degrees of the sky.
 */
import * as THREE from 'three';

/** A small, repeatable random sequence (the same trees every time for a place). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TreeSpot {
  /** km east, north of the viewer. */
  readonly x: number;
  readonly y: number;
  /** Height, km. */
  readonly h: number;
  /** A spruce (a narrow cone) or a broadleaf (aspen, oak: a round crown). */
  readonly kind: 'spruce' | 'broadleaf';
}

/** Where the trees stand: clumps around the field, with a few gaps to the horizon. */
export function treeSpots(seed: number, count = 220): TreeSpot[] {
  const rnd = seeded(seed);
  // Four to six gaps in the ring, where the horizon shows.
  const gaps = Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => ({ at: rnd() * Math.PI * 2, half: 0.12 + rnd() * 0.18 }));
  const out: TreeSpot[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const a = rnd() * Math.PI * 2;
    if (gaps.some((g) => Math.abs(((a - g.at + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < g.half)) continue;
    const d = 0.03 + Math.pow(rnd(), 0.8) * 0.13;
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, h: 0.012 + rnd() * 0.018, kind: rnd() < 0.45 ? 'spruce' : 'broadleaf' });
  }
  return out;
}

/** The ground's grid: lines every `step` km out to `radius` km, cut into short pieces so each fades with distance. */
export function groundGrid(step = 0.003, radius = 0.15, piece = 0.006): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const glow = new THREE.Color(0x8affc8);
  const fade = (x: number, y: number): number => Math.max(0, 1 - Math.hypot(x, y) / radius) ** 1.6 * 0.55;
  const lift = 0.00003; // 3 cm above the grass
  for (let a = -radius; a <= radius + 1e-9; a += step) {
    const half = Math.sqrt(Math.max(0, radius * radius - a * a));
    for (let b = -half; b < half; b += piece) {
      const b2 = Math.min(half, b + piece);
      for (const [x0, y0, x1, y1] of [[a, b, a, b2], [b, a, b2, a]] as const) {
        pos.push(x0, y0, lift, x1, y1, lift);
        const f0 = fade(x0, y0), f1 = fade(x1, y1);
        col.push(glow.r * f0, glow.g * f0, glow.b * f0, glow.r * f1, glow.g * f1, glow.b * f1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** The silhouette's colour at night and by day (owner, 4 Nov 2026: an outline, not a picture). */
const NIGHT = new THREE.Color(0x000000);
const DAY = new THREE.Color(0x0f2e17);

export interface Field {
  readonly group: THREE.Group;
  /** How much of it shows (0 hidden … 1 fully). */
  setOpacity(k: number): void;
  /** Its one colour, from night (0: black) to day (1: dark green). */
  setDay(d: number): void;
  dispose(): void;
}

/** The field and its trees for a place (`seed` from its latitude and longitude). */
export function createField(seed: number): Field {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  // The ground: a disc 40 km across, so it reaches the horizon (the globe's own sphere is
  // faceted and lies below it). Everything is one flat colour, unlit: a silhouette.
  const ground = new THREE.CircleGeometry(20, 96);
  geos.push(ground);
  const ink = new THREE.MeshBasicMaterial({ color: 0x000000 });
  mats.push(ink);
  group.add(new THREE.Mesh(ground, ink));

  // A light, glowing grid on the ground (owner, 4 Nov 2026: so the ground can be seen, not
  // just darkness): lines every 3 m, a few centimetres up, fading out by 150 m (among the trees).
  const grid = groundGrid();
  geos.push(grid);
  const gridMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const gridLines = new THREE.LineSegments(grid, gridMat);
  gridLines.frustumCulled = false;
  group.add(gridLines);

  // The trees: trunks, spruce cones and round crowns, as instances (three draws in all).
  const spots = treeSpots(seed);
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const coneGeo = new THREE.ConeGeometry(0.3, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const crownGeo = new THREE.IcosahedronGeometry(0.5, 3);
  geos.push(trunkGeo, coneGeo, crownGeo);
  const trunkMat = ink, coneMat = ink, crownMat = ink;
  const spruce = spots.filter((s) => s.kind === 'spruce');
  const leafy = spots.filter((s) => s.kind === 'broadleaf');
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, Math.max(1, spruce.length));
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, leafy.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const rnd = seeded(seed ^ 0x5bd1e995);
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd() * Math.PI * 2);
    const trunkH = s.kind === 'spruce' ? s.h * 0.25 : s.h * 0.45;
    m.compose(v.set(s.x, s.y, 0), q, sc.set(s.h * 0.12, s.h * 0.12, trunkH));
    trunks.setMatrixAt(i, m);
  });
  spruce.forEach((s, i) => {
    m.compose(v.set(s.x, s.y, s.h * 0.15), q.identity(), sc.set(s.h * 0.85, s.h * 0.85, s.h * 0.85));
    cones.setMatrixAt(i, m);
  });
  leafy.forEach((s, i) => {
    const w = s.h * (0.55 + rnd() * 0.25);
    m.compose(v.set(s.x, s.y, s.h * 0.62), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd() * 6), sc.set(w, w * (0.8 + rnd() * 0.3), s.h * 0.62));
    crowns.setMatrixAt(i, m);
  });
  if (!spruce.length) cones.count = 0;
  if (!leafy.length) crowns.count = 0;
  for (const im of [trunks, cones, crowns]) {
    im.frustumCulled = false;
    group.add(im);
  }

  return {
    group,
    setOpacity(k) {
      gridMat.opacity = k;
      group.visible = k > 0.001;
      const solid = k >= 0.999;
      for (const mat of mats) {
        mat.opacity = k;
        // Fully there: solid (depth-tested and written as any surface).
        if (mat.transparent === solid) {
          mat.transparent = !solid;
          mat.depthWrite = solid;
          mat.needsUpdate = true;
        }
      }
    },
    setDay(d) {
      ink.color.copy(NIGHT).lerp(DAY, Math.max(0, Math.min(1, d)));
    },
    dispose() {
      gridMat.dispose();
      geos.forEach((g) => g.dispose());
      mats.forEach((x) => x.dispose());
    },
  };
}
