import { useRef, type PointerEvent } from 'react';
import { PULL, pullProgress, pullVelocity, shouldCommit, type PullSample } from '../game/pressPull';

interface Options<T extends HTMLElement> {
  canStart: (event: PointerEvent<T>) => boolean;
  track: () => number;
  onPull: (progress: number) => void;
  onSpring: (progress: number) => void;
  onCommit: (progress: number, trusted: boolean) => void;
}
type Drag = { id: number; x: number; y: number; track: number; motion: number; progress: number; samples: PullSample[] };

export function usePressGesture<T extends HTMLElement>({ canStart, track, onPull, onSpring, onCommit }: Options<T>) {
  const active = useRef<Drag | null>(null);
  function observe(drag: Drag, event: PointerEvent<T>) {
    const dy = event.clientY - drag.y;
    drag.motion = Math.max(drag.motion, Math.hypot(event.clientX - drag.x, dy));
    drag.progress = pullProgress(dy, drag.track);
    drag.samples.push({ y: event.clientY, at: event.timeStamp });
    drag.samples = drag.samples.filter(sample => sample.at >= event.timeStamp - 80);
  }
  return {
    onPointerDown(event: PointerEvent<T>) {
      if (!event.isPrimary || event.button !== 0 || active.current || !canStart(event)) return;
      active.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY, track: track(), motion: 0, progress: 0,
        samples: [{ y: event.clientY, at: event.timeStamp }],
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      onPull(0);
      return true;
    },
    onPointerMove(event: PointerEvent<T>) {
      const drag = active.current;
      if (!drag || drag.id !== event.pointerId) return;
      observe(drag, event);
      onPull(drag.progress);
    },
    onPointerUp(event: PointerEvent<T>) {
      const drag = active.current;
      if (!drag || drag.id !== event.pointerId) return;
      active.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      observe(drag, event);
      if (drag.motion < PULL.tapSlopPx || shouldCommit(drag.progress, pullVelocity(drag.samples))) {
        onCommit(drag.progress, event.nativeEvent.isTrusted);
      } else onSpring(drag.progress);
    },
    onPointerCancel(event: PointerEvent<T>) {
      const drag = active.current;
      if (!drag || drag.id !== event.pointerId) return;
      active.current = null;
      onSpring(drag.progress);
    },
  };
}
