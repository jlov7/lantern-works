// A tricky brief made by hand, with Ada and Tomas both in: who makes it is the player's call. Ada is careful and rarely
// redoes it; Tomas is quicker and redoes it more often. Each choice is judged by the same forecast, and by how many of
// the other waiting buyers would still fit after it, so the careful choice shows what its hours cost.
import { RULES } from '../../engine/rules';
import { fits, forecast, reactionTo, takeableInTurn } from '../../engine/selectors';
import { applyCommand, makerBusyWith, redoBpFor, routedToAi, workingOn } from '../../engine/sim';
import type { CompanyState, Request } from '../../engine/types';
import { plannedWork } from './plannedWork';
import { promiseLabel } from './promiseLabel';

export interface MakerAvailability {
  id: string;
  name: string;
  fits: boolean;
  /** Whose launch they are already on, when they take one job at a time and have it. */
  busyWith?: string;
}

export interface MakerChoice extends MakerAvailability {
  trait: string;
  /** Chance it goes out first time, in percent. */
  firstTime: number;
  mins: number;
  /** Other waiting buyers who would still fit, taken in turn, after this choice. */
  others: number;
}

/** Roster fit needs no production-day or other-buyer simulations. */
export function makerAvailability(s: CompanyState, r: Request): MakerAvailability[] | null {
  if (r.status !== 'waiting' || r.need !== 'nuanced' || reactionTo(s, r).kind !== 'buy') return null;
  if (s.staffing.aiTier !== 'none' && routedToAi(s.staffing, r)) return null;
  const ids = Object.keys(RULES.makers);
  const working = workingOn(s, s.day).map((x) => x.id);
  if (!ids.every((id) => working.includes(id))) return null;
  return ids.map((id) => {
    const busy = makerBusyWith(s, id);
    return { id, name: s.resources.find(x => x.id === id)!.name, fits: !busy && fits(forecast(s, r.id, { maker: id })), ...(busy ? { busyWith: promiseLabel(s, busy.id, 'customer') } : {}) };
  });
}

export function makerChoices(s: CompanyState, r: Request): MakerChoice[] | null {
  const available = makerAvailability(s, r);
  return available?.map((route) => {
    const { id, fits: ok } = route;
    const after = ok ? applyCommand(s, { type: 'accept', requestId: r.id, maker: id }) : null;
    const work = ok ? plannedWork(s, r.id, false, id)! : null;
    const production = work?.production.find(task => task.jobId === after!.state.contracts.at(-1)!.jobIds[0]);
    const producer = s.resources.find(resource => resource.id === (production?.resourceId ?? id))!;
    return {
      ...route,
      trait: RULES.makers[id]!.trait,
      firstTime: 100 - Math.round(redoBpFor(s, producer.kind, r.need, producer, production?.day) / 100),
      mins: ok ? work!.first! : 0,
      others: after && !after.error ? takeableInTurn(after.state).length : 0,
    };
  }) ?? null;
}

/** The line under the choice when the two leave room for different numbers of other buyers, or null. */
export function makersAfter(choices: MakerChoice[]): string | null {
  const ok = choices.filter((m) => m.fits);
  if (ok.length < 2 || ok.every((m) => m.others === ok[0]!.others)) return null;
  return `After that, ${ok.map((m) => `with ${m.name} ${m.others === 1 ? '1 other buyer still fits' : `${m.others} other buyers still fit`}`).join('; ')}.`;
}

/** When a one-job maker is free and more than one waiting buyer is a tricky brief they could make, a line saying so. */
export function makersContested(s: CompanyState, choices: MakerAvailability[]): string | null {
  const one = choices.find((m) => RULES.makers[m.id]?.slots === 1 && !m.busyWith);
  if (!one) return null;
  const n = s.requests.filter((r) => r.status === 'waiting' && r.need === 'nuanced' && reactionTo(s, r).kind === 'buy').length;
  return n >= 2 ? `${one.name} takes one job at a time, and ${n} tricky briefs are waiting: choose which gets ${one.name}.` : null;
}
