// What the top bar and the live region show at a minute of a day being played: the engine's numbers, read from the
// day's journal and events up to that minute, so the counters tick with the miniature and never run ahead of it.
import { RULES } from '../../engine/rules';
import { dailyCosts, runwayDays, summarize } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';

export interface Stats {
  cash: number;
  owed: number;
  served: number;
  /** Operating result so far: earned revenue minus every cost. */
  profit: number;
  delivered: number;
  missed: number;
  kept: number | null;
  runway: number;
}

export function statsOf(s: CompanyState): Stats {
  const sum = summarize(s);
  return { cash: sum.cash, owed: sum.unearned, served: sum.served, profit: sum.operatingResult, delivered: sum.delivered, missed: sum.missed, kept: sum.promisesKept, runway: runwayDays(s) };
}

/** Stats at absolute minute `t` of the day that turned `before` into `after`. */
export function statsAt(before: CompanyState, after: CompanyState, t: number): Stats {
  if (t >= before.minute + RULES.minutesPerDay) return statsOf(after);
  let cash = before.cash;
  let owed = before.unearned;
  let principal = 0;
  for (let i = before.journal.length; i < after.journal.length; i++) {
    const e = after.journal[i]!;
    if (e.minute > t) break;
    cash += e.cash;
    owed += e.unearned;
    if (e.kind === 'loan') principal += e.cash;
  }
  const deliveredBy = (id: string) => {
    const j = after.jobs.find((x) => x.id === id);
    return !!j && j.status === 'delivered' && j.deliveredAt !== null && j.deliveredAt <= t;
  };
  const served = after.contracts.filter((c) => c.jobIds.every(deliveredBy)).length;
  const delivered = after.jobs.filter((j) => deliveredBy(j.id)).length;
  // Misses land at the close of a day, so mid-day they are still this morning's.
  const missed = before.jobs.filter((j) => j.status === 'missed').length;
  const c = dailyCosts(before).total;
  // Cash less what is still owed moves with operating result, excluding borrowing and repayment of principal.
  const b = summarize(before);
  return {
    cash,
    owed,
    served,
    profit: b.operatingResult + (cash - owed) - (before.cash - before.unearned) - principal,
    delivered,
    missed,
    kept: delivered + missed === 0 ? null : delivered / (delivered + missed),
    runway: c <= 0 ? Infinity : Math.floor(Math.max(0, cash) / c),
  };
}

/** One short line for the screen-reader digest at a minute of the day. */
export function digestAt(before: CompanyState, after: CompanyState, t: number, clock: string): string {
  const a = statsAt(before, after, t);
  const b = statsOf(before);
  const got = a.delivered - b.delivered;
  return `${clock}. ${got === 0 ? 'Nothing delivered yet today' : `${got} launch${got === 1 ? '' : 'es'} delivered today`}. Served ${a.served}.`;
}
