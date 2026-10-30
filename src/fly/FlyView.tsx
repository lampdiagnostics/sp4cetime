/**
 * Fly mode: you are in the solar system. Loaded on demand (with Three.js) so the
 * calendar stays light. See docs/adr/0009-fly-mode.md.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BODIES, type BodyId, litFraction, solarSystemAt } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import { moonPhase } from '../core/models';
import { addSeconds, formatTime, fromUnixMs, type Time } from '../core/time';
import { MoonIcon, moonPhaseName } from '../app/MoonIcon';
import {
  cruiseSpeed,
  DESTINATIONS,
  type Destination,
  find,
  lookAt,
  type Frame,
  nearest,
  type Pose,
  poseFrom,
  pushOut,
  vantage,
  worldOf,
} from './flight';
import { createOverlays, type OverlayOptions } from './overlays';
import { createScene } from './scene';
import { apparentDiameter, type ArcPosition, arcPosition, bodySphere, formatDMS, formatLat, formatLon, raySphere, sphereOf } from '../core/spheres';
import type { Theme } from '../core/theme';

interface Props {
  onExit: () => void;
  theme: Theme;
  overlays: OverlayOptions;
  onOverlays: (change: Partial<OverlayOptions>) => void;
}

const RATES: ReadonlyArray<{ label: string; rate: number }> = [
  { label: 'Pause', rate: 0 },
  { label: 'Live', rate: 1 },
  { label: '1 min/s', rate: 60 },
  { label: '1 h/s', rate: 3600 },
  { label: '1 day/s', rate: 86_400 },
];

/** Lenses: from the naked-eye wide view to a telescope. Narrower = bigger. */
const LENSES: ReadonlyArray<{ label: string; fov: number }> = [
  { label: 'Wide', fov: 60 },
  { label: '×3', fov: 20 },
  { label: '×12', fov: 5 },
  { label: '×60', fov: 1 },
];

type Measure = 'near' | 'sun' | 'galaxy';

