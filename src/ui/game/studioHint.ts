// The one studio lever worth looking at this morning, if any, from the same forecast the window uses. No React here.
import { fits, fitsWith, forecast, humanLoad, reactionTo, windowRequests } from '../../engine/selectors';
import { RULES } from '../../engine/rules';
import { applyCommand, paceOn } from '../../engine/sim';
import type { Command, CompanyState, Request } from '../../engine/types';
import { aiDailyCost, capacityCost } from './capacityCosts';
import { castName } from '../format';

/** With the lever booked (or none), how many of these buyers could be taken one after another, in queue order, and what they would pay. */
function* takenWithSteps(state: CompanyState, lever: 'overtime' | 'temp' | null, buyers: Request[]): Generator<void, { n: number; value: number; ids: string[] }> {
  yield;
  return yield* takenAfterSteps(lever ? applyCommand(state, { type: lever }).state : state, buyers);
}

export type HintLever = 'overtime' | 'temp' | 'hire' | 'flyers';
export interface StudioHint {
  text: string;
  lever: HintLever;
  /** For overtime or a temp: how many more buyers it would let you take than without it, and what they would pay. */
  unlocks?: { n: number; value: number };
}

export function studioHint(state: CompanyState): StudioHint | null {
  const steps = studioHintSteps(state);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/** Separate buyer forecasts so the no-Worker planner can yield and cancel. */
export function* studioHintSteps(state: CompanyState): Generator<void, StudioHint | null> {
  if (state.finished) return null;
  // Only buyers held back by hours: launches that would fall after the season ends are a calendar problem that
  // no extra hands can fix, and the ticket already says so.
  const blocked: Request[] = [];
  for (const r of windowRequests(state)) {
    yield;
    if (r.status !== 'waiting' || reactionTo(state, r).kind !== 'buy') continue;
    const f = forecast(state, r.id);
    if (!fits(f) && f.newAfterSeason.length === 0) blocked.push(r);
  }
  if (blocked.length) {
    const levers: ReturnType<typeof fitsWith>[] = [];
    for (const r of blocked) { yield; levers.push(fitsWith(state, r.id)); }
    // Counted over every buyer, so the hours the lever adds are not promised twice to buyers who already fit.
    const buyers = windowRequests(state).filter((r) => r.status === 'waiting' && reactionTo(state, r).kind === 'buy');
    const without = yield* takenWithSteps(state, null, buyers);
    let individual: StudioHint | null = null;
    for (const lever of ['overtime', 'temp'] as const) {
      if (!levers.includes(lever)) continue;
      const w = yield* takenWithSteps(state, lever, buyers);
      const unlocks = { n: Math.max(0, w.n - without.n), value: Math.max(0, w.value - without.value) };
      const n = unlocks.n;
      if (n === 0) {
        // A different buyer can fit without increasing the queue-order count.
        const buyer = blocked[levers.indexOf(lever)]!;
        const how = lever === 'overtime' ? 'overtime' : 'a temp';
        individual ??= { lever, text: `With ${how}, ${castName(buyer.castId)}'s order would fit. Book it, then choose who gets the hours.` };
        continue;
      }
      const k = blocked.length;
      const how = lever === 'overtime' ? 'overtime' : 'a temp';
      return { lever, unlocks, text: k === 1 ? `1 buyer at the window doesn't fit today. With ${how}, they would: book it, then take them.` : `${k} buyers at the window don't fit today. With ${how}, ${n >= k ? 'all of them' : `${n} of them`} would: book it, then take them.` };
    }
    if (individual) return individual;
    return { lever: 'hire', text: `${blocked.length} buyer${blocked.length === 1 ? '' : 's'} at the window won't fit today, even with overtime or a temp. A junior adds hours from tomorrow.` };
  }
  yield;
  const load = humanLoad(state);
  const ratio = load.available ? load.committed / load.available : 0;
  if (ratio > 0.85) return { lever: 'hire', text: "People's next three days are nearly full. A junior adds hours from tomorrow." };
  // Spare hours are a reason for flyers only when the window already suits the people who come; otherwise the
  // workshop is the answer, and the window says so.
  const unsuited = windowRequests(state).some((r) => r.status === 'waiting' && reactionTo(state, r).kind !== 'buy');
  if (ratio < 0.4 && state.day < 10 && !unsuited) return { lever: 'flyers', text: 'People have time to spare. Flyers bring two more neighbours tomorrow.' };
  return null;
}

export interface LeverOption {
  id: 'overtime' | 'temp' | 'push' | 'ai' | 'hire';
  /** What booking it does. */
  commands: Command[];
  label: string;
  /** Credits it costs (today, or a day for the AI desk and Noor). */
  cost: number;
  /** More buyers taken today than without it, in turn, and what they would pay. */
  n: number;
  value: number;
  /** Queue-order substitutions, including changes that do not increase the total. */
  gained: string[];
  displaced: string[];
  /** The catch, when there is one beyond the cost. */
  note?: string;
}

/**
 * When buyers at the window do not all fit: each way to more hours today, worked through the same forecast as the
 * window, as buyers and credits against its cost. The harsh panel asked for staffing to be a decision on the window,
 * not a menu below the fold.
 */
export function leverOptions(state: CompanyState, open: { ai: boolean; pace: boolean }): LeverOption[] {
  if (state.finished) return [];
  const buyers = windowRequests(state).filter((r) => r.status === 'waiting' && reactionTo(state, r).kind === 'buy');
  if (!buyers.length) return [];
  const without = takenAfter(state, buyers);
  if (without.n === buyers.length) return [];
  const temp = capacityCost(state, 'temp');
  const ai = state.staffing.aiTier;
  const candidates: Omit<LeverOption, 'n' | 'value' | 'gained' | 'displaced'>[] = [
    { id: 'overtime', commands: [{ type: 'overtime' }], label: 'Book overtime', cost: capacityCost(state, 'overtime').total, note: `charged at opening; everyone ${RULES.staff.tiredPercent - 100}% slower tomorrow; no overtime tomorrow` },
    { id: 'temp', commands: [{ type: 'temp' }], label: 'Book a temp', cost: temp.total, note: `${temp.now} cr now${temp.opening ? `, ${temp.opening} cr extra overtime at opening` : ''}; what ${RULES.staff.temp.name} makes is redone ${RULES.staff.temp.reworkPercent / 100} times as often` },
  ];
  if (open.pace && paceOn(state, state.day) === 'steady') candidates.push({ id: 'push', commands: [{ type: 'pace', pace: 'push' }], label: 'Push today', cost: 0, note: `redos ${RULES.pace.push.reworkPercent / 100} times as likely` });
  if (open.ai && ai !== 'duo') {
    const tier = ai === 'none' ? 'solo' : 'duo';
    candidates.push({ id: 'ai', commands: [{ type: 'setStaff', staffing: { aiTier: tier, routing: ai === 'none' ? 'simple' : state.staffing.routing } }], label: ai === 'none' ? 'One AI desk' : 'A second AI desk', cost: aiDailyCost(state, tier) - aiDailyCost(state, ai), note: 'extra each day from today; people still brief and finish its work' });
  }
  // Noor starts tomorrow, so she is judged on a day like today: this morning's studio with her already in it. The
  // panel's players skipped her every evening while the window priced every other way to more hours.
  const j = RULES.staff.junior;
  const canHire = !applyCommand(state, { type: 'hire' }).error;
  if (canHire) candidates.push({ id: 'hire', commands: [{ type: 'hire' }], label: `Hire ${j.name}`, cost: j.dailyCost, note: `on a day like today; she starts tomorrow, ${j.dailyCost} cr each day after` });
  const out: LeverOption[] = [];
  for (const c of candidates) {
    let s = state;
    let ok = true;
    if (c.id === 'hire') {
      s = structuredClone(state);
      s.resources.push({ id: 'what-if', kind: 'human', role: 'junior', name: j.name, speedPercent: j.speedPercent, fromDay: state.day, toDay: null, dailyCost: j.dailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
    } else
      for (const cmd of c.commands) {
        const res = applyCommand(s, cmd);
        if (res.error) ok = false;
        s = res.state;
      }
    if (!ok) continue;
    const w = takenAfter(s, buyers);
    const n = w.n - without.n;
    const gained = w.ids.filter(id => !without.ids.includes(id));
    const displaced = without.ids.filter(id => !w.ids.includes(id));
    if (gained.length) out.push({ ...c, n, value: w.value - without.value, gained, displaced });
  }
  return out.sort((a, b) => b.value - b.cost - (a.value - a.cost));
}

/** How many of these buyers could be taken one after another, in queue order, and what they would pay. */
function takenAfter(state: CompanyState, buyers: Request[]): { n: number; value: number; ids: string[] } {
  const steps = takenAfterSteps(state, buyers);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

function* takenAfterSteps(state: CompanyState, buyers: Request[]): Generator<void, { n: number; value: number; ids: string[] }> {
  let s = state;
  let n = 0;
  let value = 0;
  const ids: string[] = [];
  for (const r of buyers) {
    yield;
    if (!fits(forecast(s, r.id))) continue;
    const x = reactionTo(s, r);
    const res = applyCommand(s, { type: 'accept', requestId: r.id });
    if (res.error) continue;
    s = res.state;
    n++;
    ids.push(r.id);
    if (x.kind === 'buy') value += x.price;
  }
  return { n, value, ids };
}

export function leverResult(state: CompanyState, option: LeverOption): string {
  const names = (ids: string[]) => ids.map(id => castName(state.requests.find(request => request.id === id)!.castId)).join(', ');
  const count = option.n > 0 ? `+${option.n} buyers` : option.n < 0 ? `${option.n} buyers` : 'Same number of buyers';
  return `${count} in queue order. Fits ${names(option.gained)}${option.displaced.length ? `; ${names(option.displaced)} would no longer fit in that order` : ''}. ${option.value >= 0 ? '+' : ''}${option.value} cr in orders${option.note ? `; ${option.note}` : ''}.`;
}
