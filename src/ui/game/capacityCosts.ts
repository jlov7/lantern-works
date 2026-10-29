import { dailyCosts, tonight } from '../../engine/selectors';
import { applyCommand } from '../../engine/sim';
import type { AiTier, CompanyState } from '../../engine/types';

/** Total recurring tier price using only supplier changes already active today. */
export function aiDailyCost(state: CompanyState, tier: AiTier): number {
  const next = applyCommand(state, { type: 'setStaff', staffing: { aiTier: tier, routing: tier === 'none' ? 'human' : 'simple' } }).state;
  return dailyCosts(next).ai;
}

export function capacityCost(state: CompanyState, lever: 'temp' | 'overtime'): { now: number; opening: number; total: number } {
  const next = applyCommand(state, { type: lever }).state;
  const now = state.cash - next.cash;
  // The native one-day forecast bills everyone working overtime, including a newly booked temp.
  const opening = tonight(next).running - tonight(state).running;
  return { now, opening, total: now + opening };
}
