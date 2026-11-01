import { useEffect, useId, useRef, useState } from 'react';
import { type Recording, recordGif, recordVideo, screenshot, type Shot, videoFormat } from './capture';

const GIF_SECONDS = 5;
const GIF_WIDTH = 640;
const GIF_FPS = 15;
const VIDEO_FPS = 30;

/**
 * Capture what is on screen (the view, its names, and the boxes if they are showing),
 * straight to Downloads:
 * - P a screenshot (in every view);
 * - G a GIF: time plays for 5 seconds while it records, then pauses;
 * - V a video: from V until V again, or a click on the running time.
 * This button stays on screen, even with all text hidden, and is never in the picture.
 */
export function CaptureMenu({ getShot, onPlay, in3D }: {
  getShot: () => Shot | null;
  onPlay: (on: boolean) => void;
  in3D: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState<null | { kind: 'gif'; progress: number } | { kind: 'video'; since: number }>(null);
  const [, tickClock] = useState(0);
  const rec = useRef<Recording | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const live = useRef(getShot);
  live.current = getShot;
  const stage = (): Shot | null => live.current();
  const format = videoFormat();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  // The video's running time.
  useEffect(() => {
    if (busy?.kind !== 'video') return;
    const t = setInterval(() => tickClock((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [busy]);

  const shoot = (): void => {
    setOpen(false);
    const s = stage();
    if (s) void screenshot(s, { watermark });
  };
  const gif = (): void => {
    if (busy) return;
    setOpen(false);
    onPlay(true);
    setBusy({ kind: 'gif', progress: 0 });
    // Start once the boxes show time running (their first picture is taken at the start).
    window.setTimeout(
      () =>
        void recordGif(
          stage,
          { seconds: GIF_SECONDS, fps: GIF_FPS, width: GIF_WIDTH, watermark },
          (p) => setBusy({ kind: 'gif', progress: p }),
          () => {
            rec.current = null;
            setBusy(null);
            onPlay(false);
          },
        ).then((r) => {
          rec.current = r;
        }),
      80,
    );
  };
  const video = (): void => {
    if (busy?.kind === 'video') {
      rec.current?.stop();
      return;
    }
    if (busy || !format) return;
    setOpen(false);
    setBusy({ kind: 'video', since: Date.now() });
    void recordVideo(stage, { fps: VIDEO_FPS, watermark }, () => {
      rec.current = null;
      setBusy(null);
    }).then((r) => {
      if (!r) setBusy(null);
      rec.current = r;
    });
  };

  // Keys (not while typing in a field): P, G, V.
  const keyRef = useRef({ shoot, gif, video, in3D });
  keyRef.current = { shoot, gif, video, in3D };
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'p') keyRef.current.shoot();
      else if (k === 'g') keyRef.current.gif();
      else if (k === 'v') keyRef.current.video();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => () => rec.current?.stop(), []);

  const elapsed = busy?.kind === 'video' ? Math.floor((Date.now() - busy.since) / 1000) : 0;
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="picker capture" ref={root} data-no-capture>
      {busy?.kind === 'video' ? (
        <button type="button" className="recording" onClick={video} title="Stop recording (V)">
          ● {clock} · stop
        </button>
      ) : busy?.kind === 'gif' ? (
        <button type="button" className="recording" disabled>
          GIF {Math.round(busy.progress * 100)}%
        </button>
      ) : (
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((x) => !x)} title="Screenshot (P), GIF (G) or video (V)">
          ◉ Capture
        </button>
      )}
      {open && !busy && (
        <div className="popover capture-popover" id={panelId} role="dialog" aria-label="Capture">
          <button type="button" onClick={shoot}>
            📷 Screenshot <kbd>P</kbd>
          </button>
          <button type="button" onClick={gif} title="Time plays for 5 seconds while it records, then pauses">
            GIF, {GIF_SECONDS} s <kbd>G</kbd>
          </button>
          <button type="button" onClick={video} disabled={!format} title="Records until V again, or a click on the running time">
            ● Video <kbd>V</kbd>
          </button>
          <label>
            <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> Watermark “@sp4cetime.org”
          </label>
          <p className="note">
            Straight to Downloads. What is on screen is recorded, the boxes too if they are showing (the space bar hides them); this button never is.
            {!format && ' This browser cannot record video.'}
          </p>
        </div>
      )}
    </div>
  );
}
