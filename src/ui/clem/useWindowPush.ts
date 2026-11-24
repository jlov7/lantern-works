import { useLayoutEffect, useRef, useState } from 'react';
import type { WindowFraming } from '../game/windowFraming';

const initial = { framing: 'street', animate: false, hang: 'waiting' } as const;
type Push = { framing: WindowFraming; animate: boolean; hang: 'waiting' | 'after-push' | 'cut' };

export function useWindowPush(active: boolean, target: 'window' | 'read', decodedAt: number | null, reduced: boolean, frozen: boolean) {
  const entered = useRef<number | null>(null);
  const [push, setPush] = useState<Push>(initial);

  useLayoutEffect(() => {
    if (!active) {
      entered.current = null;
      setPush(initial);
      return;
    }
    const now = performance.now();
    entered.current ??= now;
    if (frozen) return;
    if (reduced) {
      if (push.framing !== target || push.animate || push.hang !== 'cut') setPush({ framing: target, animate: false, hang: 'cut' });
      return;
    }
    if (decodedAt === null) return;
    if (push.framing !== 'street') {
      if (push.framing !== target) setPush({ ...push, framing: target, animate: true });
      return;
    }
    if (decodedAt - entered.current > 1500) {
      setPush({ framing: target, animate: false, hang: 'cut' });
      return;
    }
    const timer = window.setTimeout(() => setPush({ framing: target, animate: true, hang: 'after-push' }), Math.max(0, 120 - (now - entered.current)));
    return () => clearTimeout(timer);
  }, [active, target, decodedAt, reduced, frozen, push]);

  return push;
}
