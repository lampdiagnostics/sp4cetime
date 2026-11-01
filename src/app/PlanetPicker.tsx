import { useEffect, useId, useRef, useState } from 'react';
import { PLANETS, type PlanetId } from '../core/planets';
import type { Theme } from '../core/theme';
import { PLANET_SETS } from './presets';
import type { Settings } from './settings';

interface Props {
  theme: Theme;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function PlanetPicker({ theme, settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = (id: PlanetId): void => {
    const has = settings.planets.includes(id);
    onChange({ planets: PLANETS.map((p) => p.id).filter((p) => (p === id ? !has : settings.planets.includes(p))) });
  };
  const same = (ids: readonly PlanetId[]): boolean =>
    ids.length === settings.planets.length && ids.every((id) => settings.planets.includes(id));

  return (
    <div className="picker" ref={root}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        Planets <span className="count">{settings.planets.length}</span> ▾
      </button>
      {open && (
        <div className="popover" id={panelId} role="dialog" aria-label="Choose planets">
          <div className="row sets" role="group" aria-label="Quick sets">
            {PLANET_SETS.map((s) => (
              <button key={s.label} type="button" aria-pressed={same(s.ids)} onClick={() => onChange({ planets: s.ids })}>
                {s.label}
              </button>
            ))}
          </div>
          <ul className="planet-list">
            {PLANETS.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={settings.planets.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="swatch" style={{ background: theme.planets[p.id] }} aria-hidden="true" />
                  {p.name}
                  <span className="dim">{p.el.a < 10 ? p.el.a.toFixed(2) : p.el.a.toFixed(1)} AU</span>
                </label>
              </li>
            ))}
          </ul>
          <hr />
          <label>
            <input type="checkbox" checked={settings.moon} onChange={(e) => onChange({ moon: e.target.checked })} /> Moon
          </label>
        </div>
      )}
    </div>
  );
}
