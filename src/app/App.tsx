import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { THEMES } from '../../content/themes';
import type { Theme } from '../core/theme';
import { addSeconds, fromUnixMs, type Time } from '../core/time';
import { CaptureMenu, type PresentControls } from './CaptureMenu';
import { drawShot, recordVideo, type Shot, stageIn, viewStages, type VideoSize } from './capture';
import type { StarsignsActions } from './StarsignsDialog';
import { setSound, soundNow, unlockSound } from './sound';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Pane, type PaneHandle, type PaneInfo } from './Pane';
import { newPathId, type Path, pathFileName, type PathPoint, type PointLook, pointLabel } from '../core/path';
import { formatTime } from '../core/time';
import { flyToPoint, type FlightDeps, type FlightSignal } from './flights';
import { deletePath, exportPath, importPath, listPaths, loadExamples, savePath, sp4ceText } from './pathStore';
import { zipParts } from '../core/zip';
import { type DialogResult, PathDialog } from './PathDialog';

/** The Starsigns dialog loads when first opened (it is not needed to see the map). */
const StarsignsDialog = lazy(() => import('./StarsignsDialog').then((m) => ({ default: m.StarsignsDialog })));

const VIEW_NAME = { calendar: 'Calendar', fly: 'Fly', galaxy: 'Whole galaxy' } as const;
/** Typing in a field (a drop-down menu that still has focus doesn't count: its keys go to the path). */
const typingNow = (): boolean => {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);
};
/**
 * A button or link chosen with the keyboard (Tab), or anything in a dialog or menu: there
 * Return and Space press it, as everywhere on the web. (A button last clicked with the
 * mouse keeps focus, but Return and Space still go to the app: a new path point, the boxes.)
 */
const keyboardOnControl = (): boolean => {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body) return false;
  if (a.closest('[role="dialog"], .popover')) return true;
  if (!(a.tagName === 'BUTTON' || a.tagName === 'A' || a.getAttribute('role') === 'button')) return false;
  try {
    return a.matches(':focus-visible');
  } catch {
    return false;
  }
};
const releaseMenu = (): void => {
  const a = document.activeElement;
  if (a instanceof HTMLSelectElement) a.blur();
};
const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The look, without the sphere positions are measured on, as a key to compare. */
const lookKey = (l: PointLook): string => JSON.stringify({ ...l, measure: undefined });

/** Presentation mode: which path, which point, and whether the viewer has wandered off it. */
interface Showing {
  readonly path: Path;
  readonly index: number;
  readonly flying: boolean;
  readonly wandered: boolean;
}

/** The dock's tabs on phones and short windows (each shows one of the boxes). */
type DockTab = 'time' | 'space' | 'display';
const DOCK_TABS: readonly { id: DockTab; label: string }[] = [
  { id: 'time', label: 'Time' },
  { id: 'space', label: 'Space' },
  { id: 'display', label: 'Display' },
];
const DOCK_KEY = 'sp4cetime.dock';

/** A phone: always full screen (there is no room for the round window). */
const isPhone = (w: number, h: number): boolean =>
  Math.min(w, h) < 600 && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * The page: one window (Pane) showing the calendar, Fly mode or the whole galaxy, its
 * boxes, the shared present (which can run fast, back, or be paused), the look, and the
 * eye, Pause and Capture at the bottom centre.
 */