interface Hud {
  time: Time;
  nearName: string;
  /** The camera's arc position on the chosen sphere. */
  sphereName: string;
  arc: ArcPosition;
  decimals: number;
  flattening: number;
  speedRadii: number;
  moonLit: number;
  moonPhase: number;
  frame: Frame;
  anchorName: string;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const NAME = (id: BodyId): string => BODIES.find((b) => b.id === id)?.name ?? id;

/** One of x, y, z in radii of the sphere, rounded to what matters. */
function radii(a: ArcPosition, i: 0 | 1 | 2): string {
  const v = a.r === 0 ? 0 : (a.xyz[i] / a.r) * a.radii;
  if (Math.abs(v) < 5e-5 * Math.max(1, a.radii)) return '0';
  return Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString('en-US') : v.toPrecision(4);
}

/** Apparent size, compact: "17°16′", "31′05″", "2.1″". */
function formatSize(rad: number): string {
  const sec = (rad * 180 * 3600) / Math.PI;
  return formatDMS(rad, sec < 10 ? 2 : sec < 600 ? 1 : 0, true);
}

function clock(t: Time): string {
  const p = (n: number): string => String(Math.floor(n)).padStart(2, '0');
  return `${formatTime(t, 3600)} · ${p(t.sec / 3600)}:${p((t.sec % 3600) / 60)}:${p(t.sec % 60)} GMT`;
}

export default function FlyView({ onExit, theme, overlays, onOverlays }: Props) {
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [rate, setRate] = useState(1);
  const [fov, setFov] = useState(60);
  const [measure, setMeasure] = useState<Measure>('near');
  const measureRef = useRef<Measure>('near');
  measureRef.current = measure;
  const tipRef = useRef<HTMLDivElement>(null);
  const fovRef = useRef(60);
  const chooseLens = (f: number): void => {
    fovRef.current = f;
    setFov(f);
  };
  const [error, setError] = useState<string | null>(null);

  // Mutable state the render loop reads.
  const poseRef = useRef<Pose | null>(null);
  const flightRef = useRef<{ fromPos: Vec3; fromQuat: THREE.Quaternion; to: Pose; start: number; ms: number } | null>(null);
  const timeRef = useRef({ baseReal: Date.now(), baseSim: fromUnixMs(Date.now()), rate: 1 });
  const goRef = useRef<(d: Destination) => void>(() => {});
  const frameRef = useRef<(f: Frame) => void>(() => {});

  const simNow = (): Time => {
    const t = timeRef.current;
    return addSeconds(t.baseSim, ((Date.now() - t.baseReal) / 1000) * t.rate);
  };
  const changeRate = (r: number): void => {
    timeRef.current = { baseReal: Date.now(), baseSim: simNow(), rate: r };
    setRate(r);
  };
  const backToNow = (): void => {
    timeRef.current = { baseReal: Date.now(), baseSim: fromUnixMs(Date.now()), rate: 1 };
    setRate(1);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const labelHost = labelsRef.current;
    if (!canvas || !labelHost) return;
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(canvas);
    } catch {
      setError('3D needs WebGL, which this browser or device does not provide.');
      return;
    }
    const resize = (): void => {
      const r = canvas.getBoundingClientRect();
      scene.resize(r.width, r.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Start at geostationary orbit, with Earth and the Moon in view.
    // Start like the calendar: the Sun in the centre, its paths flowing past.
    const aspect = (): number => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    poseRef.current = vantage('overview', solarSystemAt(simNow()), aspect()).pose;
    const paths = createOverlays(scene.scene, theme);

    goRef.current = (d) => {
      const bodies = solarSystemAt(simNow());
      const cur = poseRef.current ? worldOf(poseRef.current, bodies) : vantage(d, bodies, aspect());
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      flightRef.current = { fromPos: cur.pos, fromQuat: cur.quat, to: vantage(d, bodies, aspect()).pose, start: performance.now(), ms: reduced ? 0 : 2200 };
    };
    // Turn smoothly to face a body, staying where you are.
    const aim = (id: BodyId): void => {
      const p = poseRef.current;
      if (!p) return;
      const bodies = solarSystemAt(simNow());
      const w = worldOf(p, bodies);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(w.quat);
      const q = lookAt(w.pos, find(bodies, id).pos, [up.x, up.y, up.z]);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      flightRef.current = { fromPos: w.pos, fromQuat: w.quat, to: poseFrom(w.pos, q, p.anchor, p.frame, bodies), start: performance.now(), ms: reduced ? 0 : 900 };
    };
    frameRef.current = (f) => {
      const p = poseRef.current;
      if (!p) return;
      const bodies = solarSystemAt(simNow());
      const w = worldOf(p, bodies);
      poseRef.current = poseFrom(w.pos, w.quat, p.anchor, f, bodies);
    };

    // Labels: one element per body, positioned each frame.
    const gridLabels: HTMLDivElement[] = [];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.className = 'fly-grid-label';
      el.style.display = 'none';
      labelHost.appendChild(el);
      gridLabels.push(el);
    }
    const labels = new Map<BodyId, HTMLDivElement>();
    for (const b of BODIES) {
      const el = document.createElement('div');
      el.className = 'fly-label';
      el.title = `Look at ${b.name}`;
      el.addEventListener('click', () => aim(b.id));
      labelHost.appendChild(el);
      labels.set(b.id, el);
    }

    // Input: drag to look, WASD/RF to move, Q/E to roll, scroll or pinch to move forward.
    const keys = new Set<string>();
    let look = { x: 0, y: 0 };
    let dolly = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      flightRef.current = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    let hover: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      hover = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        look.x += e.clientX - prev.x;
        look.y += e.clientY - prev.y;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) dolly += (d - pinch) * 0.01;
        pinch = d;
      }
    };
    const onLeave = (): void => {
      hover = null;
    };
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      flightRef.current = null;
      dolly += -e.deltaY * (e.ctrlKey ? 0.02 : 0.004);
    };
    const typing = (): boolean => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'x' || k === '+' || k === '=' || k === '-') {
        const i = LENSES.findIndex((l) => l.fov === fovRef.current);
        const j = Math.max(0, Math.min(LENSES.length - 1, i + (k === 'z' || k === '+' || k === '=' ? 1 : -1)));
        chooseLens(LENSES[j]!.fov);
        return;
      }
      if (['w', 'a', 's', 'd', 'r', 'f', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.add(k);
        flightRef.current = null;
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      keys.delete(e.key.toLowerCase());
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0), zAxis = new THREE.Vector3(0, 0, 1);
    const tick = (ts: number): void => {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      const now = simNow();
      const bodies = solarSystemAt(now);
      let pos: Vec3;
      let quat: THREE.Quaternion;
      const fl = flightRef.current;
      if (fl) {
        const k = fl.ms === 0 ? 1 : Math.min(1, (ts - fl.start) / fl.ms);
        const e = ease(k);
        const to = worldOf(fl.to, bodies);
        pos = [0, 1, 2].map((i) => fl.fromPos[i]! + (to.pos[i]! - fl.fromPos[i]!) * e) as unknown as Vec3;
        quat = fl.fromQuat.clone().slerp(to.quat, e);
        if (k >= 1) {
          poseRef.current = fl.to;
          flightRef.current = null;
        }
      } else {
        const p = poseRef.current as Pose;
        const w = worldOf(p, bodies);
        pos = w.pos;
        quat = w.quat;
        // Look: turn about the camera's own up and right axes.
        const fov = (scene.camera.fov * Math.PI) / 180;
        const perPx = fov / Math.max(1, canvas.clientHeight);
        const arrows = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
        const arrowsY = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
        const yaw = look.x * perPx + arrows * 0.9 * dt * (fovRef.current / 60);
        const pitch = look.y * perPx + arrowsY * 0.9 * dt * (fovRef.current / 60);
        const roll = ((keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0)) * 0.9 * dt;
        look = { x: 0, y: 0 };
        quat = quat
          .multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, yaw))
          .multiply(new THREE.Quaternion().setFromAxisAngle(xAxis, pitch))
          .multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, roll));
        // Move: speed scales with altitude above the nearest surface.
        const near = nearest(pos, bodies);
        const v = cruiseSpeed(near.altitude) * (keys.has('shift') ? 5 : 1);
        const move = new THREE.Vector3(
          (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
          (keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0),
          (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) - dolly * 10,
        );
        dolly = 0;
        if (move.lengthSq() > 0) {
          move.multiplyScalar(v * dt).applyQuaternion(quat);
          pos = pushOut([pos[0] + move.x, pos[1] + move.y, pos[2] + move.z], bodies);
        }
        // Ride with whichever body is clearly closest.
        let anchor = p.anchor;
        let frame = p.frame;
        const anchorAlt = Math.hypot(...pos.map((c, i) => c - find(bodies, anchor).pos[i]!)) - find(bodies, anchor).info.radiusKm;
        const near2 = nearest(pos, bodies);
        if (near2.id !== anchor && near2.altitude < anchorAlt * 0.6) {
          anchor = near2.id;
          frame = 'inertial';
        }
        poseRef.current = poseFrom(pos, quat, anchor, frame, bodies);
      }

      const gl = paths.update(overlaysRef.current, now, bodies, pos);
      scene.setFov(fovRef.current);
      scene.render(bodies, pos, quat);

      // Labels.
      const cam = scene.camera;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const v3 = new THREE.Vector3();
      const placed: Array<[number, number]> = [];
      for (const b of bodies) {
        const el = labels.get(b.info.id);
        if (!el) continue;
        const rel = new THREE.Vector3(b.pos[0] - pos[0], b.pos[1] - pos[1], b.pos[2] - pos[2]);
        const d = rel.length();
        v3.copy(rel).project(cam);
        const behind = rel.clone().applyQuaternion(quat.clone().invert()).z > 0;
        if (behind || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) {
          el.style.display = 'none';
          continue;
        }
        const angR = Math.asin(Math.min(1, b.info.radiusKm / d));
        const pxR = (angR / ((cam.fov * Math.PI) / 180)) * H;
        const lx = ((v3.x + 1) / 2) * W + Math.max(6, pxR * 0.72), ly = ((1 - v3.y) / 2) * H - Math.max(6, pxR * 0.72);
        // Don't stack names: a body right beside one already named (the Moon by Earth, from afar) stays unnamed.
        if (placed.some(([x, y]) => Math.abs(x - lx) < 60 && Math.abs(y - ly) < 12)) {
          el.style.display = 'none';
          continue;
        }
        placed.push([lx, ly]);
        el.style.display = 'block';
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        el.textContent = `${b.info.name} · ${formatSize(apparentDiameter(b.info.radiusKm, d))}`;
      }

      // Grid labels.
      const inv = quat.clone().invert();
      for (let i = 0; i < gridLabels.length; i++) {
        const el = gridLabels[i]!;
        const g = gl[i];
        if (!g) {
          el.style.display = 'none';
          continue;
        }
        const rel = new THREE.Vector3(g.pos[0] - pos[0], g.pos[1] - pos[1], g.pos[2] - pos[2]);
        const z = rel.clone().applyQuaternion(inv).z;
        v3.copy(rel).project(cam);
        if (z > 0 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        el.style.color = g.kind === 'time' ? theme.tickText : theme.distanceText;
        el.style.transform = `translate(${((v3.x + 1) / 2) * W + 4}px, ${((1 - v3.y) / 2) * H + (g.kind === 'time' ? -16 : 2)}px)`;
        if (el.textContent !== g.text) el.textContent = g.text;
      }

      // Under the pointer: the arc position on whichever sphere it touches.
      const tip = tipRef.current;
      if (tip) {
        let text = '';
        if (hover) {
          const dir = new THREE.Vector3((hover.x / W) * 2 - 1, 1 - (hover.y / H) * 2, 0.5).unproject(cam).normalize();
          const dv: Vec3 = [dir.x, dir.y, dir.z];
          let best: { t: number; b: (typeof bodies)[number] } | null = null;
          for (const b of bodies) {
            const t = raySphere([0, 0, 0], dv, [b.pos[0] - pos[0], b.pos[1] - pos[1], b.pos[2] - pos[2]], b.info.radiusKm);
            if (t !== null && (!best || t < best.t)) best = { t, b };
          }
          if (best) {
            const hit: Vec3 = [pos[0] + dv[0] * best.t, pos[1] + dv[1] * best.t, pos[2] + dv[2] * best.t];
            const a = arcPosition(hit, bodySphere(best.b));
            const where = best.b.info.id === 'sun' ? 'ecliptic' : '';
            text = `${best.b.info.name} · ${formatLat(a.lat, 0)} · ${formatLon(a.lon, 0)}${where ? ` (${where})` : ''}`;
          }
        }
        tip.style.display = text ? 'block' : 'none';
        if (text && hover) {
          tip.textContent = text;
          tip.style.transform = `translate(${hover.x + 14}px, ${hover.y + 14}px)`;
        }
      }

      if (ts - hudAt > 160) {
        hudAt = ts;
        const near = nearest(pos, bodies);
        const earth = find(bodies, 'earth'), moon = find(bodies, 'moon');
        const p = poseRef.current;
        setHud({
          time: now,
          nearName: NAME(near.id),
          ...(() => {
            const m = measureRef.current;
            const sphere = sphereOf(m === 'near' ? near.id : m, bodies, now);
            const nearR = find(bodies, near.id).info.radiusKm;
            return {
              sphereName: sphere.name,
              arc: arcPosition(pos, sphere),
              decimals: m === 'galaxy' ? 6 : m === 'sun' ? 2 : 1,
              flattening: m === 'galaxy' ? 0 : find(bodies, sphere.id as BodyId).info.flattening,
              speedRadii: cruiseSpeed(near.altitude) / nearR,
            };
          })(),
          moonLit: litFraction(moon.pos, earth.pos),
          moonPhase: moonPhase(now),
          frame: p?.frame ?? 'inertial',
          anchorName: NAME(p?.anchor ?? near.id),
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      labels.forEach((el) => el.remove());
      gridLabels.forEach((el) => el.remove());
      paths.dispose();
      scene.dispose();
    };
    // Set up once; the loop reads live values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fly">
      <canvas ref={canvasRef} className="fly-canvas" aria-label="Flying in the solar system. Drag to look around; W A S D to move, R and F up and down, Q and E to roll, Shift to go faster; scroll to move forward; Z and X change the lens." />
      <div ref={labelsRef} className="fly-labels" aria-hidden="true" />
      <div ref={tipRef} className="fly-tip" aria-hidden="true" />
      {error && <p className="fly-error">{error}</p>}

      <header className="corner tl fly-hud">
        <div className="brand">
          sp4cetime <span>Fly</span>
        </div>
        {hud && (
          <>
            <div className="fly-time">{clock(hud.time)}</div>
            <div className="fly-where" aria-live="off">
              <label>
                Position on{' '}
                <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} aria-label="Sphere to measure from">
                  <option value="near">{hud.nearName} (nearest)</option>
                  <option value="sun">the Sun</option>
                  <option value="galaxy">the galaxy (Sgr A*)</option>
                </select>
              </label>
              <div className="dms">
                {formatLat(hud.arc.lat, hud.decimals)} · {formatLon(hud.arc.lon, hud.decimals)}
              </div>
              <div className="facts">
                <span title={`Distance from the centre of ${hud.sphereName}, in its radii`}>
                  {hud.arc.radii < 1000 ? hud.arc.radii.toFixed(4) : Math.round(hud.arc.radii).toLocaleString('en-US')} radii out
                </span>
                <span title="x, y, z in radii of the sphere: x toward longitude 0, z toward north">
                  x {radii(hud.arc, 0)} · y {radii(hud.arc, 1)} · z {radii(hud.arc, 2)}
                </span>
              </div>
              <div className="facts">
                <span>cruise {hud.speedRadii.toPrecision(3)} {hud.nearName} radii/s</span>
                {hud.flattening > 0 && (
                  <span title="The model is a perfect sphere; this is how the real body differs">
                    real shape flattened 1/{Math.round(1 / hud.flattening)}
                  </span>
                )}
              </div>
            </div>
            <div className="facts">
              <span className="moon" title="The Moon as seen from Earth now">
                <MoonIcon phase={hud.moonPhase} size={16} />
                Moon from Earth: {Math.round(hud.moonLit * 100)}% lit, {moonPhaseName(hud.moonPhase).toLowerCase()}
              </span>
            </div>
          </>
        )}
      </header>

      <nav className="corner tr" aria-label="Fly mode">
        <button type="button" className="primary" onClick={onExit}>
          ← Calendar
        </button>
      </nav>

      <nav className="corner bl" aria-label="Go to">
        <div className="presets">
          {DESTINATIONS.map((d) => (
            <button key={d.id} type="button" onClick={() => goRef.current(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        {hud && (
          <div className="row toggles" role="group" aria-label="Overlays">
            {([
              ['spirals', 'Spirals'],
              ['orbits', 'Orbits'],
              ['timeGrid', 'Time grid'],
              ['spaceGrid', 'Space grid'],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={overlays[k]} onClick={() => onOverlays({ [k]: !overlays[k] })}>
                {label}
              </button>
            ))}
          </div>
        )}
        {hud && (
          <label className="fly-hold">
            <input
              type="checkbox"
              checked={hud.frame === 'body'}
              onChange={(e) => frameRef.current(e.target.checked ? 'body' : 'inertial')}
            />
            Turn with {hud.anchorName}
            {hud.anchorName === 'Earth' && hud.frame === 'body' ? ' (geostationary)' : ''}
          </label>
        )}
      </nav>

      <nav className="corner br" aria-label="Time">
        <div className="segmented" role="group" aria-label="Time rate">
          {RATES.map((r) => (
            <button key={r.label} type="button" aria-pressed={rate === r.rate} onClick={() => changeRate(r.rate)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Lens">
          {LENSES.map((l) => (
            <button key={l.label} type="button" aria-pressed={fov === l.fov} onClick={() => chooseLens(l.fov)} title={`${l.fov}° field of view`}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={backToNow}>
            Back to now
          </button>
        </div>
        <p className="note">Click a name to face it · Drag to look · W A S D move · R F up/down · Q E roll · Shift faster · scroll forward · Z / X lens</p>
        <p className="note">True sizes, distances and sunlight. Grid lines mark latitude and longitude.</p>
      </nav>
    </div>
  );
}
