// The ghost studios for the end screen, worked out off the main thread (a worker) so the screen paints first.
// Without workers, each ghost runs in its own idle slice after the first paint.
import { useEffect, useState } from 'react';
import { RULES } from '../../engine/rules';
import type { RunConfig } from '../../engine/types';
import { GHOST_IDS, runGhost, type GhostId, type GhostResult } from './ghostRun';

export { GHOST_IDS, type GhostId, type GhostResult } from './ghostRun';

const idle = (fn: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 400 });
  else setTimeout(fn, 16);
};

/** All the ghosts for this street, or null until every one is ready. */
export function useGhosts(config: RunConfig, rulesVersion: string = RULES.version): Record<GhostId, GhostResult> | null {
  const [done, setDone] = useState<{ key: string; ghosts: Record<GhostId, GhostResult> } | null>(null);
  const key = JSON.stringify([rulesVersion, config]);
  useEffect(() => {
    if (config.continuation) return;
    let live = true;
    const got: Partial<Record<GhostId, GhostResult>> = {};
    const finish = () => {
      if (live && GHOST_IDS.every((id) => got[id])) setDone({ key, ghosts: got as Record<GhostId, GhostResult> });
    };
    const fallback = () => {
      const next = (i: number) => {
        if (!live || i >= GHOST_IDS.length) return finish();
        idle(() => {
          if (!live) return;
          const id = GHOST_IDS[i]!;
          got[id] ??= runGhost(config, id, rulesVersion);
          next(i + 1);
        });
      };
      // Two frames: the screen has painted before the first ghost starts.
      requestAnimationFrame(() => requestAnimationFrame(() => next(0)));
    };
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./ghosts.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<GhostResult>) => {
        got[e.data.id] = e.data;
        finish();
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        fallback();
      };
      worker.postMessage({ config: { scenarioId: config.scenarioId, seed: config.seed }, rulesVersion, ids: GHOST_IDS });
    } catch {
      fallback();
    }
    return () => {
      live = false;
      worker?.terminate();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return !config.continuation && done?.key === key ? done.ghosts : null;
}
