/**
 * The animated screensaver (sp4cetime.store, ADR-0019): one self-contained HTML page that
 * draws the buyer's wall art full screen, the wheel turning once in ten minutes, the stars
 * twinkling. Works offline, in any browser; screensaver apps that show a web page (for
 * example WebViewScreenSaver on a Mac, Lively Wallpaper on Windows) can use it as it is.
 * Click or press F for full screen. Honours reduced motion (then it stays still).
 */

import { type ArtData, drawArt } from './wallArt';

const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function screensaverHtml(D: ArtData): string {
  // JSON inside a script: close no tags early.
  const data = JSON.stringify(D).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(D.title)} · sp4cetime screensaver</title>
<style>html,body{margin:0;height:100%;background:${D.night ? '#03040b' : '#ece4d4'};overflow:hidden;cursor:none}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c" aria-label="${escHtml(D.title)}: the sky at that moment, slowly turning"></canvas>
<script>
"use strict";
var D = ${data};
var drawArt = ${drawArt.toString()};
var c = document.getElementById("c"), ctx = c.getContext("2d");
var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var t0 = performance.now();
function frame(now) {
  var dpr = window.devicePixelRatio || 1, w = innerWidth, h = innerHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawArt(ctx, D, w, h, still ? 0 : (now - t0) / 1000 + 0.001);
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("resize", function () { if (still) requestAnimationFrame(frame); });
function full() { var e = document.documentElement; if (!document.fullscreenElement && e.requestFullscreen) e.requestFullscreen().catch(function () {}); }
addEventListener("click", full);
addEventListener("keydown", function (e) { if (e.key === "f" || e.key === "F") full(); });
</script></body></html>
`;
}
