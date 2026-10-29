import { SEGMENTS } from '../../engine/rules';
import { reactionTo } from '../../engine/selectors';
import { isRegular, newsOptions } from '../../engine/sim';
import type { CompanyState, News, Request } from '../../engine/types';
import { castName } from '../format';
import { hasAuthorshipRules } from '../../engine/versions';

const wouldLoseRegular = (state: CompanyState, request: Request) => request.source !== 'amends' && isRegular(state, request.castId) && !state.lostCast.includes(request.castId) && reactionTo(state, request).kind === 'buy';

/** Opening answers every waiting visit, including one that cannot fit today's hours. */
export function regularsLeaving(state: CompanyState): string[] {
  return [...new Set(state.requests.filter(request => request.day === state.day && request.status === 'waiting' && wouldLoseRegular(state, request)).map(request => request.castId))];
}

/** A news choice adds a request; the ticket, not the news button, takes the order. */
export function newsOrder(state: CompanyState, news: News, option: number) {
  const effect = newsOptions(state, news)[option]?.effects.find(e => e.k === 'request');
  if (!effect) return null;
  const request = state.requests.find(r => r.day === news.day && r.source === 'news' && r.castId === effect.castId);
  const remaining = request?.status === 'accepted' ? state.requests.find(r => r.id !== request.id && r.day === request.day && r.castId === request.castId && r.status === 'waiting') : undefined;
  const status = request ? {
    waiting: 'not taken yet. Take it on its ticket before opening',
    accepted: 'taken at the window',
    declined: 'turned away at the window',
    walked: 'left unanswered when you opened',
  }[request.status] : null;
  return {
    name: effect.offer.name,
    status,
    intakeWarning: isRegular(state, effect.castId) && !state.lostCast.includes(effect.castId)
      ? hasAuthorshipRules(state.rulesVersion) ? `Leave this order unanswered, and ${castName(effect.castId)} will not return. An explicit decline keeps a later visit possible.` : `Turn this order away or leave it unanswered, and ${castName(effect.castId)} will not return.` : null,
    consequence: effect.repOnDelivery ? `On delivery: stronger "${SEGMENTS[effect.segment].label}" word of mouth.` : null,
    remaining: remaining ? `Another order from ${castName(remaining.castId)} is still waiting at the window.${wouldLoseRegular(state, remaining) ? ` Leave that order unanswered and ${castName(remaining.castId)} will not return.` : ''}` : null,
  };
}

export function acceptedSibling(state: CompanyState, request: Request) {
  const sibling = state.requests.find(r => r.id !== request.id && r.day === request.day && r.castId === request.castId && r.status === 'accepted');
  return sibling ? state.contracts.find(c => c.id === sibling.contractId) : undefined;
}

/** Separate visits can belong to one neighbour; accepting one does not answer the other. */
export function separateOrderLine(state: CompanyState, request: Request): string | null {
  if (!state.requests.some(r => r.id !== request.id && r.day === request.day && r.castId === request.castId)) return null;
  const accepted = acceptedSibling(state, request);
  if (!accepted) return `Another order from ${castName(request.castId)} is at the window today.`;
  const warning = wouldLoseRegular(state, request)
    ? ` Leave this one unanswered and ${castName(request.castId)} will not return.` : '';
  return `${accepted.offer.name} is already taken. This is another order.${warning}`;
}
