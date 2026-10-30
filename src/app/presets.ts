import { SECONDS_PER_DAY, SECONDS_PER_YEAR } from '../core/time';

/** Zoom presets: how much time fits across the screen. */
export interface ZoomPreset {
  readonly id: string;
  readonly label: string;
  readonly spanSeconds: number;
}

export const ZOOM_PRESETS: readonly ZoomPreset[] = [
  { id: 'day', label: 'Day', spanSeconds: SECONDS_PER_DAY },
  { id: 'month', label: 'Month', spanSeconds: SECONDS_PER_DAY * 30 },
  { id: 'years', label: 'Years', spanSeconds: SECONDS_PER_YEAR * 2.5 },
  { id: 'century', label: 'Century', spanSeconds: SECONDS_PER_YEAR * 100 },
  { id: 'galactic', label: 'Galactic year', spanSeconds: SECONDS_PER_YEAR * 230e6 },
  { id: 'sun', label: "Sun's life", spanSeconds: SECONDS_PER_YEAR * 10.5e9 },
];

export const DEFAULT_PRESET = ZOOM_PRESETS[2] as ZoomPreset;
