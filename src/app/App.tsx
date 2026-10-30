import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { THEMES } from '../../content/themes';
import type { Camera } from '../core/camera';
import { bodyState, TIER_LABELS } from '../core/models';
import type { Theme } from '../core/theme';
import { formatDuration, formatTime, fromUnixMs } from '../core/time';
import { type CanvasHandle, GalacticCanvas } from './GalacticCanvas';
import { MoonIcon, moonPhaseName } from './MoonIcon';
import { DEFAULT_PRESET, ZOOM_PRESETS } from './presets';

const CREDIT_URL = 'https://x.com/Geosophyy/status/2115404526002041035';

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (): void => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function loadThemeId(): string {
  try {
    return localStorage.getItem('sp4cetime.theme') ?? THEMES[0]?.id ?? '';
  } catch {
    return THEMES[0]?.id ?? '';
  }
}

export function App() {
  const [themeId, setThemeId] = useState(loadThemeId);
  const theme: Theme = useMemo(() => THEMES.find((t) => t.id === themeId) ?? (THEMES[0] as Theme), [themeId]);
  const reducedMotion = usePrefersReducedMotion();
  const [motionPaused, setMotionPaused] = useState(false);
  const motion = !reducedMotion && !motionPaused;
  const [cam, setCam] = useState<Camera | null>(null);
  const canvas = useRef<CanvasHandle>(null);
  const initialCenter = useMemo(() => fromUnixMs(Date.now()), []);

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

  useEffect(() => {
    try {
      localStorage.setItem('sp4cetime.theme', theme.id);
    } catch {
      /* storage unavailable: theme is not remembered */
    }
    document.documentElement.dataset.ui = theme.ui;
  }, [theme]);

  const goToday = (): void => canvas.current?.flyTo(DEFAULT_PRESET.spanSeconds, fromUnixMs(Date.now()));

  const onKeyDown = (e: KeyboardEvent): void => {
    const c = canvas.current;
    if (!c) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => c.panBy(-0.1),
      ArrowRight: () => c.panBy(0.1),
      '+': () => c.zoomBy(0.7),
      '=': () => c.zoomBy(0.7),
      '-': () => c.zoomBy(1 / 0.7),
      t: goToday,
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const state = cam ? bodyState(cam.center) : null;
  const centerLabel = cam ? formatTime(cam.center, cam.secondsPerPixel) : '';

  return (
    <div className="app" style={{ background: theme.background }}>
      <div
        className="stage"
        tabIndex={0}
        role="application"
        aria-roledescription="time canvas"
        aria-label="Galactic calendar. Drag or use the arrow keys to move through time; scroll, pinch or press plus and minus to zoom; press T for today."
        onKeyDown={onKeyDown}
      >
        <GalacticCanvas
          theme={theme}
          initialCenter={initialCenter}
          initialSpanSeconds={DEFAULT_PRESET.spanSeconds}
          motion={motion}
          onCameraChange={onCameraChange}
          handleRef={canvas}
        />
      </div>

      <header className="hud hud-left">
        <div className="brand">
          sp4cetime <span>Galactic Calendar</span>
        </div>
        <output className="center-date" aria-live="polite">
          {centerLabel}
        </output>
        {cam && state && (
          <div className="facts">
            <span className={`tier tier-${state.tier}`} title="How precisely Earth's and the Moon's positions are known here">
              {TIER_LABELS[state.tier]}
            </span>
            {state.tier === 'schematic' ? (
              <span className="moon" title="The Moon's phase cannot be known this far from today">
                Moon phase unknowable here
              </span>
            ) : (
              <span className="moon" title="Moon phase at the centre time">
                <MoonIcon phase={state.moonPhase} size={18} />
                {moonPhaseName(state.moonPhase)}
              </span>
            )}
            <span className="scale">1 px ≈ {formatDuration(cam.secondsPerPixel)}</span>
          </div>
        )}
      </header>

      <nav className="hud hud-right" aria-label="View controls">
        <div className="row">
          <button type="button" className="primary" onClick={goToday}>
            Today
          </button>
          <label className="select">
            <span className="visually-hidden">Theme</span>
            <select value={theme.id} onChange={(e) => setThemeId(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setMotionPaused((p) => !p)}
            aria-pressed={!motion}
            disabled={reducedMotion}
            title={reducedMotion ? 'Motion is off because your system asks for reduced motion' : undefined}
          >
            {motion ? 'Pause motion' : 'Motion off'}
          </button>
        </div>
        <div className="row presets" role="group" aria-label="Zoom to">
          {ZOOM_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => canvas.current?.flyTo(p.spanSeconds)}>
              {p.label}
            </button>
          ))}
        </div>
      </nav>

      <footer className="credit">
        Orbit sizes exaggerated for clarity · Inspired by{' '}
        <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer">
          @Geosophyy
        </a>
      </footer>
    </div>
  );
}
