/**
 * The Starsigns e-card (owner, 6 Nov 2026): the gift edition's card, in place of the PDF. One
 * self-contained HTML file (pictures, logo and QR code inside it) that looks and opens like a
 * greeting card folded in half from 8.5 × 11 in landscape (5.5 × 8.5 in closed):
 *
 *   FRONT   a picture from the person's own tour, the heading and the message;
 *   inside  a click opens it: the left page lists their sky (every body's sign, degree and house,
 *           the Ascendant and Midheaven), the right page is the final star map, personalised;
 *   BACK    another click closes it, turned over: the sp4cetime spiral and a QR code that opens
 *           their own tour on sp4cetime.org, to fly, stop and look around.
 *
 * Print (the button, or the browser's print) gives the real card: two landscape Letter pages,
 * outside (back | front) and inside (left | right), to print double-sided and fold.
 * Pure: everything comes in as text (data: URLs for the pictures).
 */
import { formatSignDeg, signOf } from './houses';
import type { Reading } from './reading';
import { ORDER } from './reading';
import { qrEncode, qrSvg } from './qr';

export interface EcardInput {
  readonly heading: string;
  readonly message: string;
  /** "21 June 1990, 2:30 pm". */
  readonly whenText: string;
  /** "Winnipeg". */
  readonly placeText: string;
  /** The front picture: a frame from the tour (data: URL, JPEG). */
  readonly front: string | null;
  /** The final star map (data: URL, JPEG). */
  readonly starMap: string;
  /** The sky link the QR code opens. */
  readonly link: string;
  readonly reading: Reading | null;
  /** "Whole Sign". */
  readonly systemName: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The sp4cetime spiral (Earth's path coiling round the Sun's line), as on the shop and Stripe. */
export function spiralLogoSvg(size = 512): string {
  const c = size / 2, r = size * 0.19, x0 = -size * 0.33, x1 = size * 0.33, turns = 3, steps = 600, sw = size * 0.034;
  const front: string[] = [], back: string[] = [];
  let run: string[] = [], side: boolean | null = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, a = -Math.PI / 2 + u * turns * 2 * Math.PI;
    const x = c + x0 + (x1 - x0) * u + r * 0.55 * Math.sin(a), y = c + r * Math.cos(a), s = Math.sin(a) >= 0;
    const pt = `${x.toFixed(1)},${y.toFixed(1)}`;
    if (side !== null && s !== side) {
      run.push(pt);
      (side ? front : back).push('M' + run.join(' L'));
      run = [];
    }
    run.push(pt);
    side = s;
  }
  (side ? front : back).push('M' + run.join(' L'));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="sp4cetime">` +
    `<defs><radialGradient id="sg"><stop offset="0" stop-color="#ffe9b0"/><stop offset=".55" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffb347"/></radialGradient>` +
    `<radialGradient id="sh"><stop offset="0" stop-color="#ffd27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#05070f"/>` +
    back.map((d) => `<path d="${d}" fill="none" stroke="#5fb3ff" stroke-opacity=".38" stroke-width="${(sw * 0.8).toFixed(1)}" stroke-linecap="round"/>`).join('') +
    `<line x1="${size * 0.06}" y1="${c}" x2="${size * 0.94}" y2="${c}" stroke="#ffb347" stroke-width="${(sw * 1.1).toFixed(1)}" stroke-linecap="round"/>` +
    `<circle cx="${c}" cy="${c}" r="${size * 0.17}" fill="url(#sh)"/><circle cx="${c}" cy="${c}" r="${size * 0.085}" fill="url(#sg)"/>` +
    front.map((d) => `<path d="${d}" fill="none" stroke="#5fb3ff" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/>`).join('') +
    `</svg>`
  );
}

const GLYPH: Record<string, string> = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇' };

/** The left inside page's list: each body's sign, degree and house; then the Ascendant and Midheaven. */
export function skyRows(r: Reading): { glyph: string; name: string; where: string; house: string }[] {
  const rows = ORDER.map((id) => r.bodies.find((b) => b.id === id))
    .filter((b) => b !== undefined)
    .map((b) => ({ glyph: GLYPH[b.id] ?? '•', name: b.name, where: `${formatSignDeg(b.lon)}${b.retrograde ? ' ℞' : ''}`, house: `house ${b.house}` }));
  rows.push({ glyph: 'AC', name: 'Ascendant', where: formatSignDeg(r.chart.asc), house: '' });
  rows.push({ glyph: 'MC', name: 'Midheaven', where: formatSignDeg(r.chart.mc), house: '' });
  return rows;
}

