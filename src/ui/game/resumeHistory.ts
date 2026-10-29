import type { CompanyState } from '../../engine/types';
import type { ResumeHistory } from '../useRun';

export function previousMorning(state: CompanyState, history?: ResumeHistory): CompanyState | undefined {
  return history?.beforeDay && history.commandCount === state.commands.length && history.commandFingerprint === JSON.stringify(state.commands) ? history.beforeDay : undefined;
}
