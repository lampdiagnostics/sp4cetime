import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { type Camera, clampZoom, pan, zoomAt } from '../core/camera';
import { drawFrame } from '../core/render';
import type { Theme } from '../core/theme';
import { fromUnixMs, type Time } from '../core/time';

export interface CanvasHandle {
  /** Animate to a zoom level (seconds across the screen), optionally recentring. */
  flyTo(spanSeconds: number | null, center?: Time): void;
  zoomBy(factor: number): void;
  panBy(fraction: number): void;
}

interface Props {
  theme: Theme;
  initialCenter: Time;
  initialSpanSeconds: number;
  motion: boolean;
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

export function GalacticCanvas({ theme, initialCenter, initialSpanSeconds, motion, onCameraChange, handleRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ center: initialCenter, secondsPerPixel: 1, width: 0, height: 0 });
  const themeRef = useRef(theme);
  const motionRef = useRef(motion);
  const flightRef = useRef<Flight | null>(null);
  const onChangeRef = useRef(onCameraChange);
  themeRef.current = theme;
  motionRef.current = motion;
  onChangeRef.current = onCameraChange;

  const setCam = (cam: Camera): void => {
    camRef.current = cam;
    onChangeRef.current(cam);
  };

  useImperativeHandle(handleRef, () => ({
    flyTo(spanSeconds, center) {
      if (center) setCam({ ...camRef.current, center });
      const cam = camRef.current;
      const target = spanSeconds === null ? cam.secondsPerPixel : clampZoom(spanSeconds / Math.max(cam.width, 1));
      flightRef.current = {
        fromLog: Math.log(cam.secondsPerPixel),
        toLog: Math.log(target),
        start: performance.now(),
        duration: motionRef.current ? 700 : 0,
      };
    },
    zoomBy(factor) {
      flightRef.current = null;
      const cam = camRef.current;
      setCam(zoomAt(cam, cam.width / 2, factor));
    },
    panBy(fraction) {
      flightRef.current = null;
      const cam = camRef.current;
      setCam(pan(cam, -fraction * cam.width));
    },
  }));

  // Size, input and the render loop.
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
      const secondsPerPixel = first ? clampZoom(initialSpanSeconds / rect.width) : cam.secondsPerPixel;
      first = false;
      setCam({ ...cam, width: rect.width, height: rect.height, secondsPerPixel });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Pointer input: one pointer drags (scrubs time), two pointers pinch-zoom.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const local = (e: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      flightRef.current = null;
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
      if (pointers.size === 1) {
        setCam(pan(camRef.current, p.x - prev.x));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && dist > 0) setCam(zoomAt(camRef.current, (a.x + b.x) / 2, pinchDist / dist));
        pinchDist = dist;
      }
    };
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      flightRef.current = null;
      const scale = e.deltaMode === 1 ? 16 : 1;
      const { x } = local(e as unknown as PointerEvent);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setCam(pan(camRef.current, -e.deltaX * scale));
      } else {
        setCam(zoomAt(camRef.current, x, Math.exp(e.deltaY * scale * 0.0015)));
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    let gridOffset = 0;
    let now = fromUnixMs(Date.now());
    let nowCheckedAt = last;
    const frame = (ts: number): void => {
      const dt = Math.min((ts - last) / 1000, 0.1);
      last = ts;
      if (ts - nowCheckedAt > 30_000) {
        now = fromUnixMs(Date.now());
        nowCheckedAt = ts;
      }
      const f = flightRef.current;
      if (f) {
        const k = f.duration === 0 ? 1 : Math.min(1, (ts - f.start) / f.duration);
        const e = ease(k);
        setCam({ ...camRef.current, secondsPerPixel: Math.exp(f.fromLog + (f.toLog - f.fromLog) * e) });
        if (k >= 1) flightRef.current = null;
      }
      if (motionRef.current) gridOffset += themeRef.current.gridSpeedPxPerSec * dt;
      const cam = camRef.current;
      if (cam.width > 0) drawFrame(ctx, { cam, theme: themeRef.current, now, gridOffsetPx: gridOffset });
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
