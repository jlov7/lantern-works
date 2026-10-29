// Always-mounted live regions: a hidden one for the day's digest, and a visible status line for messages.
import { useEffect, useState, type JSX } from 'react';

/** One visually hidden polite region, always mounted so announcements are heard. */
export function LiveRegion({ text }: { text: string }): JSX.Element {
  return (
    <div className="vh" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

const TOAST_MS = 8000;

/** A message that stays at least eight seconds, and longer while hovered or focused. */
export function Toast({ message, onDone }: { message: { text: string; id: number } | null; onDone: () => void }): JSX.Element {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!message || held) return;
    const id = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(id);
  }, [message, held, onDone]);
  return (
    <div className="toast-region" role="status">
      {message && (
        <div key={message.id} className="toast" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
          <p>{message.text}</p>
          <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
