import { react } from '../../engine/demand';
import { epilogues, projectOutcome } from '../../engine/endings';
import { projectRecords } from '../../engine/projects';
import { PRESETS, RULES } from '../../engine/rules';
import { AMENDS_OFFER } from '../../engine/sim';
import { hasAuthorshipRules } from '../../engine/versions';
import type { CompanyState, OfferSpec } from '../../engine/types';

type LossCause = 'unanswered-request' | 'missed-promise' | 'refused-extra-change' | 'unknown';
interface RelationshipLoss { cause: LossCause; minute: number; requestId?: string; contractId?: string }
const LINES: Record<LossCause, string> = {
  'unanswered-request': 'An unanswered request ended this relationship. That request never became an agreed job.',
  'missed-promise': 'A missed delivery ended this relationship.',
  'refused-extra-change': 'The extra change was declined, and they stopped commissioning work from the studio.',
  unknown: 'This relationship still needs rebuilding. The retained history does not establish why they stopped returning.',
};

/** Read the morning's actual menu, not today's menu, when attributing an unanswered request. */
function morningMenus(state: CompanyState): Map<number, OfferSpec[]> {
  const menus = new Map<number, OfferSpec[]>();
  let menu = [PRESETS.bespoke];
  let day = 0;
  for (const command of state.commands) {
    if (command.type === 'setMenu') menu = command.offers;
    if (command.type === 'runDay') menus.set(day++, menu);
  }
  return menus;
}

/** Project recorded dealings without changing old-rule state or inventing a cause lost at continuation. */
export function relationshipSummary(state: CompanyState, castId: string, minute = state.minute) {
  const shown = Math.min(minute, state.minute);
  const inherited = state.config.continuation?.relationships.find(r => r.castId === castId);
  let loss: RelationshipLoss | null = inherited?.lost ? { cause: 'unknown', minute: 0 } : null;
  const changes: { minute: number; loss: RelationshipLoss | null }[] = [];
  const menus = morningMenus(state);
  const regularAt = (at: number) => inherited?.regular || state.contracts.some(c => c.castId === castId && c.jobIds.length > 0 && c.jobIds.every(id => {
    const job = state.jobs.find(j => j.id === id);
    return job?.deliveredAt !== null && job?.deliveredAt !== undefined && job.deliveredAt <= at;
  }));
  for (const event of state.events) {
    if (event.minute > shown) continue;
    const job = event.jobId ? state.jobs.find(j => j.id === event.jobId) : undefined;
    const contract = job ? state.contracts.find(c => c.id === job.contractId) : undefined;
    if (job?.castId === castId && event.type === 'missed') changes.push({ minute: event.minute, loss: { cause: 'missed-promise', minute: event.minute, contractId: job.contractId } });
    if (contract?.castId === castId && event.type === 'delivered' && contract.offer.name === AMENDS_OFFER.name && contract.price === 0) changes.push({ minute: event.minute, loss: null });
    if (event.type !== 'walked') continue;
    const request = state.requests.find(r => r.id === event.requestId);
    const menu = request && menus.get(request.day);
    if (request?.castId !== castId || request.source === 'amends' || !menu || !regularAt(event.minute)) continue;
    if (request.offer || react(request, menu, []).kind === 'buy') changes.push({ minute: event.minute, loss: { cause: 'unanswered-request', minute: event.minute, requestId: request.id } });
  }
  for (const memory of state.relationshipMemory ?? []) {
    if (memory.castId === castId && memory.kind === 'change-refused' && memory.minute <= shown) changes.push({ minute: memory.minute, loss: { cause: 'refused-extra-change', minute: memory.minute, contractId: memory.contractId } });
  }
  for (const change of changes.sort((a, b) => a.minute - b.minute)) {
    if (!change.loss) loss = null;
    else if (!loss) loss = change.loss;
  }
  // Native current standing is authoritative, including incomplete legacy histories.
  if (shown === state.minute) loss = state.lostCast.includes(castId) ? loss ?? { cause: 'unknown', minute: shown } : null;
  const day = loss?.cause === 'unanswered-request' ? (state.requests.find(request => request.id === loss.requestId)?.day ?? Math.floor(loss.minute / RULES.minutesPerDay)) + 1 : loss ? Math.max(1, Math.ceil(loss.minute / RULES.minutesPerDay)) : null;
  const line = !loss ? null : loss.cause === 'unanswered-request' ? `An unanswered request on Day ${day} ended this relationship. That request never became an agreed job.` : loss.cause === 'missed-promise' ? `A missed delivery on Day ${day} ended this relationship.` : LINES[loss.cause];
  return { lost: loss !== null, loss, line };
}

/** Keep the existing ending selection and completed work, with the same relationship account as delivery. */
export function relationshipEpilogues(state: CompanyState) {
  return epilogues(state).map(epilogue => {
    if (!hasAuthorshipRules(state.rulesVersion)) return epilogue;
    const relationship = relationshipSummary(state, epilogue.castId);
    if (!relationship.lost) return epilogue;
    const milestone = projectRecords(state).find(p => p.id !== 'lantern-night' && p.contract.castId === epilogue.castId && p.completedAt !== null);
    const delivered = state.contracts.filter(c => c.castId === epilogue.castId && c.jobIds.every(id => state.jobs.find(j => j.id === id)?.status === 'delivered')).length;
    const work = milestone ? projectOutcome(milestone, state) : `${epilogue.name} received ${delivered} finished ${delivered === 1 ? 'order' : 'orders'} from the studio.`;
    return { ...epilogue, line: `${work} ${relationship.line}` };
  });
}
