import { describe, expect, it } from 'vitest';
import { RULES } from '../../engine/rules';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { statsAt, statsOf } from './live';

function apply(s: CompanyState, command: Command): CompanyState {
  const result = applyCommand(s, command);
  if (result.error) throw new Error(result.error);
  return result.state;
}

/** A cold, ordinary command log: accept the bank's offer when it arrives, otherwise sell nothing. */
function loanSeason() {
  let s = createRun({ scenarioId: 'main-street', seed: 'financial-counters-loan-0' });
  let borrowing: { before: CompanyState; after: CompanyState } | undefined;
  let last: { before: CompanyState; after: CompanyState } | undefined;
  while (!s.finished) {
    const news = s.news.find((n) => n.day === s.day && n.choice === null);
    if (news) {
      const before = s;
      s = apply(s, { type: 'choose', newsId: news.id, option: news.card === 'loan' ? 1 : 0 });
      if (news.card === 'loan') borrowing = { before, after: s };
    }
    const before = s;
    s = apply(s, { type: 'runDay' });
    if (before.day === RULES.days - 1) last = { before, after: s };
  }
  if (!borrowing || !last) throw new Error('The cold fixture must borrow and repay');
  return { borrowing, last, season: s };
}

describe('live operating result excludes financing principal', () => {
  const { borrowing, last, season } = loanSeason();

  it('does not classify the ordinary bank receipt as earned profit', () => {
    expect(borrowing.after.journal.slice(borrowing.before.journal.length)).toMatchObject([{ kind: 'loan', cash: 2000, revenue: 0, unearned: 0 }]);
    const live = statsAt(borrowing.before, borrowing.after, borrowing.before.minute);
    expect(live.cash).toBe(borrowing.before.cash + 2000);
    expect(live.profit).toBe(statsOf(borrowing.before).profit);
    expect(live.owed).toBe(borrowing.before.unearned);
  });

  it('shows the ordinary Day 12 repayment as cash out, with only interest and running costs reducing profit', () => {
    const entries = last.after.journal.slice(last.before.journal.length);
    expect(entries.filter((e) => e.kind === 'loan')).toMatchObject([{ cash: -2000, revenue: 0, unearned: 0 }]);
    expect(entries.filter((e) => e.kind === 'interest')).toMatchObject([{ cash: -300, revenue: 0, unearned: 0 }]);
    const running = entries.filter((e) => e.kind === 'wages' || e.kind === 'shop' || e.kind === 'ai').reduce((n, e) => n + e.cash, 0);
    expect(running).toBe(-1100);
    const start = last.before.minute;
    for (const offset of [0, 1, 240, RULES.minutesPerDay - 1]) {
      const live = statsAt(last.before, last.after, start + offset);
      expect(live.cash).toBe(last.before.cash - 2000 - 300 + running);
      expect(live.profit).toBe(statsOf(last.before).profit - 300 + running);
      expect(live.profit).toBe(statsOf(last.after).profit);
      expect(live.owed).toBe(last.before.unearned);
    }
    expect(statsAt(last.before, last.after, start + RULES.minutesPerDay)).toEqual(statsOf(last.after));
    const rebuilt = replay(season.config, season.commands);
    expect(rebuilt.errors).toEqual([]);
    expect(rebuilt.state).toEqual(season);
  });
});

it('ticks ordinary paid, earned and running-cost figures at their actual clock minutes', () => {
  let before = createRun({ scenarioId: 'main-street', seed: 'financial-counters-earn-0' }, LEGACY_RULES_VERSION);
  before = apply(before, { type: 'accept', requestId: 'd0-r0' });
  expect(before.cash).toBe(3900);
  expect(before.unearned).toBe(900);
  expect(before.revenue).toBe(0);
  const after = apply(before, { type: 'runDay' });
  expect(after.jobs[0]).toMatchObject({ status: 'delivered', deliveredAt: 333, allocation: 900 });
  expect(statsAt(before, after, -1)).toMatchObject({ cash: 3900, owed: 900, profit: 0, served: 0 });
  expect(statsAt(before, after, 0)).toMatchObject({ cash: 2980, owed: 900, profit: -920, served: 0 });
  expect(statsAt(before, after, 332)).toMatchObject({ cash: 2980, owed: 900, profit: -920, served: 0 });
  expect(statsAt(before, after, 333)).toMatchObject({ cash: 2980, owed: 0, profit: -20, served: 1 });
  expect(statsAt(before, after, 480)).toEqual(statsOf(after));
  const rebuilt = replay(before.config, after.commands, LEGACY_RULES_VERSION);
  expect(rebuilt.errors).toEqual([]);
  expect(rebuilt.state).toEqual(after);
});
