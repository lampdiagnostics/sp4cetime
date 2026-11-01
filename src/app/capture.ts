/**
 * Capturing what is on screen: a still (PNG), an animated GIF, or a video. A capture is
 * the views (their canvases) with everything HTML that is showing over them: the names,
 * the boxes (when they are showing), the windows' tabs. The capture controls themselves
 * (anything marked data-no-capture) are never in it. A watermark is added by default.
 */
import { GifEncoder } from './gif';
import { holdQuality } from '../core/quality';

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
  return Array.from(page.querySelectorAll<HTMLElement>('.corner, .pointbox')).filter((el) => {
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
    out.drawImage(src, (r.left - R.left) * sx, (r.top - R.top) * sy, r.width * sx, r.height * sy);
    for (const host of st.overlays) {
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
        if (el.classList.contains('fly-marker')) {
          out.fillStyle = cs.backgroundColor;
          out.beginPath();
          out.arc(x + bw / 2, y + bh / 2, bw / 2, 0, Math.PI * 2);
          out.fill();
          continue;
        }
        const text = el.textContent?.trim();
        if (!text) continue;
        if (!transparent(cs.backgroundColor)) {
          out.fillStyle = cs.backgroundColor;
          out.beginPath();
          out.roundRect(x, y, bw, bh, (parseFloat(cs.borderTopLeftRadius) || 0) * sy);
          out.fill();
        }
        out.font = `${cs.fontStyle} ${cs.fontWeight} ${(parseFloat(cs.fontSize) || 11) * sy}px ${cs.fontFamily}`;
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
export async function screenshot(shot: Shot, o: { watermark: boolean }): Promise<void> {
  const k = shotScale(shot);
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
}

/**
 * An animated GIF, `seconds` long at `fps`, `width` px wide, looping. `onProgress` gets
 * the fraction done.
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
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const delay = Math.max(2, Math.round(100 / o.fps));
  const enc = new GifEncoder(w, h, delay);
  const total = Math.max(1, Math.round(o.seconds * o.fps));
  const interval = 1000 / o.fps;
  let last = -Infinity;
  let raf = 0;
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    page.stop();
    holdQuality(false);
    try {
      if (enc.frames > 0) download(enc.finish(), 'gif');
    } finally {
      onDone();
    }
  };
  const tick = (t: number): void => {
    if (done) return;
    try {
      if (t - last >= interval - 2) {
        last = t;
        const s = getShot();
        if (s && ctx) {
          drawShot(s, ctx, w, h, { overlay: page.current(), watermark: o.watermark });
          enc.add(ctx.getImageData(0, 0, w, h).data);
          onProgress(enc.frames / total);
        }
        if (enc.frames >= total) return finish();
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

/** The best video format this browser can record: MP4 (H.264) where it can, else WebM. */
export function videoFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/** A video of what is on screen at full resolution (up to 4K wide), until stopped. */
export async function recordVideo(
  getShot: () => Shot | null,
  /** `sharp`: up to 4K wide (heavier); otherwise up to 1920 px wide (1080p), smooth on most computers. */
  o: { fps: number; watermark: boolean; sharp?: boolean },
  onDone: () => void,
): Promise<Recording | null> {
  const fmt = videoFormat();
  const first = getShot();
  if (!fmt || !first) return null;
  const px = shotScale(first);
  const k = Math.min(px, (o.sharp ? 3840 : 1920) / Math.max(1, first.region.width));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.floor((first.region.width * k) / 2) * 2);
  c.height = Math.max(2, Math.floor((first.region.height * k) / 2) * 2);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const page = liveOverlay(getShot, k);
  holdQuality(true);
  await page.ready;
  const startVideo = (): Recording => {
  drawShot(first, ctx, c.width, c.height, { overlay: page.current(), watermark: o.watermark });
  // Frames are handed to the encoder one by one, as they are drawn, at an even rate: no
  // frame is sampled twice or skipped, so motion stays smooth.
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
  const manual = typeof track?.requestFrame === 'function';
  const live = manual ? stream : c.captureStream(o.fps);
  // About 0.1 bits per pixel per frame, 6 to 40 Mbit/s.
  const bps = Math.min(40e6, Math.max(6e6, c.width * c.height * o.fps * 0.1));
  const rec = new MediaRecorder(live, { mimeType: fmt.mime, videoBitsPerSecond: bps });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  let raf = 0;
  let stopped = false;
  rec.onstop = () => {
    holdQuality(false);
    live.getTracks().forEach((t) => t.stop());
    stream.getTracks().forEach((t) => t.stop());
    if (chunks.length) download(new Blob(chunks, { type: fmt.mime.split(';')[0] ?? fmt.mime }), fmt.ext);
    onDone();
  };
  // Draw at the video's frame rate (not every screen frame), on the screen's own frames.
  const period = 1000 / o.fps;
  let next = performance.now();
  const tick = (ts: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (ts + 2 < next) return;
    next = Math.max(next + period, ts - period);
    const s = getShot();
    if (s) {
      drawShot(s, ctx, c.width, c.height, { overlay: page.current(), watermark: o.watermark });
      if (manual) track?.requestFrame?.();
    }
  };
  rec.start(1000);
  raf = requestAnimationFrame(tick);
  return {
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
    // This browser would not record (a format or stream it refuses): say so and leave nothing running.
    console.warn('Video recording could not start:', e);
    page.stop();
    holdQuality(false);
    return null;
  }
}
