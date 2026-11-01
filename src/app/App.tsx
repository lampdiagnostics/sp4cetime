import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { THEMES } from '../../content/themes';
import type { Theme } from '../core/theme';
import { addSeconds, fromUnixMs, type Time } from '../core/time';
import { CaptureMenu } from './CaptureMenu';
import { type Shot, stageIn } from './capture';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Pane, type PaneHandle, type PaneInfo } from './Pane';

/** A phone: always full screen (there is no room for the round window). */
const isPhone = (w: number, h: number): boolean =>
  Math.min(w, h) < 600 && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * The page: one window (Pane) showing the calendar, Fly mode or the whole galaxy, its
 * boxes, the shared present (which can run fast, back, or be paused), the look, and the
 * eye, Pause and Capture at the bottom centre.
 */
export function App() {
  /** What is on screen: 0 everything; 1 no controls; 2 no text at all, just the picture. Space bar cycles. */
  const [chrome, setChrome] = useState<0 | 1 | 2>(0);
  const cycleChrome = useCallback(() => setChrome((c) => ((c + 1) % 3) as 0 | 1 | 2), []);
  useEffect(() => {
    const typing = (): boolean => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
    };
    // Captured before buttons see it, so a focused button is not pressed by the space bar.
    const down = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== ' ' || typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      // While steering with the mouse in 3D (as in Minecraft), Space flies up instead.
      if (document.pointerLockElement) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) cycleChrome();
    };
    const up = (e: globalThis.KeyboardEvent): void => {
      if (e.key === ' ' && !typing()) e.preventDefault();
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
  useEffect(() => saveSettings(settings), [settings]);
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
  const getShot = (): Shot | null => {
    const root = pane.current?.root();
    const s = root ? stageIn(root, in3D, info?.clip ?? null) : null;
    if (!root || !s) return null;
    return { stages: [s], region: root.getBoundingClientRect(), page: pageRef.current };
  };

  const round = !phone && settings.round;
  const [boxesHost, setBoxesHost] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={pageRef} className={`app ${round ? 'is-round' : 'is-full'} ${in3D ? 'in-3d' : ''} chrome-${chrome}`} style={{ background: in3D ? theme.sky.background : theme.background }}>
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
        selected
        onSelect={() => {}}
        box={{ x: 0, y: 0, w: vp.w, h: vp.h }}
        round={round}
        dial={false}
        hidden={false}
        initialMode="calendar"
        prefetch3D
        boxesHost={boxesHost}
        handleRef={pane}
        onInfo={onInfo}
      />

      {/* Always on screen, never in a capture: the eye (also the space bar) and Capture. */}
      <div className="float-tools" data-no-capture>
        <button
          type="button"
          className="chrome-toggle"
          onClick={cycleChrome}
          aria-label={['Hide the controls (space bar)', 'Hide all text (space bar)', 'Show the controls and text (space bar)'][chrome]}
          title={['Hide the controls (space bar)', 'Hide all text (space bar)', 'Show the controls and text (space bar)'][chrome]}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
            {chrome < 2 && <circle cx="12" cy="12" r="3" fill={chrome === 0 ? 'currentColor' : 'none'} />}
            {chrome === 2 && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <CaptureMenu getShot={getShot} onPlay={play} in3D={in3D} />
      </div>

      {/* The window's boxes (its own controls) go here. */}
      <div className="boxes" ref={setBoxesHost} />

      {/* Top right: now, look, view */}
      <nav className="corner tr" aria-label="Display">
        <button type="button" className={live && rate === 1 ? 'primary live' : 'primary'} onClick={goNow} aria-pressed={live && rate === 1}>
          {live && rate === 1 ? '● Now' : 'Back to now'}
        </button>
        <label className="select">
          <span className="visually-hidden">Theme</span>
          <select value={theme.id} onChange={(e) => update({ themeId: e.target.value })}>
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
        {!phone && (
          <button type="button" onClick={() => update({ round: !settings.round })} aria-pressed={settings.round}>
            {settings.round ? '◯ Round' : '▭ Full'}
          </button>
        )}
      </nav>
    </div>
  );
}
