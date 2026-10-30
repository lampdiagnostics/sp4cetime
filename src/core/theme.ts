/**
 * Themes are data (content/themes/*.json), validated here at load time.
 * A theme changes how things look, never where they are.
 */
import { PLANET_IDS, type PlanetId } from './planets';

export interface Theme {
  readonly id: string;
  readonly name: string;
  /** Behind everything, and outside the round window. */
  readonly background: string;
  /** Minor and major vertical grid lines (on the axis ticks) and the horizontal lines. */
  readonly grid: string;
  readonly gridMajor: string;
  readonly gridSpacingPx: number;
  /** Galactic background stars. */
  readonly galaxy: string;
  readonly galaxyAlpha: number;
  /** The Sun's galactic path: the central line. */
  readonly sunLine: string;
  readonly sunLineWidth: number;
  readonly sun: string;
  /** One colour per planet. */
  readonly planets: Readonly<Record<PlanetId, string>>;
  readonly trailWidth: number;
  /** Opacity of the half of each helix behind the line of travel. */
  readonly trailBackAlpha: number;
  /** Opacity of the wireframe orbit rings around the Sun. */
  readonly ringAlpha: number;
  readonly moon: string;
  readonly moonTrail: string;
  readonly tickLine: string;
  readonly tickText: string;
  readonly cursor: string;
  readonly today: string;
  /** Rim of the round window. */
  readonly bezel: string;
  /** Glow radius in px for the Sun line and bodies (canvas shadowBlur). 0 = none. */
  readonly glow: number;
  readonly font: string;
  /** UI chrome: "dark" or "light". */
  readonly ui: 'dark' | 'light';
}

const STRING_KEYS = [
  'id', 'name', 'background', 'grid', 'gridMajor', 'galaxy', 'sunLine', 'sun', 'moon', 'moonTrail',
  'tickLine', 'tickText', 'cursor', 'today', 'bezel', 'font',
] as const;
const NUMBER_KEYS = [
  'gridSpacingPx', 'galaxyAlpha', 'sunLineWidth', 'trailWidth', 'trailBackAlpha', 'ringAlpha', 'glow',
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
  for (const key of ['galaxyAlpha', 'trailBackAlpha', 'ringAlpha'] as const) {
    if ((rec[key] as number) > 1) throw new Error(`${where}: "${key}" must be between 0 and 1`);
  }
  const planets = rec.planets;
  if (typeof planets !== 'object' || planets === null) throw new Error(`${where}: "planets" must be an object`);
  for (const id of PLANET_IDS) {
    const c = (planets as Record<string, unknown>)[id];
    if (typeof c !== 'string' || c === '') throw new Error(`${where}: "planets.${id}" must be a colour`);
  }
  if (rec.ui !== 'dark' && rec.ui !== 'light') throw new Error(`${where}: "ui" must be "dark" or "light"`);
  if ((rec.gridSpacingPx as number) < 8) throw new Error(`${where}: "gridSpacingPx" must be at least 8`);
  return rec as unknown as Theme;
}
