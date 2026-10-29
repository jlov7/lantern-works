import fc from 'fast-check';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allocate, react, validateOffer } from './demand';
import { GHOSTS, runPolicy } from './policies';
import { PRESETS, RULES } from './rules';
import { forecast, summarize, windowRequests } from './selectors';
import { applyCommand, createRun, getScenario, replay } from './sim';
import type { Command, CompanyState, Job, OfferSpec, RunConfig } from './types';

const CFG: RunConfig = { scenarioId: 'main-street', seed: 'test-1' };
const DAY = RULES.minutesPerDay;

function apply(s: CompanyState, cmd: Command): CompanyState {
  const r = applyCommand(s, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
}

/** A run with one hand-placed buyer so unit assertions don't depend on the tape. */
function withBuyer(menu: OfferSpec[], need: 'simple' | 'nuanced' = 'simple', segment: 'small' | 'moment' | 'careful' | 'rush' = 'moment'): CompanyState {
  const s = createRun(CFG);
  s.menu = menu;
  s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment, need, wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
  return s;
}

function ledgerHolds(s: CompanyState): void {
  const by = (k: string) => s.journal.filter((e) => e.kind === k).reduce((a, e) => a + e.cash, 0);
  expect(s.cash).toBe(RULES.initialCash + s.journal.reduce((a, e) => a + e.cash, 0));
  expect(by('earn')).toBe(0);
  const receipts = by('receipt');
  const refunds = -by('refund');
  expect(s.unearned).toBe(receipts - refunds - s.revenue);
  expect(s.unearned).toBeGreaterThanOrEqual(0);
  const open = s.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled').reduce((a, j) => a + j.allocation, 0);
  expect(s.unearned).toBe(open);
}

describe('money', () => {
  it('payment up front is cash and a liability, not revenue', () => {
    let s = withBuyer([{ ...PRESETS.club, price: 900 }], 'simple', 'small');
    s = apply(s, { type: 'accept', requestId: 'x' });
    expect(s.cash).toBe(RULES.initialCash + 900);
    expect(s.unearned).toBe(900);
    expect(s.revenue).toBe(0);
    ledgerHolds(s);
  });

  it('delivery earns the allocation without taking cash again', () => {
    let s = withBuyer([PRESETS.bespoke]);
    s = apply(s, { type: 'accept', requestId: 'x' });
    const cashBefore = s.cash;
    while (s.jobs[0]!.status !== 'delivered') s = apply(s, { type: 'runDay' });
    const costs = s.journal.filter((e) => ['wages', 'shop', 'ai'].includes(e.kind)).reduce((a, e) => a + e.cash, 0);
    expect(s.cash).toBe(cashBefore + costs);
    expect(s.revenue).toBe(900);
    expect(s.unearned).toBe(0);
    ledgerHolds(s);
  });

  it('allocations sum exactly and put the remainder on the last launch', () => {
    expect(allocate(961, 3)).toEqual([320, 320, 321]);
    fc.assert(fc.property(fc.integer({ min: 5, max: 500 }), fc.integer({ min: 1, max: 4 }), (p, n) => allocate(p * 10, n).reduce((a, b) => a + b, 0) === p * 10));
  });

  it('a missed deadline refunds the allocation, charges the fee once, and loses the neighbour', () => {
    // A nuanced bespoke job with a 1-day turnaround cannot be finished by two humans in one day (60+300+40 > 360).
    let s = withBuyer([{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }], 'nuanced');
    s = apply(s, { type: 'accept', requestId: 'x' });
    s = apply(s, { type: 'runDay' });
    const j = s.jobs[0]!;
    expect(j.status).toBe('missed');
    expect(s.journal.filter((e) => e.kind === 'refund').map((e) => e.cash)).toEqual([-500]);
    expect(s.journal.filter((e) => e.kind === 'fee').map((e) => e.cash)).toEqual([-Math.floor((500 * RULES.missedFeePercent) / 100)]);
    expect(s.lostCast).toContain('eli');
    expect(s.resources.every((r) => r.busyWith !== j.id)).toBe(true);
    ledgerHolds(s);
    // Running more days never delivers it or refunds it again.
    while (!s.finished) s = apply(s, { type: 'runDay' });
    expect(s.jobs[0]!.status).toBe('missed');
    expect(s.journal.filter((e) => e.ref === j.id && e.kind === 'refund')).toHaveLength(1);
    expect(s.revenue).toBe(0);
  });

  it('launches past the season end are refunded without a fee', () => {
    let s = createRun(CFG);
    for (let d = 0; d < 10; d++) s = apply(s, { type: 'runDay' });
    s.menu = [{ ...PRESETS.club, spacingDays: 4 }];
    s.requests.push({ id: 'late', day: s.day, index: 99, castId: 'mara', segment: 'small', need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' });
    s = apply(s, { type: 'accept', requestId: 'late' });
    while (!s.finished) s = apply(s, { type: 'runDay' });
    const jobs = s.jobs.filter((j) => j.contractId === s.contracts[0]!.id);
    expect(jobs.filter((j) => j.status === 'refunded').length).toBe(2);
    expect(s.journal.filter((e) => e.kind === 'fee')).toHaveLength(0);
    expect(s.unearned).toBe(0);
    ledgerHolds(s);
  });

  it('negative cash is shown as negative, never clamped', () => {
    let s = createRun(CFG);
    while (!s.finished) s = apply(s, { type: 'runDay' });
    // Street news defaults can give someone unpaid days off (Ada trying out at Bright Lantern).
    const unpaid = s.modifiers.filter((m) => m.kind === 'absent' && !m.paid).length;
    // Serving nobody fails the rent review: the rent rises from its morning to the end.
    const risen = (RULES.days - getScenario(CFG.scenarioId).review.day) * RULES.rentRise;
    expect(s.cash).toBe(RULES.initialCash - RULES.days * (2 * RULES.humanDailyCost + RULES.shopDailyCost) - risen + unpaid * RULES.humanDailyCost);
    expect(s.cash).toBeLessThan(0);
  });
});

describe('time and capacity', () => {
  it('human work pauses at the end of the shift and resumes next morning', () => {
    let s = withBuyer([PRESETS.bespoke], 'nuanced');
    s = apply(s, { type: 'accept', requestId: 'x' });
    s = apply(s, { type: 'runDay' });
    const j = s.jobs[0]!;
    // One person briefs then makes it; whatever doesn't fit in the shift carries over to the next morning.
    const over = RULES.effort.brief + Math.ceil(RULES.effort.produce.human.nuanced * RULES.makers.h1!.producePercent / 100) - RULES.humanShift;
    expect(over).toBeGreaterThan(0);
    expect(j.stage).toBe('produce');
    expect(j.assignee).toBe('h1');
    expect(j.remaining).toBe(over);
    s = apply(s, { type: 'runDay' });
    expect(s.jobs[0]!.status).toBe('delivered');
    expect(s.jobs[0]!.deliveredAt).toBe(DAY + over + RULES.effort.finish);
  });

  it('a task that runs past closing finishes the next morning with its remaining effort', () => {
    let s = withBuyer([PRESETS.bespoke], 'nuanced');
    s = apply(s, { type: 'accept', requestId: 'x' });
    const j = s.jobs[0]!;
    Object.assign(j, { stage: 'produce', assignee: 'h1', method: 'human', remaining: RULES.humanShift + 40 });
    s.resources.find((r) => r.id === 'h1')!.busyWith = j.id;
    s = apply(s, { type: 'runDay' });
    expect(s.jobs[0]!.remaining).toBe(40);
    s = apply(s, { type: 'runDay' });
    const done = s.events.find((e) => e.type === 'task_done' && e.stage === 'produce')!;
    expect(done.minute).toBe(DAY + 40);
  });

  it('no resource ever holds two tasks and no human works outside the shift', () => {
    const s = runPolicy({ scenarioId: 'festival-week', seed: '3' }, { ...GHOSTS.faster, accept: 'all' });
    const starts = s.events.filter((e) => e.type === 'task_start' && e.resourceId?.startsWith('h'));
    for (const e of starts) expect(e.minute % DAY).toBeLessThan(RULES.humanShift);
    const holders = new Map<string, string>();
    for (const e of s.events) {
      if (e.type === 'task_start') {
        // Someone off for the day puts their task down without an event; a colleague picking it up is the handover,
        // and the same person picking it up again on their return is a resume.
        for (const [r, j] of holders) if (j === (e.jobId ?? 'kit')) holders.delete(r);
        expect(holders.has(e.resourceId!)).toBe(false);
        holders.set(e.resourceId!, e.jobId ?? 'kit');
      }
      if (e.type === 'task_done' || e.type === 'kit_ready') holders.delete(e.resourceId!);
      if (e.type === 'missed' || e.type === 'refunded_horizon') for (const [r, j] of holders) if (j === e.jobId) holders.delete(r);
    }
  });

  it('the template kit costs real human time before it speeds anything up', () => {
    let s = withBuyer([PRESETS.launchlet], 'simple', 'small');
    s = apply(s, { type: 'accept', requestId: 'x' });
    expect(s.kit.status).toBe('queued');
    s = apply(s, { type: 'runDay' });
    const kitStart = s.events.find((e) => e.type === 'task_start' && e.stage === 'kit')!;
    const kitDone = s.events.find((e) => e.type === 'kit_ready')!;
    expect(kitDone.minute - kitStart.minute).toBe(RULES.effort.kitSetup);
  });

  it('a completion exactly at the deadline counts as on time', () => {
    // AI desk works to minute 480; a same-day launch whose last task ends at 480 is delivered.
    let s = withBuyer([{ ...PRESETS.launchlet, style: 'custom' }], 'simple', 'rush');
    s = apply(s, { type: 'accept', requestId: 'x' });
    s = apply(s, { type: 'runDay' });
    const j = s.jobs[0]!;
    expect(j.dueAt).toBe(DAY);
    expect(j.status).toBe('delivered');
    expect(j.deliveredAt!).toBeLessThanOrEqual(j.dueAt);
  });

  it('downgrading the AI desk lets a busy slot finish but take no new work, at no cost', () => {
    let s = createRun({ scenarioId: 'main-street', seed: '7' });
    s = apply(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } });
    s.menu = [PRESETS.bespoke];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    s = apply(s, { type: 'accept', requestId: 'x' });
    // Stop the AI slot mid-task by hand so it is holding work overnight.
    s.jobs[0]!.stage = 'produce';
    s.resources.find((r) => r.kind === 'ai')!.busyWith = s.jobs[0]!.id;
    s.jobs[0]!.assignee = 'ai1';
    s.jobs[0]!.method = 'ai';
    s.jobs[0]!.remaining = 10;
    s = apply(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } });
    expect(s.resources.find((r) => r.id === 'ai1')!.retired).toBe(true);
    s = apply(s, { type: 'runDay' });
    expect(s.journal.filter((e) => e.kind === 'ai')).toHaveLength(0);
    expect(s.resources.some((r) => r.kind === 'ai')).toBe(false);
    expect(s.events.filter((e) => e.type === 'task_start' && e.resourceId === 'ai1')).toHaveLength(0);
  });
});

