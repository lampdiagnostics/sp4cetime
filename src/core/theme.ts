/**
 * Themes are data (content/themes/*.json), validated here at load time.
 * A theme changes how things look, never where they are.
 */

export interface Theme {
  readonly id: string;
  readonly name: string;
  /** Page background behind everything. */
  readonly background: string;
  /** Moving background grid. */
  readonly grid: string;
  readonly gridSpacingPx: number;
  /** Grid drift speed in px/s (the "travelling forward" illusion). 0 = still. */
  readonly gridSpeedPxPerSec: number;
  /** Galactic background stars. */
  readonly galaxy: string;
  readonly galaxyAlpha: number;
  /** The Sun's galactic path: the central line. */
  readonly sunLine: string;
  readonly sunLineWidth: number;
  readonly sun: string;
  /** Earth's helix, front and back halves. */
  readonly earthTrail: string;
  readonly earthTrailBack: string;
  readonly earthTrailWidth: number;
  readonly earth: string;
  readonly moonTrail: string;
  readonly moon: string;
  readonly tickLine: string;
  readonly tickText: string;
  readonly cursor: string;
  readonly today: string;
  /** Glow radius in px for lines and bodies (canvas shadowBlur). 0 = none. */
  readonly glow: number;
  readonly font: string;
  /** UI chrome: "dark" or "light", for panel styling. */
  readonly ui: 'dark' | 'light';
}

const STRING_KEYS = [
  'id', 'name', 'background', 'grid', 'galaxy', 'sunLine', 'sun', 'earthTrail', 'earthTrailBack',
  'earth', 'moonTrail', 'moon', 'tickLine', 'tickText', 'cursor', 'today', 'font',
] as const;
const NUMBER_KEYS = [
  'gridSpacingPx', 'gridSpeedPxPerSec', 'galaxyAlpha', 'sunLineWidth', 'earthTrailWidth', 'glow',
] as const;

/** Validate untrusted theme data. Throws with a readable message on the first problem. */
export function parseTheme(data: unknown): Theme {
  if (typeof data !== 'object' || data === null) throw new Error('Theme must be an object');
  const rec = data as Record<string, unknown>;
  const where = typeof rec.id === 'string' ? `Theme "${rec.id}"` : 'Theme';
  for (const key of STRING_KEYS) {
    if (typeof rec[key] !== 'string' || rec[key] === '') throw new Error(`${where}: "${key}" must be a non-empty string`);
  }
  for (const key of NUMBER_KEYS) {
    const v = rec[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`${where}: "${key}" must be a non-negative number`);
    }
  }
  if (rec.ui !== 'dark' && rec.ui !== 'light') throw new Error(`${where}: "ui" must be "dark" or "light"`);
  if ((rec.gridSpacingPx as number) < 8) throw new Error(`${where}: "gridSpacingPx" must be at least 8`);
  return rec as unknown as Theme;
}
