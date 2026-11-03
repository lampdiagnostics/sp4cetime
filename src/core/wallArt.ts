/**
 * Wall art from a reading (sp4cetime.store, ADR-0019): the chart wheel on a starry ground
 * with the occasion, the names, the moment and the place. One drawing for the desktop
 * pictures, the phone backgrounds and the animated screensaver.
 *
 * `drawArt` is written to stand alone (no imports, nothing from outside its own body) so the
 * screensaver can carry its source text into a page that works offline. Keep it that way:
 * plain loops, no spreads, no helpers from elsewhere. Canvas 2D only (CLAUDE.md rule 1: the
 * context is passed in).
 */

import type { Reading } from './reading';

export interface ArtData {
  readonly title: string;
  readonly names: string;
  readonly when: string;
  readonly place: string;
  readonly asc: number;
  /** House cusps, or null when the time is not known. */
  readonly cusps: readonly number[] | null;
  readonly bodies: ReadonlyArray<{ readonly n: string; readonly lon: number }>;
  readonly seed: number;
  readonly night: boolean;
  readonly mark: string;
}

export function artData(r: Reading, o: { title: string; names: string; when: string; place: string; noTime: boolean; night: boolean }): ArtData {
  return {
    title: o.title,
    names: o.names,
    when: o.when,
    place: o.place,
    asc: r.chart.asc,
    cusps: o.noTime ? null : r.chart.cusps.slice(),
    bodies: r.bodies.map((b) => ({ n: b.name, lon: Math.round(b.lon * 100) / 100 })),
    seed: (Math.abs(r.time.day * 86_400 + r.time.sec) % 2_147_483_647) + 1,
    night: o.night,
    mark: 'sp4cetime.store',
  };
}

/** The canvas calls drawArt makes (a CanvasRenderingContext2D has them all). */
export interface ArtContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(s: string, x: number, y: number): void;
  setLineDash(d: number[]): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
}

/**
 * Draw the art on a W × H canvas. `t`: seconds, for the screensaver (the wheel turns once in
 * ten minutes, the stars twinkle); 0 for a still picture. Portrait canvases keep the top
 * clear for a phone's clock.
 */
