import { describe, expect, it } from 'vitest';
import { THEMES } from '../../content/themes';
import { mixRgb, parseColour } from './colour';

describe('parseColour', () => {
  it('reads hex and rgba', () => {
    expect(parseColour('#ff8000')).toEqual({ rgb: [255, 128, 0], alpha: 1 });
    expect(parseColour('#fff')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseColour('rgba(10, 20, 30, 0.5)')).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(() => parseColour('blue')).toThrow();
  });
  it('reads every colour in every theme’s sky', () => {
    for (const t of THEMES) {
      for (const [k, v] of Object.entries(t.sky)) if (typeof v === 'string') expect(() => parseColour(v), `${t.id}.sky.${k}`).not.toThrow();
    }
  });
  it('mixes', () => {
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  });
});
