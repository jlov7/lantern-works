import { useCallback, useEffect, useRef, useState } from 'react';

/** Text for the live region. Repeating the same words still re-announces them. */
export function useAnnouncer(): { text: string; announce: (text: string) => void; clear: () => void } {
  const [text, setText] = useState('');
  const flip = useRef(false);
  const announce = useCallback((t: string) => {
    flip.current = !flip.current;
    setText(flip.current ? t : `${t}\u00a0`);
  }, []);
  // Empties the region without speaking, so last evening's digest is not left in the page on a new morning.
  const clear = useCallback(() => setText(''), []);
  return { text, announce, clear };
}

const typing = (el: EventTarget | null): boolean => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
const activates = (el: EventTarget | null): boolean => el instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(el.tagName);

/** Space opens or pauses, S skips, Enter goes on to the next day, W opens the workshop. Never while typing or in a dialog. */
export function useShortcuts(keys: Partial<Record<' ' | 's' | 'Enter' | 'w', () => void>>): void {
  const ref = useRef(keys);
  useEffect(() => {
    ref.current = keys;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target) || document.querySelector('dialog[open]')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // Space and Enter on a focused button already press it.
      if ((k === ' ' || k === 'Enter') && activates(e.target)) return;
      const fn = ref.current[k as keyof typeof keys];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