export function App() {
  /** What is on screen: 0 everything; 1 no controls; 2 no text at all, just the picture. H (or the eye) cycles. */
  const [chrome, setChrome] = useState<0 | 1 | 2>(0);
  const cycleChrome = useCallback(() => setChrome((c) => ((c + 1) % 3) as 0 | 1 | 2), []);
  useEffect(() => {
    const typing = (): boolean => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
    };
    // Space (owner, 3 Nov 2026) and H show and hide the controls, then all text, then bring
    // everything back, in every view (neither flies: R and F do). Space never presses a
    // button last clicked with the mouse; a button chosen with Tab still works.
    const down = (e: globalThis.KeyboardEvent): void => {
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        if (!e.repeat) cycleChrome();
        return;
      }
      if (e.key === ' ' && !keyboardOnControl()) {
        const a = document.activeElement as HTMLElement | null;
        if (a && a !== document.body && a.tagName === 'BUTTON') a.blur();
        e.preventDefault();
        if (!e.repeat) cycleChrome();
      }
    };
    const up = (e: globalThis.KeyboardEvent): void => {
      if (e.key === ' ' && !typing() && !keyboardOnControl()) e.preventDefault();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [cycleChrome]);

  // The screen.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = (): void => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const phone = isPhone(vp.w, vp.h);

  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  // While a path is presented its look is borrowed, not saved (it used to overwrite your own
  // settings: no time grid after a Starsigns run). Stopping puts yours back.
  const beforePresent = useRef<{ settings: Settings; chrome: 0 | 1 | 2 } | null>(null);
  useEffect(() => {
    if (!beforePresent.current) saveSettings(settings);
  }, [settings]);
  const theme: Theme = useMemo(() => THEMES.find((t) => t.id === settings.themeId) ?? (THEMES[0] as Theme), [settings.themeId]);
  useEffect(() => {
    document.documentElement.dataset.ui = theme.ui;
  }, [theme]);

  // The simulated present. Speed and direction (the Speed menu) are chosen apart from
  // running it (▶ Play and ❚❚ Pause, beside the Speed menu): choosing a speed holds time
  // still until ▶ Play.
  const timeRef = useRef({ baseReal: Date.now(), baseSim: fromUnixMs(Date.now()), rate: 1 });
  const clock = useCallback((): Time => {
    const t = timeRef.current;
    return addSeconds(t.baseSim, ((Date.now() - t.baseReal) / 1000) * t.rate);
  }, []);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const rate = paused ? 0 : speed;
  const changeRate = useCallback(
    (r: number): void => {
      // A new speed is set, not started: time holds where it is until ▶ Play.
      timeRef.current = { baseReal: Date.now(), baseSim: clock(), rate: 0 };
      setSpeed(r);
      setPaused(true);
    },
    [clock],
  );
  const play = useCallback(
    (on: boolean): void => {
      timeRef.current = { baseReal: Date.now(), baseSim: clock(), rate: on ? speed : 0 };
      setPaused(!on);
    },
    [clock, speed],
  );
  const jumpBy = useCallback(
    (dt: number): void => {
      // Back to a frozen moment: the present jumps there and runs on, a new future.
      timeRef.current = { baseReal: Date.now(), baseSim: addSeconds(clock(), dt), rate: timeRef.current.rate };
    },
    [clock],
  );

  const pane = useRef<PaneHandle>(null);
  const [info, setInfo] = useState<PaneInfo | null>(null);
  const onInfo = useCallback((_id: number, i: PaneInfo) => setInfo(i), []);
  const in3D = info?.mode === 'fly';
  const inGalaxy = !!info?.inGalaxy;
  const live = info?.live ?? true;

  const goNow = (): void => {
    timeRef.current = { baseReal: Date.now(), baseSim: fromUnixMs(Date.now()), rate: 1 };
    setSpeed(1);
    setPaused(false);
    pane.current?.goNow();
  };

  const pageRef = useRef<HTMLDivElement>(null);
  // Phones and short windows put the boxes in one dock; its height goes into --dock-h so the eye and Capture sit above it.
  useEffect(() => {
    const root = document.documentElement;
    let last = '';
    const measure = (): void => {
      const h = (sel: string): number => Math.ceil(document.querySelector<HTMLElement>(sel)?.getBoundingClientRect().height ?? 0);
      const key = `${h('.dock')}`;
      if (key === last) return;
      last = key;
      root.style.setProperty('--dock-h', `${key}px`);
    };
    measure();
    const t = window.setInterval(measure, 400);
    return () => window.clearInterval(t);
  }, []);
  const veilRef = useRef<HTMLCanvasElement>(null);
  const infoRef = useRef(info);
  infoRef.current = info;
  /** The views as they show now (both, while they cross-fade), and the dissolve's picture if it is fading. */
  const getShot = (withVeil = true): Shot | null => {
    const root = pane.current?.root();
    if (!root) return null;
    const clip = infoRef.current?.clip ?? null;
    const stages = viewStages(root, clip);
    if (stages.length === 0) {
      const s = stageIn(root, infoRef.current?.mode === 'fly', clip);
      if (s) stages.push(s);
    }
    const v = veilRef.current;
    const va = v ? Number(getComputedStyle(v).opacity) : 0;
    if (withVeil && v && va > 0.01) stages.push({ canvas: v, overlays: [], clip: null, alpha: va });
    if (stages.length === 0) return null;
    return { stages, region: root.getBoundingClientRect(), page: pageRef.current };
  };

  // --- Paths (ADR-0017) -------------------------------------------------------------

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  const speedRef = useRef({ speed, paused });
  speedRef.current = { speed, paused };

  /** A picture of the screen as it is, fading out over the new look. */
  const dissolve = useCallback((): void => {
    const v = veilRef.current;
    const shot = getShot(false);
    if (!v || !shot || reducedMotion()) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    v.width = Math.round(window.innerWidth * dpr);
    v.height = Math.round(window.innerHeight * dpr);
    const ctx = v.getContext('2d');
    if (!ctx) return;
    // No names in the fading picture: a picture of them never quite matches the live ones
    // (they jumped in size or case as the new look came in); the new names fade in instead.
    drawShot(shot, ctx, v.width, v.height, { overlay: [], watermark: false, noLabels: true });
    v.style.transition = 'none';
    v.style.opacity = '1';
    void v.offsetWidth;
    v.style.transition = 'opacity 900ms ease-in-out';
    v.style.opacity = '0';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookNow = (): PointLook => {
    const st = settingsRef.current;
    return {
      themeId: st.themeId, round: st.round, chrome: chromeRef.current, planets: st.planets, moon: st.moon, rings: st.rings,
      labels: st.labels, spirals: st.spirals, timeGrid: st.timeGrid, distanceGrid: st.distanceGrid,
      constellations: st.constellations, zodiac: st.zodiac, galactic: st.galactic, coastlines: st.coastlines, chart: st.chart, highlight: st.highlight, seeThrough: st.seeThrough, strobe: st.strobe,
      strobeSteps: st.strobeSteps, focus: st.focus, measure: pane.current?.snapshot().measure ?? 'near', barycentre: st.barycentre,
    };
  };
  /** Exactly what is on screen, as a point. */
  const pointNow = (): PathPoint | null => {
    const s = pane.current?.snapshot();
    if (!s) return null;
    const sp = speedRef.current;
    return {
      view: s.view, present: clock(), speed: sp.speed, playing: !sp.paused, calendar: s.calendar, fly: s.fly,
      look: { ...lookNow(), measure: s.measure }, caption: '', where: s.where, facing: s.facing,
    };
  };

  const deps: FlightDeps = {
    pane: () => pane.current,
    clock,
    setPresent: (t) => {
      timeRef.current = { baseReal: Date.now(), baseSim: t, rate: 0 };
    },
    setClock: (t, sp, playing) => {
      timeRef.current = { baseReal: Date.now(), baseSim: t, rate: playing ? sp : 0 };
      setSpeed(sp);
      setPaused(!playing);
    },
    applyLook: (look) => {
      const now = lookNow();
      if (lookKey({ ...look, round: now.round }) === lookKey(now)) return;
      look = { ...look, round: now.round };
      // Picking out another body is not a new look: no cross-fade (its snapshot's labels
      // flickered in another size and case under the live ones).
      if (lookKey({ ...look, highlight: null }) === lookKey({ ...now, highlight: null })) {
        update({ highlight: look.highlight });
        return;
      }
      dissolve();
      // Round or full is the visitor's alone (owner, 3 Nov 2026): a path never changes it.
      const { chrome: c, measure: _m, round: _r, ...rest } = look;
      update(rest);
      setChrome(c);
    },
    reduced: reducedMotion,
  };
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [paths, setPaths] = useState<Path[]>([]);
  const refreshPaths = useCallback(() => void listPaths().then(setPaths), []);
  useEffect(refreshPaths, [refreshPaths]);
  const [message, setMessage] = useState('');
  const [examples, setExamples] = useState<Path[]>([]);
  useEffect(() => {
    void loadExamples(import.meta.env.BASE_URL).then(setExamples);
  }, []);
  const findPath = (id: string): Path | undefined => paths.find((x) => x.id === id) ?? examples.find((x) => x.id === id);

  // Making a path: Return opens the dialog with what is on screen at that moment.
  const [making, setMaking] = useState<Path | null>(null);
  const [dialog, setDialog] = useState<{ starting: boolean; point: PathPoint } | null>(null);
  const [starsigns, setStarsigns] = useState(false);
  /** A path to show selected in ▷ Present's menu, opened (after ✶ Create Path). */
  const [focusPath, setFocusPath] = useState<{ id: string; n: number } | null>(null);
  const confirmPoint = (r: DialogResult): void => {
    if (!dialog) return;
    const pt: PathPoint = { ...dialog.point, caption: r.caption };
    const path: Path = making
      ? { ...making, points: [...making.points, pt], finished: r.stop }
      : { id: newPathId(), name: r.name, created: new Date().toISOString(), points: [pt], finished: r.stop };
    setDialog(null);
    setMaking(r.stop ? null : path);
    void savePath(path).then(refreshPaths);
  };
  const finishMaking = (): void => {
    if (!making) return;
    const path = { ...making, finished: true };
    setMaking(null);
    void savePath(path).then(refreshPaths);
  };
  const discardMaking = (): void => {
    if (making) void deletePath(making.id).then(refreshPaths);
    setMaking(null);
    setDialog(null);
  };

  // Presentation mode.
  const [showing, setShowing] = useState<Showing | null>(null);
  const showRef = useRef(showing);
  showRef.current = showing;
  const signal = useRef<FlightSignal>({ cancelled: false });
  const goToPoint = useCallback((path: Path, index: number): void => {
    const pt = path.points[index];
    if (!pt) return;
    // What is heard there (0.4.2): the white-noise bed fades in over a second, or out to silence.
    unlockSound();
    const sound = pt.sound ?? 'silence';
    if (sound !== soundNow()) setSound(sound, { fade: sound === 'noise' ? 1 : 0.4 });
    signal.current.cancelled = true;
    const sig: FlightSignal = { cancelled: false };
    signal.current = sig;
    if (!showRef.current && !beforePresent.current) beforePresent.current = { settings: settingsRef.current, chrome: chromeRef.current };
    setShowing({ path, index, flying: true, wandered: false });
    void flyToPoint(pt, depsRef.current, sig).then((arrived) => {
      if (sig.cancelled) return;
      // Interrupted (a drag in 3D, say): time was held for the flight; say so in the controls.
      if (!arrived) setPaused(true);
      setShowing((s) => (s && s.path.id === path.id ? { ...s, index, flying: false, wandered: !arrived } : s));
    });
  }, []);
  const stopPresenting = useCallback((): void => {
    signal.current.cancelled = true;
    setSound('silence', { fade: 0.4 });
    // Stopped mid-flight: time is held where the flight left it; the controls show it paused.
    if (showRef.current?.flying) setPaused(true);
    setShowing(null);
    const before = beforePresent.current;
    beforePresent.current = null;
    if (before) {
      // Your settings back as they were, except round or full: that is whatever you last chose.
      setSettings((s) => ({ ...before.settings, round: s.round }));
      setChrome(before.chrome);
    }
  }, []);
  /** Next (+1) or back (−1), from the keys or the ◀ ▶ buttons (phones). */
  const stepPath = useCallback(
    (dir: 1 | -1): void => {
      const sh = showRef.current;
      if (!sh) return;
      // After looking around, a press only flies back to the point; the next goes on.
      // (During a flight, a press heads on from wherever the flight has got to.)
      if (sh.wandered && !sh.flying) return goToPoint(sh.path, sh.index);
      const next = sh.index + dir;
      if (next >= 0 && next < sh.path.points.length) goToPoint(sh.path, next);
    },
    [goToPoint],
  );
  /** ▷ Present (in its menu) runs the path by itself (owner, 3 Nov 2026); arrow keys take over point by point. */
  const startPresenting = (id: string): void => {
    const path = findPath(id);
    if (path) presentRun.current(path);
  };
  const presentRun = useRef<(p: Path) => void>(() => {});

  // Keys: Return (make a path's point, or in Presentation mode go on), → and ← (present), Esc (stop).
  /** Return, or the + Point button: what is on screen now becomes the next point. */
  const openPathDialog = (): void => {
    const point = keyRef.current.pointNow();
    if (point) setDialog({ starting: !keyRef.current.making, point });
  };
  /** Shift on its own: present by itself, or stop (set once autoPlay is defined). */
  const presentKey = useRef<() => void>(() => {});
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const keyRef = useRef({ pointNow, making });
  keyRef.current = { pointNow, making };
  useEffect(() => {
    // Keys that don't count as wandering off a point (Space only shows or hides the boxes).
    const IGNORE = ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock', 'Tab', ' ', 'h', 'H', 'p', 'P', 'g', 'G', 'v', 'V'];
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (dialogRef.current || typingNow() || e.metaKey || e.ctrlKey || e.altKey) return;
      const sh = showRef.current;
      if (sh) {
        if (e.key === 'Enter' && keyboardOnControl()) return;
        // Any arrow key stops a path playing by itself; → and ← then go point by point
        // (Shift plays on by itself from there).
        if (e.key.startsWith('Arrow') && autoRun.current) {
          playing.current++;
          setAuto(false);
        }
        if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          releaseMenu();
          if (!e.repeat) stepPath(e.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
        if (e.key === 'Escape') {
          if (!document.pointerLockElement) stopPresenting();
          return;
        }
        if (!IGNORE.includes(e.key) && !sh.flying) setShowing((s) => (s ? { ...s, wandered: true } : s));
        return;
      }
      if (e.key === 'Enter' && !e.repeat && !keyboardOnControl()) {
        e.preventDefault();
        e.stopPropagation();
        releaseMenu();
        openPathDialog();
      }
    };
    // Looking around at a point (a drag, a scroll, a click on the boxes) is wandering off it.
    const onPointer = (e: Event): void => {
      const sh = showRef.current;
      const t = e.target as Element | null;
      if (!sh || !t || t.closest?.('[data-no-capture], .pointbox')) return;
      if (sh.flying) {
        // Taking the controls during a flight stops it where it is (as a drag in 3D does);
        // the next Return or arrow flies back to the point.
        signal.current.cancelled = true;
        setPaused(true);
        setShowing((s) => (s ? { ...s, flying: false, wandered: true } : s));
        return;
      }
      setShowing((s) => (s ? { ...s, wandered: true } : s));
    };
    // Shift on its own (pressed and let go with nothing else) presents: plays the path by
    // itself, or stops it. Shift with another key, a scroll or a click is something else.
    let shiftAlone = false;
    const shiftDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Shift') shiftAlone = !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !typingNow() && !dialogRef.current;
      else shiftAlone = false;
    };
    const shiftUp = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Shift') return;
      if (shiftAlone) presentKey.current();
      shiftAlone = false;
    };
    const notAlone = (): void => {
      shiftAlone = false;
    };
    window.addEventListener('keydown', shiftDown, true);
    window.addEventListener('keyup', shiftUp, true);
    window.addEventListener('wheel', notAlone, { capture: true, passive: true });
    window.addEventListener('pointerdown', notAlone, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('wheel', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', shiftDown, true);
      window.removeEventListener('keyup', shiftUp, true);
      window.removeEventListener('wheel', notAlone, true);
      window.removeEventListener('pointerdown', notAlone, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('wheel', onPointer, true);
    };
  }, [goToPoint, stopPresenting, stepPath]);

  const present: PresentControls = {
    paths,
    presenting: !!showing,
    present: startPresenting,
    stop: stopPresenting,
    examples,
    exportPath: (id) => {
      const x = findPath(id);
      if (x) exportPath(x);
    },
    continuePath: (id) => {
      const x = findPath(id);
      if (!x) return;
      stopPresenting();
      // An example stays as it is: you carry on with your own copy.
      const own: Path = id.startsWith('example:') ? { ...x, id: newPathId(), name: `${x.name} (my copy)`, created: new Date().toISOString() } : x;
      setMaking({ ...own, finished: false });
      void savePath({ ...own, finished: false }).then(refreshPaths);
      setMessage('');
    },
    importFile: (f) => {
      setMessage('');
      importPath(f).then(
        (x) => {
          setMessage(`Uploaded “${x.name}”: present it, or ✎ Continue to add points.`);
          refreshPaths();
        },
        (err: unknown) => setMessage(err instanceof Error ? err.message : 'That file could not be read.'),
      );
    },
    deletePath: (id) => {
      if (showing?.path.id === id) stopPresenting();
      if (making?.id === id) setMaking(null);
      void deletePath(id).then(refreshPaths);
    },
    message,
  };
  const shownPoint = showing ? showing.path.points[showing.index] : undefined;

  // ✶ Starsigns: a path played on its own (a hold at each point), and for the package, recorded.
  const playing = useRef(0);
  /** True while a path plays itself (▶ Go). */
  const autoRun = useRef(false);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const setAuto = (on: boolean): void => {
    autoRun.current = on;
    setAutoPlaying(on);
  };
  /** While a Starsigns path records: when it started (for the timer) and how to stop it. */
  const [recording, setRecording] = useState<{ start: number; run: number } | null>(null);
  const [recNow, setRecNow] = useState(0);
  const stopRec = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [recording]);
  const autoPlay = async (path: Path, record: boolean, from = 0, opts: { size?: VideoSize; onVideo?: (video: Blob, ext: string) => void; onNoVideo?: () => void } = {}): Promise<void> => {
    const run = ++playing.current;
    unlockSound();
    setAuto(true);
    const live = (): boolean => playing.current === run && showRef.current?.path.id === path.id;
    const arrive = async (i: number): Promise<boolean> => {
      goToPoint(path, i);
      for (let k = 0; k < 900; k++) {
        await new Promise((r) => setTimeout(r, 100));
        if (playing.current !== run || showRef.current?.path.id !== path.id) return false;
        if (showRef.current.index === i && !showRef.current.flying) return true;
      }
      return false;
    };
    const hold = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    if (record) {
      setRecording({ start: 0, run });
      stopRec.current = () => {
        stopRec.current = null;
        setRecording(null);
        if (playing.current === run) {
          playing.current++;
          setAuto(false);
        }
      };
    }
    if (!(await arrive(from))) {
      if (record) setRecording((r) => (r && r.run === run ? null : r));
      if (playing.current === run) setAuto(false);
      return;
    }
    const rec = record
      ? await recordVideo(() => getShot(), { fps: 30, watermark: true, ...(opts.size ? { size: opts.size } : {}), ...(opts.onVideo ? { onBlob: opts.onVideo } : {}) }, () => {})
      : null;
    if (record && !rec) opts.onNoVideo?.();
    if (record && !rec) {
      setRecording((r) => (r && r.run === run ? null : r));
      stopRec.current = null;
      setMessage('This browser would not record a video; the path plays anyway.');
    }
    let stopped = false;
    const finish = (): void => {
      if (stopped) return;
      stopped = true;
      rec?.stop();
      stopRec.current = null;
      setRecording((r) => (r && r.run === run ? null : r));
    };
    if (rec) {
      setRecording({ start: performance.now(), run });
      setRecNow(performance.now());
      // ■ Stop: end the recording now and stop moving on through the path.
      stopRec.current = () => {
        finish();
        if (playing.current === run) {
          playing.current++;
          setAuto(false);
        }
      };
    }
    await hold(path.points[from]?.pause !== undefined ? path.points[from]!.pause! * 1000 : 2500);
    for (let i = from + 1; i < path.points.length && live(); i++) {
      const pt = path.points[i]!;
      // Recording (owner, 3 Nov 2026): no planet-by-planet highlights in the video; each view
      // is held a little longer instead (more for each body it would have picked out).
      if (rec && pt.look.highlight && i < path.points.length - 1) continue;
      if (!(await arrive(i))) break;
      let picks = 0;
      if (rec) for (let j = i + 1; j < path.points.length - 1 && path.points[j]!.look.highlight; j++) picks++;
      // A body picked out is a quick beat; a new view is held long enough to take in.
      // A point may say how long to stay (Starsigns does); otherwise a body picked out is a quick
      // beat and a new view is held long enough to take in.
      await hold(pt.pause !== undefined ? pt.pause * 1000 : i === path.points.length - 1 ? 3500 : pt.look.highlight ? 1600 : 3200 + picks * 700);
    }
    finish();
    if (playing.current === run) {
      playing.current++;
      setAuto(false);
    }
  };
  presentRun.current = (p: Path) => void autoPlay(p, false);
  // Shift (owner, 3 Nov 2026): one tap plays the path by itself, the next stops it. After an
  // arrow key took over, Shift plays on by itself from the point shown.
  presentKey.current = () => {
    if (autoRun.current) {
      stopPresenting();
      return;
    }
    const sh = showRef.current;
    if (sh) {
      void autoPlay(sh.path, false, sh.index);
      return;
    }
    const p = paths[0] ?? examples[0];
    if (p) void autoPlay(p, false);
    else setStarsigns(true);
  };
  const starsignsActions: StarsignsActions = {
    base: () => keyRef.current.pointNow(),
    play: (path, capture) => {
      setStarsigns(false);
      void savePath(path).then(refreshPaths);
      void autoPlay(path, capture);
    },
    download: (path) => exportPath(path),
    // ✶ Create Path (owner, 3 Nov 2026): saved, then listed in ▷ Present, ready to run.
    create: (path) => {
      setStarsigns(false);
      void savePath(path).then(() => {
        refreshPaths();
        setFocusPath({ id: path.id, n: Date.now() });
      });
    },
    // The package (owner, 3 Nov 2026): fly and record the path, then one .zip of the PDF, the
    // video and the path token (without the video if this browser cannot record).
    pack: (path, pdf, size, base) => {
      setStarsigns(false);
      void savePath(path).then(refreshPaths);
      const zip = (video: { data: Uint8Array; ext: string } | null): void => {
        const c = new Date();
        const parts = zipParts(
          [
            { name: `${base}.pdf`, data: pdf },
            ...(video ? [{ name: `${base}.${video.ext}`, data: video.data }] : []),
            { name: pathFileName(path.name), data: new TextEncoder().encode(sp4ceText(path)) },
          ],
          { year: c.getFullYear(), month: c.getMonth() + 1, day: c.getDate(), hour: c.getHours(), minute: c.getMinutes() },
        );
        const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}-package.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
      void autoPlay(path, true, 0, {
        size,
        onVideo: (v, ext) => void v.arrayBuffer().then((b) => zip({ data: new Uint8Array(b), ext })),
        onNoVideo: () => zip(null),
      });
    },
  };

  const round = settings.round;
  // A phone's first visit opens full screen; after that, as last chosen (the ◯/▭ button, top right).
  useEffect(() => {
    let first = false;
    try {
      first = !localStorage.getItem('sp4cetime.settings.v1');
    } catch {
      /* no storage: treat as a first visit */
      first = true;
    }
    if (phone && first) update({ round: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [boxesHost, setBoxesHost] = useState<HTMLDivElement | null>(null);
  // Phones and short windows: the boxes share one dock, minimised to a single row or open on one tab.
  const [dockOpen, setDockOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DOCK_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const [dockTab, setDockTab] = useState<DockTab>('time');
  // A tap on empty space (touch): closes More if it is open, otherwise hides or shows everything.
  const dockOpenRef = useRef(dockOpen);
  dockOpenRef.current = dockOpen;
  const onEmptyTap = useCallback((): void => {
    if (dockOpenRef.current) {
      setDockOpen(false);
      try {
        localStorage.setItem(DOCK_KEY, 'closed');
      } catch {
        /* not remembered */
      }
      return;
    }
    setChrome((c) => (c === 0 ? 1 : 0));
  }, []);
  const toggleDock = (): void =>
    setDockOpen((o) => {
      try {
        localStorage.setItem(DOCK_KEY, o ? 'closed' : 'open');
      } catch {
        /* private window: just not remembered */
      }
      return !o;
    });

  return (
    <div ref={pageRef} className={`app ${round ? 'is-round' : 'is-full'} ${in3D ? 'in-3d' : ''} chrome-${chrome}${dockOpen ? ' dock-open' : ''}`} style={{ background: in3D ? theme.sky.background : theme.background }}>
      <Pane
        id={1}
        theme={theme}
        settings={settings}
        update={update}
        clock={clock}
        rate={rate}
        speed={speed}
        playing={!paused}
        onPlay={play}
        changeRate={changeRate}
        jumpBy={jumpBy}
        chrome={chrome}
        setChrome={setChrome}
        selected
        onSelect={() => {}}
        box={{ x: 0, y: 0, w: vp.w, h: vp.h }}
        round={round}
        boxesHost={boxesHost}
        handleRef={pane}
        onInfo={onInfo}
        onEmptyTap={onEmptyTap}
      />

      {/* A path's dissolve between looks (a picture of the old look, fading out). */}
      <canvas ref={veilRef} className="veil" aria-hidden="true" />

      {/* Presentation mode: no box on screen; the caption for screen readers only. */}
      {showing && shownPoint && (
        // No text box at the top (owner, 3 Nov 2026): the view speaks for itself. The point's words
        // are still read out to screen readers.
        <p className="visually-hidden" aria-live="polite">
          {shownPoint.caption || showing.path.name}
        </p>
      )}

      {starsigns && (
        <Suspense fallback={null}>
          <StarsignsDialog onClose={() => setStarsigns(false)} actions={starsignsActions} />
        </Suspense>
      )}

      {dialog && (
        <PathDialog
          starting={dialog.starting}
          pointName={pointLabel(making ? making.points.length : 0, (making ? making.points.length : 0) + 2, false)}
          pathName={making?.name ?? ''}
          onConfirm={confirmPoint}
          onCancel={() => setDialog(null)}
          onDiscard={discardMaking}
        />
      )}

      {/* Always on screen, never in a capture: the eye (also the H key) and Capture. */}
      <div className="float-tools" data-no-capture>
        <button
          type="button"
          className="chrome-toggle"
          onClick={cycleChrome}
          aria-label={['Hide the controls (H)', 'Hide all text (H)', 'Show the controls and text (H)'][chrome]}
          title={['Hide the controls (H)', 'Hide all text (H)', 'Show the controls and text (H)'][chrome]}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
            {chrome < 2 && <circle cx="12" cy="12" r="3" fill={chrome === 0 ? 'currentColor' : 'none'} />}
            {chrome === 2 && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <CaptureMenu
          getShot={getShot}
          onPlay={play}
          in3D={in3D}
          present={present}
          focusPath={focusPath}
          pathRecording={recording ? { clock: recording.start ? formatClock(Math.max(0, recNow - recording.start)) : 'ready…', stop: () => stopRec.current?.() } : null}
        />
        {showing && autoPlaying && (
          <div className="path-status" role="status">
            <button type="button" onClick={stopPresenting} title="Stop (Esc)">
              ■ Stop
            </button>
          </div>
        )}
        {showing && !autoPlaying && (
          <div className="path-status" role="status">
            ▷ {pointLabel(showing.index, showing.path.points.length, showing.path.finished)} · {showing.index + 1}/{showing.path.points.length}
            <span className="note">
              {showing.flying
                ? ' · flying…'
                : showing.wandered
                  ? ' · Return, → or ← flies back to the point'
                  : showing.index === showing.path.points.length - 1
                    ? ' · the end · ← back · Esc stops'
                    : showing.index === 0
                      ? ' · Return or → next'
                      : ' · Return or → next · ← back'}
            </span>
            <button type="button" onClick={() => stepPath(-1)} aria-label="Back (←)" title="Back (←)" disabled={showing.index === 0 && !showing.wandered}>
              ◀
            </button>
            <button type="button" onClick={() => stepPath(1)} aria-label="Next (Return or →)" title="Next (Return or →)" disabled={showing.index === showing.path.points.length - 1 && !showing.wandered}>
              ▶
            </button>
            <button type="button" onClick={stopPresenting} title="Stop presenting (Esc)">
              ■ Stop
            </button>
          </div>
        )}
        {!showing && making && (
          <div className="path-status making" role="status">
            ● Making “{making.name}” · {making.points.length} point{making.points.length === 1 ? '' : 's'}
            <span className="note"> · Return adds the next</span>
            <button type="button" onClick={openPathDialog} title="Add what is on screen as the next point (Return)">
              + Point
            </button>
            <button type="button" onClick={finishMaking} title="The last point becomes END">
              Finish
            </button>
          </div>
        )}
      </div>

      {/* Phones and short windows: the only buttons at the top are Now and Fly (CSS shows them). */}
      <div className="top-bar" data-no-capture>
        <button type="button" className={live && rate === 1 ? 'primary live' : 'primary'} onClick={goNow} aria-pressed={live && rate === 1}>
          {live && rate === 1 ? '● Now' : 'Back to now'}
        </button>
        <button type="button" aria-pressed={in3D} onClick={() => pane.current?.show(in3D ? 'calendar' : 'fly')} title={in3D ? 'Back to the galactic calendar' : 'Fly through the solar system in 3D'}>
          {in3D ? 'Calendar' : '✦ Fly'}
        </button>
        <button type="button" className="astro-button" onClick={() => setStarsigns(true)} aria-label="Starsigns" title="Starsigns: the planets' signs and houses for a date, a time and a place">
          <span className="twinkle" aria-hidden="true">✶</span>
        </button>
        {/* Round or Full (owner, 3 Nov 2026: at the top right on every screen, phones too). */}
        <button
          type="button"
          className="round-button"
          onClick={() => update({ round: !settings.round })}
          aria-pressed={settings.round}
          aria-label={settings.round ? 'Round window (tap for full screen)' : 'Full screen (tap for the round window)'}
          title={settings.round ? 'Round window: tap for full screen' : 'Full screen: tap for the round window'}
        >
          {settings.round ? '◯' : '▭'}
        </button>
      </div>

      {/* The boxes. On wide screens they sit in the corners; on phones and short windows
          they share one dock at the bottom (CSS), minimised to a row or open on one tab. */}
      <div className="dock" data-open={dockOpen ? 'true' : 'false'} data-tab={dockTab}>
      <div className="dock-bar" data-no-capture>
        <button type="button" className="dock-toggle" onClick={toggleDock} aria-expanded={dockOpen} aria-controls="dock-panels" aria-label={dockOpen ? 'Hide the controls' : 'More controls'}>
          {dockOpen ? '✕ Close' : '☰ More'}
        </button>
      </div>
      <div className="dock-tabs" role="tablist" aria-label="Controls" data-no-capture>
        {DOCK_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={dockTab === t.id} onClick={() => setDockTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {/* The window's boxes (its own controls) go here. */}
      <div className="boxes" id="dock-panels" ref={setBoxesHost} />

      {/* Top right: now, look, view */}
      <nav className="corner tr" aria-label="Display">
        <button type="button" className={live && rate === 1 ? 'primary live' : 'primary'} onClick={goNow} aria-pressed={live && rate === 1}>
          {live && rate === 1 ? '● Now' : 'Back to now'}
        </button>
        <button type="button" className="astro-button" onClick={() => setStarsigns(true)} title="Starsigns: the planets' signs and houses for a date, a time and a place">
          <span className="twinkle" aria-hidden="true">✶</span> Starsigns
        </button>
        <label className="select">
          <span className="visually-hidden">Theme</span>
          <select
            value={theme.id}
            onChange={(e) => {
              update({ themeId: e.target.value });
              e.target.blur();
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={!in3D} onClick={() => pane.current?.show('calendar')} title="The galactic calendar">
            Calendar
          </button>
          <button type="button" aria-pressed={in3D && !inGalaxy} onClick={() => pane.current?.show('fly')} title="Fly through the solar system in 3D">
            ✦ Fly
          </button>
          <button type="button" aria-pressed={inGalaxy} onClick={() => pane.current?.show('galaxy')} title="See the whole Milky Way from outside, with the Sun’s path">
            ◎ Galaxy
          </button>
        </div>
      </nav>
      </div>
    </div>
  );
}

/** "0:07", "1:42": a recording's length. */
function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
