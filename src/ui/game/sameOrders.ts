// Plain buyers who want the same thing on the same terms, all clear, fold into one row from the second morning:
// the harsh panel read a window of eight identical Launchlet cards as a wall of text.
import { GOALS } from '../../engine/goals';
import { fits, fitsWithRedo, reactionTo, windowRequests, workFor, type Forecast } from '../../engine/selectors';
import type { CompanyState, Request } from '../../engine/types';

/** Groups of two or more interchangeable buyers (walk-ins, word of mouth or flyers), keyed by offer, price and work; the one being looked at stays out. */
export function sameOrders(state: CompanyState, forecasts: Map<string, Forecast>, selected: string | null): Map<string, Request[]> {
  const out = new Map<string, Request[]>();
  if (state.day === 0) return out;
  const goals = GOALS[state.config.scenarioId] ?? [];
  for (const r of windowRequests(state)) {
    if (r.status !== 'waiting') continue;
    const x = reactionTo(state, r);
    const f = forecasts.get(r.id);
    if (x.kind !== 'buy' || (r.source !== 'walkin' && r.source !== 'word' && r.source !== 'flyer') || r.offer || r.need !== 'simple' || r.id === selected || !f || !fits(f)) continue;
    if (state.contracts.some((c) => c.castId === r.castId) || !fitsWithRedo(state, r.id)) continue;
    const w = workFor(state, r.id);
    if (!w) continue;
    // Buyers who count toward an open goal group only with each other, so the row can name the goal.
    const goal = goals.find((g) => g.counts?.(r) && !g.met(state))?.id ?? '';
    const key = `${x.offerIndex}|${x.offer.price}|${w.firstDue}|${w.first}|${w.launches}|${goal}`;
    out.set(key, [...(out.get(key) ?? []), r]);
  }
  return new Map([...out].filter(([, rs]) => rs.length >= 2));
}

/** The dearer offer on the window a buyer would also have paid for, when they pick a cheaper one. */
export function wouldPayMore(state: CompanyState, r: Request): { name: string; price: number } | null {
  const x = reactionTo(state, r);
  if (x.kind !== 'buy' || x.offerIndex < 0) return null;
  let other: { name: string; price: number } | null = null;
  for (const v of x.valuations) {
    const o = state.menu[v.offerIndex];
    if (v.offerIndex !== x.offerIndex && v.blocker === null && o && o.price > x.price && (!other || o.price > other.price)) other = { name: o.name, price: o.price };
  }
  return other;
}
