import { describe, expect, it } from 'vitest';
import { buildContinuation } from './continuation';
import { projectBrief } from './projects';
import { applyCommand, createRun, mentoringBlocked, simulateDay, stageEffort } from './sim';
import { dayPlan, humanLoad, summarize, tonight } from './selectors';
import { patternMatches, patternReduction, preparePatternBlocked, teachPatternBlocked } from './patterns';
import { PRESETS, RULES } from './rules';
import type { CompanyState, Job, Request } from './types';

function delivered(): CompanyState {
  let s = createRun({ scenarioId: 'main-street', seed: 'pattern-test' });
  s.requests = [];
  const req: Request = { id: 'first', day: 0, index: 0, castId: 'clem', segment: 'moment', need: 'simple', wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'walkin', offer: { ...PRESETS.bespoke, price: 400, turnaroundDays: 3 } };
  s.requests.push(req);
  s = applyCommand(s, { type: 'accept', requestId: req.id }).state;
  simulateDay(s, { forecast: true }); simulateDay(s, { forecast: true });
  const design = projectBrief(s, 'clem-ten', 'new-band').defaultDesign;
  s = applyCommand(s, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design }).state;
  simulateDay(s, { forecast: true }); simulateDay(s, { forecast: true });
  s.cash = 5000;
  s.news = [];
  return s;
}
function patternAndJob(): { state: CompanyState; job: Job } {
  const s = delivered();
  const original = s.jobs.find(j => s.contracts.find(c => c.id === j.contractId)?.project)!;
  const job: Job = { ...original, id: 'next-piece', status: 'active', stage: 'brief', remaining: 0, assignee: null, deliveredAt: null };
  s.jobs.push(job);
  return { state: s, job };
}