/** The whole e-card, as one HTML document. */
export function ecardHtml(o: EcardInput): string {
  const heading = esc(o.heading || 'Your sky');
  const message = esc(o.message);
  const when = esc(o.whenText), place = esc(o.placeText);
  const sun = o.reading?.bodies.find((b) => b.id === 'sun');
  const rising = o.reading ? signOf(o.reading.chart.asc).name : '';
  const logo = spiralLogoSvg();
  const qr = qrSvg(qrEncode(o.link), { dark: '#05070f', light: '#ffffff', quiet: 3 });
  const rows = o.reading ? skyRows(o.reading) : [];

  const front = `
    <div class="face front">
      ${o.front ? `<img class="photo" src="${o.front}" alt="">` : `<div class="photo none"></div>`}
      <div class="shade"></div>
      <div class="front-text">
        <p class="kicker">✶ the sky of your moment</p>
        <h1>${heading}</h1>
        ${message ? `<p class="message">${message}</p>` : ''}
        <p class="when">${when}${place ? ` · ${place}` : ''}</p>
      </div>
    </div>`;
  const insideLeft = `
    <div class="face inside-left paper">
      <p class="kicker">Your sky</p>
      <h2>${heading}</h2>
      ${message ? `<p class="message">${message}</p>` : ''}
      <p class="when">${when}${place ? ` · ${place}` : ''}</p>
      ${sun ? `<p class="lede">The Sun in ${esc(sun.sign.name)}${rising ? `, ${esc(rising)} rising` : ''}.</p>` : ''}
      <table class="sky">${rows.map((r) => `<tr><td class="g">${r.glyph}</td><td>${esc(r.name)}</td><td>${esc(r.where)}</td><td class="h">${r.house}</td></tr>`).join('')}</table>
      <p class="fine">Positions: astronomy, for that minute and place. Signs (tropical) and ${esc(o.systemName || 'houses')} houses: astrology. A picture of your sky, not a prediction.</p>
    </div>`;
  const insideRight = `
    <div class="face inside-right paper dark">
      <img class="map" src="${o.starMap}" alt="The star map: the zodiac wheel with every planet in its sign and house">
      <p class="caption">The sky over ${place || 'you'}<br>${when}</p>
    </div>`;
  const back = `
    <div class="face back paper dark">
      <div class="logo">${logo}</div>
      <p class="brand">sp4cetime</p>
      <div class="qr">${qr}</div>
      <p class="scan">Scan to fly your sky yourself:<br>stop anywhere, look around.</p>
      <p class="site">sp4cetime.org</p>
    </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} · a sky card</title>
<style>
:root{--w:min(42vw,calc(80vh*0.647),400px);--h:calc(var(--w)/0.647);--ink:#f2efe6;--gold:#ffd27a;--sun:#ffb347;--dim:#9fb0d8;--paper:#0b1020}
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{background:radial-gradient(ellipse at 50% 30%,#1a2140 0,#05070f 70%);color:var(--ink);font-family:Georgia,'Times New Roman',serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;overflow:hidden;user-select:none}
.scene{perspective:2200px;cursor:pointer;outline:none}
.card{position:relative;width:var(--w);height:var(--h);transform-style:preserve-3d;transition:transform 1.1s cubic-bezier(.3,.1,.2,1)}
.leaf{position:absolute;inset:0;transform-style:preserve-3d;transition:transform 1.1s cubic-bezier(.3,.1,.2,1)}
.cover{transform-origin:left center;transform:translateZ(1px)}
.face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:6px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.cover .inside-left,.base .back{transform:rotateY(180deg)}
.s1 .card{transform:translateX(50%)}
.s1 .cover{transform:translateZ(1px) rotateY(-180deg)}
.s2 .card{transform:rotateY(180deg)}
.front .photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.32);transform-origin:50% 45%}
.front .photo.none{background:radial-gradient(circle at 50% 35%,#24305a,#05070f)}
.front .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,15,.15) 0,rgba(5,7,15,0) 35%,rgba(5,7,15,.82) 72%,rgba(5,7,15,.95) 100%)}
.front-text{position:absolute;left:0;right:0;bottom:0;padding:8% 9% 10%;text-align:center}
.kicker{font:600 calc(var(--w)*.03)/1.2 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--sun)}
h1{font-size:calc(var(--w)*.105);line-height:1.08;color:var(--gold);margin:.35em 0 .3em;font-weight:700}
h2{font-size:calc(var(--w)*.075);line-height:1.1;color:var(--gold);margin:.3em 0 .25em}
.message{font-size:calc(var(--w)*.047);line-height:1.4;font-style:italic;white-space:pre-wrap}
.when{margin-top:.8em;font:calc(var(--w)*.03)/1.3 system-ui,sans-serif;color:var(--dim);letter-spacing:.03em}
.paper{background:linear-gradient(160deg,#121935,#0b1020 60%,#080c19);padding:9% 9%}
.inside-left .lede{margin:1em 0 .5em;font-size:calc(var(--w)*.042)}
table.sky{width:100%;border-collapse:collapse;font:calc(var(--w)*.032)/1.5 system-ui,sans-serif}
table.sky td{padding:.12em .3em;border-bottom:1px solid rgba(160,176,216,.14)}
table.sky td.g{color:var(--sun);width:2.2em;text-align:center;font-weight:600}
table.sky td.h{color:var(--dim);text-align:right;white-space:nowrap}
.fine{margin-top:1em;font:calc(var(--w)*.024)/1.4 system-ui,sans-serif;color:#7f8aa6}
.inside-right{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5%;padding:6%}
.inside-right .map{width:100%;aspect-ratio:1;object-fit:cover;border-radius:50%;box-shadow:0 0 0 1px rgba(255,179,71,.4),0 0 40px rgba(255,179,71,.18)}
.caption{text-align:center;font-size:calc(var(--w)*.045);line-height:1.35;color:var(--gold)}
.back{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:3%}
.back .logo{width:30%}.back .logo svg{width:100%;display:block}
.brand{font:700 calc(var(--w)*.07) system-ui,sans-serif;color:var(--sun);letter-spacing:.02em}
.back .qr{width:44%;margin-top:4%;background:#fff;border-radius:6%;padding:2.5%}.back .qr svg{width:100%;display:block}
.scan{font:calc(var(--w)*.036)/1.4 system-ui,sans-serif;color:var(--ink)}
.site{font:600 calc(var(--w)*.032) system-ui,sans-serif;color:var(--dim);letter-spacing:.06em}
.bar{display:flex;gap:14px;align-items:center;font:15px system-ui,sans-serif;color:var(--dim)}
.bar button{font:inherit;color:var(--ink);background:rgba(255,255,255,.08);border:1px solid rgba(160,176,216,.35);border-radius:999px;padding:7px 16px;cursor:pointer}
.print{display:none}
@media (max-width:700px){:root{--w:min(78vw,calc(70vh*0.647))}.s1 .card{transform:translateX(50%) scale(.55)}}
@media (prefers-reduced-motion:reduce){.card,.leaf{transition-duration:.01s}}
@page{size:11in 8.5in;margin:0}
@media print{
  body{background:#fff;display:block;overflow:visible}
  .scene,.bar{display:none}
  .print{display:block}
  .sheet{width:11in;height:8.5in;display:flex;page-break-after:always;break-after:page}
  .half{position:relative;width:5.5in;height:8.5in;--w:5.5in}
  .half .face{position:absolute;inset:0;transform:none!important;border-radius:0;box-shadow:none;backface-visibility:visible}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head>
<body>
<div class="scene s0" role="button" tabindex="0" aria-label="A greeting card: click to open, again to close and turn over">
  <div class="card">
    <div class="leaf cover">${front}${insideLeft}</div>
    <div class="leaf base">${insideRight}${back}</div>
  </div>
</div>
<div class="bar"><span id="hint">Click the card to open it</span><button type="button" id="print">Print the card</button></div>
<div class="print" aria-hidden="true">
  <div class="sheet"><div class="half">${back}</div><div class="half">${front}</div></div>
  <div class="sheet"><div class="half">${insideLeft}</div><div class="half">${insideRight}</div></div>
</div>
<script>
(function(){
  var scene=document.querySelector('.scene'), hint=document.getElementById('hint'), s=0;
  var words=['Click the card to open it','Click to close it and turn it over','Click to turn it back to the front'];
  function go(){ s=(s+1)%3; scene.className='scene s'+s; hint.textContent=words[s]; }
  scene.addEventListener('click',go);
  scene.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); go(); } });
  document.getElementById('print').addEventListener('click',function(e){ e.stopPropagation(); window.print(); });
})();
</script>
</body></html>`;
}
