import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export type DialogKind = { kind: 'workshop'; slot: number } | { kind: 'books' } | { kind: 'settings' };

// Dialogs hand focus back to whatever opened them, or to the window if that has gone.
const restoreFocus = (el: HTMLElement | null) => (el?.isConnected ? el : document.querySelector<HTMLElement>('dialog[open] [data-compare-return], [data-customer-heading], .reply-receipt, .sign .btn, #workspace-heading'))?.focus();

/** One main dialog at a time, plus the Claude key dialog, which can open over the workshop. */
export function useDialogs() {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const keyOpener = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const show = useCallback((d: DialogKind) => {
    opener.current = document.activeElement as HTMLElement | null;
    setDialog(d);
  }, []);
  const close = useCallback(() => {
    // Commit the close now, so focus moves in the same task and never rests on the page.
    flushSync(() => setDialog(null));
    restoreFocus(opener.current);
  }, []);
  const showKey = useCallback(() => {
    keyOpener.current = document.activeElement as HTMLElement | null;
    setKeyOpen(true);
  }, []);
  const closeKey = useCallback(() => {
    flushSync(() => setKeyOpen(false));
    restoreFocus(keyOpener.current);
  }, []);
  return { dialog, show, close, keyOpen, showKey, closeKey };
}
