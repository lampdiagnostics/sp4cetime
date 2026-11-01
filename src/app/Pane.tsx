import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import type { BodyId } from '../core/bodies';
import type { Camera } from '../core/camera';
import { viewMatrix, type Vec3 } from '../core/geometry';
import { formatLat, formatLon } from '../core/spheres';
import { densePaths, layout } from '../core/render';
import type { Theme } from '../core/theme';
import { CALENDAR_YEAR_LIMIT, formatDuration, formatTime, type Time, toCivil } from '../core/time';
import { formatKm } from '../core/ticks';
import { type CanvasHandle, GalacticCanvas } from './GalacticCanvas';
import { PlanetPicker } from './PlanetPicker';
import { ElementsPicker } from './ElementsPicker';
import { HelpButton } from './HelpButton';
import { DEFAULT_PRESET, ZOOM_PRESETS } from './presets';
import type { Settings } from './settings';
import { FlyBoundary } from './FlyBoundary';
import type { FlyCommand, FlyHud, Measure } from '../fly/FlyView';
import type { Destination } from '../fly/flight';

/** A request to the 3D view, before it is numbered. */
type FlyRequest = FlyCommand extends infer C ? (C extends unknown ? Omit<C, 'seq'> : never) : never;

/** The 3D view (Fly mode and the whole galaxy) loads on demand, with Three.js, so the calendar stays light. */
const FlyView = lazy(() => import('../fly/FlyView'));

const CREDIT_URL = 'https://x.com/Geosophyy/status/2115404526002041035';
const STROBE_CREDIT_URL = 'https://x.com/techartist_/status/2114819625242529992';

/** One scale only: nothing is compressed. (√ fit and linear were removed; see CHANGELOG.) */
const SCALE_NOTE = 'True proportions: orbits in their true sizes and orientation (pinch or scroll to size them)';
const SCALE_NOTE_3D = 'True scale: true distances, sizes and sunlight';

/** How fast time runs, forward or back: real time, then a minute to a century every second. */
const STEPS: ReadonlyArray<{ label: string; s: number }> = [
  { label: 'normal speed', s: 1 },
  { label: '1 minute/s', s: 60 },
  { label: '1 hour/s', s: 3600 },
  { label: '1 day/s', s: 86_400 },
  { label: '1 week/s', s: 7 * 86_400 },
  { label: '1 month/s', s: 2_629_800 },
  { label: '1 year/s', s: 31_557_600 },
  { label: '1 decade/s', s: 315_576_000 },
  { label: '1 century/s', s: 3_155_760_000 },
];
export const RATES: ReadonlyArray<{ label: string; rate: number }> = [
  ...[...STEPS].reverse().map((x) => ({ label: `◀ Back, ${x.label}`, rate: -x.s })),
  ...STEPS.map((x) => ({ label: x.s === 1 ? 'Live' : `▶ Forward, ${x.label}`, rate: x.s })),
];

/** Where the person can go, from any view. */
const DESTINATIONS: ReadonlyArray<{ id: Destination; label: string }> = [
  { id: 'overview', label: 'Solar system' },
  { id: 'geo', label: 'Geostationary orbit' },
  { id: 'leo', label: 'Low Earth orbit' },
  { id: 'earthMoon', label: 'Earth & Moon' },
  { id: 'moon', label: 'Moon' },
  { id: 'mars', label: 'Mars' },
  { id: 'jupiter', label: 'Jupiter' },
  { id: 'saturn', label: 'Saturn' },
  { id: 'sun', label: 'Sun' },
  { id: 'galaxy', label: 'Whole galaxy' },
];

/** One of x, y, z in radii of the sphere, rounded to what matters. */
function radii(a: FlyHud['arc'], i: 0 | 1 | 2): string {
  const v = a.r === 0 ? 0 : (a.xyz[i] / a.r) * a.radii;
  if (Math.abs(v) < 5e-5 * Math.max(1, a.radii)) return '0';
  return Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString('en-US') : v.toPrecision(4);
}

