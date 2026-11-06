import { useEffect } from 'react';
import { type Path, pathFileName } from '../core/path';
import { zipParts } from '../core/zip';
import { sp4ceText } from './pathStore';
import { ETSY_URL, SHOP_URL } from './shop';

/**
 * The Download package (owner, 4 Nov 2026): pops up when ▶ Go's tour ends. ⤓ Download (free)
 * saves one .zip: the MP4 made for X, the PDF of the video's last frame (with the signs and
 * houses for a Starsigns path) and the path token (.sp4ce.json). ✶ Customize and ☕ Buy me a
 * coffee go to the shop (sp4cetime.store), where the paid options and Stripe live; this site
 * shows no prices. Never in a capture.
 */
export function PackageDialog({
  path,
  video,
  pdf,
  ecard = null,
  onClose,
}: {
  path: Path;
  video: { readonly blob: Blob; readonly ext: string } | 'pending' | 'none';
  pdf: Uint8Array | 'pending' | null;
  /** The gift edition's e-card (one HTML file), in place of the PDF (6 Nov 2026). */
  ecard?: string | 'pending' | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);

  const base = pathFileName(path.name).replace(/\.sp4ce\.json$/, '') || 'sp4cetime';
  const ready = video !== 'pending' && pdf !== 'pending' && ecard !== 'pending';
  const isGift = ecard !== null;
  const openCard = (): void => {
    if (typeof ecard !== 'string') return;
    const url = URL.createObjectURL(new Blob([ecard], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };
  const download = async (): Promise<void> => {
    const c = new Date();
    const files: Array<{ name: string; data: Uint8Array }> = [];
    if (typeof video === 'object') files.push({ name: `${base}.${video.ext}`, data: new Uint8Array(await video.blob.arrayBuffer()) });
    if (pdf instanceof Uint8Array) files.push({ name: `${base}.pdf`, data: pdf });
    if (typeof ecard === 'string') files.push({ name: `${base}-ecard.html`, data: new TextEncoder().encode(ecard) });
    files.push({ name: pathFileName(path.name), data: new TextEncoder().encode(sp4ceText(path)) });
    const parts = zipParts(files, { year: c.getFullYear(), month: c.getMonth() + 1, day: c.getDate(), hour: c.getHours(), minute: c.getMinutes() });
    const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}-package.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="path-dialog-backdrop" data-no-capture onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="path-dialog package-dialog" role="dialog" aria-modal="true" aria-labelledby="package-title">
        <button type="button" className="astro-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
          ×
        </button>
        <h2 id="package-title">Download package</h2>
        <ul className="package-list">
          <li>
            <strong>Video</strong> (.mp4, made for X){' '}
            {video === 'pending' ? <span className="hint">finishing…</span> : video === 'none' ? <span className="hint">this browser could not record it</span> : null}
          </li>
          {isGift ? (
            <li>
              <strong>E-card</strong> (.html, opens in any browser): your message on the front, your sky and star map inside, a QR code to fly it on the back; prints as a folded card{' '}
              {ecard === 'pending' ? <span className="hint">making…</span> : typeof ecard === 'string' ? <button type="button" className="link-button" onClick={openCard}>✉ Open it</button> : null}
            </li>
          ) : (
            <li>
              <strong>PDF</strong>: the final view{path.points[path.points.length - 1]?.look.chart ? ', with your signs and houses' : ''}{' '}
              {pdf === 'pending' ? <span className="hint">making…</span> : pdf === null ? <span className="hint">not available</span> : null}
            </li>
          )}
          <li>
            <strong>Path token</strong> (.sp4ce.json): drop it on ▷ Paths to fly it again
          </li>
        </ul>
        <div className="row package-buttons">
          <button type="button" className="go-big" disabled={!ready} onClick={() => void download()} title="One .zip with the video, the PDF and the path token: free">
            <span aria-hidden="true">⤓</span> {ready ? 'Download (free)' : 'Getting it ready…'}
          </button>
          {!isGift && (
            <a className="button" href={ETSY_URL} target="_blank" rel="noopener" title="Make it a gift: your heading, message and music on the video, and a greeting e-card, made for you (AstrologyTours on Etsy)">
              ✶ Customize on Etsy
            </a>
          )}
          <a className="button coffee" href={`${SHOP_URL}coffee`} target="_blank" rel="noopener" title="Pay what you like, through Stripe at sp4cetime.store: it keeps sp4cetime going">
            ☕ Buy me a coffee
          </a>
        </div>
      </div>
    </div>
  );
}
