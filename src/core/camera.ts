/**
 * The camera maps time to screen x. It is camera-relative by construction:
 * every conversion goes through diffSeconds(t, center), so deep-time values
 * never enter screen maths directly.
 */
import { MAX_SECONDS_PER_PIXEL, MAX_TIME, MIN_SECONDS_PER_PIXEL, MIN_TIME } from './constants';
import { addSeconds, clampTime, diffSeconds, type Time } from './time';

export interface Camera {
  /** The moment under the centre of the screen. */
  readonly center: Time;
  /** Zoom: how many seconds one CSS pixel spans. */
  readonly secondsPerPixel: number;
  readonly width: number;
  readonly height: number;
}

export function timeToX(cam: Camera, t: Time): number {
  return cam.width / 2 + diffSeconds(t, cam.center) / cam.secondsPerPixel;
}

export function xToTime(cam: Camera, x: number): Time {
  return addSeconds(cam.center, (x - cam.width / 2) * cam.secondsPerPixel);
}

export function clampZoom(secondsPerPixel: number): number {
  return Math.min(MAX_SECONDS_PER_PIXEL, Math.max(MIN_SECONDS_PER_PIXEL, secondsPerPixel));
}

function withCenter(cam: Camera, center: Time): Camera {
  return { ...cam, center: clampTime(center, MIN_TIME, MAX_TIME) };
}

/** Drag the canvas by dx pixels (positive = content moves right = earlier time). */
export function pan(cam: Camera, dx: number): Camera {
  return withCenter(cam, addSeconds(cam.center, -dx * cam.secondsPerPixel));
}

/** Zoom by `factor` (>1 zooms out) keeping the time under screen x fixed. */
export function zoomAt(cam: Camera, x: number, factor: number): Camera {
  const anchor = xToTime(cam, x);
  const secondsPerPixel = clampZoom(cam.secondsPerPixel * factor);
  const center = addSeconds(anchor, -(x - cam.width / 2) * secondsPerPixel);
  return withCenter({ ...cam, secondsPerPixel }, center);
}

/** Visible time range [start, end]. */
export function visibleRange(cam: Camera): [Time, Time] {
  return [xToTime(cam, 0), xToTime(cam, cam.width)];
}
