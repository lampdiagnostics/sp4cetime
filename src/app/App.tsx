import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { THEMES } from '../../content/themes';
import type { Camera } from '../core/camera';
import { KM_PER_AU, KM_PER_LIGHT_YEAR, type ScaleMode } from '../core/geometry';
import { bodyState, TIER_LABELS } from '../core/models';
import { pitchExaggerated, travelKm } from '../core/render';
import type { Theme } from '../core/theme';
import { CALENDAR_YEAR_LIMIT, formatDuration, formatTime, fromUnixMs, type Time, toCivil } from '../core/time';
import { type CanvasHandle, GalacticCanvas } from './GalacticCanvas';
import { MoonIcon, moonPhaseName } from './MoonIcon';
import { PlanetPicker } from './PlanetPicker';
import { DEFAULT_PRESET, ZOOM_PRESETS } from './presets';
import { loadSettings, saveSettings, type Settings } from './settings';

const CREDIT_URL = 'https://x.com/Geosophyy/status/2115404526002041035';

const SCALE_NOTES: Record<ScaleMode, string> = {
  fit: 'Orbits in true orientation; sizes √-compressed to fit',
  linear: 'Orbits in true orientation and proportion; enlarged to fit',
  true: 'True scale: orbit sizes against 230 km/s of travel',
};

function formatTravel(km: number): string {
  const a = Math.abs(km);
  const sign = km < 0 ? '−' : '+';
  if (a < 1) return 'here';
  const fmt = (v: number): string => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toPrecision(3));
  if (a < 1e8) return `${sign}${fmt(a)} km`;
  if (a < KM_PER_LIGHT_YEAR / 2) return `${sign}${fmt(a / KM_PER_AU)} AU`;
  return `${sign}${fmt(a / KM_PER_LIGHT_YEAR)} ly`;
}

