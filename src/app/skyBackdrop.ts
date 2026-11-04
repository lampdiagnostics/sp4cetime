/**
 * The real sky behind the calendar: the Milky Way and the naked-eye stars, seen
 * through the same lens as Fly mode, turning with the view (src/core/skymap.ts). Uses the same data
 * as Fly mode (public/sky), styled by the theme's sky (src/core/theme.ts): in Bright mode
 * it is a negative, dark ink on paper like a star chart, where brighter means darker.
 */
import { mixRgb, parseColour } from '../core/colour';
import { ECL_TO_EQ, type Mat3, type Vec3 } from '../core/geometry';
import type { SkyOptions } from '../core/render';
import { type FigureData, figureShown, type MarkKind, skyMarks, skySegments, turnSigns } from '../core/skyfigures';
import type { SkyStyle } from '../core/theme';
import { apply, applyT, projectSky, unprojectSky, viewToGalactic } from '../core/skymap';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Backdrop {
  draw(ctx: CanvasRenderingContext2D, view: Mat3, cx: number, cy: number, focal: number, box: Box, style: SkyStyle, options: SkyOptions): void;
}

interface SkyFile extends FigureData {
  readonly stars: readonly number[];
}

const DEG = Math.PI / 180;
const STEP = 4; // screen px per Milky Way raster px (scaled up smoothly when drawn)
const MAX_MAG = 5.5;

async function loadMap(url: string): Promise<{ px: Uint8ClampedArray; W: number; H: number }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0);
  return { px: ctx.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
}

