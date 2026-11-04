/**
 * Capturing what is on screen: a still (PNG), an animated GIF, or a video. A capture is
 * the views (their canvases) with everything HTML that is showing over them: the names,
 * the boxes (when they are showing), the windows' tabs. The capture controls themselves
 * (anything marked data-no-capture) are never in it. A watermark is added by default.
 */
import { holdQuality } from '../core/quality';
import { soundStream, unlockSound } from './sound';

export const WATERMARK = '@sp4cetime.org';

export interface Stage {
  readonly canvas: HTMLCanvasElement;
  /** HTML drawn over the canvas that moves every frame (Fly mode's labels and markers). */
  readonly overlays: readonly HTMLElement[];
  /** Its round window on screen (client px), or null for the whole rectangle. */
  readonly clip: { readonly cx: number; readonly cy: number; readonly r: number } | null;
  /** How opaque it is (a view cross-fading, a path's dissolve); 1 if not given. */
  readonly alpha?: number;
}

/** What to capture: some windows, within a region of the screen (client px), and the page around them. */
export interface Shot {
  readonly stages: readonly Stage[];
  readonly region: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** The page whose HTML (boxes, tabs) is painted over the views. */
  readonly page: HTMLElement | null;
}

/** A window's view (its calendar or its 3D canvas), with its circle (in the window's own px). */
export function stageIn(root: HTMLElement, in3D: boolean, clip: { cx: number; cy: number; r: number } | null): Stage | null {
  const canvas = root.querySelector<HTMLCanvasElement>(in3D ? '.fly-canvas' : '.galactic-canvas');
  if (!canvas) return null;
  const overlays = in3D ? [...root.querySelectorAll<HTMLElement>('.fly-markers, .fly-labels')] : [];
  const b = root.getBoundingClientRect();
  return { canvas, overlays, clip: clip ? { cx: b.left + clip.cx, cy: b.top + clip.cy, r: clip.r } : null };
}

/**
 * Both of a window's views as they show now: the calendar and the 3D view, each as opaque
 * as it is on screen (they cross-fade when the view changes).
 */
export function viewStages(root: HTMLElement, clip: { cx: number; cy: number; r: number } | null): Stage[] {
  const out: Stage[] = [];
  for (const in3D of [false, true]) {
    const st = stageIn(root, in3D, clip);
    if (!st) continue;
    const view = st.canvas.closest<HTMLElement>('.view');
    const alpha = view ? Number(getComputedStyle(view).opacity) : 1;
    if (alpha > 0.01) out.push({ ...st, alpha });
  }
  return out;
}

/** Device pixels per CSS pixel of the first view (so a capture is as sharp as the screen). */
export function shotScale(shot: Shot): number {
  const s = shot.stages[0];
  if (!s) return 1;
  const r = s.canvas.getBoundingClientRect();
  return r.width > 0 ? s.canvas.width / r.width : 1;
}

const shown = (cs: CSSStyleDeclaration): boolean => cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
const transparent = (c: string): boolean => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);

// --- The page's HTML as a picture -------------------------------------------------

/** Left out of the HTML picture: the views (drawn from their canvases), what is painted every frame, the capture controls. */
const SKIP = 'canvas, .fly-labels, .fly-markers, [data-no-capture]';

/**
 * The styles that decide how a box looks. While recording, only these are copied (a few
 * dozen instead of every one of the ~350 the browser knows), so refreshing the boxes'
 * picture costs a fraction of a frame; a screenshot copies them all.
 */
const LOOK_PROPS: readonly string[] = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style',
  'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'background-color', 'background-image', 'box-shadow', 'color', 'opacity', 'visibility', 'overflow', 'font-family', 'font-size',
  'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line', 'text-overflow',
  'white-space', 'vertical-align', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self',
  'justify-content', 'row-gap', 'column-gap', 'grid-template-columns', 'list-style-type', 'appearance', 'fill', 'stroke', 'stroke-width',
];

