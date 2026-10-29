import { RULES } from '../../engine/rules';
import { workFor, type dayPlan } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { clockLabel } from '../timeline';

type Plan = NonNullable<ReturnType<typeof dayPlan>>;

export function planEnding(plan: Plan, state: CompanyState, considering: string | null): string {
  const theirs = plan.blocks.filter(b => b.isNew);
  // Finishing at the shift boundary counts only if the native task actually completes.
  const done = theirs.find(b => b.stage === 'finish' && b.completed && b.to <= (plan.lanes.find(l => l.id === b.resourceId)?.length ?? 0));
  if (done) return ` Out at ${clockLabel(done.to)}.`;
  if (!theirs.length) return '';
  if (state.day === RULES.days - 1) return ' Not finished before the season ends.';
  const due = considering ? workFor(state, considering)?.firstDue : undefined;
  if (due === undefined) return ' Not finished today.';
  return due <= state.day ? ' Not finished today: it would miss tonight.' : ' Not finished today: it carries on tomorrow.';
}