describe('patterns are paid and scheduled work', () => {
  it('costs50 and60 Tomas minutes; no benefit until ready, or for a different design', () => {
    const { state, job } = patternAndJob();
    const sourceId = state.jobs.find(j => j.status === 'delivered' && j.contractId === job.contractId)!.id;
    const cash = state.cash;
    let s = applyCommand(state, { type: 'preparePattern', sourceId }).state;
    expect(s.cash).toBe(cash - 50);
    expect(summarize(s).other - summarize(state).other).toBe(50);
    const tomas = s.resources.find(r => r.id === 'h2')!;
    expect(patternReduction(s, job, tomas, s.day)).toBe(0);
    const load = humanLoad(s);
    expect(load.committed - humanLoad(state).committed).toBe(60);
    const plan = dayPlan(s)!;
    expect(plan.blocks.find(b => b.stage === 'pattern')).toMatchObject({ resourceId: 'h2', from: 0, to: 60, completed: true });
    const base = stageEffort(s, job, 'human');
    const forecast = structuredClone(s);
    simulateDay(forecast, { forecast: true });
    expect(forecast.events.find(e => e.type === 'task_done' && e.jobId === job.id && e.stage === 'brief')!.minute - state.day * 480).toBe(75);
    expect(forecast.patterns![0]!.status).toBe('ready');
    expect(forecast.resources.find(r => r.id === 'h2')!.busyMinutes).toBeGreaterThanOrEqual(60);
    s = forecast;
    const afterReady = structuredClone(s);
    afterReady.jobs.push({ ...job, id: 'ready-brief', status: 'active', stage: 'brief', remaining: 0, assignee: null, deliveredAt: null, allocation: 0 });
    simulateDay(afterReady, { forecast: true });
    const briefStart = afterReady.events.find(e => e.type === 'task_start' && e.jobId === 'ready-brief' && e.stage === 'brief')!;
    const briefDone = afterReady.events.find(e => e.type === 'task_done' && e.jobId === 'ready-brief' && e.stage === 'brief')!;
    expect(briefDone.minute - briefStart.minute).toBe(60);
    expect(patternReduction(s, { ...job, stage: 'brief' }, tomas, s.day)).toBe(15);
    expect(stageEffort(s, job, 'human')).toBe(base);
    expect(patternReduction(s, { ...job, stage: 'finish' }, tomas, s.day)).toBe(0);
    expect(patternReduction(s, { ...job, stage: 'rework' }, tomas, s.day)).toBe(0);
    const design = s.contracts.find(c => c.id === job.contractId)!.project!.proof!.design.pieces[0]!;
    design.headline = 'Another Thursday';
    expect(patternReduction(s, { ...job, stage: 'brief' }, tomas, s.day)).toBe(15);
    design.palette = 'river';
    expect(patternReduction(s, { ...job, stage: 'brief' }, tomas, s.day)).toBe(0);
    expect(preparePatternBlocked(s, sourceId)).toContain('already');
  });

  it('matches composition precisely, permits new copy and preserves all production charges', () => {
    const s = delivered();
    const design = s.contracts.find(c => c.project)!.project!.proof!.design.pieces[0]!;
    expect(patternMatches(design, { ...design, copy: [], headline: 'New words', treatment: 'hand-border' })).toBe(true);
    for (const changed of [{ ...design, kind: 'sign' as const }, { ...design, layout: 'headline' as const }, { ...design, typeface: 'sans' as const }, { ...design, motifs: [] }]) expect(patternMatches(design, changed)).toBe(false);
    const sourceId = s.jobs.find(j => s.contracts.find(c => c.id === j.contractId)?.project)!.id;
    const prepared = applyCommand(s, { type: 'preparePattern', sourceId }).state;
    expect(prepared.contracts).toEqual(s.contracts);
    expect(prepared.jobs).toEqual(s.jobs);
    expect(tonight(prepared).running).toBe(tonight(s).running);
    expect(preparePatternBlocked(s, 'not-a-delivered-piece')).toContain('actual delivered');
  });

  it('reserves both Tomas and Noor, rejects mentoring collisions and teaches for tomorrow', () => {
    let s = delivered();
    const sourceId = s.jobs.find(j => s.contracts.find(c => c.id === j.contractId)?.project)!.id;
    s = applyCommand(s, { type: 'preparePattern', sourceId }).state;
    simulateDay(s, { forecast: true });
    s.news = [];
    s.resources.push({ id: 'j1', name: 'Noor', kind: 'human', role: 'junior', fromDay: 0, toDay: null, dailyCost: 160, speedPercent: 150, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
    const id = s.patterns![0]!.id;
    const before = s;
    const mentored = applyCommand(s, { type: 'mentor', resourceId: 'j1', specialization: 'proofing' }).state;
    expect(teachPatternBlocked(mentored, id, 'j1')).toContain('appointment');
    s = applyCommand(s, { type: 'teachPattern', patternId: id, resourceId: 'j1' }).state;
    expect(mentoringBlocked(s, 'j1', 'templates')).toContain('appointment');
    expect(mentoringBlocked(s, 'j1', 'proofing')).toContain('appointment');
    const job = s.jobs.find(j => j.contractId === s.contracts.find(c => c.project)!.id)!;
    const noor = s.resources.find(r => r.id === 'j1')!;
    expect(patternReduction(s, { ...job, stage: 'brief' }, noor, s.day)).toBe(0);
    const plan = dayPlan(s)!;
    for (const who of ['h2', 'j1']) expect(plan.blocks.find(b => b.resourceId === who && b.stage === 'mentoring')).toMatchObject({ from: 0, to: 60 });
    expect(humanLoad(before).available - humanLoad(s).available).toBe(100);
    simulateDay(s, { forecast: true });
    expect(s.patternTeaching![0]!.completedAt).toBe((s.day - 1) * 480 + 60);
    expect(patternReduction(s, { ...job, stage: 'brief' }, noor, s.day)).toBe(15);
    expect(teachPatternBlocked(s, id, 'j1')).toContain('already');
  });

  it('can prepare a selected carried proof without its old contracts', () => {
    const parent = delivered();
    const sourceId = parent.jobs.find(j => parent.contracts.find(c => c.id === j.contractId)?.project)!.id;
    while (!parent.finished) simulateDay(parent, { forecast: true });
    parent.cash = 1000;
    let next = createRun(buildContinuation(parent, [sourceId]));
    next = applyCommand(next, { type: 'preparePattern', sourceId: next.config.continuation!.pieces[0]!.id }).state;
    expect(next.patterns![0]!.status).toBe('queued');
    expect(next.contracts).toHaveLength(0);
    simulateDay(next, { forecast: true });
    expect(next.patterns![0]!.status).toBe('ready');
    expect(next.events.find(e => e.type === 'pattern_ready')!.minute).toBe(60);
    expect(next.cash).toBe(1000 - 50 - 2 * RULES.humanDailyCost - RULES.shopDailyCost - next.config.continuation!.rentExtra);
  });

  it('keeps paid ready patterns and this hiring spell’s knowledge through seasons two and three', () => {
    const parent = delivered();
    const sourceId = parent.jobs.find(j => parent.contracts.find(c => c.id === j.contractId)?.project)!.id;
    while (!parent.finished) simulateDay(parent, { forecast: true });
    parent.cash = 5000;
    let second = createRun(buildContinuation(parent, [sourceId]));
    second = applyCommand(second, { type: 'preparePattern', sourceId: 'carried-1' }).state;
    second = applyCommand(second, { type: 'hire' }).state;
    simulateDay(second, { forecast: true });
    second.news = [];
    second = applyCommand(second, { type: 'teachPattern', patternId: second.patterns![0]!.id, resourceId: 'j1' }).state;
    while (!second.finished) simulateDay(second, { forecast: true });
    const config = buildContinuation(second, ['carried-1']);
    const third = createRun(JSON.parse(JSON.stringify(config)));
    const pattern = third.patterns![0]!;
    expect(pattern).toMatchObject({ status: 'ready', remaining: 0, sourceId: 'carried-1' });
    const noor = third.resources.find(r => r.id === 'j1')!;
    expect(noor.inheritedPatterns).toEqual([pattern.id]);
    expect(third.patternTeaching).toEqual([]);
    expect(teachPatternBlocked(third, pattern.id, noor.id)).toContain('already');
    expect(third.journal.filter(e => e.kind === 'pattern')).toHaveLength(0);
    const ownPattern = third.patterns!.length;
    expect(ownPattern).toBe(1);
    const dropped = buildContinuation(second, []).continuation!;
    expect(dropped.patterns).toEqual([]);
    second.resources.find(r => r.id === 'j1')!.toDay = 11;
    const rehiring = createRun(buildContinuation(second, ['carried-1']));
    expect(rehiring.patterns![0]!.status).toBe('ready');
    expect(rehiring.resources.some(r => r.inheritedPatterns?.length)).toBe(false);
    expect(rehiring.config.continuation!.patterns[0]!.noorKnows).toBe(false);
  });

  it('carries genuine unfinished preparation minutes without paying or restarting the work', () => {
    let parent = delivered();
    const sourceId = parent.jobs.find(j => parent.contracts.find(c => c.id === j.contractId)?.project)!.id;
    while (parent.day < 11) simulateDay(parent, { forecast: true });
    parent.news = [];
    // Tomas has 340 minutes of held work. Only 20 preparation minutes fit before his shift ends.
    const held = parent.jobs[0]!;
    held.stage = 'produce'; held.status = 'active'; held.assignee = 'h2'; held.remaining = 340; held.deliveredAt = null; held.dueAt = 5760;
    held.allocation = 0;
    parent.resources.find(r => r.id === 'h2')!.busyWith = held.id;
    parent.cash = 1000;
    parent = applyCommand(parent, { type: 'preparePattern', sourceId }).state;
    simulateDay(parent, { forecast: true });
    expect(parent.patterns![0]).toMatchObject({ status: 'preparing', remaining: 40 });
    const third = createRun(buildContinuation(parent, [sourceId]));
    expect(third.patterns![0]).toMatchObject({ status: 'queued', remaining: 40, assignee: null });
    const cash = third.cash;
    simulateDay(third, { forecast: true });
    expect(third.events.find(e => e.type === 'pattern_ready')!.minute).toBe(40);
    expect(third.journal.filter(e => e.kind === 'pattern')).toEqual([]);
    expect(third.cash).toBe(cash + third.journal.filter(e => e.kind !== 'capital').reduce((sum, e) => sum + e.cash, 0));
  });

});