export function drawArt(ctx: ArtContext, D: ArtData, W: number, H: number, t: number): void {
  const portrait = H > W * 1.2;
  const night = D.night;
  const ink = night ? '#e8ebf6' : '#1b1d24';
  const dim = night ? 'rgba(200,206,230,0.62)' : 'rgba(40,44,56,0.58)';
  const faint = night ? 'rgba(200,206,230,0.22)' : 'rgba(40,44,56,0.2)';
  const accent = night ? '#f0b35a' : '#b06a0c';
  const serif = 'Georgia, "Times New Roman", serif';
  const sans = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  const S = Math.min(W, H);

  // Ground.
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  g.addColorStop(0, night ? '#141a38' : '#fbf8f1');
  g.addColorStop(1, night ? '#03040b' : '#ece4d4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Stars (the same every time for this moment: a seeded generator).
  let s = D.seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const nStars = Math.round((W * H) / (night ? 2600 : 5200));
  for (let i = 0; i < nStars; i++) {
    const x = rnd() * W, y = rnd() * H, m = rnd();
    const tw = t ? 0.65 + 0.35 * Math.sin(t * (0.6 + m * 1.7) + i) : 1;
    ctx.globalAlpha = (night ? 0.25 + 0.75 * m * m : 0.12 + 0.3 * m) * tw;
    ctx.fillStyle = night ? '#ffffff' : '#3a3f4e';
    ctx.beginPath();
    ctx.arc(x, y, (0.35 + m * m * 1.4) * (S / 1100), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The wheel.
  const cx = W / 2;
  const cy = portrait ? H * 0.58 : H * 0.52;
  const R = portrait ? W * 0.42 : H * 0.34;
  const rot = t ? (t / 600) * Math.PI * 2 : 0;
  const ang = (lon: number): number => Math.PI + ((lon - D.asc) * Math.PI) / 180 + rot;
  const px = (lon: number, r: number): number => cx + r * Math.cos(ang(lon));
  const py = (lon: number, r: number): number => cy - r * Math.sin(ang(lon));
  const circle = (r: number, colour: string, w: number): void => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const ray = (lon: number, r0: number, r1: number, colour: string, w: number): void => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(px(lon, r0), py(lon, r0));
    ctx.lineTo(px(lon, r1), py(lon, r1));
    ctx.stroke();
  };
  const lw = R / 260;
  circle(R, ink, lw * 1.6);
  circle(R * 0.84, dim, lw);
  circle(R * 0.42, faint, lw);
  const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(R * 0.052)}px ${sans}`;
  for (let k = 0; k < 12; k++) {
    ray(k * 30, R * 0.84, R, dim, lw);
    ctx.fillStyle = dim;
    ctx.fillText(SIGNS[k]!.toUpperCase(), px(k * 30 + 15, R * 0.92), py(k * 30 + 15, R * 0.92));
  }
  if (D.cusps) {
    for (let i = 0; i < D.cusps.length; i++) {
      const c = D.cusps[i]!;
      ray(c, R * 0.42, R * 0.84, i % 3 === 0 ? accent : faint, i % 3 === 0 ? lw * 1.6 : lw);
      ctx.fillStyle = dim;
      ctx.font = `${Math.round(R * 0.042)}px ${sans}`;
      ctx.fillText(String(i + 1), px(c + 15, R * 0.36), py(c + 15, R * 0.36));
    }
    ctx.setLineDash([R * 0.02, R * 0.014]);
    ray(D.asc, -R * 1.04, R * 1.04, accent, lw);
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.font = `bold ${Math.round(R * 0.045)}px ${sans}`;
    ctx.fillText('ASC', px(D.asc, R * 1.1), py(D.asc, R * 1.1));
  }
  // Bodies: a tick and a dot at the true place, the name nudged apart where they crowd.
  const sorted = D.bodies.slice().sort((a, b) => a.lon - b.lon);
  // Names go on an outer ring; one too close to the last on that ring drops to an inner ring,
  // and only if both are taken does it slide along.
  const rings = [R * 0.64, R * 0.53];
  const last = [-1e9, -1e9];
  const near = (a: number, b: number): boolean => Math.abs(((a - b + 540) % 360) - 180) < 12;
  ctx.font = `${Math.round(R * 0.048)}px ${sans}`;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i]!;
    let l = b.lon;
    let ring = 0;
    if (near(l, last[0]!)) {
      if (!near(l, last[1]!)) ring = 1;
      else l = last[0]! + 12;
    }
    last[ring] = l;
    ray(b.lon, R * 0.84, R * 0.78, ink, lw * 1.4);
    const sunMoon = b.n === 'Sun' || b.n === 'Moon';
    ctx.fillStyle = sunMoon ? accent : ink;
    ctx.beginPath();
    ctx.arc(px(b.lon, R * 0.73), py(b.lon, R * 0.73), R * (sunMoon ? 0.016 : 0.011), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(b.n, px(l, rings[ring]!), py(l, rings[ring]!));
  }

  // Words.
  const fit = (text: string, size: number, maxW: number, family: string, bold: boolean): void => {
    let z = size;
    ctx.font = `${bold ? 'bold ' : ''}${Math.round(z)}px ${family}`;
    // Shrink to fit (measureText is not in every context; estimate 0.55 em a character).
    while (z > size * 0.4 && text.length * z * 0.55 > maxW) {
      z *= 0.92;
      ctx.font = `${bold ? 'bold ' : ''}${Math.round(z)}px ${family}`;
    }
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (portrait) {
    ctx.fillStyle = ink;
    fit(D.title, W * 0.075, W * 0.9, serif, true);
    ctx.fillText(D.title, cx, H * 0.845);
    if (D.names) {
      ctx.fillStyle = accent;
      fit(D.names, W * 0.05, W * 0.9, serif, false);
      ctx.fillText(D.names, cx, H * 0.88);
    }
    ctx.fillStyle = dim;
    fit(D.when, W * 0.032, W * 0.9, sans, false);
    ctx.fillText(D.when, cx, H * 0.915);
    fit(D.place, W * 0.03, W * 0.9, sans, false);
    ctx.fillText(D.place, cx, H * 0.94);
  } else {
    ctx.fillStyle = ink;
    fit(D.title, H * 0.06, W * 0.8, serif, true);
    ctx.fillText(D.title, cx, H * 0.1);
    if (D.names) {
      ctx.fillStyle = accent;
      fit(D.names, H * 0.036, W * 0.8, serif, false);
      ctx.fillText(D.names, cx, H * 0.145);
    }
    ctx.fillStyle = dim;
    fit(`${D.when} · ${D.place}`, H * 0.022, W * 0.8, sans, false);
    ctx.fillText(`${D.when} · ${D.place}`, cx, H * 0.95);
  }
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = dim;
  ctx.font = `${Math.round(S * 0.014)}px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText(D.mark, W - S * 0.02, H - S * 0.02);
  ctx.globalAlpha = 1;
}
