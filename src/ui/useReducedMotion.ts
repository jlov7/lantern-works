import { useEffect, useState } from 'react';
import { loadPrefs, PREFS_EVENT } from './persist';

const QUERY = '(prefers-reduced-motion: reduce)';

function reduced(): boolean {
  const m = loadPrefs().motion;
  if (m !== 'system') return m === 'reduce';
  return typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches;
}

/** True when animations should stop: the motion setting if the player chose one, otherwise this device's setting. */
export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(reduced);
  useEffect(() => {
    const mq = matchMedia(QUERY);
    const on = () => {
      setRm(reduced());
      // CSS follows the same choice: 'reduce' stops animations, 'full' keeps them on a reduced-motion device.
      document.documentElement.dataset.motion = loadPrefs().motion;
    };
    on();
    mq.addEventListener('change', on);
    window.addEventListener(PREFS_EVENT, on);
    return () => {
      mq.removeEventListener('change', on);
      window.removeEventListener(PREFS_EVENT, on);
    };
  }, []);
  return rm;
}