describe('offers and demand', () => {
  it('templated offers cannot take nuanced work', () => {
    expect(validateOffer({ ...PRESETS.launchlet, scope: 'any' })).toMatch(/simple/);
  });

  it('a nuanced brief will not buy a simple-only offer, and accept is rejected without side effects', () => {
    const s = withBuyer([PRESETS.launchlet], 'nuanced');
    expect(react(s.requests[0]!, s.menu, []).kind).toBe('walk');
    const r = applyCommand(s, { type: 'accept', requestId: 'x' });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });

  it('changing the window never reprices or reschedules promises already made', () => {
    let s = withBuyer([PRESETS.bespoke]);
    s = apply(s, { type: 'accept', requestId: 'x' });
    s = apply(s, { type: 'runDay' });
    const before = structuredClone(s.jobs.map(({ dueAt, allocation, releaseDay }) => ({ dueAt, allocation, releaseDay })));
    s = apply(s, { type: 'setMenu', offers: [{ ...PRESETS.club, price: 2000 }] });
    expect(s.jobs.map(({ dueAt, allocation, releaseDay }) => ({ dueAt, allocation, releaseDay }))).toEqual(before);
    expect(s.contracts[0]!.price).toBe(900);
  });

  it('a neighbour you let down will not buy again', () => {
    const r = react({ castId: 'mara', segment: 'small', need: 'simple', wtpPercent: 115 }, [PRESETS.launchlet], ['mara']);
    expect(r).toMatchObject({ kind: 'walk', reason: 'lost' });
  });
});

