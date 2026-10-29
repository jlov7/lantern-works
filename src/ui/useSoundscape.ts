import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { unlockAudioFromGesture, type AudioBus } from './sound';
import { createSoundscape, type SoundscapeState } from './soundscape';

export interface SoundscapeOptions extends SoundscapeState { enabled: boolean }

export function useSoundscape(options: SoundscapeOptions): { startFromGesture: (nextEnabled?: boolean) => void } {
  const { enabled, scene, attention, relationship } = options;
  const [handle] = useState(() => createSoundscape(options));
  const current = useRef(options);
  const unlocked = useRef<AudioBus | null>(null);
  const startFromGesture = useCallback((nextEnabled = current.current.enabled) => {
    if (!nextEnabled || document.hidden) { unlocked.current = null; handle.stop(); return; }
    unlocked.current = unlockAudioFromGesture();
    // A Settings click can unlock now, then begin only after enabled=true commits.
    if (current.current.enabled && unlocked.current) handle.start(unlocked.current);
  }, [handle]);

  useLayoutEffect(() => {
    current.current = { enabled, scene, attention, relationship };
    handle.update(current.current);
    if (!enabled) { handle.stop(); unlocked.current = null; }
    else if (unlocked.current && !document.hidden) handle.start(unlocked.current);
  }, [handle, enabled, scene, attention, relationship]);

  useEffect(() => {
    const gesture = (event: Event) => { if (event.isTrusted && current.current.enabled) startFromGesture(); };
    const visibility = () => { if (document.hidden) { handle.stop(); unlocked.current = null; } };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
      handle.stop(); unlocked.current = null;
    };
  }, [handle, startFromGesture]);
  return { startFromGesture };
}
