import { useEffect, useRef, useState } from 'react';

export interface DialogResult {
  readonly name: string;
  readonly caption: string;
  readonly stop: boolean;
}

/**
 * Return pressed (not in Presentation mode): start a path and name it, or confirm what is
 * on screen as its next point, with an optional caption and a choice to stop after it.
 * Return confirms; Esc cancels. Never in a capture.
 */
export function PathDialog({ starting, pointName, pathName, onConfirm, onCancel, onDiscard }: {
  /** No path is being made yet: this view will be START. */
  starting: boolean;
  /** "START", "POINT 3", … */
  pointName: string;
  pathName: string;
  onConfirm: (r: DialogResult) => void;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [stop, setStop] = useState(false);
  const [sure, setSure] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onCancel]);

  return (
    <div className="path-dialog-backdrop" data-no-capture onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="path-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({ name: name.trim() || 'Untitled path', caption: caption.trim(), stop });
        }}
      >
        <h2 id="path-dialog-title">{starting ? 'Start a path?' : `Add this view as ${pointName}?`}</h2>
        <p className="note">
          {starting
            ? 'What is on screen now (the view, the moment, how time is running, the look) becomes START. Then travel anywhere and press Return for each next point.'
            : <>Path “{pathName}”: what is on screen now becomes {pointName}.</>}
        </p>
        {starting && (
          <label>
            Name of the path
            <input ref={first} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The life of the Sun" maxLength={120} />
          </label>
        )}
        <label>
          Caption <span className="note">(optional, shown at this point)</span>
          <input ref={starting ? undefined : first} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} />
        </label>
        <label className="check">
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} /> Stop making the path after this point (it becomes END)
        </label>
        <div className="row">
          <button type="submit" className="primary">
            {starting ? 'Start the path' : `Add ${pointName}`} <kbd>Return</kbd>
          </button>
          <button type="button" onClick={onCancel}>
            Cancel <kbd>Esc</kbd>
          </button>
          {!starting && (
            <button type="button" className="danger" onClick={() => (sure ? onDiscard() : setSure(true))} title="Throw away this path and everything in it">
              {sure ? 'Really discard it?' : 'Discard path'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
