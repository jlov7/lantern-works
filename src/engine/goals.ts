// Optional goals per street (GD-20): a second reason to replay a street, read only from the final state.
import { medalFor, summarize } from './selectors';
import { repLevel } from './sim';
import type { CompanyState, Request, SegmentId } from './types';

export interface Goal {
  id: string;
  label: string;
  met: (s: CompanyState) => boolean;
  /** Where the season stands on it so far, for the street panel. */
  progress: (s: CompanyState) => string;
  /** Neighbours whose order would count towards it, so their ticket can say so. */
  counts?: (r: Request) => boolean;
}

const missedOrRefunded = (s: CompanyState) => s.jobs.filter((j) => j.status === 'refunded' || j.status === 'missed').length;

/** Neighbours of one type whose whole order was delivered. */
function servedOf(s: CompanyState, segment: SegmentId): number {
  return s.contracts.filter((c) => c.segment === segment && c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length;
}

/** Orders from one type still being made: they count once delivered on time. */
function inWorksOf(s: CompanyState, segment: SegmentId): number {
  return s.contracts.filter((c) => c.segment === segment && c.jobIds.some((id) => ['scheduled', 'active'].includes(s.jobs.find((j) => j.id === id)?.status ?? '')) && !c.jobIds.some((id) => ['missed', 'refunded'].includes(s.jobs.find((j) => j.id === id)?.status ?? ''))).length;
}
/** "2 of 6 delivered, 1 in the works": a goal counted on delivery says so while orders are still being made. */
const deliveredOf = (s: CompanyState, segment: SegmentId, n: number) => {
  const w = s.finished ? 0 : inWorksOf(s, segment);
  return `${Math.min(n, servedOf(s, segment))} of ${n} delivered${w ? `, ${w} in the works` : ''}`;
};

const usedAi = (s: CompanyState) => s.journal.some((e) => e.kind === 'ai');
const maxDesks = (s: CompanyState) => (s.commands.some((c) => c.type === 'setStaff' && c.staffing.aiTier === 'duo') ? 2 : usedAi(s) ? 1 : 0);

export const GOALS: Record<string, Goal[]> = {
  'main-street': [
    { id: 'careful-6', label: 'Serve six careful voices', met: (s) => servedOf(s, 'careful') >= 6, progress: (s) => deliveredOf(s, 'careful', 6), counts: (r) => r.segment === 'careful' },
    {
      id: 'no-refunds',
      label: 'Close the season with no launch missed or refunded',
      met: (s) => s.finished && s.jobs.every((j) => j.status !== 'refunded' && j.status !== 'missed') && s.contracts.length > 0,
      progress: (s) => (missedOrRefunded(s) ? `${missedOrRefunded(s)} missed or refunded` : 'none so far'),
    },
  ],
  'festival-week': [
    { id: 'rush-12', label: 'Serve twelve last-minute jobs', met: (s) => servedOf(s, 'rush') >= 12, progress: (s) => deliveredOf(s, 'rush', 12), counts: (r) => r.segment === 'rush' },
    {
      id: 'silver-one-desk',
      label: 'Reach silver with at most one AI desk',
      met: (s) => maxDesks(s) <= 1 && ['silver', 'gold'].includes(medalFor(s).medal ?? ''),
      progress: (s) => (maxDesks(s) > 1 ? 'missed: two desks used' : `${summarize(s).served} served so far`),
    },
  ],
  'bespoke-rush': [
    { id: 'no-ai-25', label: `Serve 25 without an AI desk`, met: (s) => !usedAi(s) && summarize(s).served >= 25, progress: (s) => (usedAi(s) ? 'missed: an AI desk was used' : `${Math.min(25, summarize(s).served)} of 25`) },
    { id: 'careful-word', label: 'End with careful voices talking you up', met: (s) => repLevel(s.rep.careful) >= 2, progress: (s) => `word of mouth ${Math.max(0, repLevel(s.rep.careful))} of 2` },
  ],
};

export function goalsFor(s: CompanyState): { goal: Goal; met: boolean }[] {
  return (GOALS[s.config.scenarioId] ?? []).filter((goal) => !s.config.continuation || goal.id !== 'silver-one-desk').map((goal) => ({ goal, met: s.finished && goal.met(s) }));
}