/** A copy of an element and its children with its computed styles written inline (all, or only `props`). */
function cloneStyled(src: Element, props?: readonly string[]): Node {
  if (src.matches(SKIP)) {
    const gap = document.createElement('span');
    gap.setAttribute('style', 'display:none');
    return gap;
  }
  const c = src.cloneNode(false) as Element;
  const cs = getComputedStyle(src);
  let css = '';
  if (props) for (const n of props) css += `${n}:${cs.getPropertyValue(n)};`;
  else {
    for (let i = 0; i < cs.length; i++) {
      const n = cs[i] as string;
      css += `${n}:${cs.getPropertyValue(n)};`;
    }
  }
  // Anything holding a view (a window, the 3D view's frame) must not hide it with its background.
  if (src.querySelector('canvas')) css += 'background:transparent !important;background-color:transparent !important;';
  c.setAttribute('style', css);
  c.removeAttribute('id');
  if (src instanceof HTMLInputElement) {
    c.setAttribute('value', src.value);
    if (src.checked) c.setAttribute('checked', '');
    else c.removeAttribute('checked');
  }
  if (src instanceof HTMLOptionElement) {
    if (src.selected) c.setAttribute('selected', '');
    else c.removeAttribute('selected');
  }
  // A drop-down shows only its chosen option.
  const kids = src instanceof HTMLSelectElement ? Array.from(src.selectedOptions) : Array.from(src.childNodes);
  for (const ch of kids) {
    if (ch.nodeType === Node.ELEMENT_NODE) c.appendChild(cloneStyled(ch as Element, props));
    else if (ch.nodeType === Node.TEXT_NODE) c.appendChild(ch.cloneNode());
  }
  return c;
}

