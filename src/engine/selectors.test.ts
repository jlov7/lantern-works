import { describe, expect, it } from 'vitest';
import { PRESETS, RULES } from './rules';
import { GHOSTS, runPolicy } from './policies';
import { dailyCosts, dayPlan, medalFor, reactionTo, summarize, tonight, windowRequests } from './selectors';
import { applyCommand, createRun, replay, simulateDay } from './sim';
import type { CompanyState } from './types';

describe('tonight', () => {
  it("counts the day's running costs, overtime included, so the day's profit shows before opening", () => {
    const s = createRun({ scenarioId: 'main-street', seed: 'tonight-1' });
    expect(tonight(s).running).toBe(dailyCosts(s).total);
    const late = applyCommand(s, { type: 'overtime' }).state;
    expect(tonight(late).running).toBe(dailyCosts(s).total + RULES.staff.overtimePerPerson * 2);
  });
});

describe("today's plan, hour by hour", () => {
  const carried = () => {
    const config = { scenarioId: 'main-street', seed: 'batch-check-m-0' };
    return replay(config, runPolicy(config, GHOSTS.hand).commands.slice(0, 11)).state;
  };
  function matchesNative(s: CompanyState) {
    const before = structuredClone(s);
    const f = structuredClone(s);
    for (const j of f.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
    simulateDay(f, { forecast: true });
    const plan = dayPlan(s)!;
    for (const lane of plan.lanes) {
      const previous = s.resources.find((r) => r.id === lane.id);
      const next = f.resources.find((r) => r.id === lane.id)!;
      const blocks = plan.blocks.filter((b) => b.resourceId === lane.id).sort((a, b) => a.from - b.from);
      expect(lane.length).toBe(next.shiftMinutes - (previous?.shiftMinutes ?? 0));
      expect(blocks.reduce((sum, b) => sum + b.to - b.from, 0)).toBe(next.busyMinutes - (previous?.busyMinutes ?? 0));
      for (const [i, b] of blocks.entries()) {
        expect(b.from).toBeGreaterThanOrEqual(i ? blocks[i - 1]!.to : 0);
        expect(b.to).toBeLessThanOrEqual(lane.length);
        expect(b.completed).toBe(f.events.slice(s.events.length).some((e) => e.resourceId === b.resourceId &&
          (e.jobId ?? 'kit') === b.jobId && e.stage === b.stage && e.minute === s.minute + b.to &&
          (e.type === 'task_done' || e.type === 'kit_ready')));
      }
    }
    expect(s).toEqual(before);
    return { plan, f };
  }

  it('lays each stretch of work in its lane, within the day, and marks the buyer being looked at as new', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'e2e-1' });
    const buyers = windowRequests(s).filter((r) => reactionTo(s, r).kind === 'buy');
    s = applyCommand(s, { type: 'accept', requestId: buyers[0]!.id }).state;
    const plain = dayPlan(s)!;
    expect(plain.blocks.some((b) => b.isNew)).toBe(false);
    const plan = dayPlan(s, buyers[1]!.id)!;
    expect(plan.blocks.filter((b) => b.isNew).length).toBeGreaterThan(0);
    for (const l of plan.lanes) {
      const mine = plan.blocks.filter((b) => b.resourceId === l.id);
      for (const b of mine) expect(b.from >= 0 && b.to <= l.length && b.from <= b.to).toBe(true);
      expect(mine.reduce((a, b) => a + b.to - b.from, 0)).toBeLessThanOrEqual(l.length);
    }
  });

  it.each(['solo', 'duo'] as const)('shows every available %s AI desk, including idle capacity', (aiTier) => {
    const s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'm1' }), { type: 'setStaff', staffing: { aiTier, routing: 'all' } }).state;
    const { plan } = matchesNative(s);
    expect(plan.lanes.filter((l) => l.kind === 'ai').map((l) => [l.name, l.length])).toEqual(
      Array.from({ length: RULES.ai[aiTier].slots }, (_, i) => [`AI desk ${i + 1}`, RULES.aiShift]),
    );
    expect(plan.lanes.filter((l) => l.kind === 'human').every((l) => l.length === RULES.humanShift)).toBe(true);
    const removed = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } }).state;
    expect(dayPlan(removed)!.lanes.some((l) => l.kind === 'ai')).toBe(false);
  });

  it.each([false, true])('keeps AI production in its named lane, with a known outage: %s', (outage) => {
    let s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'm1' }), { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
    const menu = applyCommand(s, { type: 'setMenu', offers: [PRESETS.launchlet] });
    expect(menu.error).toBeUndefined();
    const taken = applyCommand(menu.state, { type: 'accept', requestId: 'd0-r0' });
    expect(taken.error).toBeUndefined();
    s = taken.state;
    if (outage) s.modifiers.push({ kind: 'outage', day: s.day });
    const { plan } = matchesNative(s);
    expect(plan.lanes.find((l) => l.id === 'ai1')).toMatchObject({ name: 'AI desk 1', length: RULES.aiShift });
    expect(plan.blocks.every((b) => plan.lanes.some((l) => l.id === b.resourceId))).toBe(true);
    expect(plan.blocks.some((b) => b.resourceId === 'ai1' && b.stage === 'produce')).toBe(!outage);
  });

  it('keeps a retiring desk visible while its carried task drains, even after the simulator removes it', () => {
    let s = applyCommand(carried(), { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
    const job = s.jobs.find((j) => j.id === 'c2-l1')!;
    s.resources.find((r) => r.id === job.assignee)!.busyWith = null;
    job.assignee = 'ai1';
    job.remaining = 30;
    s.resources.find((r) => r.id === 'ai1')!.busyWith = job.id;
    s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } }).state;
    const before = structuredClone(s);
    const plan = dayPlan(s)!;
    expect(plan.lanes.find((l) => l.id === 'ai1')).toEqual({ id: 'ai1', name: 'AI desk 1', kind: 'ai', length: RULES.aiShift });
    expect(plan.blocks.find((b) => b.resourceId === 'ai1')).toMatchObject({ jobId: job.id, stage: 'produce', from: 0, to: 30, completed: true });
    const f = structuredClone(s);
    simulateDay(f, { forecast: true });
    expect(f.resources.some((r) => r.id === 'ai1')).toBe(false);
    expect(s).toEqual(before);
  });

  it('includes carried production even when its native task start was yesterday', () => {
    const { plan, f } = matchesNative(carried());
    expect(plan.blocks.filter((b) => b.resourceId === 'h1')).toEqual([
      { resourceId: 'h1', jobId: 'c2-l1', stage: 'produce', from: 0, to: 315, isNew: false, completed: true },
      { resourceId: 'h1', jobId: 'c2-l1', stage: 'finish', from: 315, to: 360, isNew: false, completed: false },
    ]);
    expect(f.events).toContainEqual({ day: 1, minute: 795, type: 'task_done', jobId: 'c2-l1', resourceId: 'h1', stage: 'produce' });
    expect(f.events.some((e) => e.day === 1 && e.type === 'task_start' && e.jobId === 'c2-l1' && e.stage === 'produce')).toBe(false);
  });

  it('uses native absence, temp expiry, future availability and overtime shift boundaries', () => {
    const absent = carried();
    absent.modifiers.push({ kind: 'absent', who: 'h1', day: absent.day, paid: true });
    absent.resources.push({ ...absent.resources[0]!, id: 'future', busyWith: null, fromDay: absent.day + 1 });
    const { plan } = matchesNative(absent);
    expect(plan.lanes.some((l) => l.id === 'h1' || l.id === 'future')).toBe(false);
    expect(plan.blocks.some((b) => b.jobId === 'c2-l1' && b.resourceId === 'h2' && b.from === 0)).toBe(true);
    const temp = applyCommand(carried(), { type: 'temp' }).state;
    const today = matchesNative(temp);
    expect(today.plan.lanes.find((l) => l.id === 't1')!.length).toBe(RULES.humanShift);
    expect(matchesNative(today.f).plan.lanes.some((l) => l.id === 't1')).toBe(false);
    const first = applyCommand(createRun({ scenarioId: 'main-street', seed: 'e2e-1' }), { type: 'accept', requestId: 'd0-r1' }).state;
    const late = applyCommand(first, { type: 'overtime' });
    expect(late.error).toBeUndefined();
    expect(matchesNative(late.state).plan.lanes.every((l) => l.length === RULES.aiShift)).toBe(true);
  });

  it('uses a known morning default and carries kit work and already-known rework', () => {
    const ill = carried();
    ill.news.push({ id: 'known-cold', day: ill.day, card: 'ill', choice: null });
    expect(matchesNative(ill).plan.lanes.some((l) => l.id === 'h2')).toBe(false);
    const kit = carried();
    kit.resources[0]!.busyWith = 'kit';
    kit.jobs.find((j) => j.id === 'c2-l1')!.assignee = null;
    kit.kit = { status: 'building', remaining: 75, assignee: 'h1' };
    expect(matchesNative(kit).plan.blocks[0]).toMatchObject({ resourceId: 'h1', jobId: 'kit', stage: 'kit', from: 0, to: 75 });
    const rework = carried();
    const job = rework.jobs.find((j) => j.id === 'c2-l1')!;
    job.stage = 'rework';
    job.reworkFlag = true;
    expect(matchesNative(rework).plan.blocks[0]).toMatchObject({ jobId: job.id, stage: 'rework', from: 0, to: 315 });
  });
});

describe('medals', () => {
  it('give silver and gold only to a season in profit; a loss caps the medal at bronze', () => {
    // Handmade Lantern on this seed: silver, with a profit.
    const s = runPolicy({ scenarioId: 'main-street', seed: 'panel-2' }, GHOSTS.hand);
    expect(medalFor(s).medal).toBe('silver');
    // The same season with a large one-off cost on the books: still solvent, now at a loss.
    const loss = structuredClone(s);
    const cost = summarize(s).operatingResult + 1;
    loss.journal.push({ day: 11, minute: 0, kind: 'news', cash: -cost, unearned: 0, revenue: 0, ref: 'test', note: 'test' });
    expect(summarize(loss).operatingResult).toBeLessThan(0);
    loss.cash = 1;
    expect(medalFor(loss).medal).toBe('bronze');
    expect(medalFor(loss).reason).toMatch(/silver and gold need a profit/);
  });
});
