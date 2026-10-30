import { parseTheme, type Theme } from '../../src/core/theme';
import minimal from './minimal.json';
import scientific from './scientific.json';
import synthwave from './synthwave.json';

/** Built-in themes, validated at startup. The first is the default. */
export const THEMES: readonly Theme[] = [scientific, minimal, synthwave].map(parseTheme);