export async function loadBackdrop(base: string): Promise<Backdrop> {
  const [sky, map] = await Promise.all([
    fetch(`${base}sky/sky.json`).then((r) => {
      if (!r.ok) throw new Error(`sky.json: ${r.status}`);
      return r.json() as Promise<SkyFile>;
    }),
    loadMap(`${base}sky/milkyway.jpg`),
  ]);

  // Stars as ecliptic directions, brightest last so they draw on top.
  const stars: Array<{ d: Vec3; mag: number; bv: number }> = [];
  for (let i = 0; i < sky.stars.length; i += 4) {
    const [ra, dec, mag, bv] = [sky.stars[i]!, sky.stars[i + 1]!, sky.stars[i + 2]!, sky.stars[i + 3]!];
    if (mag > MAX_MAG) continue;
    const eq: Vec3 = [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
    stars.push({ d: applyT(ECL_TO_EQ, eq), mag, bv });
  }
  stars.sort((a, b) => b.mag - a.mag);
  const natural = (bv: number): [number, number, number] => {
    if (bv < 0.0) return [190, 210, 255];
    if (bv < 0.4) return [235, 240, 255];
    if (bv < 0.8) return [255, 244, 225];
    if (bv < 1.2) return [255, 222, 180];
    return [255, 200, 150];
  };
  const colour = (bv: number, style: SkyStyle): string => {
    const [r, g, b] = mixRgb(natural(bv), parseColour(style.starTint).rgb, style.starTintMix);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  };

  // Galactic map lookup (bilinear, wrapping in longitude). Centre in the middle,
  // longitude increasing to the left, b = +90° at the top.
  const brightness = (l: number, b: number): number => {
    const fx = (((0.5 - l / (2 * Math.PI)) % 1) + 1) % 1 * map.W - 0.5;
    const fy = (0.5 - b / Math.PI) * map.H - 0.5;
    const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(map.H - 2, Math.floor(fy)));
    const tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
    const get = (x: number, y: number): number => map.px[(y * map.W + ((x % map.W) + map.W) % map.W) * 4]! / 255;
    const top = get(x0, y0) * (1 - tx) + get(x0 + 1, y0) * tx;
    const bot = get(x0, y0 + 1) * (1 - tx) + get(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };

  // Constellation figures, the zodiac and the galaxy marks, as in Fly mode.
  const segments = skySegments(sky);
  const marks = skyMarks(sky);
  const brightStars = stars.filter((s) => s.mag < 3.2).map((s) => s.d);
  let lines: Array<{ x0: number; y0: number; x1: number; y1: number; kind: string; opacity: number }> = [];
  let names: Array<{ x: number; y: number; text: string; kind: MarkKind }> = [];

  const raster = document.createElement('canvas');
  const rctx = raster.getContext('2d') as CanvasRenderingContext2D;
  let image: ImageData | null = null;
  let key = '';
  let projected: Array<{ x: number; y: number; size: number; alpha: number; colour: string }> = [];

  const rebuild = (view: Mat3, style: SkyStyle, cx: number, cy: number, focal: number, box: Box, options: SkyOptions): void => {
    // Lines and names: a straight line on screen is a great circle on the sky in this lens.
    lines = [];
    const far = 4 * focal;
    const on = (p: { x: number; y: number } | null): p is { x: number; y: number } => !!p && Math.abs(p.x) < far && Math.abs(p.y) < far;
    // The sign boundaries and names turn with the equinox of the viewed date.
    const shift = options.equinoxShift ?? 0;
    for (const g of segments) {
      if (!figureShown(g.kind, options)) continue;
      const ga = g.kind === 'signs' ? turnSigns(g.a, shift) : g.a, gb = g.kind === 'signs' ? turnSigns(g.b, shift) : g.b;
      const a = projectSky(apply(view, ga), focal), b = projectSky(apply(view, gb), focal);
      if (on(a) && on(b)) lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, kind: g.kind, opacity: g.opacity });
    }
    const brightPts = brightStars.map((d) => projectSky(apply(view, d), focal)).filter(on);
    names = [];
    for (const m of marks) {
      if (!figureShown(m.kind, options)) continue;
      const p = projectSky(apply(view, m.kind === 'sign' ? turnSigns(m.dir, shift) : m.dir), focal);
      if (!on(p)) continue;
      // Step aside rather than cover a bright star; hide if there is no room.
      const w = m.text.length * (m.kind === 'constellation' || m.kind === 'zodiacFigure' ? 7.6 : 6.3) + 4;
      const base = m.kind === 'star' ? [p.x + 6, p.y - 6] : [p.x, p.y];
      for (const [dx, dy] of [[0, 0], [0, -14], [0, 14], [-w - 10, 0]] as const) {
        const x0 = base[0]! + dx, y0 = base[1]! + dy;
        const hit = brightPts.some((s) => (m.kind !== 'star' || Math.hypot(s.x - p.x, s.y - p.y) > 2) && s.x > x0 - 4 && s.x < x0 + w + 4 && s.y > y0 - 4 && s.y < y0 + 17);
        if (!hit) {
          names.push({ x: x0, y: y0, text: m.text, kind: m.kind });
          break;
        }
      }
    }
    const faint = parseColour(style.milkyWayFaint).rgb, bright = parseColour(style.milkyWayBright).rgb;
    // Milky Way: every raster pixel looks up the sky in its direction.
    const nw = Math.max(1, Math.ceil(box.w / STEP)), nh = Math.max(1, Math.ceil(box.h / STEP));
    if (!image || image.width !== nw || image.height !== nh) {
      raster.width = nw;
      raster.height = nh;
      image = rctx.createImageData(nw, nh);
    }
    const data = image.data;
    for (let py = 0; py < nh; py++) {
      for (let px = 0; px < nw; px++) {
        const d = unprojectSky(box.x + (px + 0.5) * STEP - cx, box.y + (py + 0.5) * STEP - cy, focal);
        const i = (py * nw + px) * 4;
        const { l, b } = viewToGalactic(view, d);
        const v = brightness(l, b);
        const warm = Math.min(1, Math.max(0, (v - 0.35) / 0.55));
        const c = mixRgb(faint, bright, warm);
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        // Ink on paper reads fainter than light on black: lift the faint parts.
        data[i + 3] = Math.round(255 * Math.min(1, style.ink ? v ** 0.75 : v));
      }
    }
    rctx.putImageData(image, 0, 0);
    // Stars, as screen offsets from the view centre.
    projected = [];
    for (const s of stars) {
      const p = projectSky(apply(view, s.d), focal);
      if (!p || Math.abs(p.x) > 4 * focal || Math.abs(p.y) > 4 * focal) continue;
      projected.push({
        x: p.x,
        y: p.y,
        // As in Fly mode: bright stars much larger and brighter than faint ones.
        size: (style.ink ? 1.25 : 1) * (1.1 + 7 * 10 ** (-0.3 * (s.mag + 1.5))),
        alpha: Math.min(1, (style.ink ? 0.45 : 0.3) + 1.5 * 10 ** (-0.3 * s.mag)),
        colour: colour(s.bv, style),
      });
    }
  };

  return {
    draw(ctx, view, cx, cy, focal, box, style, options) {
      const k = `${JSON.stringify(style)}|${options.constellations}${options.zodiac}${options.galactic}|${(options.equinoxShift ?? 0).toFixed(2)}|${[cx, cy, focal, box.x, box.y, box.w, box.h].map((x) => x.toFixed(1)).join(',')}|${view
        .flat()
        .map((x) => x.toFixed(5))
        .join(',')}`;
      if (k !== key) {
        rebuild(view, style, cx, cy, focal, box, options);
        key = k;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = Math.min(1, style.milkyWayStrength);
      ctx.drawImage(raster, box.x, box.y, raster.width * STEP, raster.height * STEP);
      const scale = Math.max(0.8, Math.min(1.4, box.h / 800));
      for (const s of projected) {
        const x = cx + s.x, y = cy + s.y;
        if (x < box.x - 8 || x > box.x + box.w + 8 || y < box.y - 8 || y > box.y + box.h + 8) continue;
        ctx.globalAlpha = Math.min(1, s.alpha * style.starStrength);
        ctx.fillStyle = s.colour;
        const r = s.size * scale;
        if (r < 1.2) ctx.fillRect(x - r / 2, y - r / 2, r, r);
        else {
          ctx.beginPath();
          ctx.arc(x, y, r / 2, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      // Figures and marks over the stars, names last.
      const colourOf = (kind: string): string =>
        kind === 'figures' ? style.figures : kind === 'galactic' ? style.galactic : style.zodiac;
      ctx.lineWidth = 1;
      for (const kind of ['figures', 'signs', 'ecliptic', 'zodiacFigures', 'galactic']) {
        const set = lines.filter((l) => l.kind === kind);
        if (set.length === 0) continue;
        ctx.strokeStyle = colourOf(kind);
        ctx.globalAlpha = Math.min(1, set[0]!.opacity * (style.ink ? 1.3 : 1));
        ctx.beginPath();
        for (const l of set) {
          ctx.moveTo(cx + l.x0, cy + l.y0);
          ctx.lineTo(cx + l.x1, cy + l.y1);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.shadowColor = style.labelHalo;
      ctx.shadowBlur = 3;
      for (const n of names) {
        const upper = n.kind === 'constellation' || n.kind === 'zodiacFigure';
        ctx.font = `${upper ? 9.5 : n.kind === 'sign' || n.kind === 'galactic' ? 11 : 10.5}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = n.kind === 'star' ? style.labelStar : n.kind === 'galactic' ? style.labelGalactic : n.kind === 'constellation' ? style.label : style.labelZodiac;
        ctx.globalAlpha = n.kind === 'sign' ? 0.7 : 1;
        const t = upper ? n.text.toUpperCase().split('').join('\u200a') : n.text;
        ctx.fillText(t, cx + n.x, cy + n.y);
      }
      // The Sun and the Moon, where they are on the zodiac seen from Earth now (moved each
      // frame, not cached: the Moon crosses a sign in about two and a half days).
      if (options.bodies) {
        ctx.globalAlpha = 1;
        for (const b of options.bodies) {
          const p = projectSky(apply(view, b.dir), focal);
          if (!p) continue;
          const x = cx + p.x, y = cy + p.y;
          if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
          ctx.fillStyle = style.labelZodiac;
          ctx.strokeStyle = style.labelZodiac;
          ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          // The Sun's sign is written below it (the Sun itself is drawn on top); the Moon's beside it.
          const below = b.glyph === '☉';
          ctx.fillText(`${b.glyph} ${b.text}`, x + (below ? -30 : 11), y + (below ? 22 : 0));
        }
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    },
  };
}
