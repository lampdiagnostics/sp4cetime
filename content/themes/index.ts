import { parseTheme, type Theme } from '../../src/core/theme';
import bright from './bright.json';
import colour from './colour.json';
import dark from './dark.json';

/** Built-in themes, validated at startup. The first is the default. */
export const THEMES: readonly Theme[] = [dark, bright, colour].map(parseTheme);

