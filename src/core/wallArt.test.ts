import { describe, expect, it } from 'vitest';
import { artData, type ArtContext, drawArt } from './wallArt';
import { screensaverHtml } from './screensaver';
import { readingAt } from './reading';
import { fromCivil } from './time';

/** A canvas that records what is drawn. */
function recorder(): ArtContext & { texts: string[]; calls: number } {
  const grad = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const r = {
    texts: [] as string[],
    calls: 0,
    fillStyle: '' as ArtContext['fillStyle'],
    strokeStyle: '' as ArtContext['strokeStyle'],
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    beginPath() {
      r.calls++;
    },
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    fillRect() {},
    fillText(s: string) {
      r.texts.push(s);
    },
    setLineDash() {},
    createRadialGradient: () => grad,
  };
  return r;
}

const natal = readingAt(fromCivil(1985, 7, 14, 73_200), 49.88, -97.15);
const D = artData(natal, { title: 'Happy Birthday', names: 'Ada', when: '14 July 1985', place: 'Winnipeg', noTime: false, night: true });

describe('wall art', () => {
  it('draws the title, the names, every sign and every body, in both shapes', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1290, 2796],
    ] as const) {
      const ctx = recorder();
      drawArt(ctx, D, w, h, 0);
      for (const s of ['Happy Birthday', 'Ada', 'ARIES', 'PISCES', 'Sun', 'Moon', 'Pluto', 'ASC']) expect(ctx.texts).toContain(s);
    }
  });

  it('leaves the houses out when the time is not known', () => {
    const ctx = recorder();
    drawArt(ctx, { ...D, cusps: null }, 1920, 1080, 0);
    expect(ctx.texts).not.toContain('ASC');
  });

  it('stands alone, so the screensaver can carry it (its source runs with nothing around it)', () => {
    const f = new Function(`return (${drawArt.toString()});`)() as typeof drawArt;
    const ctx = recorder();
    f(ctx, D, 800, 600, 12.5);
    expect(ctx.texts).toContain('Happy Birthday');
  });
});

describe('screensaver', () => {
  it('is one page with the data inside, closing no tags early', () => {
    const html = screensaverHtml({ ...D, names: '</script><b>x' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('prefers-reduced-motion');
  });
});
