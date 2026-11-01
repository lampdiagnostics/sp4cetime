import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A "?" button that opens the instructions in a pop-up in the middle of the screen (Esc,
 * the × or a click outside closes it). The pop-up is put on the page itself, outside the
 * blurred control box, so it is always placed against the whole window.
 */
export function HelpButton({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="picker help" ref={root}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} title="How to use it">
        ? How to
      </button>
      {open &&
        createPortal(
          <div className="popover help-popover" id={id} ref={panel} role="dialog" aria-label="How to use sp4cetime">
            <button type="button" className="help-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
