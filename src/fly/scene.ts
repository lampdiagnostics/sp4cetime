/**
 * The Three.js scene for flying (docs/adr/0009-fly-mode.md). Loaded only when
 * Fly mode opens. Everything is placed relative to the camera each frame
 * ("floating origin"), computed in double precision, so positions stay exact
 * whether you are 400 km above Earth or out past Neptune.
 */
import * as THREE from 'three';
import { BODIES, type BodyId, type BodyInfo, type BodyState } from '../core/bodies';
import type { Vec3 } from '../core/geometry';

/** Surface colours (approximate true colours; no invented surface detail). */
export const BODY_COLORS: Record<BodyId, number> = {
  sun: 0xfff4e0,
  mercury: 0x8c8680,
  venus: 0xe6d3a3,
  earth: 0x2f62b5,
  moon: 0x9d9a93,
  mars: 0xc1603a,
  jupiter: 0xd8b48a,
  saturn: 0xe3cf98,
  uranus: 0xa4dce3,
  neptune: 0x5a7ee0,
  pluto: 0xcbb69c,
};

export interface FlyScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  /** Place everything for this moment and camera, then draw. */
  render(bodies: readonly BodyState[], camPos: Vec3, camQuat: THREE.Quaternion): void;
  /** Lens: vertical field of view in degrees (narrow = telescope). */
  setFov(deg: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Latitude/longitude wireframe on a unit sphere, every 15°. */
function graticule(): THREE.BufferGeometry {
  const pts: number[] = [];
  const seg = 96;
  for (let lat = -75; lat <= 75; lat += 15) {
    const phi = (lat * Math.PI) / 180;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      pts.push(Math.cos(phi) * Math.cos(a), Math.cos(phi) * Math.sin(a), Math.sin(phi));
      pts.push(Math.cos(phi) * Math.cos(b), Math.cos(phi) * Math.sin(b), Math.sin(phi));
    }
  }
  for (let lon = 0; lon < 360; lon += 15) {
    const l = (lon * Math.PI) / 180;
    for (let i = 0; i < seg / 2; i++) {
      const a = -Math.PI / 2 + (i / (seg / 2)) * Math.PI, b = -Math.PI / 2 + ((i + 1) / (seg / 2)) * Math.PI;
      pts.push(Math.cos(a) * Math.cos(l), Math.cos(a) * Math.sin(l), Math.sin(a));
      pts.push(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** Saturn's main rings as radial bands, from published radii (km). */
function ringTexture(inner: number, outer: number): THREE.CanvasTexture {
  const W = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 1;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const band = (r0: number, r1: number, alpha: number, tone: number): void => {
    const x0 = ((r0 - inner) / (outer - inner)) * W, x1 = ((r1 - inner) / (outer - inner)) * W;
    ctx.fillStyle = `rgba(${tone}, ${Math.round(tone * 0.93)}, ${Math.round(tone * 0.82)}, ${alpha})`;
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), 1);
  };
  band(74_658, 92_000, 0.18, 170); // C ring
  band(92_000, 117_580, 0.9, 236); // B ring
  band(117_580, 122_170, 0.06, 150); // Cassini Division
  band(122_170, 133_423, 0.65, 220); // A ring (inner)
  band(133_423, 133_745, 0.05, 150); // Encke Gap
  band(133_745, 136_775, 0.6, 215); // A ring (outer)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rings(info: BodyInfo): THREE.Mesh | null {
  if (!info.rings) return null;
  const [inner, outer] = info.rings;
  const R = info.radiusKm;
  const geo = new THREE.RingGeometry(inner / R, outer / R, 256, 1);
  // Radial texture coordinate: 0 at the inner edge, 1 at the outer edge.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i)) * R;
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshLambertMaterial({ map: ringTexture(inner, outer), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

/** Thin limb glow on Earth, brightest on the sunlit side. */
function atmosphere(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunDir;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 6.0);
        float day = clamp(dot(vNormal, sunDir) * 0.8 + 0.25, 0.0, 1.0);
        gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * rim * day * 0.6, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 96), mat);
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,248,230,1)');
  g.addColorStop(0.08, 'rgba(255,236,190,0.9)');
  g.addColorStop(0.25, 'rgba(255,200,120,0.25)');
  g.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function stars(): THREE.Points {
  const N = 5000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  let seed = 230;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const d = 1e12;
    pos[i * 3] = r * Math.cos(a) * d;
    pos[i * 3 + 1] = r * Math.sin(a) * d;
    pos[i * 3 + 2] = u * d;
    const b = 0.25 + 0.75 * rnd() ** 3;
    col[i * 3] = b * (0.85 + 0.15 * rnd());
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}

export function createScene(canvas: HTMLCanvasElement): FlyScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // Units are kilometres. A logarithmic depth buffer keeps 10 m and 10 billion km both sharp.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1e13);

  scene.add(stars());
  // The Sun is the only real light. A faint ambient term stands in for earthshine and scatter.
  const sunLight = new THREE.PointLight(0xffffff, Math.PI, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.035));

  const grid = graticule();
  const meshes = new Map<BodyId, THREE.Mesh>();
  let earthAtmosphere: THREE.Mesh | null = null;
  for (const info of BODIES) {
    const geo = new THREE.SphereGeometry(1, 128, 96);
    // SphereGeometry's pole is +y; turn it so the body's pole is +z (matching its axes).
    geo.rotateX(Math.PI / 2);
    const mat =
      info.id === 'sun'
        ? new THREE.MeshBasicMaterial({ color: BODY_COLORS.sun })
        : new THREE.MeshLambertMaterial({ color: BODY_COLORS[info.id] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    if (info.id !== 'sun') {
      const lines = new THREE.LineSegments(
        grid,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      lines.scale.setScalar(1.002);
      mesh.add(lines);
    } else {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(12);
      mesh.add(glow);
    }
    const ring = rings(info);
    if (ring) mesh.add(ring);
    if (info.id === 'earth') {
      earthAtmosphere = atmosphere();
      mesh.add(earthAtmosphere);
    }
    scene.add(mesh);
    meshes.set(info.id, mesh);
  }

  const basis = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  return {
    renderer,
    camera,
    scene,
    render(bodies, camPos, camQuat) {
      camera.position.set(0, 0, 0);
      camera.quaternion.copy(camQuat);
      camera.updateMatrixWorld();
      for (const b of bodies) {
        const mesh = meshes.get(b.info.id);
        if (!mesh) continue;
        const [x, y, z] = b.axes;
        const R = b.info.radiusKm;
        // Floating origin: subtract in double precision before handing floats to the GPU.
        basis.makeBasis(tmp.set(x[0], x[1], x[2]), new THREE.Vector3(y[0], y[1], y[2]), new THREE.Vector3(z[0], z[1], z[2]));
        basis.scale(new THREE.Vector3(R, R, R));
        basis.setPosition(b.pos[0] - camPos[0], b.pos[1] - camPos[1], b.pos[2] - camPos[2]);
        mesh.matrix.copy(basis);
        mesh.matrixWorldNeedsUpdate = true;
        if (b.info.id === 'sun') sunLight.position.set(b.pos[0] - camPos[0], b.pos[1] - camPos[1], b.pos[2] - camPos[2]);
      }
      const earth = bodies.find((b) => b.info.id === 'earth');
      if (earth && earthAtmosphere) {
        const d = Math.hypot(...earth.pos);
        const sunDirWorld = new THREE.Vector3(-earth.pos[0] / d, -earth.pos[1] / d, -earth.pos[2] / d);
        (earthAtmosphere.material as THREE.ShaderMaterial).uniforms.sunDir!.value.copy(sunDirWorld.transformDirection(camera.matrixWorldInverse));
      }
      renderer.render(scene, camera);
    },
    setFov(deg) {
      if (camera.fov === deg) return;
      camera.fov = deg;
      camera.updateProjectionMatrix();
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
    },
  };
}
