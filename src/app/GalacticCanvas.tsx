import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { type Camera, clampZoom, pan, zoomAt } from '../core/camera';
import { DEFAULT_ROLL } from '../core/geometry';
import { drawFrame, layout, type ViewOptions } from '../core/render';
import type { Theme } from '../core/theme';
import { fromUnixMs, type Time } from '../core/time';

export interface CanvasHandle {
  /** Animate to a zoom level (seconds across the screen), optionally recentring. */
  flyTo(spanSeconds: number | null, center?: Time): void;
  zoomBy(factor: number): void;
  panBy(fraction: number): void;
  rollBy(radians: number): void;
  resetRoll(): void;
}

type CanvasView = Omit<ViewOptions, 'roll'>;

interface Props {
  theme: Theme;
  view: CanvasView;
  /** Follow the present moment: the centre advances in real time. */
  live: boolean;
  onLiveChange: (live: boolean) => void;
  initialSpanSeconds: number;
  onCameraChange: (cam: Camera) => void;
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

export function GalacticCanvas({ theme, view, live, onLiveChange, initialSpanSeconds, onCameraChange, handleRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ center: nowTime(), secondsPerPixel: 1, width: 0, height: 0 });
  const rollRef = useRef(DEFAULT_ROLL);
  const themeRef = useRef(theme);
  const viewRef = useRef(view);
  const liveRef = useRef(live);
  const flightRef = useRef<Flight | null>(null);
  const onChangeRef = useRef(onCameraChange);
  const onLiveRef = useRef(onLiveChange);
  themeRef.current = theme;
  viewRef.current = view;
  liveRef.current = live;
  onChangeRef.current = onCameraChange;
  onLiveRef.current = onLiveChange;

  const setCam = (cam: Camera): void => {
    camRef.current = cam;
    onChangeRef.current(cam);
  };
  const stopLive = (): void => {
    if (liveRef.current) {
      liveRef.current = false;
      onLiveRef.current(false);
    }
  };
  /** Zoom about screen x, or about the present while following it. */
  const zoom = (x: number, factor: number): void => {
    const cam = camRef.current;
    setCam(zoomAt(cam, liveRef.current ? cam.width / 2 : x, factor));
  };

  useImperativeHandle(handleRef, () => ({
    flyTo(spanSeconds, center) {
      if (center) setCam({ ...camRef.current, center });
      const cam = camRef.current;
      const target =
        spanSeconds === null ? cam.secondsPerPixel : clampZoom(spanSeconds / Math.max(viewWidth(cam, viewRef.current.round), 1));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      flightRef.current = {
        fromLog: Math.log(cam.secondsPerPixel),
        toLog: Math.log(target),
        start: performance.now(),
        duration: reduced ? 0 : 700,
      };
    },
    zoomBy(factor) {
      flightRef.current = null;
      zoom(camRef.current.width / 2, factor);
    },
    panBy(fraction) {
      flightRef.current = null;
      stopLive();
      const cam = camRef.current;
      setCam(pan(cam, -fraction * cam.width));
    },
    rollBy(radians) {
      rollRef.current += radians;
    },
    resetRoll() {
      rollRef.current = DEFAULT_ROLL;
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
    let gesture: { x0: number; y0: number; axis: 'x' | 'y' | null } | null = null;
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      flightRef.current = null;
      gesture = pointers.size === 1 ? { x0: p.x, y0: p.y, axis: null } : null;
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
        if (gesture.axis === 'x') {
          stopLive();
          setCam(pan(camRef.current, p.x - prev.x));
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
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      gesture = null;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      flightRef.current = null;
      const scale = e.deltaMode === 1 ? 16 : 1;
      const { x } = local(e);
      if (e.shiftKey) {
        rollRef.current += e.deltaY * scale * ROLL_PER_PX * 0.5;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        stopLive();
        setCam(pan(camRef.current, -e.deltaX * scale));
      } else {
        zoom(x, Math.exp(e.deltaY * scale * 0.0015));
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
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
      // Live: the present stays under the centre, so the grid and axis flow past
      // at exactly one second per second.
      if (liveRef.current) setCam({ ...camRef.current, center: now });
      const cam = camRef.current;
      if (cam.width > 0) {
        drawFrame(ctx, { cam, theme: themeRef.current, now, view: { ...viewRef.current, roll: rollRef.current } });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
    // The loop reads live values through refs; it is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="galactic-canvas" />;
}