describe('determinism and honesty', () => {
  it('replaying the same commands reproduces the run exactly', () => {
    const s = runPolicy(CFG, GHOSTS.faster);
    const again = replay(CFG, s.commands);
    expect(again.errors).toEqual([]);
    expect(again.state).toEqual(s);
  });

  it('identical policies give identical results; ghosts start on the same street', () => {
    expect(summarize(runPolicy(CFG, GHOSTS.old))).toEqual(summarize(runPolicy(CFG, GHOSTS.old)));
    const a = runPolicy(CFG, GHOSTS.old);
    const b = runPolicy(CFG, GHOSTS.faster);
    const day0 = (x: CompanyState) => x.requests.filter((r) => r.day === 0).map((r) => [r.castId, r.need, r.wtpPercent]);
    expect(day0(a)).toEqual(day0(b));
  });

  it('rejected commands change nothing', () => {
    const s = createRun(CFG);
    for (const cmd of [
      { type: 'accept', requestId: 'nope' },
      { type: 'setMenu', offers: [] },
      { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 905 }] },
      { type: 'setStaff', staffing: { aiTier: 'none', routing: 'all' } },
      { type: 'bogus' },
    ] as Command[]) {
      const r = applyCommand(s, cmd);
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
      expect(s.revision).toBe(0);
    }
  });

  it('the forecast never reveals hidden rework or future arrivals', () => {
    let s = runPolicy({ scenarioId: 'bespoke-rush', seed: '2' }, GHOSTS.faster);
    s = replay(s.config, s.commands.slice(0, 20)).state;
    const flagged = s.jobs.find((j) => j.reworkFlag && j.stage === 'finish');
    const f = forecast(s);
    if (flagged) expect(f.atRisk).not.toContain(flagged.id);
    expect(s.requests.every((r) => r.day <= s.day)).toBe(true);
  });

  it('ledger identities hold at every step of random play', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 5, maxLength: 60 }), fc.constantFrom('main-street', 'festival-week', 'bespoke-rush'), (moves, scenarioId) => {
        let s = createRun({ scenarioId, seed: moves.join('') });
        const menus = [[PRESETS.bespoke], [PRESETS.bespoke, PRESETS.club], [PRESETS.launchlet, PRESETS.club]];
        for (const m of moves) {
          if (s.finished) break;
          const waiting = windowRequests(s).filter((r) => r.status === 'waiting');
          let cmd: Command;
          if (m < 4 && waiting.length) cmd = { type: 'accept', requestId: waiting[0]!.id };
          else if (m === 4 && waiting.length) cmd = { type: 'decline', requestId: waiting[0]!.id };
          else if (m === 5) cmd = { type: 'setMenu', offers: menus[s.revision % 3]! };
          else if (m === 6) cmd = { type: 'setStaff', staffing: { aiTier: (['none', 'solo', 'duo'] as const)[s.revision % 3]!, routing: s.revision % 3 === 0 ? 'human' : 'all' } };
          else cmd = { type: 'runDay' };
          s = applyCommand(s, cmd).state;
          ledgerHolds(s);
          const busy = s.resources.map((r) => r.busyWith).filter((x): x is string => x !== null && x !== 'kit');
          expect(new Set(busy).size).toBe(busy.length);
          for (const j of s.jobs as Job[]) if (['delivered', 'missed', 'refunded'].includes(j.status)) expect(j.assignee).toBeNull();
        }
      }),
      { numRuns: 120 },
    );
  });

  it('the engine has no UI, DOM or randomness dependencies', () => {
    const dir = join(import.meta.dirname);
    for (const f of readdirSync(dir).filter((x: string) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from 'react'|\bdocument\.\w|\bwindow\.\w|Math\.random|Date\.now|localStorage/);
    }
  });
});

