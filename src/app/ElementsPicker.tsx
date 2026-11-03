import { useEffect, useId, useRef, useState } from 'react';
import { STROBE_MAX, STROBE_MIN, type Settings } from './settings';

type ElementKey = 'spirals' | 'strobe' | 'rings' | 'timeGrid' | 'distanceGrid' | 'constellations' | 'zodiac' | 'galactic' | 'coastlines';

/** What can be drawn, in every view. */
const ELEMENTS: ReadonlyArray<readonly [ElementKey, string]> = [
  ['spirals', 'Spirals'],
  ['strobe', 'Strobe (frozen poses, calendar)'],
  ['rings', 'Orbits'],
  ['timeGrid', 'Time grid'],
  ['distanceGrid', 'Space grid'],
  ['constellations', 'Constellations'],
  ['zodiac', 'Zodiac'],
  ['galactic', 'Galaxy marks'],
  ['coastlines', 'Coastlines and borders (3D)'],
];

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** What is on screen: 0 everything, 1 no controls, 2 no text at all (Space, H, the eye, a tap). */
  chrome: 0 | 1 | 2;
  onChrome: (c: 0 | 1 | 2) => void;
}

/** A drop-down of the elements to show, each one on or off. */
export function ElementsPicker({ settings, onChange, chrome, onChrome }: Props) {
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

  const on = ELEMENTS.filter(([k]) => settings[k]).length;
  return (
    <div className="picker menu" ref={root}>
      <span className="heading">Elements</span>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        Show <span className="count">{on}</span> ▾
      </button>
      {open && (
        <div className="popover" id={panelId} role="dialog" aria-label="Choose what to show">
          {/* The same three steps as Space, H or the eye; on a phone, a tap on empty space brings everything back. */}
          <div>
            <label title="Hide the boxes and buttons (Space or H); tap empty space or press Space to bring them back">
              <input type="checkbox" checked={chrome === 0} onChange={(e) => onChrome(e.target.checked ? 0 : 1)} /> Controls
            </label>
          </div>
          <div>
            <label title="Hide every word on screen too (Space or H twice)">
              <input type="checkbox" checked={chrome < 2} onChange={(e) => onChrome(e.target.checked ? 0 : 2)} /> Text and labels
            </label>
          </div>
          {ELEMENTS.map(([k, label]) => (
            <div key={k}>
              <label>
                <input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ [k]: e.target.checked })} /> {label}
              </label>
              {k === 'strobe' && settings.strobe && (
                <label className="strobe-steps">
                  <input
                    type="range"
                    min={STROBE_MIN}
                    max={STROBE_MAX}
                    step={0.05}
                    value={settings.strobeSteps}
                    onChange={(e) => onChange({ strobeSteps: Number(e.target.value) })}
                    aria-label="Strobe steps a year"
                  />
                  <input
                    type="number"
                    min={STROBE_MIN}
                    max={STROBE_MAX}
                    step={0.01}
                    value={settings.strobeSteps}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= STROBE_MIN && v <= STROBE_MAX) onChange({ strobeSteps: v });
                    }}
                    aria-label="Strobe steps a year (exact)"
                  />
                  <span>a year</span>
                </label>
              )}
            </div>
          ))}
          {settings.chart && (
            <label>
              <input type="checkbox" checked onChange={() => onChange({ chart: null })} /> Starsigns houses ({settings.chart.place}, 3D)
            </label>
          )}
        </div>
      )}
    </div>
  );
}