/** "07:39:12 GMT" for moments within the calendar range, else null. */
function gmtClock(t: Time): string | null {
  if (Math.abs(toCivil(t).year) > CALENDAR_YEAR_LIMIT) return null;
  const p = (n: number): string => String(Math.floor(n)).padStart(2, '0');
  return `${p(t.sec / 3600)}:${p((t.sec % 3600) / 60)}:${p(t.sec % 60)} GMT`;
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => saveSettings(settings), [settings]);

  const theme: Theme = useMemo(
    () => THEMES.find((t) => t.id === settings.themeId) ?? (THEMES[0] as Theme),
    [settings.themeId],
  );
  useEffect(() => {
    document.documentElement.dataset.ui = theme.ui;
  }, [theme]);

  // The centre is the present moment by default.
  const [live, setLive] = useState(true);
  const [cam, setCam] = useState<Camera | null>(null);
  const canvas = useRef<CanvasHandle>(null);

  // The canvas reports every camera change; the HUD re-renders at most ~10 times a second.
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
      scale: settings.scale,
      planets: settings.planets,
      moon: settings.moon,
      rings: settings.rings,
      labels: settings.labels,
      round: settings.round,
      spirals: settings.spirals,
      timeGrid: settings.timeGrid,
      distanceGrid: settings.distanceGrid,
    }),
    [settings],
  );

  const goNow = (): void => {
    canvas.current?.flyTo(null, fromUnixMs(Date.now()));
    setLive(true);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const c = canvas.current;
    if (!c) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => c.panBy(-0.1),
      ArrowRight: () => c.panBy(0.1),
      ArrowUp: () => c.rollBy(-0.1),
      ArrowDown: () => c.rollBy(0.1),
      '+': () => c.zoomBy(0.7),
      '=': () => c.zoomBy(0.7),
      '-': () => c.zoomBy(1 / 0.7),
      t: goNow,
      n: goNow,
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const state = cam ? bodyState(cam.center) : null;
  const now = fromUnixMs(Date.now());
  const travel = cam ? travelKm(now, cam.center) : 0;
  const clock = cam ? gmtClock(cam.center) : null;
  const widened = cam ? settings.spirals && pitchExaggerated(settings.planets, cam.secondsPerPixel) : false;

  return (
    <div className={`app ${settings.round ? 'is-round' : 'is-full'}`} style={{ background: theme.background }}>
      <div
        className="stage"
        tabIndex={0}
        role="application"
        aria-roledescription="time canvas"
        aria-label="Galactic calendar. Drag sideways or use the left and right arrow keys to move through time; drag up and down or use the up and down arrows to turn the view around the line of travel; scroll, pinch or press plus and minus to zoom; press N to return to now."
        onKeyDown={onKeyDown}
      >
        <GalacticCanvas
          theme={theme}
          view={view}
          live={live}
          onLiveChange={setLive}
          initialSpanSeconds={DEFAULT_PRESET.spanSeconds}
          onCameraChange={onCameraChange}
          handleRef={canvas}
        />
      </div>

      {/* Top left: where and when */}
      <header className="corner tl">
        <div className="brand">
          sp4cetime <span>Galactic Calendar</span>
        </div>
        <output className="center-date" aria-live="off">
          {cam ? formatTime(cam.center, Math.max(cam.secondsPerPixel, 3600)) : ''}
        </output>
        {clock && <div className="clock">{clock}</div>}
        {cam && state && (
          <div className="facts">
            <span className={`tier tier-${state.tier}`} title="How precisely positions are known here">
              {TIER_LABELS[state.tier]}
            </span>
            {state.tier === 'schematic' ? (
              <span className="moon" title="The Moon's phase cannot be known this far from today">
                Moon phase unknowable here
              </span>
            ) : (
              <span className="moon" title="Moon phase at the centre time">
                <MoonIcon phase={state.moonPhase} size={16} />
                {moonPhaseName(state.moonPhase)}
              </span>
            )}
            <span title="How far the Sun has travelled along its galactic orbit from where it is now">
              {live ? 'Now' : `${formatTravel(travel)} from now`}
            </span>
          </div>
        )}
      </header>

      {/* Top right: now, look, window */}
      <nav className="corner tr" aria-label="Display">
        <button type="button" className={live ? 'primary live' : 'primary'} onClick={goNow} aria-pressed={live}>
          {live ? '● Live' : 'Now'}
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
        <button type="button" onClick={() => update({ round: !settings.round })} aria-pressed={settings.round}>
          {settings.round ? '◯ Round' : '▭ Full'}
        </button>
      </nav>

      {/* Bottom left: what is drawn */}
      <nav className="corner bl" aria-label="Bodies and units">
        <PlanetPicker theme={theme} settings={settings} onChange={update} />
        <div className="segmented" role="group" aria-label="Overlays">
          <button type="button" aria-pressed={settings.spirals} onClick={() => update({ spirals: !settings.spirals })}>
            Spirals
          </button>
          <button type="button" aria-pressed={settings.timeGrid} onClick={() => update({ timeGrid: !settings.timeGrid })}>
            Time grid
          </button>
          <button
            type="button"
            aria-pressed={settings.distanceGrid}
            onClick={() => update({ distanceGrid: !settings.distanceGrid })}
          >
            Space grid
          </button>
        </div>
        <label className="select">
          <span className="visually-hidden">Orbit scale</span>
          <select value={settings.scale} onChange={(e) => update({ scale: e.target.value as ScaleMode })}>
            <option value="fit">√ Fit</option>
            <option value="linear">Linear</option>
            <option value="true">True scale</option>
          </select>
        </label>
        <p className="note">
          {SCALE_NOTES[settings.scale]}
          {widened && <><br />Coils widened to stay readable at this zoom</>}
        </p>
      </nav>

      {/* Bottom right: zoom */}
      <nav className="corner br" aria-label="Zoom">
        <div className="presets" role="group" aria-label="Zoom to">
          {ZOOM_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => canvas.current?.flyTo(p.spanSeconds)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="row">
          {cam && <span className="scale">1 px ≈ {formatDuration(cam.secondsPerPixel)}</span>}
          <button type="button" className="ghost" onClick={() => canvas.current?.resetRoll()} title="Drag up or down to turn the view">
            Reset view
          </button>
        </div>
        <p className="note">
          Inspired by{' '}
          <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer">
            @Geosophyy
          </a>
        </p>
      </nav>
    </div>
  );
}
