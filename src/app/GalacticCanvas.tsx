import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { type Camera, clampZoom, pan, zoomAt } from '../core/camera';
import { DEFAULT_ROLL, MAX_YAW } from '../core/geometry';
import { drawFrame, layout, type SkyBackdrop, type ViewOptions } from '../core/render';
import { loadBackdrop } from './skyBackdrop';
import type { Theme } from '../core/theme';
import { MAX_TIME, MIN_TIME } from '../core/constants';
import { clampTime, diffSeconds, fromUnixMs, isZeroInterval, makeTime, type Time, timeAdd, timeDiff } from '../core/time';

export interface CanvasHandle {
  /** Animate to a zoom level (seconds across the screen). */
  flyTo(spanSeconds: number): void;
  /** Look at the present again: the Sun returns to the centre. */
  goNow(): void;
  zoomBy(factor: number): void;
  panBy(fraction: number): void;
  rollBy(radians: number): void;
  /** Turn the system about the screen's vertical axis. */
  yawBy(radians: number): void;
  /** Reset rotation and the Sun's position. */
  resetRoll(): void;
  /** Magnify space (orbit sizes) by a factor, independent of the time zoom. */
  spaceZoomBy(factor: number): void;
  resetSpaceZoom(): void;
}

/** Space zoom range: from fitting the chosen orbits to well inside the Moon's orbit. */
export const MAX_SPACE_ZOOM = 500;

type CanvasView = Omit<ViewOptions, 'roll' | 'yaw' | 'spaceZoom' | 'panY'>;

interface Props {
  theme: Theme;
  view: CanvasView;
  /** Called with true when the view is centred on the present, false when looking ahead or back. */
  onLiveChange: (live: boolean) => void;
  initialSpanSeconds: number;
  onCameraChange: (cam: Camera) => void;
  onSpaceZoomChange: (zoom: number) => void;
  handleRef: Ref<CanvasHandle>;
}

interface Flight {
  fromLog: number;
  toLog: number;
  start: number;
  duration: number;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const nowTime = (): Time => fromUnixMs(Date.now());
const ROLL_PER_PX = 0.008;

/** Width the zoom presets fit to: the round window's diameter, or the whole screen. */
function viewWidth(cam: Camera, round: boolean): number {
  return round ? 2 * (layout(cam, true).clipR ?? cam.width / 2) : cam.width;
}

export function GalacticCanvas({ theme, view, onLiveChange, initialSpanSeconds, onCameraChange, onSpaceZoomChange, handleRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ center: nowTime(), secondsPerPixel: 1, width: 0, height: 0 });
  const rollRef = useRef(DEFAULT_ROLL);
  const yawRef = useRef(0);
  const turnYaw = (d: number): void => {
    yawRef.current = Math.max(-MAX_YAW, Math.min(MAX_YAW, yawRef.current + d));
  };
  /** The Sun can be grabbed and moved; this is its line's vertical offset, px. */
  const panYRef = useRef(0);
  /** Where the Sun was drawn last frame (for grabbing it). */
  const sunRef = useRef({ x: NaN, y: NaN });
  // The real sky behind the calendar, loaded after the first frames.
  const skyRef = useRef<SkyBackdrop | null>(null);
  useEffect(() => {
    let live = true;
    loadBackdrop(import.meta.env.BASE_URL).then(
      (b) => {
        if (live) skyRef.current = b;
      },
      (e: unknown) => console.warn('Sky backdrop not loaded:', e),
    );
    return () => {
      live = false;
    };
  }, []);
  const spaceZoomRef = useRef(1);
  const onSpaceRef = useRef(onSpaceZoomChange);
  onSpaceRef.current = onSpaceZoomChange;
  const setSpaceZoom = (z: number): void => {
    spaceZoomRef.current = Math.min(MAX_SPACE_ZOOM, Math.max(1, z));
    onSpaceRef.current(spaceZoomRef.current);
  };
  const themeRef = useRef(theme);
  const viewRef = useRef(view);
  /**
   * The Sun is always the present moment. The view looks `offset` ahead of
   * (or behind) it and keeps flowing with real time, so the grid always passes
   * the Sun: a line labelled 02:55:00 crosses it when the clock reads 02:55:00.
   */
  const ZERO = makeTime(0);
  const offsetRef = useRef<Time>(ZERO);
  const nowRef = useRef<Time>(nowTime());
  const flightRef = useRef<Flight | null>(null);
  const onChangeRef = useRef(onCameraChange);
  const onLiveRef = useRef(onLiveChange);
  themeRef.current = theme;
  viewRef.current = view;
  onChangeRef.current = onCameraChange;
  onLiveRef.current = onLiveChange;

