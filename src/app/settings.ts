import type { ScaleMode } from '../core/geometry';
import { PLANET_IDS, type PlanetId } from '../core/planets';

/** Per-viewer preferences, remembered in this browser only. */
export interface Settings {
  readonly themeId: string;
  readonly planets: readonly PlanetId[];
  readonly moon: boolean;
  readonly rings: boolean;
  readonly labels: boolean;
  readonly round: boolean;
  readonly spirals: boolean;
  readonly timeGrid: boolean;
  readonly distanceGrid: boolean;
  readonly scale: ScaleMode;
  readonly focus: 'sun' | PlanetId;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: 'scientific',
  planets: ['mercury', 'venus', 'earth', 'mars'],
  moon: true,
  rings: true,
  labels: true,
  round: true,
  spirals: true,
  timeGrid: true,
  distanceGrid: true,
  scale: 'fit',
  focus: 'sun',
};

const KEY = 'sp4cetime.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const data = JSON.parse(raw) as Partial<Settings>;
    const planets = Array.isArray(data.planets)
      ? PLANET_IDS.filter((id) => (data.planets as unknown[]).includes(id))
      : DEFAULT_SETTINGS.planets;
    return {
      themeId: typeof data.themeId === 'string' ? data.themeId : DEFAULT_SETTINGS.themeId,
      planets,
      moon: typeof data.moon === 'boolean' ? data.moon : DEFAULT_SETTINGS.moon,
      rings: typeof data.rings === 'boolean' ? data.rings : DEFAULT_SETTINGS.rings,
      labels: typeof data.labels === 'boolean' ? data.labels : DEFAULT_SETTINGS.labels,
      round: typeof data.round === 'boolean' ? data.round : DEFAULT_SETTINGS.round,
      spirals: typeof data.spirals === 'boolean' ? data.spirals : DEFAULT_SETTINGS.spirals,
      timeGrid: typeof data.timeGrid === 'boolean' ? data.timeGrid : DEFAULT_SETTINGS.timeGrid,
      distanceGrid: typeof data.distanceGrid === 'boolean' ? data.distanceGrid : DEFAULT_SETTINGS.distanceGrid,
      scale: data.scale === 'linear' || data.scale === 'true' ? data.scale : 'fit',
      focus: PLANET_IDS.includes(data.focus as PlanetId) ? (data.focus as PlanetId) : 'sun',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}
