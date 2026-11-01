import { useEffect, useId, useRef, useState } from 'react';
import { type Recording, recordGif, recordVideo, screenshot, type Shot, videoFormat } from './capture';
import type { Path } from '../core/path';

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
export interface PresentControls {
  readonly paths: readonly Path[];
  /** The app's own example paths (read-only; Continue makes your own copy). */
  readonly examples: readonly Path[];
  readonly presenting: boolean;
  present(id: string): void;
  stop(): void;
  exportPath(id: string): void;
  importFile(f: File): void;
  deletePath(id: string): void;
  /** Go on adding points to this path (Return adds the next). */
  continuePath(id: string): void;
  /** What went wrong with the last import, if anything. */
  readonly message: string;
}

export function CaptureMenu({ getShot, onPlay, in3D, present }: {
  getShot: () => Shot | null;
  onPlay: (on: boolean) => void;
  in3D: boolean;
  /** Paths: Presentation mode lives in the Capture button (presentations are made to be captured). */
  present: PresentControls;
}) {
  const [open, setOpen] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [sharp, setSharp] = useState(false);
  const [chosen, setChosen] = useState('');
  const [sureDelete, setSureDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const all = [...present.paths, ...present.examples];
  const pathId = all.some((x) => x.id === chosen) ? chosen : (all[0]?.id ?? '');
  const isExample = pathId.startsWith('example:');
  const option = (x: Path) => (
    <option key={x.id} value={x.id}>
      {x.name} · {x.points.length} point{x.points.length === 1 ? '' : 's'}
      {x.finished ? '' : ' (unfinished)'}
    </option>
  );
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
        ).then(
          (r) => {
            rec.current = r;
          },
          () => {
            rec.current = null;
            setBusy(null);
            onPlay(false);
          },
        ),
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
    void recordVideo(stage, { fps: VIDEO_FPS, watermark, sharp }, () => {
      rec.current = null;
      setBusy(null);
    }).then(
      (r) => {
        if (!r) setBusy(null);
        rec.current = r;
      },
      () => {
        rec.current = null;
        setBusy(null);
      },
    );
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
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((x) => !x)} title="Screenshot (P), GIF (G) or video (V); present a path">
          ◉ Capture · ▷ Present
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
          <label title="Video at up to 4K instead of 1080p: sharper, but heavier for the computer while recording">
            <input type="checkbox" checked={sharp} onChange={(e) => setSharp(e.target.checked)} /> Sharp video (up to 4K)
          </label>
          <p className="note">
            Straight to Downloads. What is on screen is recorded, the boxes too if they are showing (the space bar hides them); this button never is.
            {!format && ' This browser cannot record video.'}
          </p>
          <hr />
          <div className="present-section" aria-label="Present a path">
            <span className="heading">Present a path</span>
            {present.paths.length === 0 && (
              <p className="note">Make your own: go anywhere and press Return to start a path; travel and press Return for each next point.</p>
            )}
            {all.length > 0 && (
              <>
                <select value={pathId} onChange={(e) => (setChosen(e.target.value), setSureDelete(false))} aria-label="Paths">
                  {present.paths.length > 0 && <optgroup label="Your paths">{present.paths.map(option)}</optgroup>}
                  {present.examples.length > 0 && <optgroup label="Examples">{present.examples.map(option)}</optgroup>}
                </select>
                {present.presenting ? (
                  <button type="button" className="primary" onClick={() => (setOpen(false), present.stop())}>
                    ■ Stop presenting <kbd>Esc</kbd>
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={() => (setOpen(false), present.present(pathId))} title="Fly from point to point: Return or → next, ← back">
                    ▷ Present
                  </button>
                )}
                <div className="capture-row">
                  <button type="button" onClick={() => (setOpen(false), present.continuePath(pathId))} title={isExample ? 'Make your own copy and add points to it (Return)' : 'Add more points to it (Return)'}>
                    ✎ Continue
                  </button>
                  <button type="button" onClick={() => present.exportPath(pathId)} title="Download it as a .sp4ce.json file to keep or share">
                    ⤓ Download
                  </button>
                  {!isExample && (
                    <button type="button" onClick={() => (sureDelete ? (present.deletePath(pathId), setSureDelete(false)) : setSureDelete(true))}>
                      {sureDelete ? 'Really?' : 'Delete'}
                    </button>
                  )}
                </div>
              </>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} title="Open a .sp4ce.json file to present it or keep working on it">
              ⤒ Upload a path (.json)…
            </button>
            <p className="note">Paths are files: download yours to keep them, upload them to present or carry on. This browser keeps a copy too.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) present.importFile(f);
                e.target.value = '';
              }}
            />
            {present.message && <p className="note">{present.message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