/** "07:39:12 GMT" for moments within the calendar range, else null. */
function gmtClock(t: Time): string | null {
  if (Math.abs(toCivil(t).year) > CALENDAR_YEAR_LIMIT) return null;
  const p = (n: number): string => String(Math.floor(n)).padStart(2, '0');
  return `${p(t.sec / 3600)}:${p((t.sec % 3600) / 60)}:${p(t.sec % 60)} GMT`;
}

export type PaneMode = 'calendar' | 'fly' | 'galaxy';

/**
 * The space grid's scale bar: two of its dashed lines (in its own brown, made solid enough
 * to read on the box) as far apart as they are on screen, the distance between them written
 * above, and a bar spanning them.
 */
function ScaleBar({ km, px, color }: { km: number; px: number; color: string }) {
  const ink = color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgba($1,$2,$3, 0.95)');
  // The grid's spacing, or a round part or multiple of it, so the bar fits the box (40–260 px).
  let f = 1;
  for (const g of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    f = g;
    if (px / g <= 260) break;
  }
  if (px < 40) {
    for (const g of [2, 5, 10, 20, 50, 100, 200, 500]) {
      f = 1 / g;
      if (px * g >= 40) break;
    }
  }
  const label = formatKm(km / f);
  const w = Math.round(px / f);
  const W = w + 8;
  return (
    <svg className="scale-bar" width={W} height={34} viewBox={`0 0 ${W} 34`} role="img" aria-label={`Space grid: ${label} between lines`}>
      <text x={W / 2} y={11} textAnchor="middle">
        {label}
      </text>
      <line x1={4} y1={15} x2={4} y2={33} stroke={ink} strokeWidth={1.5} strokeDasharray="4 3" />
      <line x1={w + 4} y1={15} x2={w + 4} y2={33} stroke={ink} strokeWidth={1.5} strokeDasharray="4 3" />
      <line x1={4} y1={24} x2={w + 4} y2={24} stroke={ink} strokeWidth={2} />
    </svg>
  );
}

/** What the window manager needs to know about a window. */
export interface PaneInfo {
  readonly mode: 'calendar' | 'fly';
  readonly inGalaxy: boolean;
  readonly live: boolean;
  /** Its round window, in the pane's own pixels (null when it is full). */
  readonly clip: { readonly cx: number; readonly cy: number; readonly r: number } | null;
}

export interface PaneHandle {
  show(m: PaneMode): void;
  goNow(): void;
  root(): HTMLElement | null;
}

interface Props {
  id: number;
  theme: Theme;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  clock: () => Time;
  /** How fast time runs now (0 while paused). */
  rate: number;
  /** The chosen speed and direction (kept while paused). */
  speed: number;
  /** Time running, or paused; ▶ Play and ❚❚ Pause set it. */
  playing: boolean;
  onPlay: (on: boolean) => void;
  changeRate: (r: number) => void;
  /** Move the shared present by this many seconds (a frozen strobe pose was clicked). */
  jumpBy: (dt: number) => void;
  chrome: 0 | 1 | 2;
  /** This window's controls are the ones in the boxes, and it takes the keyboard. */
  selected: boolean;
  onSelect: () => void;
  /** Where it is on screen, px. */
  box: { x: number; y: number; w: number; h: number };
  /** Drawn round (a dial or the round window) or full. */
  round: boolean;
  /** One of several dials: the whole pane is cut to its circle. */
  dial: boolean;
  /** Not shown (another window is full screen): nothing is drawn. */
  hidden: boolean;
  initialMode: PaneMode;
  /** Load the 3D view in the background soon after opening (the first window only). */
  prefetch3D: boolean;
  /** Where its boxes go (the screen's corners), while selected. */
  boxesHost: HTMLElement | null;
  handleRef: Ref<PaneHandle>;
  onInfo: (id: number, info: PaneInfo) => void;
}

