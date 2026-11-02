import type { ChartLook } from '../core/path';
import { PLANET_IDS, type PlanetId } from '../core/planets';

/**
 * Per-viewer preferences, remembered in this browser only. Every visit (and every reload)
 * still opens the same way: the calendar, round window, Dark Mode, the Sun in the centre.
 * What is drawn (planets, overlays) is remembered.
 */
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
  /** Fly mode's sky: constellation figures and names, and the zodiac. */
  readonly constellations: boolean;
  readonly zodiac: boolean;
  /** The galactic equator, centre, anticentre and the halfway points. */
  readonly galactic: boolean;
  /** Earth's line skin in Fly: coastlines, big lakes, country borders. */
  readonly coastlines: boolean;
  /** A Starsigns chart on the sky (horizon and houses), or none. Not kept between visits. */
  readonly chart: ChartLook | null;
  /** Strobe: the solar system's frozen poses behind the present, and how many a year. */
  readonly strobe: boolean;
  readonly strobeSteps: number;
  readonly focus: 'sun' | PlanetId;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: 'dark',
  planets: ['mercury', 'venus', 'earth', 'mars'],
  moon: true,
  rings: true,
  labels: true,
  round: true,
  spirals: true,
  timeGrid: true,
  distanceGrid: true,
  constellations: true,
  zodiac: true,
  galactic: true,
  coastlines: true,
  chart: null,
  strobe: false,
  strobeSteps: 5.2,
  focus: 'sun',
};

const KEY = 'sp4cetime.settings.v1';

/** The strobe's range of steps (poses) a year. */
export const STROBE_MIN = 1;
export const STROBE_MAX = 24;


export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const data = JSON.parse(raw) as Partial<Settings>;
    const planets = Array.isArray(data.planets)
      ? PLANET_IDS.filter((id) => (data.planets as unknown[]).includes(id))
      : DEFAULT_SETTINGS.planets;
    return {
      themeId: DEFAULT_SETTINGS.themeId,
      planets,
      moon: typeof data.moon === 'boolean' ? data.moon : DEFAULT_SETTINGS.moon,
      rings: typeof data.rings === 'boolean' ? data.rings : DEFAULT_SETTINGS.rings,
      labels: typeof data.labels === 'boolean' ? data.labels : DEFAULT_SETTINGS.labels,
      round: DEFAULT_SETTINGS.round,
      spirals: typeof data.spirals === 'boolean' ? data.spirals : DEFAULT_SETTINGS.spirals,
      timeGrid: typeof data.timeGrid === 'boolean' ? data.timeGrid : DEFAULT_SETTINGS.timeGrid,
      distanceGrid: typeof data.distanceGrid === 'boolean' ? data.distanceGrid : DEFAULT_SETTINGS.distanceGrid,
      constellations: typeof data.constellations === 'boolean' ? data.constellations : DEFAULT_SETTINGS.constellations,
      zodiac: typeof data.zodiac === 'boolean' ? data.zodiac : DEFAULT_SETTINGS.zodiac,
      galactic: typeof data.galactic === 'boolean' ? data.galactic : DEFAULT_SETTINGS.galactic,
      coastlines: typeof data.coastlines === 'boolean' ? data.coastlines : DEFAULT_SETTINGS.coastlines,
      chart: null,
      strobe: typeof data.strobe === 'boolean' ? data.strobe : DEFAULT_SETTINGS.strobe,
      strobeSteps:
        typeof data.strobeSteps === 'number' && data.strobeSteps >= STROBE_MIN && data.strobeSteps <= STROBE_MAX
          ? data.strobeSteps
          : DEFAULT_SETTINGS.strobeSteps,
      focus: 'sun',
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