  const setCam = (cam: Camera): void => {
    camRef.current = cam;
    onChangeRef.current(cam);
  };
  /** Apply a camera move made by the user, keeping its offset from the present. */
  const moveTo = (cam: Camera): void => {
    const center = clampTime(cam.center, MIN_TIME, MAX_TIME);
    const wasLive = isZeroInterval(offsetRef.current);
    offsetRef.current = timeDiff(center, nowRef.current);
    setCam({ ...cam, center });
    const live = isZeroInterval(offsetRef.current);
    if (live !== wasLive) onLiveRef.current(live);
  };
  /**
   * Zooming always holds the Sun (the present) where it is on screen, so a zoom
   * can never carry it away. Its x in camera coordinates is where "now" falls.
   */
  const sunAnchorX = (cam: Camera): number => {
    const x = cam.width / 2 + diffSeconds(nowRef.current, cam.center) / cam.secondsPerPixel;
    return Number.isFinite(x) ? x : cam.width / 2;
  };
  const zoom = (factor: number): void => {
    const cam = camRef.current;
    moveTo(zoomAt(cam, sunAnchorX(cam), factor));
  };

  useImperativeHandle(handleRef, () => ({
    flyTo(spanSeconds) {
      const cam = camRef.current;
      const target = clampZoom(spanSeconds / Math.max(viewWidth(cam, viewRef.current.round), 1));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      flightRef.current = {
        fromLog: Math.log(cam.secondsPerPixel),
        toLog: Math.log(target),
        start: performance.now(),
        duration: reduced ? 0 : 700,
      };
    },
    goNow() {
      const wasLive = isZeroInterval(offsetRef.current);
      offsetRef.current = ZERO;
      setCam({ ...camRef.current, center: nowRef.current });
      if (!wasLive) onLiveRef.current(true);
    },
    zoomBy(factor) {
      flightRef.current = null;
      zoom(factor);
    },
    panBy(fraction) {
      flightRef.current = null;
      const cam = camRef.current;
      moveTo(pan(cam, -fraction * cam.width));
    },
    rollBy(radians) {
      rollRef.current += radians;
    },
    yawBy(radians) {
      turnYaw(radians);
    },
    resetRoll() {
      rollRef.current = DEFAULT_ROLL;
      yawRef.current = 0;
      panYRef.current = 0;
    },
    spaceZoomBy(factor) {
      setSpaceZoom(spaceZoomRef.current * factor);
    },
    resetSpaceZoom() {
      setSpaceZoom(1);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let first = true;
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cam = camRef.current;
      const sized = { ...cam, width: rect.width, height: rect.height };
      const secondsPerPixel = first
        ? clampZoom(initialSpanSeconds / Math.max(viewWidth(sized, viewRef.current.round), 1))
        : cam.secondsPerPixel;
      first = false;
      setCam({ ...cam, width: rect.width, height: rect.height, secondsPerPixel });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // One pointer:
    // - on the Sun: move it anywhere (sideways = through time, up/down = its line);
    // - on the Sun's line: slide along it through time;
    // - anywhere else: rotate the solar system (sideways = turn, up/down = roll).
    // Two pointers: pinch zoom.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let gesture: { kind: 'sun' | 'line' | 'rotate'; x0: number; y0: number; axis: 'x' | 'y' | null } | null = null;
    /** Pixels of movement before a rotation locks to turning (sideways) or rolling (up/down). */
    const AXIS_LOCK_PX = 6;
    /** Grab radius around the Sun, and half-height of the grabbable line, px. */
    const SUN_GRAB = 22;
    const LINE_GRAB = 10;
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (p: { x: number; y: number }): 'sun' | 'line' | 'rotate' => {
      const sun = sunRef.current;
      if (Math.hypot(p.x - sun.x, p.y - sun.y) <= SUN_GRAB) return 'sun';
      if (Math.abs(p.y - sun.y) <= LINE_GRAB) return 'line';
      return 'rotate';
    };
    const CURSORS = { sun: 'move', line: 'ew-resize', rotate: 'grab' } as const;
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      flightRef.current = null;
      const kind = hit(p);
      gesture = pointers.size === 1 ? { kind, x0: p.x, y0: p.y, axis: null } : null;
      canvas.style.cursor = kind === 'rotate' ? 'grabbing' : CURSORS[kind];
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent): void => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1 && gesture) {
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (gesture.kind === 'sun') {
          moveTo(pan(camRef.current, dx));
          const H = camRef.current.height;
          panYRef.current = Math.max(-H / 2, Math.min(H / 2, panYRef.current + dy));
        } else if (gesture.kind === 'line') {
          moveTo(pan(camRef.current, dx));
        } else {
          // One rotation at a time: the first few pixels decide turn or roll.
          if (gesture.axis === null) {
            const tx = p.x - gesture.x0, ty = p.y - gesture.y0;
            if (Math.hypot(tx, ty) < AXIS_LOCK_PX) return;
            gesture.axis = Math.abs(tx) >= Math.abs(ty) ? 'x' : 'y';
          }
          if (gesture.axis === 'x') turnYaw(dx * ROLL_PER_PX);
          else rollRef.current += dy * ROLL_PER_PX;
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && dist > 0) zoom(pinchDist / dist);
        pinchDist = dist;
      }
    };
    const onHover = (e: PointerEvent): void => {
      if (pointers.size > 0) return;
      canvas.style.cursor = CURSORS[hit(local(e))];
    };
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      gesture = null;
      canvas.style.cursor = '';
    };
    // Trackpad and mouse-wheel gestures do one thing at a time. The first event of a
    // gesture picks the action; it stays locked until the wheel has been still for a
    // moment, so a two-finger swipe that drifts diagonally never mixes zoom and time.
    type WheelAction = 'zoom' | 'time' | 'space' | 'turn' | 'roll';
    let wheelAction: WheelAction | null = null;
    let wheelTimer = 0;
    const WHEEL_IDLE_MS = 220;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (pointers.size > 0) return;
      flightRef.current = null;
      const scale = e.deltaMode === 1 ? 16 : 1;
      const dx = e.deltaX * scale, dy = e.deltaY * scale;
      if (wheelAction === null) {
        if (e.ctrlKey) wheelAction = 'zoom'; // trackpad pinch
        else if (e.altKey) wheelAction = 'space';
        else if (e.shiftKey) wheelAction = Math.abs(dx) > Math.abs(dy) ? 'turn' : 'roll';
        else wheelAction = Math.abs(dx) > Math.abs(dy) ? 'time' : 'zoom';
      }
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelAction = null;
      }, WHEEL_IDLE_MS);
      switch (wheelAction) {
        case 'zoom':
          // Pinch deltas are small; scroll deltas are large.
          zoom(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)));
          break;
        case 'space':
          setSpaceZoom(spaceZoomRef.current * Math.exp(-dy * 0.002));
          break;
        case 'time':
          moveTo(pan(camRef.current, -dx));
          break;
        case 'turn':
          turnYaw((dx || dy) * ROLL_PER_PX * 0.5);
          break;
        case 'roll':
          rollRef.current += dy * ROLL_PER_PX * 0.5;
          break;
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointermove', onHover);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const frame = (ts: number): void => {
      const now = nowTime();
      const f = flightRef.current;
      if (f) {
        const k = f.duration === 0 ? 1 : Math.min(1, (ts - f.start) / f.duration);
        const e = ease(k);
        const cam = camRef.current;
        const target = Math.exp(f.fromLog + (f.toLog - f.fromLog) * e);
        moveTo(zoomAt(cam, sunAnchorX(cam), target / cam.secondsPerPixel));
        if (k >= 1) flightRef.current = null;
      }
      nowRef.current = now;
      // The view flows with real time at its chosen offset from the present.
      setCam({ ...camRef.current, center: clampTime(timeAdd(now, offsetRef.current), MIN_TIME, MAX_TIME) });
      const cam = camRef.current;
      if (cam.width > 0) {
        const r = drawFrame(ctx, {
          cam,
          theme: themeRef.current,
          now,
          view: { ...viewRef.current, roll: rollRef.current, yaw: yawRef.current, spaceZoom: spaceZoomRef.current, panY: panYRef.current },
          backdrop: skyRef.current,
        });
        sunRef.current = { x: r.sunX, y: r.sunY };
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointermove', onHover);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
    // The loop reads live values through refs; it is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="galactic-canvas" />;
}
