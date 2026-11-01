import type { PlanetId } from '../core/planets';
import { SECONDS_PER_DAY, SECONDS_PER_YEAR } from '../core/time';

/** Zoom presets: how much time fits across the screen. */
export interface ZoomPreset {
  readonly id: string;
  readonly label: string;
  readonly spanSeconds: number;
}

export const ZOOM_PRESETS: readonly ZoomPreset[] = [
  { id: 'minute', label: 'Minute', spanSeconds: 60 },
  { id: 'hour', label: 'Hour', spanSeconds: 3600 },
  { id: 'day', label: 'Day', spanSeconds: SECONDS_PER_DAY },
  { id: 'week', label: 'Week', spanSeconds: SECONDS_PER_DAY * 7 },
  { id: 'month', label: 'Month', spanSeconds: SECONDS_PER_DAY * 30 },
  { id: 'year', label: 'Year', spanSeconds: SECONDS_PER_YEAR },
  { id: 'decade', label: 'Decade', spanSeconds: SECONDS_PER_YEAR * 10 },
  { id: 'century', label: 'Century', spanSeconds: SECONDS_PER_YEAR * 100 },
  { id: 'galactic', label: 'Galactic year', spanSeconds: SECONDS_PER_YEAR * 230e6 },
  { id: 'sun', label: "Sun's life", spanSeconds: SECONDS_PER_YEAR * 10.5e9 },
];

/** The calendar opens at a minute across: the present, second by second. */
export const DEFAULT_PRESET = ZOOM_PRESETS[0] as ZoomPreset;

export const PLANET_SETS: ReadonlyArray<{ label: string; ids: readonly PlanetId[] }> = [
  { label: 'Earth', ids: ['earth'] },
  { label: 'Inner', ids: ['mercury', 'venus', 'earth', 'mars'] },
  { label: 'Outer', ids: ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] },
  { label: 'All', ids: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] },
];
