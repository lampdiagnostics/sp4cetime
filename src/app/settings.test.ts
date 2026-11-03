import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from './settings';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe('Opening the app', () => {
  afterEach(() => store.clear());

  it('opens in Dark Mode, centred on the Sun, round or full as last chosen', () => {
    store.set('sp4cetime.settings.v1', JSON.stringify({ themeId: 'bright', round: false, focus: 'mars', planets: ['jupiter'], spirals: false, scale: 'true' }));
    store.set('sp4cetime.settings.fix040', '1');
    const s = loadSettings();
    expect(s.themeId).toBe('dark');
    expect(s.round).toBe(false);
    expect(s.focus).toBe('sun');
    // What is drawn is remembered.
    expect(s.planets).toEqual(['jupiter']);
    expect(s.spirals).toBe(false);
  });

  it('puts back, once, what a Starsigns path used to save over your settings (0.4.0 fix)', () => {
    store.set('sp4cetime.settings.v1', JSON.stringify({ planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'], timeGrid: false, spirals: false, rings: false, distanceGrid: false, galactic: false, moon: false }));
    const s = loadSettings();
    expect(s.timeGrid).toBe(true);
    expect(s.spirals).toBe(true);
    expect(s.planets).toEqual(DEFAULT_SETTINGS.planets);
    expect(s.moon).toBe(false); // the rest is kept
    expect(store.get('sp4cetime.settings.fix040')).toBe('1');
    // Only once: later choices stay.
    store.set('sp4cetime.settings.v1', JSON.stringify({ timeGrid: false }));
    expect(loadSettings().timeGrid).toBe(false);
  });

  it('opens with the defaults on a first visit', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Zoom presets', () => {
  it('run Minute, Hour, Day, Week, Month, Year, Decade, Century, Galactic year, Sun’s life', async () => {
    const { ZOOM_PRESETS, DEFAULT_PRESET } = await import('./presets');
    expect(ZOOM_PRESETS.map((p) => p.label)).toEqual(['Minute', 'Hour', 'Day', 'Week', 'Month', 'Year', 'Decade', 'Century', 'Galactic year', 'Sun’s life'.replace('’', "'")]);
    expect(DEFAULT_PRESET.id).toBe('minute');
  });
});
