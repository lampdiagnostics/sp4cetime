/**
 * The real sky behind the calendar: the Milky Way and the naked-eye stars on a
 * whole-sky disc that turns with the view (src/core/skymap.ts). Uses the same data
 * as Fly mode (public/sky). On light themes it is drawn as dark ink, like a star chart.
 */
import { ECL_TO_EQ, type Mat3, type Vec3 } from '../core/geometry';
import { apply, applyT, projectSky, unprojectSky, viewToGalactic } from '../core/skymap';

export interface Backdrop {
  draw(ctx: CanvasRenderingContext2D, view: Mat3, cx: number, cy: number, R: number, ink: 'light' | 'dark', strength: number): void;
}

interface SkyFile {
  readonly stars: readonly number[];
}

const DEG = Math.PI / 180;
const N = 256; // Milky Way raster size, px (scaled up smoothly when drawn)
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
  const colour = (bv: number, ink: 'light' | 'dark'): string => {
    if (ink === 'light') return 'rgb(40, 44, 60)';
    if (bv < 0.0) return 'rgb(190, 210, 255)';
    if (bv < 0.4) return 'rgb(235, 240, 255)';
    if (bv < 0.8) return 'rgb(255, 244, 225)';
    if (bv < 1.2) return 'rgb(255, 222, 180)';
    return 'rgb(255, 200, 150)';
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

  const raster = document.createElement('canvas');
  raster.width = raster.height = N;
  const rctx = raster.getContext('2d') as CanvasRenderingContext2D;
  const image = rctx.createImageData(N, N);
  let key = '';
  let projected: Array<{ x: number; y: number; size: number; alpha: number; colour: string }> = [];

  const rebuild = (view: Mat3, ink: 'light' | 'dark'): void => {
    // Milky Way: every raster pixel looks up the sky in its direction.
    const data = image.data;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const d = unprojectSky(px + 0.5 - N / 2, py + 0.5 - N / 2, N / 2);
        const i = (py * N + px) * 4;
        if (!d) {
          data[i + 3] = 0;
          continue;
        }
        const { l, b } = viewToGalactic(view, d);
        const v = brightness(l, b);
        const warm = Math.min(1, Math.max(0, (v - 0.35) / 0.55));
        if (ink === 'light') {
          data[i] = 70;
          data[i + 1] = 78;
          data[i + 2] = 105;
        } else {
          data[i] = 140 + 100 * warm;
          data[i + 1] = 158 + 66 * warm;
          data[i + 2] = 216 - 18 * warm;
        }
        data[i + 3] = Math.round(255 * Math.min(1, v));
      }
    }
    rctx.putImageData(image, 0, 0);
    // Stars on the unit disc.
    projected = stars.map((s) => {
      const p = projectSky(apply(view, s.d), 1);
      return {
        x: p.x,
        y: p.y,
        size: 0.7 + 3.2 * 10 ** (-0.22 * (s.mag + 1.5)),
        alpha: Math.min(1, 0.25 + 1.2 * 10 ** (-0.28 * s.mag)),
        colour: colour(s.bv, ink),
      };
    });
  };

  return {
    draw(ctx, view, cx, cy, R, ink, strength) {
      const k = `${ink}|${view.flat().map((x) => x.toFixed(5)).join(',')}`;
      if (k !== key) {
        rebuild(view, ink);
        key = k;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = (ink === 'light' ? 0.3 : 0.55) * strength;
      ctx.drawImage(raster, cx - R, cy - R, 2 * R, 2 * R);
      const scale = Math.max(0.8, Math.min(1.4, R / 420));
      for (const s of projected) {
        const x = cx + s.x * R, y = cy + s.y * R;
        ctx.globalAlpha = s.alpha * strength * (ink === 'light' ? 0.55 : 1);
        ctx.fillStyle = s.colour;
        const r = s.size * scale;
        if (r < 1.2) ctx.fillRect(x - r / 2, y - r / 2, r, r);
        else {
          ctx.beginPath();
          ctx.arc(x, y, r / 2, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  };
}
