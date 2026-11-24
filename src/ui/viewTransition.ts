import { flushSync } from 'react-dom';

export function withViewTransition(update: () => void, reduced: boolean): void {
  if (typeof document.startViewTransition !== 'function' || reduced) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(update));
  // Skipped transitions still change the screen, including if the tab was hidden.
  void transition.ready.catch(() => undefined);
  void transition.finished.catch(() => undefined);
}