/** The circle a dial is cut to: the round window plus its rim of ticks. */
export const RIM_PX = 14;

/**
 * One window: the galactic calendar, Fly mode or the whole galaxy, with its own view
 * settings, camera and place. The shared present, speed and theme come from outside.
 * While selected, its controls fill the screen's corner boxes.
 */
export function Pane(p: Props) {
  const { id, theme, settings, update, clock, rate, speed, playing, onPlay, changeRate, chrome, selected, box, round, dial, hidden } = p;
  const [mode, setMode] = useState<'calendar' | 'fly'>('calendar');
  const [measure, setMeasure] = useState<Measure>('near');
  const [flyHud, setFlyHud] = useState<FlyHud | null>(null);
  const [spaceStatement, setSpaceStatement] = useState('');
  const [spaceBar, setSpaceBar] = useState<{ km: number; px: number }>({ km: 0, px: 0 });
  const in3D = mode === 'fly';
  const inGalaxy = in3D && !!flyHud?.inGalaxy;
  const [command, setCommand] = useState<FlyCommand | null>(null);
  const seq = useRef(0);
  const send = (c: FlyRequest): void => setCommand({ ...c, seq: ++seq.current } as FlyCommand);
  // Load the 3D view shortly after the calendar first draws, so going there is instant.
  const [flyWanted, setFlyWanted] = useState(false);
  useEffect(() => {
    if (!p.prefetch3D) return;
    const t = window.setTimeout(() => setFlyWanted(true), 1500);
    return () => window.clearTimeout(t);
  }, [p.prefetch3D]);

  const [live, setLive] = useState(true);
  const [cam, setCam] = useState<Camera | null>(null);
  const canvas = useRef<CanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The canvas reports every camera change; the readouts re-render at most ~10 times a second.
  const pending = useRef<Camera | null>(null);
  const onCameraChange = useCallback((c: Camera) => {
    const first = pending.current === null;
    pending.current = c;
    if (first) {
      window.setTimeout(() => {
        setCam(pending.current);
        pending.current = null;
      }, 100);
    }
  }, []);

  const view = useMemo(
    () => ({
      scale: 'linear' as const, // the calendar: true proportions, sized by pinch and scroll
      planets: settings.planets,
      moon: settings.moon,
      rings: settings.rings,
      labels: settings.labels,
      round,
      spirals: settings.spirals,
      timeGrid: settings.timeGrid,
      distanceGrid: settings.distanceGrid,
      focus: settings.focus,
      constellations: settings.constellations,
      zodiac: settings.zodiac,
      galactic: settings.galactic,
      strobe: settings.strobe ? settings.strobeSteps : 0,
      text: chrome < 2,
    }),
    [settings, chrome, round],
  );
  const overlays = useMemo(
    () => ({
      spirals: settings.spirals,
      orbits: settings.rings,
      timeGrid: settings.timeGrid,
      spaceGrid: settings.distanceGrid,
      planets: settings.planets,
      moon: settings.moon,
      constellations: settings.constellations,
      zodiac: settings.zodiac,
      galactic: settings.galactic,
    }),
    [settings],
  );

  /** Into 3D from the calendar: Fly starts at the calendar's own view (turned as it is turned), then goes on. */
  const enter3D = (then?: Extract<FlyCommand, { kind: 'enter' }>['then']): void => {
    const r = canvas.current?.rotation() ?? { roll: 0, yaw: 0 };
    const m = viewMatrix(r.roll, r.yaw);
    const axes: readonly [Vec3, Vec3, Vec3] = [m[0], m[1], m[2]];
    setFlyWanted(true);
    send({ kind: 'enter', axes, ...(then && { then }) });
    setMode('fly');
  };
  const goTo = (d: Destination): void => {
    if (mode === 'fly') send({ kind: 'go', dest: d });
    else enter3D(d === 'overview' ? undefined : d === 'galaxy' ? { warpOut: true } : { go: d });
  };
  const openFly = (): void => {
    if (mode !== 'fly') enter3D();
    else if (inGalaxy) send({ kind: 'go', dest: 'overview' });
  };
  const openGalaxy = (): void => {
    if (mode !== 'fly') enter3D({ warpOut: true });
    else if (!inGalaxy) send({ kind: 'go', dest: 'galaxy' });
  };
  const onBodyClick = (b: BodyId): void => {
    if (mode === 'fly') send({ kind: 'above', id: b });
    else enter3D({ above: b });
  };
  const show = (m: PaneMode): void => {
    if (m === 'calendar') setMode('calendar');
    else if (m === 'fly') openFly();
    else openGalaxy();
  };
  const showRef = useRef(show);
  showRef.current = show;
  // A new window opens in its own view.
  useEffect(() => {
    if (p.initialMode !== 'calendar') {
      // After the calendar has measured itself (its turn sets the 3D view's start).
      const t = window.setTimeout(() => showRef.current(p.initialMode), 50);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localNow = (): void => {
    canvas.current?.goNow();
    setLive(true);
  };
  useImperativeHandle(p.handleRef, () => ({
    show: (m) => showRef.current(m),
    goNow: localNow,
    root: () => rootRef.current,
  }));
  const goNow = (): void => {
    changeRate(1);
    localNow();
  };
  const zoomBy = (f: number): void => {
    if (mode === 'fly') send({ kind: 'dolly', amount: f < 1 ? 0.6 : -0.6 });
    else canvas.current?.zoomBy(f);
  };
  // Keys that work in every view (the selected window only).
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
      if (mode === 'fly' && (e.key === 'n' || e.key === 'N' || e.key === 't')) goNow();
      else if (mode === 'fly' && (e.key === '+' || e.key === '=')) zoomBy(0.7);
      else if (mode === 'fly' && e.key === '-') zoomBy(1 / 0.7);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    const c = canvas.current;
    if (!c || mode !== 'calendar') return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (e.shiftKey ? c.yawBy(-0.1) : c.panBy(-0.1)),
      ArrowRight: () => (e.shiftKey ? c.yawBy(0.1) : c.panBy(0.1)),
      ArrowUp: () => c.rollBy(-0.1),
      ArrowDown: () => c.rollBy(0.1),
      '+': () => c.zoomBy(0.7),
      '=': () => c.zoomBy(0.7),
      '-': () => c.zoomBy(1 / 0.7),
      ']': () => c.spaceZoomBy(1.5),
      '[': () => c.spaceZoomBy(1 / 1.5),
      t: goNow,
      n: goNow,
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  // The Sun is always the present; the readout's headline is the present moment.
  const now = clock();
  const gmt = gmtClock(now);
  const banded = cam && mode === 'calendar' ? settings.spirals && densePaths(settings.planets, cam.secondsPerPixel) : false;
  // How much time is across the window (the round window's width, or the screen's), and which preset that is.
  const across = cam ? (round ? 2 * (layout(cam, true).clipR ?? cam.width / 2) : cam.width) : 1;
  const spanSeconds = cam ? cam.secondsPerPixel * Math.max(1, across) : DEFAULT_PRESET.spanSeconds;
  const presetId = ZOOM_PRESETS.find((x) => Math.abs(Math.log(x.spanSeconds / spanSeconds)) < 0.05)?.id ?? '';

  // The round window, the same in 3D as in the calendar.
  const L = layout({ center: now, secondsPerPixel: 1, width: box.w, height: box.h }, true);
  // A dial is cut just outside its rim of ticks; so is a capture of the calendar (the 3D view's circle is exact).
  const clip = round && L.clipR ? { cx: L.cx, cy: L.clipY, r: L.clipR + (dial || !in3D ? RIM_PX : 0) } : null;
  const flyStyle: CSSProperties = round && L.clipR ? { clipPath: `circle(${L.clipR}px at 50% ${L.clipY}px)` } : {};
  const paneStyle: CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    background: dial ? 'transparent' : in3D ? theme.sky.background : theme.background,
    ...(dial && clip ? { clipPath: `circle(${clip.r}px at ${clip.cx}px ${clip.cy}px)` } : {}),
    ...(hidden ? { visibility: 'hidden' } : {}),
  };

  // Tell the window manager what it needs (view, clip) when that changes.
  const onInfo = p.onInfo;
  const ci = clip ? `${clip.cx},${clip.cy},${clip.r}` : '';
  useEffect(() => {
    onInfo(id, { mode, inGalaxy, live, clip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode, inGalaxy, live, ci, onInfo]);

  const boxes = (
    <>
      {/* Top left: when, and where */}
      <header className="corner tl">
        <div className="brand">
          sp4cetime <span>{inGalaxy ? 'Whole galaxy' : in3D ? 'Fly' : 'Galactic Calendar'}</span>
        </div>
        <output className="center-date" aria-live="off">
          {formatTime(now, 3600)}
        </output>
        {gmt && <div className="clock">{gmt}{rate !== 1 && <span className="rate"> · {rate === 0 ? 'Paused' : RATES.find((r) => r.rate === rate)?.label.replace(/^[◀▶❚ ]+/, '')}</span>}</div>}
        {in3D && flyHud && (
          // In Fly and the galaxy: where you are, as an arc position on a chosen sphere.
          <div className="fly-where" aria-live="off">
            <label>
              Position on{' '}
              <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} aria-label="Sphere to measure from">
                <option value="near">{flyHud.nearName} (nearest)</option>
                <option value="sun">the Sun</option>
                <option value="galaxy">the galaxy (Sgr A*)</option>
              </select>
            </label>
            <div className="dms">
              {formatLat(flyHud.arc.lat, flyHud.decimals)} · {formatLon(flyHud.arc.lon, flyHud.decimals)}
            </div>
            <div className="facts">
              <span title={`Distance from the centre of ${flyHud.sphereName}, in its radii`}>
                {flyHud.arc.radii < 1000 ? flyHud.arc.radii.toFixed(4) : Math.round(flyHud.arc.radii).toLocaleString('en-US')} radii out
              </span>
              <span title="x, y, z in radii of the sphere: x toward longitude 0, z toward north">
                x {radii(flyHud.arc, 0)} · y {radii(flyHud.arc, 1)} · z {radii(flyHud.arc, 2)}
              </span>
            </div>
            <div className="facts">
              <span>cruise {flyHud.speedRadii.toPrecision(3)} {flyHud.nearName} radii/s</span>
              {flyHud.flattening > 0 && (
                <span title="The model is a perfect sphere; this is how the real body differs">real shape flattened 1/{Math.round(1 / flyHud.flattening)}</span>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Bottom left: what is drawn, and where to go */}
      <nav className="corner bl" aria-label="Places, bodies and overlays">
        <label className="select menu">
          <span className="heading">Space</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) goTo(e.target.value as Destination);
              e.target.blur();
            }}
          >
            <option value="" disabled>
              Go to…
            </option>
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <span className="heading">View</span>
        <div className="row view-row">
          <PlanetPicker theme={theme} settings={settings} onChange={update} />
          <label className="select">
            <span className="visually-hidden">Centre the view on</span>
            <select
              value={settings.focus}
              onChange={(e) => {
                const f = e.target.value as Settings['focus'];
                update({ focus: f });
                if (in3D) send({ kind: 'face', id: f });
              }}
            >
              <option value="sun">Centre: Sun</option>
              <option value="earth">Centre: Earth (geocentric)</option>
            </select>
          </label>
        </div>
        <ElementsPicker settings={settings} onChange={update} />
        <p className="note">
          {in3D ? SCALE_NOTE_3D : SCALE_NOTE}
          {banded && <><br />Shaded bands: paths too tightly wound to draw turn by turn here</>}
        </p>
      </nav>

      {/* Bottom right: zoom */}
      <nav className="corner br" aria-label="Time and speed">
        <label className="select menu">
          <span className="heading">Time</span>
          <select
            value={presetId}
            onChange={(e) => {
              const z = ZOOM_PRESETS.find((x) => x.id === e.target.value);
              if (z) canvas.current?.flyTo(z.spanSeconds);
              e.target.blur();
            }}
          >
            <option value="" disabled>
              {cam ? `${formatDuration(spanSeconds)} across` : 'Zoom to…'}
            </option>
            {ZOOM_PRESETS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <span className="heading">Speed</span>
        <div className="row play-row">
          <button type="button" className={playing ? 'on' : 'primary'} onClick={() => onPlay(true)} aria-pressed={playing} title="Run time at the chosen speed and direction">
            ▶ Play
          </button>
          <label className="select">
            <span className="visually-hidden">Speed and direction</span>
            <select
              value={speed}
              title="Speed and direction: choosing one holds time still until ▶ Play"
              onChange={(e) => {
                changeRate(Number(e.target.value));
                e.target.blur();
              }}
            >
              {RATES.map((r) => (
                <option key={r.rate} value={r.rate}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={playing ? '' : 'on'} onClick={() => onPlay(false)} aria-pressed={!playing} title="Hold time still">
            ❚❚ Pause
          </button>
        </div>
        {(() => {
          // The space grid's scale: a bar between two of its dashed lines, with how many km apart they are.
          const b = in3D ? flyHud?.bar : spaceBar;
          if (b && b.km > 0 && b.px > 2) return <ScaleBar km={b.km} px={b.px} color={theme.distanceGrid} />;
          const t = in3D ? flyHud?.statement : spaceStatement;
          return t ? <span className="scale">{t}</span> : null;
        })()}
        {in3D && flyHud?.hint && <p className="note fly-hint">{flyHud.hint}</p>}
        <HelpButton>
          {in3D ? (
            <ul>
              <li>Click the view to steer with the mouse, as in Minecraft; Esc lets go.</li>
              <li>W flies toward whatever is in the middle of the view (S backs away) · A D slide sideways · Space up · Shift down (R and F too) · Ctrl five times faster. Speed is half your height above the nearest body each second, so you slow as you arrive.</li>
              <li>Drag or scroll to look around where you stand.</li>
              <li>Pinch to widen or narrow the view; Shift + scroll or pinch zooms time.</li>
              <li>Click a name to fly there (you turn to face it, close in, and arrive just above its north pole). Click a galaxy's or the black hole's name to fly there.</li>
              <li>Back away past 1,000 AU to warp out to the whole galaxy; fly straight at the Sun, or click it, to warp home.</li>
            </ul>
          ) : (
            <ul>
              <li>Drag empty space to turn the solar system; grab the Sun to move through time.</li>
              <li>Scroll or pinch: the size of the solar system. Shift + scroll or pinch: time.</li>
              <li>Sideways scroll, or ← →: along the line through time. N: back to now.</li>
              <li>Click the name of the Sun, a planet or the Moon to fly just above it.</li>
              <li>Centre: Earth makes the view geocentric: Earth's path is straight, the Sun coils around it, and the planets loop back (retrograde).</li>
              <li>Elements › Strobe freezes the whole solar system's pose so many times a year, behind the present. Slide the steps: whole numbers make still polygons, in-between ones turn lap by lap. Click a frozen pose to go back to that moment; time runs on from there.</li>
            </ul>
          )}
          <ul>
            <li>Space bar: hide the boxes, then all labels, then bring them back.</li>
            <li>Speed (bottom right): choose how fast time runs and which way (Live is real time); choosing holds time still until ▶ Play; ❚❚ Pause stops it.</li>
            <li>◉ Capture (bottom centre), straight to Downloads: P a screenshot, G a 5-second GIF (time plays while it records, then pauses), V a video until V again or a click on its running time. What is on screen is recorded, the boxes too if showing, never the Capture button, with an @sp4cetime.org watermark unless you turn it off.</li>
          </ul>
          <h3>Inspirations and credits</h3>
          <ul className="credits">
            <li>
              The galactic-motion visualization by{' '}
              <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer">@Geosophyy</a>, where this began.
            </li>
            <li>
              The strobe: Techartist's dancer worldline, where each pose freezes behind her as a sculpture (
              <a href={STROBE_CREDIT_URL} target="_blank" rel="noopener noreferrer">@techartist_</a>).
            </li>
            <li>The galaxy's Fermi bubbles: NASA's Fermi Gamma-ray Space Telescope.</li>
            <li>The warp from the galaxy down to the planets: Google Earth's zoom into Street View.</li>
            <li>Flying: Minecraft's creative-mode controls.</li>
                        <li>
              Positions: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">astronomy-engine</a> by Don Cross; JPL's Keplerian elements.
              Stars and constellations: <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener noreferrer">d3-celestial</a> by Olaf Frohn.
              Maps: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope</a> (CC BY 4.0), NASA Blue Marble.
              3D: <a href="https://threejs.org" target="_blank" rel="noopener noreferrer">three.js</a>.
            </li>
          </ul>
        </HelpButton>
      </nav>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={`pane ${selected ? 'selected' : ''} ${dial ? 'dial' : ''} ${in3D ? 'in-3d' : ''}`}
      style={paneStyle}
      onPointerDownCapture={p.onSelect}
      data-pane={id}
    >
      <div
        className={`stage view ${in3D ? '' : 'on'}`}
        tabIndex={0}
        role="application"
        aria-roledescription="time canvas"
        aria-label="Galactic calendar. The Sun is the present moment and time flows past it. Drag empty space to rotate the solar system in any direction, or use Shift with the arrow keys. Grab the Sun to move it anywhere, slide along its line, or use the left and right arrow keys to look ahead or back in time. Scroll or pinch to make the solar system larger or smaller (or the bracket keys); hold Shift while scrolling or pinching to zoom time (or plus and minus). Click the name of the Sun, a planet or the Moon to fly just above it. Press N to return to now."
        onKeyDown={onKeyDown}
      >
        <GalacticCanvas
          theme={theme}
          view={view}
          onLiveChange={setLive}
          initialSpanSeconds={DEFAULT_PRESET.spanSeconds}
          onCameraChange={onCameraChange}
          onSpaceZoomChange={() => {}}
          handleRef={canvas}
          clock={clock}
          active={!in3D && !hidden}
          onBodyClick={onBodyClick}
          onSpaceStatement={(t, b) => {
            setSpaceStatement(t);
            setSpaceBar(b);
          }}
          onPoseClick={p.jumpBy}
        />
      </div>

      {flyWanted && (
        <div className={`view view-3d ${in3D ? 'on' : ''}`} style={dial ? {} : flyStyle} aria-hidden={!in3D}>
          <FlyBoundary onExit={() => setMode('calendar')}>
            <Suspense fallback={in3D ? <p className="fly-error">Loading the solar system…</p> : null}>
              <FlyView
                active={in3D && !hidden}
                focused={selected}
                theme={theme}
                overlays={overlays}
                clock={clock}
                scale="true"
                spanSeconds={spanSeconds}
                measure={measure}
                command={command}
                onTimeZoom={(f) => canvas.current?.zoomBy(f)}
                onHud={setFlyHud}
              />
            </Suspense>
          </FlyBoundary>
        </div>
      )}
      {selected && p.boxesHost && createPortal(boxes, p.boxesHost)}
    </div>
  );
}