describe('review regressions', () => {
  it('the sign cannot be repainted once the morning has started serving, so prices cannot be tailored per neighbour', () => {
    let s = withBuyer([PRESETS.bespoke]);
    s = apply(s, { type: 'accept', requestId: 'x' });
    const r = applyCommand(s, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 1200 }] });
    expect(r.error).toMatch(/sign is up/);
    expect(r.state).toBe(s);
  });

  it('removing an idle AI desk keeps its history in the season totals', () => {
    let s = createRun({ scenarioId: 'main-street', seed: '9' });
    s = apply(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } });
    s = apply(s, { type: 'setMenu', offers: [PRESETS.bespoke] });
    for (const r of windowRequests(s)) s = applyCommand(s, { type: 'accept', requestId: r.id }).state;
    s = apply(s, { type: 'runDay' });
    const before = summarize(s).aiUtil;
    expect(before).toBeGreaterThan(0);
    if (s.resources.some((r) => r.kind === 'ai' && r.busyWith)) s.resources.find((r) => r.kind === 'ai')!.busyWith = null;
    s = apply(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } });
    expect(summarize(s).aiUtil).toBe(before);
  });

  it('events and entries at the closing minute belong to the day that is closing', () => {
    let s = withBuyer([{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }], 'nuanced');
    s = apply(s, { type: 'accept', requestId: 'x' });
    s = apply(s, { type: 'runDay' });
    const missed = s.events.find((e) => e.type === 'missed')!;
    expect(missed.minute).toBe(DAY);
    expect(missed.day).toBe(0);
    expect(s.journal.filter((e) => e.kind === 'refund' || e.kind === 'fee').every((e) => e.day === 0)).toBe(true);
    while (!s.finished) s = apply(s, { type: 'runDay' });
    expect(s.events.filter((e) => e.type === 'refunded_horizon').every((e) => e.day === RULES.days - 1)).toBe(true);
  });
});

