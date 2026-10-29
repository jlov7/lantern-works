import { RULES } from '../../engine/rules';
import { dayPlan } from '../../engine/selectors';
import { applyCommand, simulateDay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';

export interface PlannedWork {
  first: number | null;
  total: number | null;
  launches: number;
  firstDue: number;
  days: { day: number; minutes: number; capacity: number; kit: number }[];
  production: { jobId: string; resourceId: string; day: number }[];
}

/** People's time in the same no-redo calendar as the shared plan, not nominal stage effort. */
export function plannedWork(s: CompanyState, requestId: string, counter = false, maker?: string): PlannedWork | null {
  return plannedCommandWork(s, { type: 'accept', requestId, ...(counter ? { counter: true as const } : {}), ...(maker ? { maker } : {}) });
}

export function plannedCommandWork(s: CompanyState, command: Extract<Command, { type: 'accept' | 'acceptProject' | 'reserve' }>): PlannedWork | null {
  const accepted = applyCommand(s, command);
  if (accepted.error) return null;
  const t = accepted.state;
  const contract = t.contracts.at(-1)!;
  const ids = new Set(contract.jobIds);
  const first = t.jobs.filter(j => ids.has(j.id)).sort((a, b) => a.dueAt - b.dueAt)[0]!;
  const firstDue = first.dueAt / RULES.minutesPerDay - 1;
  for (const j of t.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
  let firstMinutes = 0, totalMinutes = 0;
  const days: PlannedWork['days'] = [];
  const production: PlannedWork['production'] = [];
  // A season is twelve days. Stop when this order settles; never invent later orders or future luck.
  for (let n = s.day; n < RULES.days && !t.finished; n++) {
    const plan = dayPlan(t)!;
    const humans = plan.lanes.filter(l => l.kind === 'human');
    const blocks = plan.blocks.filter(b => humans.some(l => l.id === b.resourceId));
    production.push(...plan.blocks.filter(b => ids.has(b.jobId) && b.stage === 'produce' && b.completed).map(b => ({ jobId: b.jobId, resourceId: b.resourceId, day: t.day })));
    const minutes = blocks.filter(b => ids.has(b.jobId)).reduce((sum, b) => sum + b.to - b.from, 0);
    firstMinutes += blocks.filter(b => b.jobId === first.id).reduce((sum, b) => sum + b.to - b.from, 0);
    totalMinutes += minutes;
    days.push({ day: t.day, minutes, capacity: humans.reduce((sum, l) => sum + l.length, 0), kit: blocks.filter(b => b.jobId === 'kit').reduce((sum, b) => sum + b.to - b.from, 0) });
    simulateDay(t, { forecast: true });
    if (t.jobs.filter(j => ids.has(j.id)).every(j => j.status !== 'active' && j.status !== 'scheduled')) break;
  }
  return {
    first: t.jobs.find(j => j.id === first.id)!.status === 'delivered' ? firstMinutes : null,
    total: t.jobs.filter(j => ids.has(j.id)).every(j => j.status === 'delivered') ? totalMinutes : null,
    launches: ids.size,
    firstDue,
    days,
    production,
  };
}
