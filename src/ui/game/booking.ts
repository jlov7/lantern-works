// A neighbour who rang ahead for tomorrow: one neighbour, several launches, a premium, and the work starts tomorrow
// before tomorrow's own buyers arrive. Medals count neighbours served, and silver and gold also need a profit, so
// whether to take it depends on which of the two the season is short of. The line puts both sides in view.
import { getScenario } from '../../engine/sim';
import type { CompanyState, Request } from '../../engine/types';
import { castName, hours } from '../format';
import { plannedWork } from './plannedWork';

export function bookingLine(s: CompanyState, r: Request): string | null {
  if (r.source !== 'booking' || r.status !== 'waiting' || !r.offer) return null;
  const w = plannedWork(s, r.id);
  if (!w) return null;
  const tomorrow = w.days.find(d => d.day === s.day + 1);
  const coming = getScenario(s.config.scenarioId).arrivals[s.day + 1] ?? 0;
  const what = r.offer.launches > 1 ? `, ${r.offer.launches} launches` : '';
  const total = w.total === null ? 'Some work remains unfinished in this plan.' : `About ${hours(w.total)} of people's work in total.`;
  const next = tomorrow ? ` Tomorrow: about ${hours(tomorrow.minutes)} of their ${hours(tomorrow.capacity)}, before new buyers.` : '';
  return `One neighbour towards your medal count${what}. ${total}${next} Usually ${coming} or so new buyers arrive tomorrow. If it all goes out on time, big-night neighbours hear about it.`;
}

/** Bookings whose work ran today, with the people's minutes it took: the evening ties a full day back to them. */
export function bookingsWorked(s: CompanyState, day: number): { name: string; minutes: number }[] {
  const out: { name: string; minutes: number }[] = [];
  for (const c of s.contracts) {
    if (!c.offer.startsInDays || c.acceptedDay + c.offer.startsInDays !== day) continue;
    const ids = new Set(c.jobIds);
    const open = new Map<string, number>();
    let minutes = 0;
    for (const e of s.events) {
      if (e.day !== day || !e.jobId || !ids.has(e.jobId) || !e.resourceId || s.resources.find((r) => r.id === e.resourceId)?.kind !== 'human') continue;
      if (e.type === 'task_start') open.set(e.resourceId, e.minute);
      else if (e.type === 'task_done' && open.has(e.resourceId)) {
        minutes += e.minute - open.get(e.resourceId)!;
        open.delete(e.resourceId);
      }
    }
    if (minutes > 0) out.push({ name: castName(c.castId), minutes });
  }
  return out;
}
