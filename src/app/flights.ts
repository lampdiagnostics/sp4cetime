/**
 * Flying between a path's points (ADR-0017). A flight always starts from what is on
 * screen now and ends exactly at the point, and it is never a cut:
 *
 * - In the calendar, time flies along a van Wijk–Nuij curve (zoom out until both moments
 *   fit, glide, zoom in), while the view turns and resizes with it.
 * - In 3D, the camera journeys to the point's camera (distance falling by equal factors, a
 *   warp when the scale changes enormously), short jumps in time running along with it.
 * - Between the calendar and 3D, they meet where they already match: the calendar's own
 *   view in 3D, turned as the calendar is turned; the views cross-fade there.
 * - A big jump in time (more than a month) from or to the solar system in 3D goes by way
 *   of the calendar, where deep time can be seen passing, instead of blurring the planets.
 * - Changes of look (theme, round or full window, what is drawn, which boxes show) dissolve
 *   from a picture of the old look as the flight begins.
 */
import { viewMatrix, type Vec3 } from '../core/geometry';
import {
  type CalendarView,
  easeInOut,
  isBigTimeJump,
  lerpCalendarTurn,
  type PathPoint,
  type PointLook,
  zoomPath,
  zoomPathMs,
} from '../core/path';
import { addSeconds, diffSeconds, makeTime, type Time, timeAdd } from '../core/time';
import type { CanvasHandle } from './GalacticCanvas';
import type { PaneHandle } from './Pane';

export interface FlightDeps {
  pane(): PaneHandle | null;
  /** The present now. */
  clock(): Time;
  /** Hold the present here (time stands still during a flight). */
  setPresent(t: Time): void;
  /** On arrival: the present, and how time runs from there. */
  setClock(t: Time, speed: number, playing: boolean): void;
  /** Change the look (with a dissolve when anything changes). */
  applyLook(look: PointLook): void;
  reduced(): boolean;
}

/** Cancelled when the person stops presenting. */
export interface FlightSignal {
  cancelled: boolean;
}

const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));
const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));
/** The views' cross-fade (app.css `.view` transition). */
const CROSSFADE_MS = 480;

const seconds = (interval: Time): number => interval.day * 86_400 + interval.sec;
const axesOf = (c: CalendarView): readonly [Vec3, Vec3, Vec3] => {
  const m = viewMatrix(c.roll, c.yaw);
  return [m[0], m[1], m[2]];
};

/** Run `step(e)` with e easing from 0 to 1 over `ms`; false if cancelled. */
async function animate(ms: number, sig: FlightSignal, step: (e: number) => void): Promise<boolean> {
  const t0 = performance.now();
  for (;;) {
    if (sig.cancelled) return false;
    const k = ms <= 0 ? 1 : Math.min(1, (performance.now() - t0) / ms);
    step(easeInOut(k));
    if (k >= 1) return true;
    await frame();
  }
}

/** The calendar from its view now to `to` at the present `toP`, flying through time. */
async function calendarLeg(cal: CanvasHandle, d: FlightDeps, toP: Time, to: CalendarView, sig: FlightSignal): Promise<boolean> {
  const from = cal.getView();
  const fromP = d.clock();
  const W = cal.viewWidth();
  const c0 = timeAdd(fromP, from.offset), c1 = timeAdd(toP, to.offset);
  const z = zoomPath(c0, from.secondsPerPixel * W, c1, to.secondsPerPixel * W);
  // The Sun's place on screen, px from the centre, glides from one to the other.
  const px0 = -seconds(from.offset) / from.secondsPerPixel;
  const px1 = -seconds(to.offset) / to.secondsPerPixel;
  const turn = Math.abs(to.roll - from.roll) + Math.abs(to.yaw - from.yaw) + Math.abs(Math.log(to.spaceZoom / from.spaceZoom)) + Math.abs(to.panY - from.panY) / 200;
  const ms = d.reduced() ? 0 : Math.max(zoomPathMs(z.S), turn > 0.01 ? 1200 : 0);
  const ok = await animate(ms, sig, (e) => {
    const at = z.at(z.S * e);
    const spp = at.w / W;
    const offSec = -(px0 + (px1 - px0) * e) * spp;
    d.setPresent(addSeconds(at.centre, -offSec));
    cal.setView({ ...lerpCalendarTurn(from, to, e), secondsPerPixel: spp, offset: makeTime(0, offSec) });
  });
  if (!ok) return false;
  d.setPresent(toP);
  cal.setView(to);
  return true;
}

