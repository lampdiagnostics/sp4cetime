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

  it('always opens round, in Dark Mode, centred on the Sun, whatever was chosen last time', () => {
    store.set('sp4cetime.settings.v1', JSON.stringify({ themeId: 'bright', round: false, focus: 'mars', planets: ['jupiter'], spirals: false, scale: 'true' }));
    const s = loadSettings();
    expect(s.themeId).toBe('dark');
    expect(s.round).toBe(true);
    expect(s.focus).toBe('sun');
    // What is drawn is remembered.
    expect(s.planets).toEqual(['jupiter']);
    expect(s.spirals).toBe(false);
    expect(s.scale).toBe('true');
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
