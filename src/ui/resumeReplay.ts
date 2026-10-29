import { scenarioById } from '../engine/rules';
import { applyCommand, createRun } from '../engine/sim';
import type { CompanyState } from '../engine/types';
import { supportsRulesVersion } from '../engine/versions';
import type { SavedRun } from './schema';
import type { ResumeHistory } from './useRun';

export type ReplayInput = Pick<SavedRun, 'rules' | 'config' | 'commands'>;
export interface RebuiltRun { state: CompanyState; history: ResumeHistory }

/** Rules and the entire tape identify a reconstruction, including same-length replacements. */
export function replayFingerprint(run: ReplayInput): string {
  return JSON.stringify([run.rules, run.config, run.commands]);
}

/** Each yield is a cancellation point for the main-thread fallback. Workers drain this without yielding. */
export function* reconstruct(run: ReplayInput): Generator<void, RebuiltRun | null> {
  if (!supportsRulesVersion(run.rules) || !scenarioById(run.config.scenarioId)) return null;
  let state: CompanyState;
  try { state = createRun(run.config, run.rules); } catch { return null; }
  let beforeDay: CompanyState | null = null;
  for (const command of run.commands) {
    const result = applyCommand(state, command);
    if (result.error) return null;
    if (command.type === 'runDay') beforeDay = state;
    state = result.state;
    yield;
  }
  return { state, history: { commandCount: run.commands.length, commandFingerprint: JSON.stringify(run.commands), beforeDay } };
}
