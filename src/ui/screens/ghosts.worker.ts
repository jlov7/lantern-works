// Runs the ghost studios for one street and posts each result as soon as it is ready.
import type { RunConfig } from '../../engine/types';
import { runGhost, type GhostId, type GhostResult } from './ghostRun';

// The app compiles against the DOM library; this is the small part of the worker scope it uses.
const scope = self as unknown as { onmessage: ((e: MessageEvent<{ config: RunConfig; rulesVersion: string; ids: GhostId[] }>) => void) | null; postMessage: (m: GhostResult) => void };

scope.onmessage = (e) => {
  for (const id of e.data.ids) scope.postMessage(runGhost(e.data.config, id, e.data.rulesVersion));
};
