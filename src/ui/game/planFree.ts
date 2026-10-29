import type { dayPlan } from '../../engine/selectors';
import { hours } from '../format';
import { clockLabel } from '../timeline';

export function planFree(plan: NonNullable<ReturnType<typeof dayPlan>>): string[] {
  return plan.lanes.filter((l) => l.kind === 'human').map((l) => {
    const mine = plan.blocks.filter((b) => b.resourceId === l.id);
    const used = mine.reduce((a, b) => a + (b.to - b.from), 0);
    const left = l.length - used;
    const from = Math.max(0, ...mine.map((b) => b.to));
    // Gaps count as free hours, but only the uninterrupted tail can be labelled "from".
    const tail = l.length - from;
    const after = from > 0 && tail >= 30 ? (left - tail >= 30 ? ` (${hours(tail)} from ${clockLabel(from)})` : ` from ${clockLabel(from)}`) : '';
    return left >= 15 ? `${l.name} ${hours(left)}${after}` : `${l.name} none`;
  });
}