/** Into 3D at the calendar's view (they match there), cross-fading. */
async function into3D(pane: PaneHandle, sig: FlightSignal): Promise<boolean> {
  if (sig.cancelled) return false;
  const ok = await pane.setView3D(true);
  await sleep(CROSSFADE_MS * 0.6);
  return ok && !sig.cancelled;
}

/** Out of 3D to the calendar: fly to the calendar's view in 3D, turned as `cal` will be, then cross-fade. */
async function outOf3D(pane: PaneHandle, cal: CanvasHandle, turnTo: CalendarView, sig: FlightSignal): Promise<boolean> {
  const fly = pane.fly();
  if (fly && !(await fly.flyOverview(axesOf(turnTo)))) return false;
  if (sig.cancelled) return false;
  // The calendar takes over turned as the 3D view was.
  cal.setView({ roll: turnTo.roll, yaw: turnTo.yaw });
  await pane.setView3D(false);
  await sleep(CROSSFADE_MS * 0.6);
  return !sig.cancelled;
}

/** A 3D journey to the point's camera; time (a short jump) runs along with it. */
async function flyLeg(pane: PaneHandle, d: FlightDeps, to: PathPoint, sig: FlightSignal): Promise<boolean> {
  // A flight cancelled while waiting (a newer press) must not take the camera.
  if (sig.cancelled) return false;
  const fly = pane.fly();
  if (!fly || !to.fly) return true;
  const p0 = d.clock();
  const dt = diffSeconds(to.present, p0);
  let arrived: boolean | null = null;
  void fly.flyTo(to.fly).then((a) => (arrived = a));
  const t0 = performance.now();
  const TIME_MS = d.reduced() ? 0 : 2400;
  while (arrived === null) {
    if (sig.cancelled) return false;
    const k = TIME_MS === 0 ? 1 : Math.min(1, (performance.now() - t0) / TIME_MS);
    if (dt !== 0) d.setPresent(k >= 1 ? to.present : addSeconds(p0, dt * easeInOut(k)));
    await frame();
  }
  d.setPresent(to.present);
  return arrived;
}

/**
 * Fly from what is on screen now to the point. Resolves true on arrival, false if it was
 * interrupted (a drag in 3D, say) or cancelled.
 */
export async function flyToPoint(to: PathPoint, d: FlightDeps, sig: FlightSignal): Promise<boolean> {
  const pane = d.pane();
  const cal = pane?.calendar();
  if (!pane || !cal) return false;
  const from = pane.snapshot();
  const from3D = from.view !== 'calendar';
  const to3D = to.view !== 'calendar' && to.fly !== null;
  // Time stands still while flying; the point sets how it runs on arrival.
  d.setPresent(d.clock());
  d.applyLook(to.look);
  pane.setMeasure(to.look.measure);

  let ok = true;
  if (!from3D && !to3D) ok = await calendarLeg(cal, d, to.present, to.calendar, sig);
  else if (!from3D && to3D) {
    ok = (await calendarLeg(cal, d, to.present, to.calendar, sig)) && (await into3D(pane, sig)) && (await flyLeg(pane, d, to, sig));
  } else if (from3D && !to3D) {
    ok = (await outOf3D(pane, cal, to.calendar, sig)) && (await calendarLeg(cal, d, to.present, to.calendar, sig));
  } else {
    const big = isBigTimeJump(d.clock(), to.present) && !(from.view === 'galaxy' && to.view === 'galaxy');
    if (big) {
      ok =
        (await outOf3D(pane, cal, to.calendar, sig)) &&
        (await calendarLeg(cal, d, to.present, to.calendar, sig)) &&
        (await into3D(pane, sig)) &&
        (await flyLeg(pane, d, to, sig));
    } else ok = await flyLeg(pane, d, to, sig);
  }
  if (!ok || sig.cancelled) return false;
  // Exactly the point, then time runs (or holds) as it did there.
  if (!to3D) cal.setView(to.calendar);
  else {
    pane.fly()?.setState(to.fly!);
    cal.setView(to.calendar);
  }
  d.setClock(to.present, to.speed, to.playing);
  return true;
}