describe('playtest regressions', () => {
  it('the forecast says when a late sale cannot ship before the season ends', () => {
    let s = createRun(CFG);
    for (let d = 0; d < RULES.days - 1; d++) s = apply(s, { type: 'runDay' });
    s.menu = [PRESETS.bespoke];
    s.requests.push({ id: 'late', day: s.day, index: 99, castId: 'nell', segment: 'careful', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' });
    // Fill both people's last day so the new job cannot finish.
    for (const id of ['h1', 'h2']) {
      s.requests.push({ id: `fill-${id}`, day: s.day, index: 98, castId: 'hugo', segment: 'careful', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' });
      s = apply(s, { type: 'accept', requestId: `fill-${id}` });
    }
    const f = forecast(s, 'late');
    expect(f.newAfterSeason).toEqual([`c${s.contracts.length + 1}-l1`]);
  });

  it('two offers on the window cannot share a name', () => {
    const s = createRun(CFG);
    const r = applyCommand(s, { type: 'setMenu', offers: [PRESETS.bespoke, { ...PRESETS.launchlet, name: 'bespoke launch' }] });
    expect(r.error).toMatch(/different names/);
  });

  it('no neighbour appears twice in one morning when the cast can cover the day', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const day = createRun({ scenarioId: 'main-street', seed: String(seed) }).requests;
      expect(new Set(day.map((r) => r.castId)).size).toBe(day.length);
    }
  });
});
