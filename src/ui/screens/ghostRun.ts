// One ghost studio's season on a street, reduced to what the end screen shows. Shared by the worker and the fallback.
import { GHOSTS, runPolicy } from '../../engine/policies';
import { RULES } from '../../engine/rules';
import { servedByDay, summarize, type Summary } from '../../engine/selectors';
import type { RunConfig } from '../../engine/types';

export type GhostId = keyof typeof GHOSTS;
export const GHOST_IDS = Object.keys(GHOSTS) as GhostId[];

export interface GhostResult {
  id: GhostId;
  summary: Summary;
  served: number[];
}

export function runGhost(config: RunConfig, id: GhostId, rulesVersion: string = RULES.version): GhostResult {
  const s = runPolicy(config, GHOSTS[id], {}, rulesVersion);
  return { id, summary: summarize(s), served: servedByDay(s) };
}
