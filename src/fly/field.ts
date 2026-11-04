/**
 * The ground in a Starsigns place (0.4.2): a grassy field ringed by trees, standing in for
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

/** A tile of grass: green with darker and lighter blades (no detail is claimed for any real place). */
function grassTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#3f6b2a';
  ctx.fillRect(0, 0, S, S);
  const rnd = seeded(7);
  for (let i = 0; i < 2600; i++) {
    const g = 70 + Math.floor(rnd() * 70);
    ctx.strokeStyle = `rgba(${Math.floor(g * 0.55)}, ${g + 20}, ${Math.floor(g * 0.35)}, ${0.35 + rnd() * 0.4})`;
    ctx.lineWidth = 1;
    const x = rnd() * S, y = rnd() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface Field {
  readonly group: THREE.Group;
  /** How much of it shows (0 hidden … 1 fully). */
  setOpacity(k: number): void;
  dispose(): void;
}

/** The field and its trees for a place (`seed` from its latitude and longitude). */
export function createField(seed: number): Field {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const keep = <M extends THREE.Material>(m: M): M => (mats.push(m), m);

  // The grass: a disc 20 km across, so it reaches the horizon (the globe's own sphere is
  // faceted and lies below it), lighter blades near, one even green far off.
  const tex = grassTexture();
  tex.repeat.set(4000, 4000);
  const ground = new THREE.CircleGeometry(20, 96);
  // UVs over the disc: 4000 tiles across 40 km, so a tile is 10 m.
  const pos = ground.attributes.position as THREE.BufferAttribute;
  const uv = ground.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 40 + 0.5, pos.getY(i) / 40 + 0.5);
  geos.push(ground);
  const grassMat = keep(new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff }));
  group.add(new THREE.Mesh(ground, grassMat));

  // The trees: trunks, spruce cones and round crowns, as instances (three draws in all).
  const spots = treeSpots(seed);
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const coneGeo = new THREE.ConeGeometry(0.3, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const crownGeo = new THREE.IcosahedronGeometry(0.5, 1);
  geos.push(trunkGeo, coneGeo, crownGeo);
  const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x4a3626 }));
  const coneMat = keep(new THREE.MeshLambertMaterial({ color: 0x1f3d24 }));
  const crownMat = keep(new THREE.MeshLambertMaterial({ color: 0x35582a, flatShading: true }));
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
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((x) => x.dispose());
      tex.dispose();
    },
  };
}
