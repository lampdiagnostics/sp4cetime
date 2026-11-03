/**
 * Fly mode, and the whole galaxy: the 3D view. It has no controls of its own: the
 * app's shared controls drive it (through `command` and its props), the same controls
 * as the calendar's. Loaded on demand with Three.js so the calendar stays light.
 * See docs/adr/0009-fly-mode.md, 0012 and 0013.
 *
 * Drag to turn around what you are looking at (as dragging turns the calendar). Trackpad:
 * scroll to look around, pinch to widen or narrow the view (you stay put),
 * Shift + scroll or pinch to space the time and space grids. W A S D move you. Backing
 * away past 1,000 AU from the Sun warps you out to the whole galaxy; flying in on the
 * galaxy (or at the Sun from out there, or clicking it) warps you back.
 */
import { type CSSProperties, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BODIES, type BodyId, solarSystemAt } from '../core/bodies';
import type { Vec3 } from '../core/geometry';
import type { Time } from '../core/time';
import {
  aboveNorth,
  arrivalView,
  cruiseSpeed,
  type Destination,
  find,
  isWarp,
  lookAt,
  nearest,
  overviewView,
  type Pose,
  poseFrom,
  pushOut,
  vantage,
  WARP_HINT_KM,
  WARP_IN_ANGLE,
  WARP_OUT_KM,
  warpPoint,
  worldOf,
} from './flight';
import { createOverlays, type OverlayOptions } from './overlays';
import { createScene } from './scene';
import { WHEEL_RADII } from '../core/starsigns';
import { createWheel } from './wheel';
import { createSky, loadSky, type SkyChart, type SkyLabel } from './sky';
import { createGalaxy, galaxyFade, GAL_NORTH, loadGalaxyMap, RULER_STATEMENT, warpOutVantage } from './galaxy';
import { apparentDiameter, type ArcPosition, arcPosition, bodySphere, formatDMS, formatLat, formatLon, raySphere, sphereOf } from '../core/spheres';
import type { Theme } from '../core/theme';
import type { PlanetId } from '../core/planets';
import { CALENDAR_AXES } from '../core/paths3d';
import { chartAt, eclipticDirOfDate, formatSignDeg, houseOf, lonOfDateFromVector, signOf as signOfLon, skyOfDate, zenithDir } from '../core/houses';
import { type FlyState, logLerp } from '../core/path';
import { createGovernor } from '../core/quality';

/**
 * What a path needs from the 3D view: read where you are, put you somewhere exactly, and
 * fly there (the promise says whether the flight finished or was interrupted).
 */
export interface FlyApi {
  getState(): FlyState & { readonly look: Vec3; readonly inGalaxy: boolean };
  setState(s: FlyState): void;
  flyTo(s: FlyState): Promise<boolean>;
  /** To the calendar's own view in 3D, turned as given (where the calendar and 3D meet). */
  flyOverview(axes: readonly [Vec3, Vec3, Vec3]): Promise<boolean>;
}

/** What the shared controls ask of the 3D view. `seq` makes each request a new one. */
export type FlyCommand = { readonly seq: number } & (
  | {
      /** Arrive from the calendar: stand at its view in 3D (turned as it is), then optionally go on. */
      readonly kind: 'enter';
      readonly axes: readonly [Vec3, Vec3, Vec3];
      readonly then?: { readonly go: Destination } | { readonly above: BodyId } | { readonly warpOut: true };
    }
  | { readonly kind: 'go'; readonly dest: Destination }
  | { readonly kind: 'above'; readonly id: BodyId }
  | { readonly kind: 'face'; readonly id: BodyId }
  | { readonly kind: 'dolly'; readonly amount: number }
  | { readonly kind: 'level' }
);

export type Measure = 'near' | 'sun' | 'galaxy';

/** What the shared readout shows while in 3D. */
export interface FlyHud {
  readonly nearName: string;
  readonly sphereName: string;
  readonly arc: ArcPosition;
  readonly decimals: number;
  readonly flattening: number;
  readonly speedRadii: number;
  readonly inGalaxy: boolean;
  readonly hint: string;
  /** "Space grid · 2 million km between lines", or the galaxy's light-year ruler. */
  readonly statement: string;
  /** The space grid's scale bar: its spacing, km (0 when there is none, as out in the galaxy), and on screen, px. */
  readonly bar: { readonly km: number; readonly px: number };
}

interface Props {
  /** Showing now (the calendar is hidden). While not, nothing is drawn and keys are ignored. */
  active: boolean;
  /** This window is the chosen one (of several): only it takes the keyboard. */
  focused?: boolean;
  theme: Theme;
  overlays: OverlayOptions;
  /** The simulated present, shared with the calendar. */
  clock: () => Time;
  /** The zoom preset's span (seconds across): paths reach half of it into past and future. */
  spanSeconds: number;
  measure: Measure;
  command: FlyCommand | null;
  /** Shift + scroll or pinch: zoom time, as in the calendar (the grids' units follow it). */
  onTimeZoom: (factor: number) => void;
  onHud: (h: FlyHud) => void;
  /** The 3D view's API for paths, once it is ready (null when it goes). */
  onApi?: (api: FlyApi | null) => void;
  /** A tap (touch) on the view that hit nothing: show or hide the controls. */
  onEmptyTap?: () => void;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Speed of light, km/s. */
const C_KM_S = 299_792.458;
const WARP_MS = 3600;
/** Field of view, degrees (vertical). */
const FOV = 60;
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const NAME = (id: BodyId): string => BODIES.find((b) => b.id === id)?.name ?? id;

/** A body's outline on screen, for keeping labels from showing through it. */
interface Disc {
  x: number;
  y: number;
  r: number;
  /** Distance from the camera, km. */
  d: number;
  id: BodyId;
  /** Rings, as an ellipse: semi-axes and the major axis's screen direction. */
  ring?: { a: number; b: number; ux: number; uy: number };
}
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
function discCovers(c: Disc, r: Rect): boolean {
  const cx = Math.max(r.x0, Math.min(c.x, r.x1)), cy = Math.max(r.y0, Math.min(c.y, r.y1));
  if (Math.hypot(cx - c.x, cy - c.y) <= c.r) return true;
  if (!c.ring) return false;
  const { a, b, ux, uy } = c.ring;
  for (const fx of [0, 0.5, 1]) {
    for (const fy of [0, 0.5, 1]) {
      const px = r.x0 + (r.x1 - r.x0) * fx - c.x, py = r.y0 + (r.y1 - r.y0) * fy - c.y;
      const along = px * ux + py * uy, across = -px * uy + py * ux;
      if ((along / a) ** 2 + (across / Math.max(0.5, b)) ** 2 <= 1) return true;
    }
  }
  return false;
}
/**
 * Which way is level ahead: where you look, flattened onto the plane square to "up". Looking
 * straight up or down, it is the way the top (or bottom) of the view points.
 */
function levelHeading(fwd: THREE.Vector3, quat: THREE.Quaternion, up: THREE.Vector3): THREE.Vector3 {
  const flat = fwd.clone().addScaledVector(up, -fwd.dot(up));
  if (flat.lengthSq() > 1e-10) return flat.normalize();
  const top = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).multiplyScalar(-Math.sign(fwd.dot(up)) || 1);
  const f2 = top.addScaledVector(up, -top.dot(up));
  return f2.lengthSq() > 1e-10 ? f2.normalize() : new THREE.Vector3(1, 0, 0);
}

/** Roughly how wide a label is on screen, px (no layout needed). */
function labelWidth(text: string, kind: string): number {
  return text.length * (kind === 'constellation' || kind === 'zodiacFigure' ? 7.6 : 6.3) + 4;
}
/** Apparent size, compact: "17°16′", "31′05″", "2.1″". */
function formatSize(rad: number): string {
  const sec = (rad * 180 * 3600) / Math.PI;
  return formatDMS(rad, sec < 10 ? 2 : sec < 600 ? 1 : 0, true);
}

