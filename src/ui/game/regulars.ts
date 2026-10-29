// What a regular says when they come back: a line about the last launch, in their kind's voice, so a relationship the
// end screen celebrates is heard at the window as it grows. Pure and picked by the visit.
import type { CompanyState, Request, SegmentId } from '../../engine/types';
import { contractProof } from '../../engine/ordinary';
import { relationshipSummary } from './relationshipSummary';

/** These lines refer to recorded dealings, rather than assuming every return means satisfaction. */
export function rememberedLine(state: CompanyState, request: Request): string | null {
  if (!state.relationshipMemory) return null;
  const relationship = relationshipSummary(state, request.castId);
  if (relationship.lost) return `${relationship.line}${request.source === 'amends' ? ' This new request is a chance to rebuild trust.' : ''}`;
  const memories = state.relationshipMemory.filter(m => m.castId === request.castId && m.day < request.day);
  const last = memories.at(-1);
  const previous = state.config.continuation?.relationships.find(r => r.castId === request.castId);
  const kind = last?.kind ?? previous?.lastResolution;
  if (!kind) return null;
  if (kind === 'declined-before-promise') return 'You said you could not fit it last time. Have you got room today?';
  if (kind === 'agreed-later-start') return last ? 'We have a date for the other job. This is a separate request.' : 'You found a later slot for me last season. What can you fit this time?';
  if (kind === 'renegotiated-with-discount') return 'You called when the date slipped. Tell me what is possible this time.';
  if (kind === 'amends-kept') return 'You put the last one right. Let us start from there.';
  if (kind === 'promise-kept') {
    const contract = state.contracts.find(c => c.id === last?.contractId);
    const title = (contract ? contractProof(contract)?.pieces[0]?.title : undefined) ?? state.config.continuation?.pieces.find(p => p.castId === request.castId)?.title;
    return title ? `I still have "${title}". Here is what I need next.` : 'The last job arrived when you said it would. I have another brief.';
  }
  return null;
}

const SECOND: Record<SegmentId, string[]> = {
  small: ['The last one had the queue out of the door by ten. Same again, please.', 'People still ask about the last one. Can we do another?'],
  moment: ['You made our last big night. This one is bigger.', 'Everyone came last time. Now they expect it.'],
  careful: ['You listened properly last time. That is why I am back.', 'The last one was right first time. I would like that again.'],
  rush: ['You saved me last time. I need saving again, by tonight.', 'Same as before: late notice, no excuses. Sorry.'],
};

const LATER: Record<SegmentId, string> = {
  small: 'At this point the queue knows your name.',
  moment: 'We have stopped asking anyone else.',
  careful: 'I have told my friends. Carefully.',
  rush: 'You are the only studio I call in a panic now.',
};

/** The line a returning neighbour says, given how many launches they have already had delivered. */
export function regularLine(segment: SegmentId, servedBefore: number, visit: number): string {
  if (servedBefore >= 2) return `${servedBefore === 2 ? 'Third' : `${servedBefore + 1}th`} time. ${LATER[segment]}`;
  const lines = SECOND[segment];
  return lines[visit % lines.length]!;
}
