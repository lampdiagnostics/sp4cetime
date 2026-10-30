import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { type Camera, clampZoom, pan, zoomAt } from '../core/camera';
import { DEFAULT_ROLL } from '../core/geometry';
import { drawFrame, layout, type ViewOptions } from '../core/render';
import type { Theme } from '../core/theme';
import { MAX_TIME, MIN_TIME } from '../core/constants';
import { clampTime, fromUnixMs, isZeroInterval, makeTime, type Time, timeAdd, timeDiff } from '../core/time';

export interface CanvasHandle {
  /** Animate to a zoom level (seconds across the screen). */
  flyTo(spanSeconds: number): void;
  /** Look at the present again: the Sun returns to the centre. */
  goNow(): void;
  zoomBy(factor: number): void;
  panBy(fraction: number): void;
  rollBy(radians: number): void;
  resetRoll(): void;
  /** Magnify space (orbit sizes) by a factor, independent of the time zoom. */
  spaceZoomBy(factor: number): void;
  resetSpaceZoom(): void;
}

/** Space zoom range: from fitting the chosen orbits to well inside the Moon's orbit. */
export const MAX_SPACE_ZOOM = 500;

type CanvasView = Omit<ViewOptions, 'roll' | 'spaceZoom' | 'panY'>;

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
/** Pixels of drag before a gesture locks to scrubbing (horizontal) or rolling (vertical). */
const AXIS_LOCK_PX = 6;
const ROLL_PER_PX = 0.008;

/** Width the zoom presets fit to: the round window's diameter, or the whole screen. */
function viewWidth(cam: Camera, round: boolean): number {
  return round ? 2 * (layout(cam, true).clipR ?? cam.width / 2) : cam.width;
}

export function GalacticCanvas({ theme, view, onLiveChange, initialSpanSeconds, onCameraChange, onSpaceZoomChange, handleRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ center: nowTime(), secondsPerPixel: 1, width: 0, height: 0 });
  const rollRef = useRef(DEFAULT_ROLL);
  /** The Sun can be grabbed and moved; this is its line's vertical offset, px. */
  const panYRef = useRef(0);
  /** Where the Sun was drawn last frame (for grabbing it). */
  const sunRef = useRef({ x: NaN, y: NaN });
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
  /** Zoom about screen x, or about the Sun while it is centred. */
  const zoom = (x: number, factor: number): void => {
    const cam = camRef.current;
    moveTo(zoomAt(cam, isZeroInterval(offsetRef.current) ? cam.width / 2 : x, factor));
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
      zoom(camRef.current.width / 2, factor);
    },
    panBy(fraction) {
      flightRef.current = null;
      const cam = camRef.current;
      moveTo(pan(cam, -fraction * cam.width));
    },
    rollBy(radians) {
      rollRef.current += radians;
    },
    resetRoll() {
      rollRef.current = DEFAULT_ROLL;
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

    // One pointer: horizontal drag scrubs time, vertical drag rolls the view
    // about the line of travel (locked per gesture). Two pointers: pinch zoom.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let gesture: { x0: number; y0: number; axis: 'x' | 'y' | 'sun' | null } | null = null;
    /** Grab radius around the Sun, px. */
    const SUN_GRAB = 22;
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      flightRef.current = null;
      const onSun = Math.hypot(p.x - sunRef.current.x, p.y - sunRef.current.y) <= SUN_GRAB;
      gesture = pointers.size === 1 ? { x0: p.x, y0: p.y, axis: onSun ? 'sun' : null } : null;
      canvas.style.cursor = onSun ? 'move' : '';
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
        if (gesture.axis === null) {
          const dx = p.x - gesture.x0, dy = p.y - gesture.y0;
          if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
          gesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
        if (gesture.axis === 'sun') {
          // Moving the Sun: sideways looks ahead or back in time; up and down moves
          // its line. The grid stays centred on it either way.
          moveTo(pan(camRef.current, p.x - prev.x));
          const H = camRef.current.height;
          panYRef.current = Math.max(-H / 2, Math.min(H / 2, panYRef.current + (p.y - prev.y)));
        } else if (gesture.axis === 'x') {
          moveTo(pan(camRef.current, p.x - prev.x));
        } else {
          rollRef.current += (p.y - prev.y) * ROLL_PER_PX;
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && dist > 0) zoom((a.x + b.x) / 2, pinchDist / dist);
        pinchDist = dist;
      }
    };
    const onHover = (e: PointerEvent): void => {
      if (pointers.size > 0) return;
      const p = local(e);
      canvas.style.cursor = Math.hypot(p.x - sunRef.current.x, p.y - sunRef.current.y) <= SUN_GRAB ? 'move' : '';
    };
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      gesture = null;
      canvas.style.cursor = '';
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      flightRef.current = null;
      const scale = e.deltaMode === 1 ? 16 : 1;
      const { x } = local(e);
      if (e.altKey) {
        // Option/Alt + scroll: zoom into space rather than time.
        setSpaceZoom(spaceZoomRef.current * Math.exp(-e.deltaY * scale * 0.002));
      } else if (e.shiftKey) {
        rollRef.current += e.deltaY * scale * ROLL_PER_PX * 0.5;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        moveTo(pan(camRef.current, -e.deltaX * scale));
      } else {
        zoom(x, Math.exp(e.deltaY * scale * 0.0015));
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
        setCam({ ...camRef.current, secondsPerPixel: Math.exp(f.fromLog + (f.toLog - f.fromLog) * e) });
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
          view: { ...viewRef.current, roll: rollRef.current, spaceZoom: spaceZoomRef.current, panY: panYRef.current },
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