/** One box of the page (its HTML as a picture), and where it is on screen (client px). */
export interface Snap {
  readonly img: HTMLImageElement;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** An element's HTML as an image at `k` device pixels per CSS pixel, by drawing a styled copy inside an SVG. */
function snapshotElement(el: HTMLElement, k: number, fast = false): Promise<Snap | null> {
  const r = el.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(r.width)), h = Math.max(1, Math.ceil(r.height));
  const clone = cloneStyled(el, fast ? LOOK_PROPS : undefined) as HTMLElement;
  const base = clone.getAttribute('style') ?? '';
  clone.setAttribute('style', `${base}position:relative;left:0;top:0;right:auto;bottom:auto;transform:none;margin:0;width:${w}px;height:${h}px;box-sizing:border-box;`);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * k)}" height="${Math.round(h * k)}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>`;
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ img, left: r.left, top: r.top, width: w, height: h });
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * The page's boxes (the corner boxes, whatever of them is showing; never the capture
 * controls), each as its own picture, so nothing but the boxes can ever cover the view.
 */
function pageBoxes(page: HTMLElement): HTMLElement[] {
  return Array.from(page.querySelectorAll<HTMLElement>('.corner, .pointbox, .place-stamp')).filter((el) => {
    if (el.closest('[data-no-capture]')) return false;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0;
  });
}

export async function snapshotPage(page: HTMLElement, k: number): Promise<Snap[]> {
  const snaps = await Promise.all(pageBoxes(page).map((el) => snapshotElement(el, k)));
  return snaps.filter((x): x is Snap => x !== null);
}

/** What a box shows: when this changes, its picture is taken again. */
function boxKey(el: HTMLElement): string {
  const b = el.getBoundingClientRect();
  const fields = Array.from(el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
    .map((f) => (f instanceof HTMLInputElement && f.type === 'checkbox' ? String(f.checked) : f.value))
    .join('|');
  return `${document.documentElement.dataset.ui ?? ''}|${el.className}|${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)},${Math.round(b.height)}|${el.textContent ?? ''}|${fields}`;
}

// --- Reading a view back ----------------------------------------------------------

/**
 * Some browsers hand back an empty picture when one canvas is drawn into another (a 3D
 * view whose frame has already gone to the screen, or a GPU canvas). Each view is tested
 * now and then by drawing it small; one that comes back empty is read pixel by pixel
 * instead (slower, but it always works).
 */
const blankCache = new WeakMap<HTMLCanvasElement, { blank: boolean; t: number }>();
function drawsBlank(src: HTMLCanvasElement): boolean {
  const now = performance.now();
  const c = blankCache.get(src);
  if (c && now - c.t < 3000) return c.blank;
  let blank = false;
  try {
    const t = document.createElement('canvas');
    t.width = 16;
    t.height = 16;
    const x = t.getContext('2d', { willReadFrequently: true });
    if (x) {
      x.drawImage(src, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      blank = true;
      for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 0) (blank = false), (i = d.length);
    }
  } catch {
    blank = true;
  }
  blankCache.set(src, { blank, t: now });
  return blank;
}

const scratch = document.createElement('canvas');
function readBack(src: HTMLCanvasElement): CanvasImageSource {
  const w = src.width, h = src.height;
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const out = scratch.getContext('2d');
  if (!out) return src;
  const gl = (src.getContext('webgl2') ?? src.getContext('webgl')) as WebGLRenderingContext | null;
  if (gl) {
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const img = out.createImageData(w, h);
    // WebGL rows run bottom to top.
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    out.putImageData(img, 0, 0);
    return scratch;
  }
  const c2 = src.getContext('2d');
  if (c2) {
    out.putImageData(c2.getImageData(0, 0, w, h), 0, 0);
    return scratch;
  }
  return src;
}

function drawWatermark(out: CanvasRenderingContext2D, w: number, h: number): void {
  const fs = Math.max(11, Math.round(Math.min(w, h) * 0.026));
  out.save();
  out.globalAlpha = 1;
  out.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  out.textAlign = 'right';
  out.textBaseline = 'alphabetic';
  out.shadowColor = 'rgba(0, 0, 0, 0.85)';
  out.shadowBlur = fs * 0.5;
  out.fillStyle = 'rgba(255, 255, 255, 0.78)';
  out.fillText(WATERMARK, w - fs * 0.9, h - fs * 0.8);
  out.restore();
}

export interface PaintOptions {
  /** The page's boxes, from snapshotPage. */
  readonly overlay: readonly Snap[];
  readonly watermark: boolean;
  /** Leave out the views' moving names and dots (the cross-fade between looks: the live ones stay on top). */
  readonly noLabels?: boolean;
  /**
   * Make the views pop (videos and GIFs): a little brighter, more contrast and colour, the
   * names and boxes left as they are. 0 is the screen as it is; 1 the recording's look.
   */
  readonly pop?: number;
}

/** Is the page in a light look (Bright: ink on paper)? Then popping darkens the ink instead of brightening. */
const lightLook = (): boolean => document.documentElement.dataset.ui === 'light';

/** The canvas filter that makes a view pop, or 'none'. */
export function popFilter(pop: number, light = lightLook()): string {
  if (!(pop > 0)) return 'none';
  const k = Math.min(1.5, pop);
  return light
    ? `contrast(${(1 + 0.12 * k).toFixed(3)}) saturate(${(1 + 0.15 * k).toFixed(3)})`
    : `brightness(${(1 + 0.18 * k).toFixed(3)}) contrast(${(1 + 0.08 * k).toFixed(3)}) saturate(${(1 + 0.15 * k).toFixed(3)})`;
}

/** Paint the shot into `out`, w × h px: the views, their moving names, the page's HTML, the watermark. */
export function drawShot(shot: Shot, out: CanvasRenderingContext2D, w: number, h: number, o: PaintOptions): void {
  const R = shot.region;
  const sx = w / R.width, sy = h / R.height;
  out.save();
  out.globalAlpha = 1;
  out.fillStyle = (shot.page && getComputedStyle(shot.page).backgroundColor) || '#000';
  out.fillRect(0, 0, w, h);
  for (const st of shot.stages) {
    const r = st.canvas.getBoundingClientRect();
    out.save();
    if (st.clip) {
      out.beginPath();
      out.arc((st.clip.cx - R.left) * sx, (st.clip.cy - R.top) * sy, st.clip.r * sx, 0, Math.PI * 2);
      out.clip();
    }
    const src = drawsBlank(st.canvas) ? readBack(st.canvas) : st.canvas;
    out.globalAlpha = st.alpha ?? 1;
    const filter = popFilter(o.pop ?? 0);
    if (filter !== 'none') out.filter = filter;
    out.drawImage(src, (r.left - R.left) * sx, (r.top - R.top) * sy, r.width * sx, r.height * sy);
    out.filter = 'none';
    for (const host of o.noLabels ? [] : st.overlays) {
      if (!shown(getComputedStyle(host))) continue;
      const halo = getComputedStyle(host).getPropertyValue('--label-halo').trim() || 'rgba(0,0,0,0.85)';
      for (const el of Array.from(host.children) as HTMLElement[]) {
        // Hidden names (most of them, at any moment) are skipped without asking for their style.
        if (el.style.display === 'none') continue;
        const cs = getComputedStyle(el);
        if (!shown(cs)) continue;
        const b = el.getBoundingClientRect();
        if (b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom) continue;
        const x = (b.left - R.left) * sx, y = (b.top - R.top) * sy, bw = b.width * sx, bh = b.height * sy;
        out.globalAlpha = Number(cs.opacity) * (st.alpha ?? 1);
        // Dots: a body's marker, and a body's disc on the chart wheel.
        if (el.classList.contains('fly-marker') || el.dataset.kind === 'dot') {
          out.fillStyle = cs.backgroundColor;
          out.beginPath();
          out.arc(x + bw / 2, y + bh / 2, bw / 2, 0, Math.PI * 2);
          out.fill();
          continue;
        }
        // As shown: capitals where the style asks for them (constellation, house and angle
        // names), so a picture or a cross-fade never shows them in another case.
        const raw = el.textContent?.trim();
        if (!raw) continue;
        const text = cs.textTransform === 'uppercase' ? raw.toUpperCase() : cs.textTransform === 'lowercase' ? raw.toLowerCase() : cs.textTransform === 'capitalize' ? raw.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : raw;
        if (!transparent(cs.backgroundColor)) {
          out.fillStyle = cs.backgroundColor;
          out.beginPath();
          out.roundRect(x, y, bw, bh, (parseFloat(cs.borderTopLeftRadius) || 0) * sy);
          out.fill();
        }
        out.font = `${cs.fontStyle} ${cs.fontWeight} ${(parseFloat(cs.fontSize) || 11) * sy}px ${cs.fontFamily}`;
        const ls = parseFloat(cs.letterSpacing);
        (out as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = Number.isFinite(ls) && ls !== 0 ? `${ls * sy}px` : '0px';
        out.textBaseline = 'middle';
        out.textAlign = 'left';
        const tx = x + (parseFloat(cs.paddingLeft) || 0) * sx, ty = y + bh / 2;
        if (transparent(cs.backgroundColor)) {
          out.strokeStyle = halo;
          out.lineWidth = 3 * sy;
          out.lineJoin = 'round';
          out.strokeText(text, tx, ty);
        }
        out.fillStyle = cs.color;
        out.fillText(text, tx, ty);
      }
    }
    out.restore();
  }
  out.globalAlpha = 1;
  for (const b of o.overlay) out.drawImage(b.img, (b.left - R.left) * sx, (b.top - R.top) * sy, b.width * sx, b.height * sy);
  if (o.watermark) drawWatermark(out, w, h);
  out.restore();
}

/**
 * The page's HTML, kept fresh while recording: checked a few times a second, and only a
 * box whose contents changed (the clock ticks by the second) has its picture taken again,
 * with the light copy of its styles, so the recording never stalls on it.
 */
function liveOverlay(getShot: () => Shot | null, k: number): { current: () => readonly Snap[]; ready: Promise<void>; stop: () => void } {
  let img: readonly Snap[] = [];
  const cache = new Map<HTMLElement, { key: string; snap: Snap | null }>();
  let busy = false;
  let stopped = false;
  const take = async (): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    const s = getShot();
    if (s?.page) {
      const els = pageBoxes(s.page);
      const out: Snap[] = [];
      for (const el of els) {
        const key = boxKey(el);
        let entry = cache.get(el);
        if (!entry || entry.key !== key) {
          entry = { key, snap: await snapshotElement(el, k, true) };
          cache.set(el, entry);
        }
        if (entry.snap) out.push(entry.snap);
      }
      img = out;
    }
    busy = false;
  };
  const ready = take();
  const timer = window.setInterval(() => void take(), 250);
  return {
    current: () => img,
    ready,
    stop: () => {
      stopped = true;
      window.clearInterval(timer);
    },
  };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function download(blob: Blob, ext: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sp4cetime-${stamp()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What is on screen at full resolution, as a PNG. */
export async function screenshot(shot: Shot, o: { watermark: boolean; fit?: readonly [number, number] }): Promise<void> {
  // Small (for X): scaled to fit within `fit` pixels; large: the screen's full resolution.
  const k = o.fit ? Math.min(shotScale(shot), o.fit[0] / shot.region.width, o.fit[1] / shot.region.height) : shotScale(shot);
  const overlay = shot.page ? await snapshotPage(shot.page, k) : [];
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(shot.region.width * k));
  c.height = Math.max(1, Math.round(shot.region.height * k));
  const ctx = c.getContext('2d');
  if (!ctx) return;
  drawShot(shot, ctx, c.width, c.height, { overlay, watermark: o.watermark });
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (blob) download(blob, 'png');
}

/** A running capture; `stop` ends it (and downloads the file). */
export interface Recording {
  stop(): void;
  /** The video's current frame, as it is in the file (JPEG): the tour's PDF is made from the last one. */
  still?(): Promise<{ jpeg: Blob; width: number; height: number; dark: boolean } | null>;
}

/** A frame of the recording canvas as a JPEG, and whether its sides (where the PDF's text goes) are dark. */
function stillOf(c: HTMLCanvasElement): Promise<{ jpeg: Blob; width: number; height: number; dark: boolean } | null> {
  let dark = true;
  try {
    const ctx = c.getContext('2d');
    if (ctx) {
      const side = Math.max(1, Math.floor(c.width * 0.18));
      let sum = 0, n = 0;
      for (const x0 of [0, c.width - side]) {
        const d = ctx.getImageData(x0, 0, side, c.height).data;
        for (let i = 0; i < d.length; i += 4 * 97) {
          sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          n++;
        }
      }
      dark = n === 0 || sum / n < 128;
    }
  } catch {
    /* unreadable: take it as the night sky */
  }
  return new Promise((res) => c.toBlob((b) => res(b ? { jpeg: b, width: c.width, height: c.height, dark } : null), 'image/jpeg', 0.92));
}

/** Even, at least 2 (H.264 and X need even sizes). */
const even = (x: number): number => Math.max(2, Math.floor(x / 2) * 2);
const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

/**
 * Thin lines kept visible in a smaller picture: the views are thickened before they are
 * shrunk (every bright line and star grows by `r` px on each side; in the light look the
 * dark ink grows instead), so a 1-pixel constellation line or spiral survives being made
 * three or four times smaller instead of fading to nothing between frames.
 */
let thickScratch: HTMLCanvasElement | null = null;
export function thicken(src: CanvasImageSource & { width: number; height: number }, r: number, light: boolean): CanvasImageSource {
  if (r < 1) return src;
  const c = (thickScratch ??= document.createElement('canvas'));
  if (c.width !== src.width || c.height !== src.height) {
    c.width = src.width;
    c.height = src.height;
  }
  const x = c.getContext('2d');
  if (!x) return src;
  x.globalCompositeOperation = 'copy';
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = light ? 'darken' : 'lighten';
  // Separable: across, then down (each pass a few copies of the picture, shifted).
  for (let d = 1; d <= r; d++) {
    x.drawImage(c, d, 0);
    x.drawImage(c, -d, 0);
  }
  for (let d = 1; d <= r; d++) {
    x.drawImage(c, 0, d);
    x.drawImage(c, 0, -d);
  }
  x.globalCompositeOperation = 'source-over';
  return c;
}

const thickCopies = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** A shot with each view thickened by `r` px (in the view's own pixels) for a small recording. */
function thickShot(shot: Shot, r: number): Shot {
  if (r < 1) return shot;
  const light = lightLook();
  return {
    ...shot,
    stages: shot.stages.map((st) => {
      const src = drawsBlank(st.canvas) ? readBack(st.canvas) : st.canvas;
      const t = thicken(src as HTMLCanvasElement, r, light);
      // Copied out of the shared scratch (one copy kept per view), so the next view does not overwrite it.
      let own = thickCopies.get(st.canvas);
      if (!own) {
        own = document.createElement('canvas');
        thickCopies.set(st.canvas, own);
      }
      if (own.width !== st.canvas.width || own.height !== st.canvas.height) {
        own.width = st.canvas.width;
        own.height = st.canvas.height;
      }
      const ox = own.getContext('2d');
      if (ox) {
        ox.globalCompositeOperation = 'copy';
        ox.drawImage(t, 0, 0);
        ox.globalCompositeOperation = 'source-over';
      }
      // Drawn where the view's own canvas is on screen.
      const r0 = st.canvas.getBoundingClientRect();
      Object.defineProperty(own, 'getBoundingClientRect', { value: () => r0, configurable: true });
      return { ...st, canvas: own };
    }),
  };
}

/** The GIF encoder, in a worker where possible (so the view keeps moving smoothly while frames are compressed). */
interface GifSink {
  add(rgba: Uint8ClampedArray, delayCs: number): void;
  finish(): Promise<Blob | null>;
}
async function gifSink(w: number, h: number): Promise<GifSink> {
  try {
    const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
    let frames = 0;
    worker.postMessage({ type: 'init', w, h });
    return {
      add(rgba, delayCs) {
        const buf = rgba.slice().buffer;
        worker.postMessage({ type: 'frame', rgba: buf, delayCs }, [buf]);
        frames++;
      },
      finish: () =>
        new Promise((res) => {
          if (frames === 0) {
            worker.terminate();
            return res(null);
          }
          worker.onmessage = (e: MessageEvent<{ type: string; bytes?: ArrayBuffer }>) => {
            worker.terminate();
            res(e.data.bytes ? new Blob([e.data.bytes], { type: 'image/gif' }) : null);
          };
          worker.onerror = () => {
            worker.terminate();
            res(null);
          };
          worker.postMessage({ type: 'finish' });
        }),
    };
  } catch {
    const { GifEncoder } = await import('./gif');
    const enc = new GifEncoder(w, h, 5);
    return {
      add: (rgba, d) => enc.add(rgba, d),
      finish: async () => (enc.frames > 0 ? enc.finish() : null),
    };
  }
}

/**
 * An animated GIF, `seconds` long at `fps`, `width` px wide, looping. Each frame waits
 * as long as really passed before the next (so motion keeps its true speed even when the
 * screen stutters); the views are thickened and made to pop before they are shrunk, so
 * thin lines (constellations, spirals) stay visible. `onProgress` gets the fraction done.
 */
export async function recordGif(
  getShot: () => Shot | null,
  o: { seconds: number; fps: number; width: number; watermark: boolean },
  onProgress: (f: number) => void,
  onDone: () => void,
): Promise<Recording> {
  const first = getShot();
  const aspect = first ? first.region.height / Math.max(1, first.region.width) : 9 / 16;
  const w = Math.max(16, Math.round(o.width));
  const h = Math.max(16, Math.round(w * aspect));
  const page = liveOverlay(getShot, first ? w / first.region.width : 1);
  holdQuality(true);
  await page.ready;
  const sink = await gifSink(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (ctx) ctx.imageSmoothingQuality = 'high';
  const total = Math.max(1, Math.round(o.seconds * o.fps));
  const interval = 1000 / o.fps;
  // How much smaller than the views the GIF is: lines grow by a third of that on each side (thick enough to survive, thin enough that text stays text).
  const shrink = first ? shotScale(first) * (first.region.width / w) : 1;
  const r = Math.max(0, Math.min(3, Math.round(shrink / 3)));
  let last = -Infinity;
  let raf = 0;
  let done = false;
  let count = 0;
  let pending: { rgba: Uint8ClampedArray; t: number } | null = null;
  let shownCs = 0;
  let startT = 0;
  /** Send the frame before this one, now that we know how long it was on screen. */
  const flush = (until: number): void => {
    if (!pending) return;
    const endCs = Math.round((until - startT) / 10);
    const d = Math.max(2, endCs - shownCs);
    shownCs += d;
    sink.add(pending.rgba, d);
    pending = null;
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    page.stop();
    holdQuality(false);
    flush(pending ? pending.t + interval : 0);
    void sink
      .finish()
      .then((b) => b && download(b, 'gif'))
      .finally(onDone);
  };
  const tick = (t: number): void => {
    if (done) return;
    try {
      if (t - last >= interval - 2) {
        last = t;
        const s = getShot();
        if (s && ctx) {
          if (count === 0) startT = t;
          flush(t);
          drawShot(thickShot(s, r), ctx, w, h, { overlay: page.current(), watermark: o.watermark, pop: 1 });
          pending = { rgba: ctx.getImageData(0, 0, w, h).data, t };
          count++;
          onProgress(count / total);
        }
        if (count >= total) return finish();
      }
    } catch (e) {
      // A picture the browser will not let us read (or anything else): stop cleanly, keep what was recorded.
      console.warn('GIF recording stopped:', e);
      return finish();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop: finish };
}

/** The best video format MediaRecorder can make (the fallback where WebCodecs is missing): MP4 (H.264, AAC) where it can, else WebM. */
export function videoFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return typeof VideoEncoder !== 'undefined' ? { mime: 'video/mp4', ext: 'mp4' } : null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/**
 * Video size (owner, 3 Nov 2026), one choice for every recording (the Capture menu and
 * the ✶ Starsigns package), remembered in this browser:
 * - 'hires': for desktop screens, up to 4K, a high bit rate (up to 40 Mbit/s);
 * - 'small': for posting on X (0.4.2, ADR-0020): within 1920 × 1080, about 12 Mbit/s
 *   (about 90 MB a minute; X takes 512 MB and 25 Mbit/s), H.264 High, constant 30 frames a
 *   second, AAC sound, index first, so X accepts it as it is. (0.4.0 made it 720p at
 *   2 Mbit/s through MediaRecorder; X rejected that file.)
 */
export type VideoSize = 'hires' | 'small';
const VIDEO_SIZE_KEY = 'sp4ce-video-size';
export function getVideoSize(): VideoSize {
  try {
    return localStorage.getItem(VIDEO_SIZE_KEY) === 'small' ? 'small' : 'hires';
  } catch {
    return 'hires';
  }
}
export function setVideoSize(s: VideoSize): void {
  try {
    localStorage.setItem(VIDEO_SIZE_KEY, s);
  } catch {
    /* not remembered */
  }
}

/**
 * The video's size: the screen's shape, as large as fits 1920 × 1080 for X ('small') or
 * 3840 × 2160 ('hires'), upright too, even on both sides.
 */
export function videoDims(width: number, height: number, size: VideoSize): { w: number; h: number; k: number } {
  const long = size === 'small' ? 1920 : 3840, short = size === 'small' ? 1080 : 2160;
  const k = Math.min(long / Math.max(width, height, 1), short / Math.max(1, Math.min(width, height)));
  return { w: even(width * k), h: even(height * k), k };
}

/**
 * A video of what is on screen, until stopped. Made for X (ADR-0020) where the browser has
 * WebCodecs: H.264 High, a constant 30 frames a second, AAC sound always there (what is
 * heard, or silence), the index first; 'small' fits 1920 × 1080 (X's size), 'hires' up to 4K
 * for big screens. Otherwise MediaRecorder, with the sound as a track. While it records the
 * views are drawn at the video's own resolution (never the softer one a slow screen may
 * have dropped to) and made to pop a little.
 */
export async function recordVideo(
  getShot: () => Shot | null,
  o: { fps: number; watermark: boolean; size?: VideoSize; onBlob?: (video: Blob, ext: string) => void },
  onDone: () => void,
): Promise<Recording | null> {
  unlockSound();
  const first0 = getShot();
  if (!first0) return null;
  const size = o.size ?? getVideoSize();
  const dims = videoDims(first0.region.width, first0.region.height, size);
  // Views at least as sharp as the video (up to 3 device px per CSS px).
  holdQuality(true, Math.min(3, Math.max(shotScale(first0), dims.k)));
  // Let the views redraw at that resolution before the first frame.
  for (let i = 0; i < 3; i++) await nextFrame();
  const first = getShot() ?? first0;
  const c = document.createElement('canvas');
  c.width = dims.w;
  c.height = dims.h;
  const ctx = c.getContext('2d');
  if (!ctx) {
    holdQuality(false);
    return null;
  }
  ctx.imageSmoothingQuality = 'high';
  const page = liveOverlay(getShot, dims.k);
  await page.ready;
  const paint = (s: Shot): void => drawShot(s, ctx, c.width, c.height, { overlay: page.current(), watermark: o.watermark, pop: 1 });
  const deliver = (video: Blob, ext: string): void => {
    // Handed back (the Starsigns package zips it), or saved to Downloads.
    if (o.onBlob) o.onBlob(video, ext);
    else download(video, ext);
  };

  // Made for X: WebCodecs and our MP4 writer (loaded when first needed, outside the calendar's budget).
  const x = await import('./videoEncode').then((m) => m.startXVideo(c.width, c.height, o.fps)).catch(() => null);
  if (x) {
    const period = 1000 / o.fps;
    let t0 = -1;
    let nextSlot = 0;
    let raf = 0;
    let stopped = false;
    const tick = (ts: number): void => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (t0 < 0) t0 = ts;
      const slot = Math.floor((ts - t0) / period);
      if (slot < nextSlot) return;
      const s = getShot();
      if (!s) return;
      try {
        paint(s);
        // A slow screen frame fills the slots it missed with itself: time in the video stays true.
        x.frame(c, slot - nextSlot + 1);
      } catch (e) {
        console.warn('Video frame skipped:', e);
      }
      nextSlot = slot + 1;
    };
    raf = requestAnimationFrame(tick);
    return {
      still: () => stillOf(c),
      stop(): void {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        page.stop();
        void x
          .finish()
          .then((blob) => {
            if (blob) deliver(blob, 'mp4');
            else console.warn('The video could not be finished.');
          })
          .finally(() => {
            holdQuality(false);
            onDone();
          });
      },
    };
  }

  // Fallback: MediaRecorder (the sound as a track; the file may need re-encoding for X).
  const fmt = videoFormat();
  if (!fmt || typeof MediaRecorder === 'undefined') {
    page.stop();
    holdQuality(false);
    return null;
  }
  const startVideo = (): Recording => {
    paint(first);
    // Frames are handed to the encoder one by one, as they are drawn, at an even rate.
    const stream = c.captureStream(0);
    const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    const manual = typeof track?.requestFrame === 'function';
    const vid = manual ? stream : c.captureStream(o.fps);
    const sound = soundStream();
    const live = new MediaStream([...vid.getVideoTracks(), ...(sound ? sound.getAudioTracks() : [])]);
    const bps = size === 'small' ? Math.min(12e6, Math.max(4e6, c.width * c.height * o.fps * 0.13)) : Math.min(50e6, Math.max(8e6, c.width * c.height * o.fps * 0.12));
    const rec = new MediaRecorder(live, { mimeType: fmt.mime, videoBitsPerSecond: bps, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    let raf = 0;
    let stopped = false;
    rec.onstop = () => {
      holdQuality(false);
      vid.getTracks().forEach((t) => t.stop());
      stream.getTracks().forEach((t) => t.stop());
      if (chunks.length) deliver(new Blob(chunks, { type: fmt.mime.split(';')[0] ?? fmt.mime }), fmt.ext);
      onDone();
    };
    const period = 1000 / o.fps;
    let next = performance.now();
    const tick = (ts: number): void => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (ts + 2 < next) return;
      next = Math.max(next + period, ts - period);
      const s = getShot();
      if (s) {
        paint(s);
        if (manual) track?.requestFrame?.();
      }
    };
    rec.start(1000);
    raf = requestAnimationFrame(tick);
    return {
      still: () => stillOf(c),
      stop(): void {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        page.stop();
        if (rec.state !== 'inactive') rec.stop();
        else holdQuality(false);
      },
    };
  };
  try {
    return startVideo();
  } catch (e) {
    console.warn('Video recording could not start:', e);
    page.stop();
    holdQuality(false);
    return null;
  }
}
