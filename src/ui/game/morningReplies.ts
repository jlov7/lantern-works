import { RULES } from '../../engine/rules';
import { applyCommand, isRegular, nextEligibleVisit } from '../../engine/sim';
import { windowRequests } from '../../engine/selectors';
import { hasAuthorshipRules } from '../../engine/versions';
import type { CompanyState, Request } from '../../engine/types';
import { dayLabel } from '../format';

export function routineReplies(state: CompanyState): Request[] {
  return windowRequests(state).filter(request => request.status === 'waiting' && request.source !== 'project' && request.source !== 'amends');
}

export function returnAfterReply(state: CompanyState, castId: string, declined = false): string {
  const day = declined ? nextEligibleVisit(state, castId) : state.day + 2;
  return day >= RULES.days ? 'A later visit would be in another season.' : `They may return from ${dayLabel(day)}; a visit is not guaranteed.`;
}

/** Apply the existing individual replies in order, including reputation floors and old-rule losses. */
export function reviewReplies(state: CompanyState, ids: string[]) {
  const eligible = new Set(routineReplies(state).map(request => request.id));
  let next = state;
  const requests: Request[] = [];
  for (const id of new Set(ids)) {
    if (!eligible.has(id)) continue;
    const result = applyCommand(next, { type: 'decline', requestId: id });
    if (result.error) continue;
    requests.push(state.requests.find(request => request.id === id)!);
    next = result.state;
  }
  const losses = Object.entries(state.rep).map(([segment, before]) => ({ segment, points: before - next.rep[segment as keyof typeof state.rep] })).filter(loss => loss.points > 0);
  return {
    requests,
    losses,
    regulars: requests.filter(request => isRegular(state, request.castId)),
    lost: next.lostCast.filter(id => !state.lostCast.includes(id)),
    keepsRelationships: hasAuthorshipRules(state.rulesVersion),
  };
}
