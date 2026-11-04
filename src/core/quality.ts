/**
 * Smooth on any device: a governor that lowers the drawing resolution when frames are
 * slow and raises it again when there is room. The picture stays the same (only its
 * sharpness changes), so a slower laptop or phone keeps fluid motion instead of
 * stuttering. Pure logic, fed the time between frames.
 */
export interface Governor {
  /** The current resolution, device pixels per CSS pixel. */
  readonly scale: number;
  /** One frame took `ms`; returns a new scale when it should change, else null. */
  sample(ms: number): number | null;
}

export interface GovernorOptions {
  /** Highest scale (the screen's own, up to 2). */
  readonly max: number;
  /** Lowest scale it will go to. */
  readonly min?: number;
  /** Slower than this (ms a frame, smoothed) for `patience` frames: step down. */
  readonly slowMs?: number;
  /** Faster than this for `patience × 4` frames: step up. */
  readonly fastMs?: number;
  readonly patience?: number;
}

/** While a screenshot, GIF or video is being made, the resolution holds still (a recording slows frames; it should not soften them). */
let held = 0;
/** While recording, the resolution to draw at (device px per CSS px), or null to hold the one there is. */
let forced: number | null = null;
export function holdQuality(on: boolean, scale?: number): void {
  held = Math.max(0, held + (on ? 1 : -1));
  if (on && scale !== undefined) forced = scale;
  if (held === 0) forced = null;
}

export function createGovernor(o: GovernorOptions): Governor {
  const max = o.max;
  const min = Math.min(max, o.min ?? 0.75);
  const slowMs = o.slowMs ?? 24;
  const fastMs = o.fastMs ?? 13;
  const patience = o.patience ?? 45;
  let scale = max;
  let avg = 16.7;
  /** How much frame times wander: a browser capping the rate (Safari's Low Power Mode, 30 a second) is very regular. */
  let dev = 2;
  let slow = 0;
  let fast = 0;
  let cooldown = 0;
  return {
    get scale() {
      return scale;
    },
    sample(ms) {
      // Gaps (a hidden tab, a pause, a dialog) say nothing about drawing speed.
      if (held > 0) {
        // A recording sets its own resolution (sharp enough for 1080p), whatever the screen managed before.
        if (forced !== null && Math.abs(forced - scale) > 0.01) {
          scale = forced;
          return scale;
        }
        return null;
      }
      if (!(ms > 0) || ms > 250) return null;
      dev += (Math.abs(ms - avg) - dev) * 0.1;
      avg += (ms - avg) * 0.1;
      const capped = dev < 1.5 && Math.abs(avg - 1000 / 30) < 2.5;
      if (cooldown > 0) {
        cooldown--;
        return null;
      }
      slow = avg > slowMs && !capped ? slow + 1 : 0;
      fast = avg < fastMs ? fast + 1 : 0;
      let next = scale;
      if (slow >= patience && scale > min) next = Math.max(min, scale * 0.8);
      else if (fast >= patience * 4 && scale < max) next = Math.min(max, scale * 1.15);
      // After a recording raised it, come back down to the screen's own.
      if (scale > max) next = max;
      if (next === scale) return null;
      scale = Math.round(next * 100) / 100;
      slow = 0;
      fast = 0;
      cooldown = 60;
      return scale;
    },
  };
}