interface Flight {
  fromPos: Vec3;
  fromQuat: THREE.Quaternion;
  to: Pose;
  start: number;
  ms: number;
  /** A warp changes distance from the Sun by equal factors (warpPoint) and can't be interrupted. */
  warp: boolean;
  /** Fly toward this point by equal factors of distance from it (closing in on a galaxy or the black hole). */
  toward?: Vec3;
  /**
   * A journey to a body: distance from it falls by equal factors (as fast between the
   * planets as it is slow at the end), following the body as it moves. You first turn to
   * face it, fly at it, and only at the end turn to the view on arrival.
   */
  body?: { id: BodyId; fromRel: Vec3; up: Vec3; face?: boolean };
  /** Start from this pose, recomputed every frame (time may run during the flight). */
  fromPose?: Pose;
  /** The view's width and the "up" for flying, on arrival (a path's point). */
  fov?: { from: number; to: number };
  upTo?: Vec3;
  /** Told when the flight ends: true if it arrived, false if something interrupted it. */
  done?: (arrived: boolean) => void;
}

export default function FlyView({ active, focused = true, theme, overlays, clock, spanSeconds, measure, command, onTimeZoom, onHud, onApi, onEmptyTap }: Props) {
  const live = useRef({ active, focused, theme, overlays, clock, spanSeconds, measure, onTimeZoom, onHud, onEmptyTap });
  live.current = { active, focused, theme, overlays, clock, spanSeconds, measure, onTimeZoom, onHud, onEmptyTap };
  const stickRef = useRef<HTMLDivElement>(null);
  const touchHintRef = useRef<HTMLParagraphElement>(null);
  // On a touch screen, how to fly shows for a few seconds on arriving (or until the first touch).
  useEffect(() => {
    const el = touchHintRef.current;
    if (!active || !el || typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: coarse)').matches) return;
    el.classList.add('on');
    const t = window.setTimeout(() => el.classList.remove('on'), 7000);
    return () => {
      window.clearTimeout(t);
      el.classList.remove('on');
    };
  }, [active]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const warpRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const styleRef = useRef<(t: Theme) => void>(() => {});
  const runRef = useRef<(c: FlyCommand) => void>(() => {});
  const onApiRef = useRef(onApi);
  onApiRef.current = onApi;

  useEffect(() => {
    const canvas = canvasRef.current;
    const labelHost = labelsRef.current;
    if (!canvas || !labelHost) return;
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(canvas);
    } catch {
      if (errorRef.current) errorRef.current.textContent = '3D needs WebGL, which this browser or device does not provide. The calendar still works.';
      return;
    }
    const resize = (): void => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0) scene.resize(r.width, r.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const now0 = (): Time => live.current.clock();
    const bodiesAt = (t: Time) => {
      const trueBodies = solarSystemAt(t);
      // One scale, true (ADR-0016): the bodies are drawn where they are.
      return { trueBodies, bodies: trueBodies };
    };
    const aspect = (): number => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    let axes: readonly [Vec3, Vec3, Vec3] = CALENDAR_AXES;
    let pose: Pose = vantage('overview', bodiesAt(now0()).bodies, aspect(), now0()).pose;
    let flight: Flight | null = null;

    scene.setStyle(live.current.theme.sky);
    let paths = createOverlays(scene.scene, live.current.theme);
    let sky: ReturnType<typeof createSky> | null = null;
    let galaxy: ReturnType<typeof createGalaxy> | null = null;
    let disposed = false;
    loadGalaxyMap(import.meta.env.BASE_URL)
      .then((map) => {
        if (!disposed) galaxy = createGalaxy(scene.scene, map, live.current.theme.sky);
      })
      .catch((e: unknown) => console.warn('Galaxy map not loaded:', e));
    loadSky(import.meta.env.BASE_URL)
      .then(({ data, milkyWay }) => {
        if (!disposed) sky = createSky(scene.scene, data, milkyWay, scene.renderer.getPixelRatio(), live.current.theme.sky);
      })
      .catch((e: unknown) => console.warn('Sky not loaded:', e));

    styleRef.current = (t) => {
      scene.setStyle(t.sky);
      sky?.setStyle(t.sky);
      galaxy?.setStyle(t.sky);
      paths.dispose();
      paths = createOverlays(scene.scene, t);
    };

    const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const here = (): { pos: Vec3; quat: THREE.Quaternion } => worldOf(pose, bodiesAt(now0()).bodies);
    const fly = (to: Pose, warp: boolean, ms?: number): void => {
      const from = here();
      flight = { fromPos: from.pos, fromQuat: from.quat, to, start: performance.now(), ms: reduced() ? 0 : (ms ?? (warp ? WARP_MS : 2200)), warp };
    };
    /** A flight between two places, as a warp when the scale changes enormously. */
    const flyTo = (to: Pose): void => {
      const { bodies } = bodiesAt(now0());
      const sun = find(bodies, 'sun').pos;
      fly(to, isWarp(len3(sub3(here().pos, sun)), len3(sub3(worldOf(to, bodies).pos, sun))));
    };
    /** Out to the whole galaxy, along a heading (from the Sun). */
    const warpOut = (heading: Vec3): void => {
      const { bodies } = bodiesAt(now0());
      const v = warpOutVantage(now0(), heading);
      fly(poseFrom(v.pos, lookAt(v.pos, v.target, v.up), 'sun', 'inertial', bodies), true);
    };
    /** Back into the solar system, arriving along a heading, in front of the Sun. */
    const warpIn = (heading: Vec3): void => {
      const { bodies } = bodiesAt(now0());
      const a = arrivalView(find(bodies, 'sun').pos, heading);
      fly(poseFrom(a.pos, a.quat, 'sun', 'inertial', bodies), true);
    };
    /** The calendar's view in 3D (the Solar system destination). */
    const home = (): void => {
      const { bodies } = bodiesAt(now0());
      const v = overviewView(find(bodies, 'sun').pos, axes);
      flyTo(poseFrom(v.pos, v.quat, 'sun', 'inertial', bodies));
    };
    const go = (d: Destination): void => {
      const { bodies } = bodiesAt(now0());
      const sun = find(bodies, 'sun').pos;
      if (d === 'overview') return home();
      if (d === 'galaxy' && len3(sub3(here().pos, sun)) < WARP_OUT_KM) {
        // From the solar system: back away from where you are looking, and keep going.
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(here().quat);
        return warpOut([back.x, back.y, back.z]);
      }
      flyTo(vantage(d, bodies, aspect(), now0(), axes).pose);
    };
    const above = (id: BodyId): void => {
      const { bodies } = bodiesAt(now0());
      const to = aboveNorth(id, bodies).pose;
      const sun = find(bodies, 'sun').pos;
      const from = here();
      const dest = worldOf(to, bodies).pos;
      if (isWarp(len3(sub3(from.pos, sun)), len3(sub3(dest, sun)))) return flyTo(to);
      const c = find(bodies, id).pos;
      const fromRel = sub3(from.pos, c);
      // Longer journeys take longer: a second and a half, plus about one second for every
      // tenfold of distance closed.
      const ratio = Math.max(1, len3(fromRel) / Math.max(1, len3(sub3(dest, c))));
      const ms = Math.min(7000, Math.max(1800, 1500 + 900 * Math.log10(ratio)));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(from.quat);
      flight = {
        fromPos: from.pos, fromQuat: from.quat, to, start: performance.now(), ms: reduced() ? 0 : ms, warp: false,
        body: { id, fromRel, up: [up.x, up.y, up.z] },
      };
    };
    const face = (id: BodyId): void => {
      const { bodies } = bodiesAt(now0());
      const w = here();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(w.quat);
      fly(poseFrom(w.pos, lookAt(w.pos, find(bodies, id).pos, [up.x, up.y, up.z]), pose.anchor, pose.frame, bodies), false, 900);
    };
    let dolly = 0;
    /** The view's width (pinch), degrees. */
    let fov = FOV;
    const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
    runRef.current = (c) => {
      switch (c.kind) {
        case 'enter': {
          axes = c.axes;
          fov = FOV;
          const { bodies } = bodiesAt(now0());
          const v = overviewView(find(bodies, 'sun').pos, axes);
          pose = poseFrom(v.pos, v.quat, 'sun', 'inertial', bodies);
          flight = null;
          const t = c.then;
          if (!t) break;
          if ('go' in t) go(t.go);
          else if ('above' in t) above(t.above);
          else warpOut([axes[2][0], axes[2][1], axes[2][2]]);
          break;
        }
        case 'go':
          go(c.dest);
          break;
        case 'above':
          above(c.id);
          break;
        case 'face':
          face(c.id);
          break;
        case 'dolly':
          if (!flight?.warp) {
            flight = null;
            dolly += c.amount;
          }
          break;
        case 'level': {
          fov = FOV;
          // North up, keeping the way you look: far out the galaxy's north, near a body its
          // north, otherwise ecliptic north. That becomes your "up" for flying.
          const { bodies } = bodiesAt(now0());
          const w = here();
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(w.quat);
          const near = nearest(w.pos, bodies);
          const nb = find(bodies, near.id);
          const up: Vec3 =
            galaxyFade(len3(w.pos)) > 0.5 ? GAL_NORTH : near.altitude < 10 * nb.info.radiusKm ? nb.axes[2] : [0, 0, 1];
          upRef.set(up[0], up[1], up[2]).normalize();
          const target: Vec3 = [w.pos[0] + fwd.x, w.pos[1] + fwd.y, w.pos[2] + fwd.z];
          fly(poseFrom(w.pos, lookAt(w.pos, target, up), pose.anchor, pose.frame, bodies), false, 600);
          break;
        }
      }
    };

    // Labels: sky names, grid and galaxy names, one element per body.
    const skyLabels: HTMLDivElement[] = [];
    for (let i = 0; i < 140; i++) {
      const el = document.createElement('div');
      el.className = 'fly-sky-label';
      el.style.display = 'none';
      labelHost.appendChild(el);
      skyLabels.push(el);
    }
    const gridLabels: HTMLDivElement[] = [];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.className = 'fly-grid-label';
      el.style.display = 'none';
      el.addEventListener('pointerdown', (e) =>
        pressLabel(e, () => {
          const action = el.dataset.action ?? '';
          if (flight?.warp || !action) return;
          const { bodies } = bodiesAt(now0());
          if (action === 'sun') {
            warpIn(unit3(sub3(find(bodies, 'sun').pos, here().pos)));
            return;
          }
          // A galaxy's or the black hole's name: fly over there and have a look.
          if (action.startsWith('goto:') && galaxy) {
            const v = galaxy.vantage(action.slice(5), here().pos, now0());
            if (!v) return;
            const to = poseFrom(v.pos, lookAt(v.pos, v.target, v.up), 'sun', 'inertial', bodies);
            const from = here();
            flight = { fromPos: from.pos, fromQuat: from.quat, to, start: performance.now(), ms: reduced() ? 0 : 4000, warp: false, toward: v.target };
          }
        }),
      );
      labelHost.appendChild(el);
      gridLabels.push(el);
    }
    // A small dot on each body too far away to see, so you can tell where it is.
    const markers = new Map<BodyId, HTMLDivElement>();
    const markerHost = markersRef.current;
    for (const b of BODIES) {
      const m = document.createElement('div');
      m.className = 'fly-marker';
      m.style.display = 'none';
      markerHost?.appendChild(m);
      markers.set(b.id, m);
    }
    // A body picked out by a Starsigns path: a soft pulsing ring around it.
    const halo = document.createElement('div');
    halo.className = 'fly-halo';
    halo.style.display = 'none';
    markerHost?.appendChild(halo);
    // The chart wheel around Earth (Starsigns, step 4).
    const wheel = createWheel(scene.scene, labelHost);
    const labels = new Map<BodyId, HTMLDivElement>();
    for (const b of BODIES) {
      const el = document.createElement('div');
      el.className = 'fly-label';
      el.title = `Float above ${b.name}'s north pole`;
      el.addEventListener('pointerdown', (e) => pressLabel(e, () => above(b.id)));
      labelHost.appendChild(el);
      labels.set(b.id, el);
    }

    /**
     * Flying is like Minecraft's creative mode: there is an "up" (the up of wherever you
     * last arrived, or set by Reset view), you never roll, you look up and down at most
     * straight up or down, and W A S D move you level with it, Space and Shift straight up
     * and down. Click the view to steer with the mouse (Esc lets go).
     */
    const upRef = new THREE.Vector3(0, 1, 0).applyQuaternion(worldOf(pose, bodiesAt(now0()).bodies).quat);
    let locked = false;
    const onLockChange = (): void => {
      locked = document.pointerLockElement === canvas;
      keys.clear();
    };
    const onMouseLook = (e: MouseEvent): void => {
      if (!locked) return;
      look.x -= e.movementX * 1.6;
      look.y -= e.movementY * 1.6;
    };
    let downAt: { x: number; y: number; moved: boolean } | null = null;
    // Input: drag (or scroll, or steer with the mouse) to look around where you stand; W A S D to fly.
    const keys = new Set<string>();
    let look = { x: 0, y: 0 };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    /**
     * Touch, as in phone games: a thumb stick appears wherever a finger lands on the left
     * of the view and flies you (up: forward, down: back, sideways: slide); a finger
     * anywhere else looks around. Two fingers: pinch flies forward or back; sliding them
     * moves you sideways, up or down. A quick tap on nothing shows or hides the controls.
     */
    const STICK_R = 56;
    let stick: { id: number; x0: number; y0: number; x: number; y: number; t: number } | null = null;
    let two: { d0: number; mx0: number; my0: number; mx: number; my: number; mode: 'pinch' | 'slide' | null } | null = null;
    /** Sliding with two fingers, px not yet flown. */
    let slide = { x: 0, y: 0 };
    /** This touch had a second finger at some point (so its end is not a tap). */
    let multi = false;
    let touchAt = 0;
    const showStick = (): void => {
      const el = stickRef.current;
      if (!el) return;
      if (!stick) {
        el.style.display = 'none';
        return;
      }
      const r = canvas.getBoundingClientRect();
      let dx = stick.x - stick.x0, dy = stick.y - stick.y0;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) (dx *= STICK_R / l), (dy *= STICK_R / l);
      el.style.display = 'block';
      el.style.left = `${stick.x0 - r.left}px`;
      el.style.top = `${stick.y0 - r.top}px`;
      el.style.setProperty('--kx', `${dx}px`);
      el.style.setProperty('--ky', `${dy}px`);
    };
    const hideTouchHint = (): void => {
      touchHintRef.current?.classList.remove('on');
    };
    const tapped = (): void => {
      live.current.onEmptyTap?.();
    };
    /**
     * A press on a name: a click if it is let go where it started, otherwise the start of
     * a drag like any other. The canvas takes the pointer either way, so dragging across
     * names never catches on them.
     */
    let pressed: { x: number; y: number; act: () => void } | null = null;
    const pressLabel = (e: PointerEvent, act: () => void): void => {
      pressed = { x: e.clientX, y: e.clientY, act };
      onDown(e);
    };
    const onDown = (e: PointerEvent): void => {
      e.preventDefault(); // no text selection while dragging
      if (locked) return;
      if (e.pointerType === 'touch') {
        if (pointers.size === 0 && !stick) {
          multi = false;
          touchAt = performance.now();
          hideTouchHint();
        } else multi = true;
        const r = canvas.getBoundingClientRect();
        if (!stick && !pressed && e.clientX - r.left < r.width * 0.42 && pointers.size === 0) {
          canvas.setPointerCapture(e.pointerId);
          stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
          if (!flight?.warp) flight = null;
          showStick();
          return;
        }
      }
      downAt = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
      labelHost.classList.add('dragging');
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!flight?.warp) flight = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          two = { d0: pinch, mx0: mx, my0: my, mx, my, mode: null };
        }
      }
    };
    let hover: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent): void => {
      if (locked) return;
      if (stick && e.pointerId === stick.id) {
        stick.x = e.clientX;
        stick.y = e.clientY;
        showStick();
        return;
      }
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) downAt.moved = true;
      const r = canvas.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      hover = null;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 5) pressed = null;
      if (pressed) return;
      if (pointers.size === 1) {
        // Drag: look around without moving, the whole sky (and every body in it) turning together.
        look.x += e.clientX - prev.x;
        look.y += e.clientY - prev.y;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (e.pointerType !== 'touch') {
          // Pinching widens or narrows the view; you stay where you are.
          if (pinch > 0 && d > 0) fov = clamp((fov * pinch) / d, 0.5, 100);
        } else {
          if (!two) two = { d0: d, mx0: mx, my0: my, mx, my, mode: null };
          if (two.mode === null) {
            const byPinch = Math.abs(d - two.d0), bySlide = Math.hypot(mx - two.mx0, my - two.my0);
            if (Math.max(byPinch, bySlide) > 24) two.mode = byPinch >= bySlide ? 'pinch' : 'slide';
          }
          // Pinch apart: fly forward (things grow, as when zooming in); together: back.
          if (two.mode === 'pinch' && pinch > 0 && d > 0 && !flight?.warp) {
            flight = null;
            dolly += Math.log(d / pinch) * 1.5;
          } else if (two.mode === 'slide' && !flight?.warp) {
            flight = null;
            slide.x += mx - two.mx;
            slide.y += my - two.my;
          }
          two.mx = mx;
          two.my = my;
        }
        pinch = d;
      }
    };
    const onPointerLeave = (): void => {
      hover = null;
    };
    const onUp = (e: PointerEvent): void => {
      if (stick && e.pointerId === stick.id) {
        const s = stick;
        stick = null;
        showStick();
        if (e.type === 'pointerup' && !multi && pointers.size === 0 && Math.hypot(s.x - s.x0, s.y - s.y0) < 8 && performance.now() - s.t < 350) tapped();
        return;
      }
      pointers.delete(e.pointerId);
      pinch = 0;
      if (pointers.size < 2) two = null;
      if (pointers.size === 0) labelHost.classList.remove('dragging');
      const p = pressed;
      pressed = null;
      const d = downAt;
      downAt = null;
      if (p && e.type === 'pointerup') p.act();
      // A quick tap on nothing (touch): show or hide the controls.
      else if (!p && d && !d.moved && e.type === 'pointerup' && e.pointerType === 'touch' && !multi && pointers.size === 0 && !stick && performance.now() - touchAt < 350) tapped();
      // A plain click on the view (not a name, not a drag): steer with the mouse, as in Minecraft.
      else if (!p && d && !d.moved && e.type === 'pointerup' && e.pointerType === 'mouse' && pointers.size === 0 && !flight?.warp) {
        void canvas.requestPointerLock?.();
      }
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (flight?.warp) return;
      const k = e.deltaMode === 1 ? 16 : 1;
      const dx = e.deltaX * k, dy = e.deltaY * k;
      // Shift + scroll or pinch: zoom time, as in the calendar. In 3D this changes the
      // grids' units (the ruler along the Sun's line), not the picture.
      if (e.shiftKey) {
        live.current.onTimeZoom(Math.exp((dy || dx) * (e.ctrlKey ? 0.01 : 0.0015)));
        return;
      }
      // Pinch (ctrlKey): a wider or narrower view, without moving.
      if (e.ctrlKey) {
        fov = clamp(fov * Math.exp(dy * 0.01), 0.5, 100);
        return;
      }
      // Scroll: look around, the sky following your fingers as when dragging.
      flight = null;
      look.x -= dx;
      look.y -= dy;
    };
    const typing = (): boolean => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
    };
    const MOVE_KEYS = ['w', 'a', 's', 'd', 'r', 'f', 'shift', 'control', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!live.current.active || !live.current.focused || typing()) return;
      const k = e.key.toLowerCase();
      // Space always flies up, as in games (H shows and hides the controls).
      if (k === ' ') e.preventDefault();
      if (MOVE_KEYS.includes(k)) {
        keys.add(k);
        if (!flight?.warp) flight = null;
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
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseLook);

    // Paths: read and set the camera exactly, and fly to a saved camera.
    const toPose = (s: FlyState): Pose => ({ anchor: s.anchor, frame: s.frame, rel: s.rel, quat: new THREE.Quaternion(s.quat[0], s.quat[1], s.quat[2], s.quat[3]) });
    let watched: Flight | null = null;
    const watch = (f: Flight): Promise<boolean> =>
      new Promise((resolve) => {
        if (watched && watched !== f) watched.done?.(false);
        f.done = resolve;
        watched = f;
        if (f.ms === 0) {
          // No motion wanted: arrive on the next frame.
          f.start = performance.now() - 1;
        }
      });
    const api: FlyApi = {
      getState() {
        const w = here();
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(w.quat);
        return {
          anchor: pose.anchor,
          frame: pose.frame,
          rel: [pose.rel[0], pose.rel[1], pose.rel[2]],
          quat: [pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w],
          fov,
          up: [upRef.x, upRef.y, upRef.z],
          look: [fwd.x, fwd.y, fwd.z],
          inGalaxy: galaxyFade(len3(w.pos)) > 0.5,
        };
      },
      setState(st) {
        if (watched) watched.done?.(false);
        watched = null;
        flight = null;
        pose = toPose(st);
        fov = st.fov;
        upRef.set(st.up[0], st.up[1], st.up[2]).normalize();
      },
      flyTo(st) {
        const to = toPose(st);
        const { bodies } = bodiesAt(now0());
        const sun = find(bodies, 'sun').pos;
        const from = here();
        const dest = worldOf(to, bodies).pos;
        const fromKm = len3(sub3(from.pos, sun)), toKm = len3(sub3(dest, sun));
        const base = {
          fromPos: from.pos, fromQuat: from.quat, to, start: performance.now(), fromPose: pose,
          fov: { from: fov, to: st.fov }, upTo: st.up,
        };
        let f: Flight;
        if (isWarp(fromKm, toKm)) f = { ...base, ms: reduced() ? 0 : WARP_MS, warp: true };
        else if (galaxyFade(len3(from.pos)) > 0.5 && galaxyFade(len3(dest)) > 0.5) {
          // Out among the galaxies: close in by equal factors of distance on where you are going.
          f = { ...base, ms: reduced() ? 0 : 4000, warp: false, toward: dest };
        } else {
          // A journey: distance from where you are going falls by equal factors, following
          // it as it moves; to another body you first turn to face it.
          const c = find(bodies, to.anchor).pos;
          const fromRel = sub3(from.pos, c);
          const ratio = Math.max(len3(fromRel), 1) / Math.max(1, len3(sub3(dest, c)));
          const span = Math.abs(Math.log10(ratio));
          const ms = Math.min(7000, Math.max(1800, 1500 + 900 * span));
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(from.quat);
          f = { ...base, ms: reduced() ? 0 : ms, warp: false, body: { id: to.anchor, fromRel, up: [up.x, up.y, up.z], face: to.anchor !== pose.anchor && to.anchor !== 'sun' } };
        }
        flight = f;
        return watch(f);
      },
      flyOverview(ax) {
        axes = ax;
        const { bodies } = bodiesAt(now0());
        const v = overviewView(find(bodies, 'sun').pos, ax);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
        const st: FlyState = {
          anchor: 'sun', frame: 'inertial',
          rel: [v.pos[0] - find(bodies, 'sun').pos[0], v.pos[1] - find(bodies, 'sun').pos[1], v.pos[2] - find(bodies, 'sun').pos[2]],
          quat: [v.quat.x, v.quat.y, v.quat.z, v.quat.w], fov: FOV, up: [up.x, up.y, up.z],
        };
        return api.flyTo(st);
      },
    };
    onApiRef.current?.(api);

    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let lastPos: Vec3 | null = null;
    // Smooth on any device: draw at a lower resolution while frames are slow.
    const governor = createGovernor({ max: Math.min(window.devicePixelRatio || 1, 2), min: 0.6 });
    const tick = (ts: number): void => {
      raf = requestAnimationFrame(tick);
      const frameMs = ts - last;
      const dt = Math.min(0.1, frameMs / 1000);
      last = ts;
      const L = live.current;
      if (L.active) {
        const q = governor.sample(frameMs);
        if (q !== null) scene.setPixelRatio(q);
      }
      if (!L.active) {
        keys.clear();
        lastPos = null;
        if (locked) document.exitPointerLock();
        // Left 3D mid-flight: the flight cannot finish here; tell whoever is waiting on it.
        if (flight) {
          if (watched === flight) {
            watched.done?.(false);
            watched = null;
          }
          flight = null;
        }
        return;
      }
      if (watched && watched !== flight) {
        watched.done?.(false);
        watched = null;
      }
      const now = L.clock();
      const { trueBodies, bodies } = bodiesAt(now);
      const sunPos = find(bodies, 'sun').pos;
      let pos: Vec3;
      let quat: THREE.Quaternion;
      const fl = flight;
      let warpK = -1;
      if (fl) {
        const k = fl.ms === 0 ? 1 : Math.min(1, (ts - fl.start) / fl.ms);
        const e = ease(k);
        const to = worldOf(fl.to, bodies);
        if (fl.fromPose) {
          // Bodies move while time runs during the flight: start from where the start is now.
          const w0 = worldOf(fl.fromPose, bodies);
          fl.fromPos = w0.pos;
          fl.fromQuat = w0.quat;
        }
        if (fl.fov) fov = logLerp(fl.fov.from, fl.fov.to, e);
        const jb = fl.body;
        const c = jb ? find(bodies, jb.id).pos : null;
        pos = fl.warp
          ? warpPoint(sunPos, fl.fromPos, to.pos, e)
          : c && jb
            ? warpPoint(c, [c[0] + jb.fromRel[0], c[1] + jb.fromRel[1], c[2] + jb.fromRel[2]], to.pos, e)
          : fl.toward
            ? warpPoint(fl.toward, fl.fromPos, to.pos, e)
          : ([0, 1, 2].map((i) => fl.fromPos[i]! + (to.pos[i]! - fl.fromPos[i]!) * e) as unknown as Vec3);
        if (c && jb && jb.face !== false) {
          // Turn to face it, fly at it, and turn to the arrival view only at the end.
          const face = lookAt(pos, c, jb.up);
          const sm = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
          quat = k < 0.8 ? fl.fromQuat.clone().slerp(face, sm(k / 0.2)) : face.slerp(to.quat, sm((k - 0.8) / 0.2));
        } else quat = fl.fromQuat.clone().slerp(to.quat, e);
        if (fl.warp && k < 1) warpK = k;
        if (k >= 1) {
          pose = fl.to;
          flight = null;
          // Where you arrive sets which way is up for flying.
          if (fl.upTo) upRef.set(fl.upTo[0], fl.upTo[1], fl.upTo[2]).normalize();
          else upRef.set(0, 1, 0).applyQuaternion(worldOf(fl.to, bodies).quat);
          if (fl.fov) fov = fl.fov.to;
          if (watched === fl) watched = null;
          fl.done?.(true);
        }
      } else {
        const w = worldOf(pose, bodies);
        pos = w.pos;
        quat = w.quat;
        // Look (drag, scroll, mouse while steering, arrows): you stay where you are and turn about "up", tilting up and down at
        // most to straight up or down, never roll.
        const fovRad = (scene.camera.fov * Math.PI) / 180;
        const perPx = fovRad / Math.max(1, canvas.clientHeight);
        const arrows = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
        const arrowsY = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
        const yaw = look.x * perPx + arrows * 0.9 * dt * (fov / 60);
        const pitch = look.y * perPx + arrowsY * 0.9 * dt * (fov / 60);
        look = { x: 0, y: 0 };
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
        const flat = levelHeading(fwd, quat, upRef);
        if (yaw !== 0 || pitch !== 0) {
          flat.applyAxisAngle(upRef, yaw);
          const MAXP = (89.5 * Math.PI) / 180;
          const p = Math.max(-MAXP, Math.min(MAXP, Math.asin(Math.max(-1, Math.min(1, fwd.dot(upRef)))) + pitch));
          const f = flat.clone().multiplyScalar(Math.cos(p)).addScaledVector(upRef, Math.sin(p));
          quat = lookAt([0, 0, 0], [f.x, f.y, f.z], [upRef.x, upRef.y, upRef.z]);
        }
        // Move: W A S D level with "up"; Space or R up, Shift or F down (Space and Shift while
        // steering with the mouse; otherwise Shift goes faster); Ctrl faster. Speed scales
        // with the distance to the nearest thing: a body, the black hole, a galaxy.
        const near = nearest(pos, bodies);
        const clearance = Math.min(near.altitude, galaxy ? galaxy.clearanceKm(pos, now) : Infinity);
        const sprint = keys.has('control') || (!locked && keys.has('shift'));
        const v = cruiseSpeed(clearance) * (sprint ? 5 : 1);
        const right = flat.clone().cross(upRef).normalize();
        // The thumb stick: how far it is pushed (past a small dead zone), up to full speed.
        let stickX = 0, stickY = 0;
        if (stick) {
          const sx = (stick.x - stick.x0) / STICK_R, sy = (stick.y - stick.y0) / STICK_R;
          const l = Math.hypot(sx, sy);
          if (l > 0.12) {
            const k = Math.min(1, l) / l;
            stickX = sx * k;
            stickY = sy * k;
          }
        }
        const ahead = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0) - stickY;
        const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + stickX;
        const up1 = keys.has('r') || keys.has(' ') ? 1 : 0;
        const down1 = keys.has('f') || (locked && keys.has('shift')) ? 1 : 0;
        const look3 = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
        // W and S fly the way you are looking, so whatever is in the middle of the view is
        // where you go (and it grows until you arrive); A and D slide sideways, level;
        // Space and Shift rise and sink along "up".
        const move = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(quat)
          .multiplyScalar(ahead)
          .addScaledVector(right, side)
          .addScaledVector(upRef, up1 - down1)
          .addScaledVector(look3, dolly * 10);
        dolly = 0;
        // Two fingers sliding: the scene follows them (a screen's height is three seconds' cruise).
        if ((slide.x !== 0 || slide.y !== 0) && dt > 0) {
          const k = 3 / (Math.max(1, canvas.clientHeight) * dt);
          move.addScaledVector(right, -slide.x * k).addScaledVector(upRef, slide.y * k);
          slide = { x: 0, y: 0 };
        }
        let moved = false;
        if (move.lengthSq() > 0) {
          const before = pos;
          move.multiplyScalar(v * dt);
          pos = pushOut([pos[0] + move.x, pos[1] + move.y, pos[2] + move.z], bodies);
          if (galaxy) pos = galaxy.keepOut(pos, now);
          const r0 = len3(sub3(before, sunPos)), r1 = len3(sub3(pos, sunPos));
          const heading = unit3(sub3(pos, before));
          const toSun = unit3(sub3(sunPos, pos));
          if (r0 < WARP_OUT_KM && r1 >= WARP_OUT_KM) {
            // Leaving the solar system: speed up past light and out to the whole galaxy,
            // along the way you were heading (or straight out, if you were backing away).
            const out = unit3(sub3(pos, sunPos));
            pose = poseFrom(pos, quat, 'sun', 'inertial', bodies);
            warpOut(heading[0] * out[0] + heading[1] * out[1] + heading[2] * out[2] > 0 ? heading : out);
            moved = true;
          } else if (r1 > WARP_OUT_KM) {
            // Out among the stars or beyond, only flying straight at the Sun warps you back
            // (or clicking it); you can fly anywhere else, the black hole included.
            const atSun = r1 < r0 && Math.acos(Math.min(1, heading[0] * toSun[0] + heading[1] * toSun[1] + heading[2] * toSun[2])) < WARP_IN_ANGLE;
            if (atSun) {
              pose = poseFrom(pos, quat, 'sun', 'inertial', bodies);
              warpIn(heading);
              moved = true;
            }
          }
        }
        if (!moved) {
          // Ride with whichever body is clearly closest.
          let anchor = pose.anchor;
          let frame = pose.frame;
          const a = find(bodies, anchor);
          const anchorAlt = len3(sub3(pos, a.pos)) - a.info.radiusKm;
          const near2 = nearest(pos, bodies);
          if (near2.id !== anchor && near2.altitude < anchorAlt * 0.6) {
            anchor = near2.id;
            frame = 'inertial';
          }
          pose = poseFrom(pos, quat, anchor, frame, bodies);
        }
      }

      const shape = undefined;

      // The warp: a slight widening of the view and a vignette, and the speed in light speeds.
      const warpEl = warpRef.current;
      const kick = warpK >= 0 ? Math.sin(Math.PI * warpK) : 0;
      if (warpEl) {
        if (warpK >= 0 && lastPos && dt > 0) {
          const c = len3(sub3(pos, lastPos)) / dt / C_KM_S;
          warpEl.style.opacity = String(Math.min(1, kick * 1.4));
          const t = warpEl.firstElementChild as HTMLElement | null;
          if (t) t.textContent = c >= 1 ? `Warp · ${c >= 100 ? Math.round(c).toLocaleString('en-US') : c.toFixed(1)} × light speed` : `${(c * C_KM_S).toLocaleString('en-US', { maximumFractionDigits: 0 })} km/s`;
        } else warpEl.style.opacity = '0';
      }
      lastPos = pos;

      // Far out, the outside view of the galaxy takes over from the sky seen from the Sun,
      // and the solar-system paths and grids (too small to see) step aside.
      const far = galaxyFade(len3(pos));
      sky?.setFade(1 - far);
      const lensFov = fov * (1 + 0.28 * kick * kick);
      const pxAngle = (lensFov * Math.PI) / 180 / Math.max(1, canvas.clientHeight);
      const galaxyLabels = galaxy ? galaxy.update(now, pos, pxAngle, scene.renderer.getPixelRatio()) : [];
      const o = L.overlays;
      scene.setEarthLines(o.coastlines ?? true);
      const gl: Array<{ pos: Vec3; text: string; kind: 'time' | 'space' | 'galaxy'; action?: string }> = [
        ...paths.update(
          far > 0.5 ? { ...o, spirals: false, orbits: false, timeGrid: false, spaceGrid: false } : o,
          now,
          bodies,
          pos,
          trueBodies,
          shape,
          pxAngle,
          L.spanSeconds,
        ),
        ...galaxyLabels.map((g) => ({ ...g, kind: 'galaxy' as const })),
      ];
      // Near the ground, the sky takes the colour of the hour: blue by day, through twilight, to black at night
      // (stars and names stay on top). Faded out by 120 km up.
      {
        const e = find(bodies, 'earth');
        const off = sub3(pos, e.pos);
        const altKm = len3(off) - e.info.radiusKm;
        if (altKm < 120 && far <= 0.5) {
          const upv = unit3(off);
          const s = unit3(sub3(find(bodies, 'sun').pos, pos));
          const alt = (Math.asin(Math.max(-1, Math.min(1, upv[0] * s[0] + upv[1] * s[1] + upv[2] * s[2]))) * 180) / Math.PI;
          const tw = Math.min(1, Math.max(0, (alt + 12) / 20)); // −12° (night) → +8° (day)
          const ink = L.theme.sky.ink;
          // Night (the theme's sky) → twilight violet → day blue, smoothly.
          const mix = (p: string, q: string, k: number): string => {
            const c = (h: string, i: number): number => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
            return `#${[0, 1, 2].map((i) => Math.round(c(p, i) + (c(q, i) - c(p, i)) * k).toString(16).padStart(2, '0')).join('')}`;
          };
          const twilight = ink ? '#e4dcef' : '#25305e', day = ink ? '#cfe1f6' : '#3f7cc4';
          const colour = tw > 0.5 ? mix(twilight, day, (tw - 0.5) * 2) : twilight;
          const amount = (tw > 0.5 ? 1 : tw * 2) * (1 - Math.max(0, Math.min(1, (altKm - 20) / 100)));
          scene.setDaylight(colour, amount);
        } else scene.setDaylight('#000000', 0);
      }
      scene.setFov(lensFov);
      scene.setNear(Math.min(1000, Math.max(0.01, nearest(pos, bodies).altitude * 1e-4)));
      scene.render(bodies, pos, quat);

      // Labels.
      const cam = scene.camera;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const v3 = new THREE.Vector3();
      const inv = quat.clone().invert();
      const fovRad = (cam.fov * Math.PI) / 180;
      // Every body's outline on screen: labels never show through a body or its rings.
      const discs: Disc[] = [];
      for (const b of bodies) {
        const rel = new THREE.Vector3(b.pos[0] - pos[0], b.pos[1] - pos[1], b.pos[2] - pos[2]);
        const d = rel.length();
        const relCam = rel.clone().applyQuaternion(inv);
        if (relCam.z >= 0) continue;
        v3.copy(rel).project(cam);
        const r = (Math.asin(Math.min(1, b.info.radiusKm / d)) / fovRad) * H;
        if (r < 1.5) continue;
        const disc: Disc = { x: ((v3.x + 1) / 2) * W, y: ((1 - v3.y) / 2) * H, r, d, id: b.info.id };
        if (b.info.rings) {
          const a = (Math.asin(Math.min(1, b.info.rings[1] / d)) / fovRad) * H;
          const n = new THREE.Vector3(...b.axes[2]).applyQuaternion(inv);
          const minor = Math.abs(n.dot(relCam.clone().normalize()));
          const sx = n.x, sy = -n.y, sl = Math.hypot(sx, sy) || 1;
          // The ellipse's minor axis lies along the pole's direction on screen.
          disc.ring = { a, b: a * minor, ux: -sy / sl, uy: sx / sl };
        }
        discs.push(disc);
      }
      const hidden = (r: Rect, nearerThan = Infinity, except?: BodyId): boolean =>
        discs.some((c) => c.d < nearerThan && c.id !== except && discCovers(c, r));

      // Which zodiac sign each body is in, seen from where you are. Directions use true
      // positions (in √ fit the picture is pulled in, the sky is not): you are where you
      // are relative to the body nearest you.
      const nearId = nearest(pos, bodies).id;
      const nearTrue = find(trueBodies, nearId).pos, nearShown = find(bodies, nearId).pos;
      const trueCam: Vec3 = [nearTrue[0] + pos[0] - nearShown[0], nearTrue[1] + pos[1] - nearShown[1], nearTrue[2] + pos[2] - nearShown[2]];
      // Signs from the equinox of the viewed date (precession: about 50″ a year from 2000).
      const skyNow = skyOfDate(now);
      // A Starsigns chart: the place's horizon and houses on the sky, and each body's house in its label.
      const ch = L.overlays.chart;
      const chart = ch ? chartAt(now, ch.lat, ch.lon, ch.system) : null;
      const skyChart: SkyChart | null =
        ch && chart
          ? {
              zenith: zenithDir(now, ch.lat, ch.lon),
              cusps: chart.cusps.map((c) => eclipticDirOfDate(c, 0, skyNow)),
              middles: chart.cusps.map((c) => eclipticDirOfDate(c + 15, -11, skyNow)),
              asc: eclipticDirOfDate(chart.asc, 2.5, skyNow),
              mc: eclipticDirOfDate(chart.mc, 2.5, skyNow),
              key: `${ch.lat},${ch.lon},${ch.system},${Math.round(chart.lst * 20)}`,
            }
          : null;
      const signOf = (id: BodyId): string => {
        const t = find(trueBodies, id).pos;
        const lon = lonOfDateFromVector([t[0] - trueCam[0], t[1] - trueCam[1], t[2] - trueCam[2]], skyNow);
        const s = signOfLon(lon);
        return chart ? `${s.glyph} ${formatSignDeg(lon)} · house ${houseOf(lon, chart.cusps)}` : `${s.glyph} ${s.name}`;
      };
      // The wheel: with a chart on, once Earth is well below (more than 6 of its radii away).
      const earthB = find(trueBodies, 'earth');
      const earthShown = find(bodies, 'earth');
      const fromEarth = len3(sub3(pos, earthShown.pos)) / earthShown.info.radiusKm;
      const wheelOn = !!(ch && chart) && far <= 0.5 && fromEarth > 6;
      let haloShown = false;
      const placed: Array<[number, number]> = [];
      for (const b of bodies) {
        const el = labels.get(b.info.id);
        if (!el) continue;
        const rel = new THREE.Vector3(b.pos[0] - pos[0], b.pos[1] - pos[1], b.pos[2] - pos[2]);
        const d = rel.length();
        v3.copy(rel).project(cam);
        const behind = rel.clone().applyQuaternion(inv).z > 0;
        const angR = Math.asin(Math.min(1, b.info.radiusKm / d));
        const pxR = (angR / fovRad) * H;
        // The dot: wherever the body is in view but smaller than a few pixels, unless a nearer body hides it.
        const mk = markers.get(b.info.id);
        if (mk) {
          const mx = ((v3.x + 1) / 2) * W, my = ((1 - v3.y) / 2) * H;
          const show = !behind && far <= 0.5 && pxR < 4 && Math.abs(v3.x) <= 1 && Math.abs(v3.y) <= 1 && !hidden({ x0: mx, y0: my, x1: mx, y1: my }, d, b.info.id);
          mk.style.display = show ? 'block' : 'none';
          if (show) {
            mk.style.transform = `translate(${mx}px, ${my}px)`;
            // The colour of its path (the Sun's line for the Sun).
            const c = b.info.id === 'sun' ? L.theme.sunLine : b.info.id === 'moon' ? L.theme.moon : L.theme.planets[b.info.id as PlanetId];
            if (mk.style.background !== c) mk.style.background = c;
          }
        }
        // A body close by can fill the view with its centre off screen: still name it.
        const big = pxR > 0.4 * H;
        if (far > 0.5 || behind || (!big && (Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1))) {
          el.style.display = 'none';
          continue;
        }
        // Beside the body, kept on screen (when it fills the view, at the top left).
        const rawX = ((v3.x + 1) / 2) * W + Math.max(6, pxR * 0.72), rawY = ((1 - v3.y) / 2) * H - Math.max(6, pxR * 0.72);
        const offView = rawX < 0 || rawX > W || rawY < 0 || rawY > H;
        const lx = big && offView ? 16 : Math.min(Math.max(rawX, 8), W - 180);
        const ly = big && offView ? H * 0.5 : Math.min(Math.max(rawY, 16), H - 16);
        // Don't stack names: a body right beside one already named (the Moon by Earth, from afar) stays unnamed
        // (unless it is the one picked out).
        const picked = L.overlays.highlight === b.info.id;
        el.classList.toggle('hl', picked);
        if (picked && !wheelOn) {
          const hx = ((v3.x + 1) / 2) * W, hy = ((1 - v3.y) / 2) * H;
          const size = Math.max(34, Math.min(0.6 * H, 2 * pxR + 24));
          halo.style.display = 'block';
          halo.style.width = halo.style.height = `${size}px`;
          // Placed by left/top: its pulse scales it, which would also move a transform's offset.
          halo.style.left = `${hx - size / 2}px`;
          halo.style.top = `${hy - size / 2}px`;
          haloShown = true;
        }
        if (!picked && placed.some(([x, y]) => Math.abs(x - lx) < 60 && Math.abs(y - ly) < 12)) {
          el.style.display = 'none';
          continue;
        }
        const text = `${b.info.name} · ${formatSize(apparentDiameter(b.info.radiusKm, d))}${L.overlays.zodiac && b.info.id !== nearId ? ` · in ${signOf(b.info.id)}` : ''}`;
        if (hidden({ x0: lx, y0: ly, x1: lx + labelWidth(text, 'body'), y1: ly + 13 }, d, b.info.id)) {
          el.style.display = 'none';
          continue;
        }
        placed.push([lx, ly]);
        el.style.display = 'block';
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        if (el.textContent !== text) el.textContent = text;
      }
      if (!haloShown) halo.style.display = 'none';
      wheel.update(
        wheelOn && chart
          ? {
              centre: [earthShown.pos[0] - pos[0], earthShown.pos[1] - pos[1], earthShown.pos[2] - pos[2]],
              radiusKm: WHEEL_RADII * earthShown.info.radiusKm,
              shift: skyNow.lonShift,
              cusps: chart.cusps,
              asc: chart.asc,
              mc: chart.mc,
              bodies: trueBodies
                .filter((b) => b.info.id !== 'earth')
                .map((b) => {
                  const lon = lonOfDateFromVector([b.pos[0] - earthB.pos[0], b.pos[1] - earthB.pos[1], b.pos[2] - earthB.pos[2]], skyNow);
                  const picked = L.overlays.highlight === b.info.id;
                  const sg = signOfLon(lon);
                  return { id: b.info.id, lon, text: picked ? `${b.info.name} · ${formatSignDeg(lon)} · house ${houseOf(lon, chart.cusps)}` : `${b.info.name} ${Math.floor(sg.deg)}°` };
                }),
              highlight: L.overlays.highlight ?? null,
              zodiac: L.theme.sky.zodiac,
              accent: L.theme.sky.labelZodiac,
            }
          : null,
        cam,
        inv,
        W,
        H,
      );

      // Sky labels: directions on the sky sphere, kept clear of bodies and bright stars.
      const sl: readonly SkyLabel[] = sky ? sky.update({ ...L.overlays, equinoxShift: skyNow.lonShift, chart: skyChart }) : [];
      const starPts: Array<[number, number]> = [];
      if (sky && sl.length > 0) {
        for (const d of sky.brightStars) {
          const rel = new THREE.Vector3(d[0], d[1], d[2]);
          if (rel.clone().applyQuaternion(inv).z >= 0) continue;
          v3.copy(rel).project(cam);
          if (Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) continue;
          starPts.push([((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H]);
        }
      }
      const coversStar = (r: Rect, own?: readonly [number, number]): boolean =>
        starPts.some(([x, y]) => (!own || Math.hypot(x - own[0], y - own[1]) > 2) && x > r.x0 - 4 && x < r.x1 + 4 && y > r.y0 - 4 && y < r.y1 + 4);
      for (let i = 0; i < skyLabels.length; i++) {
        const el = skyLabels[i]!;
        const g = sl[i];
        if (!g) {
          el.style.display = 'none';
          continue;
        }
        const rel = new THREE.Vector3(g.dir[0] * 1e12, g.dir[1] * 1e12, g.dir[2] * 1e12);
        if (rel.clone().applyQuaternion(inv).z > 0) {
          el.style.display = 'none';
          continue;
        }
        v3.copy(rel).project(cam);
        if (Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) {
          el.style.display = 'none';
          continue;
        }
        const ax = ((v3.x + 1) / 2) * W, ay = ((1 - v3.y) / 2) * H;
        const w = labelWidth(g.text, g.kind), h = 13;
        const base: [number, number] = g.kind === 'star' ? [ax + 6, ay - 6] : [ax, ay];
        let spot: [number, number] | null = null;
        for (const [dx, dy] of [[0, 0], [0, -14], [0, 14], [-w - 10, 0]] as const) {
          const r = { x0: base[0] + dx, y0: base[1] + dy, x1: base[0] + dx + w, y1: base[1] + dy + h };
          if (!hidden(r) && !coversStar(r, g.kind === 'star' ? [ax, ay] : undefined)) {
            spot = [r.x0, r.y0];
            break;
          }
        }
        if (!spot) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        if (el.dataset.kind !== g.kind) el.dataset.kind = g.kind;
        el.style.transform = `translate(${spot[0]}px, ${spot[1]}px)`;
        if (el.textContent !== g.text) el.textContent = g.text;
      }

      // Grid and galaxy labels.
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
        const gx = ((v3.x + 1) / 2) * W + 4, gy = ((1 - v3.y) / 2) * H + (g.kind === 'time' ? -16 : 2);
        if (z > 0 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1 || hidden({ x0: gx, y0: gy, x1: gx + labelWidth(g.text, g.kind), y1: gy + 13 }, rel.length())) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = 'block';
        const th = L.theme;
        el.style.color = g.kind === 'time' ? th.tickText : g.kind === 'galaxy' ? th.sky.path : th.distanceText;
        if (el.dataset.kind !== g.kind) el.dataset.kind = g.kind;
        if ((el.dataset.action ?? '') !== (g.action ?? '')) el.dataset.action = g.action ?? '';
        el.title = g.action === 'sun' ? 'Warp back to the solar system' : g.action ? 'Fly over there and have a look' : '';
        el.style.transform = `translate(${gx}px, ${gy}px)`;
        if (el.textContent !== g.text) el.textContent = g.text;
      }

      // Under the pointer: latitude and longitude on whichever body it touches.
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
          } else if (galaxy) {
            // Out here, the black hole and the neighbour galaxies are named when pointed at.
            let near: { t: number; text: string } | null = null;
            for (const h of galaxy.hoverables(now)) {
              const t = raySphere([0, 0, 0], dv, [h.centre[0] - pos[0], h.centre[1] - pos[1], h.centre[2] - pos[2]], h.radiusKm);
              if (t !== null && (!near || t < near.t)) near = { t, text: h.text };
            }
            if (near) text = near.text;
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
        const inGalaxy = far > 0.5;
        const m = L.measure === 'near' && inGalaxy ? 'galaxy' : L.measure;
        const sphere = sphereOf(m === 'near' ? near.id : m, bodies, now);
        const nearR = find(bodies, near.id).info.radiusKm;
        const r = len3(sub3(pos, sunPos));
        L.onHud({
          nearName: inGalaxy ? 'Galaxy' : NAME(near.id),
          sphereName: sphere.name,
          arc: arcPosition(pos, sphere),
          decimals: m === 'galaxy' ? 6 : m === 'sun' ? 2 : 1,
          flattening: m === 'galaxy' ? 0 : find(bodies, sphere.id as BodyId).info.flattening,
          speedRadii: cruiseSpeed(near.altitude) / nearR,
          inGalaxy,
          // The grid says once how far apart its lines are; far out, the Sun's path in light years.
          statement: far > 0.5 ? (galaxy ? RULER_STATEMENT : '') : paths.statement(),
          bar: far > 0.5 ? { km: 0, px: 0 } : paths.bar(),
          hint: flight?.warp
            ? ''
            : r > WARP_OUT_KM
              ? inGalaxy
                ? 'Fly anywhere, the black hole at the centre included. Fly straight at the Sun, or click ☉ The Sun now, to warp back.'
                : ''
              : r > WARP_HINT_KM
                ? `${Math.round(r / 149_597_870.7)} AU from the Sun. Keep backing away (S): at 1,000 AU you warp out to the whole galaxy.`
                : '',
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      onApiRef.current?.(null);
      watched?.done?.(false);
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseLook);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      labels.forEach((el) => el.remove());
      markers.forEach((el) => el.remove());
      gridLabels.forEach((el) => el.remove());
      skyLabels.forEach((el) => el.remove());
      halo.remove();
      wheel.dispose();
      disposed = true;
      sky?.dispose();
      galaxy?.dispose();
      paths.dispose();
      scene.dispose();
    };
    // Set up once; the loop reads live values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restyle in place when the theme changes (Dark, Bright, Colour).
  useEffect(() => {
    styleRef.current(theme);
  }, [theme]);

  // Carry out each new command from the shared controls.
  const doneSeq = useRef(-1);
  useEffect(() => {
    if (command && command.seq !== doneSeq.current) {
      doneSeq.current = command.seq;
      runRef.current(command);
    }
  }, [command]);

  return (
    <div
      className="fly"
      data-ui={theme.ui}
      style={
        {
          background: theme.sky.background,
          '--sky-label': theme.sky.label,
          '--sky-star': theme.sky.labelStar,
          '--sky-zodiac': theme.sky.labelZodiac,
          '--sky-galactic': theme.sky.labelGalactic,
          '--label-halo': theme.sky.labelHalo,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        className="fly-canvas"
        aria-label="The solar system in 3D. Click to steer with the mouse, as in Minecraft (Escape lets go): W A S D fly level, Space up, Shift down, Ctrl faster. Drag or scroll to look around where you stand; pinch to widen or narrow the view; Shift with scroll or pinch zooms time; W A S D to move, R and F up and down, Shift to go faster. Click a name to fly just above that body, over its north pole."
      />
      <div ref={markersRef} className="fly-markers" aria-hidden="true" />
      <div ref={labelsRef} className="fly-labels" aria-hidden="true" />
      <div ref={tipRef} className="fly-tip" aria-hidden="true" />
      <div ref={stickRef} className="fly-stick" aria-hidden="true">
        <span />
      </div>
      <p ref={touchHintRef} className="fly-touch-hint" aria-hidden="true">
        Left thumb: fly · Drag: look · Pinch: forward and back · Two fingers: slide · Tap: hide controls
      </p>
      <div ref={warpRef} className="fly-warp" aria-hidden="true">
        <span />
      </div>
      <p ref={errorRef} className="fly-error" />
    </div>
  );
}
