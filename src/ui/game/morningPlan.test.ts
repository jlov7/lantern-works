import { afterEach, describe, expect, it, vi } from 'vitest';
import frozen from '../../engine/fixtures/legacy-5.0.0.json';
import courtyard from '../../engine/fixtures/main-courtyard-5.0.0.json';
import creative from '../../engine/fixtures/legacy-6.1.0.json';
import { adaptCareerContinuation, buildContinuation, deliveredPieces } from '../../engine/continuation';
import { compatiblePatterns, patternSources } from '../../engine/patterns';
import { ordinaryBrief } from '../../engine/ordinary';
import { projectBrief } from '../../engine/projects';
import { PRESETS, RULES } from '../../engine/rules';
import { atRiskIfRedone, counterFor, dayPlan, fits, fitsWith, fitsWithRedo, forecast, reactionTo, takeableInTurn, tonight, windowRequests, workFor, type Forecast } from '../../engine/selectors';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState, Request } from '../../engine/types';
import { castName } from '../format';
import { lostSoFar, lostSoFarSteps } from '../../ai/debrief';
import observed from './fixtures/careful-maker-day.json';
import { makerChoices } from './makers';
import { computeMorningPlan, hydrateQueue, hydrateSame, morningPlanKey, morningPlanSteps, startMorningPlan, type MorningPlanOptions, type MorningPlanRequest, type MorningPlanResponse, type PlannerWorker } from './morningPlan';
import { regularsLeaving } from './orderIntake';
import { plannedCommandWork, plannedWork } from './plannedWork';
import { queueModel } from './queueModel';
import { sameOrders } from './sameOrders';
import { studioHint } from './studioHint';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function estimates(state: CompanyState) {
  const out = new Map<string, Forecast>();
  if (!state.finished) for (const request of windowRequests(state)) {
    if (request.status !== 'waiting') continue;
    if (reactionTo(state, request).kind === 'buy') out.set(request.id, forecast(state, request.id));
    else if (counterFor(state, request)) out.set(request.id, forecast(state, request.id, { counter: true }));
  }
  return out;
}

function assertParity(state: CompanyState, selected: string | null) {
  const before = structuredClone(state);
  const forecasts = estimates(state);
  const expected = queueModel(state, forecasts);
  const plan = computeMorningPlan(state, selected);
  expect(plan.key).toBe(morningPlanKey(state, selected));
  expect(plan.forecasts).toEqual(forecasts);
  expect(plan.lost).toEqual(state.day < 2 || state.finished ? [] : lostSoFar(state));
  expect(plan.studioHint).toEqual(studioHint(state));
  const window = windowRequests(state);
  const focus = window.find(request => request.id === selected) ?? window.find(request => request.status === 'waiting') ?? window.at(-1);
  const considering = focus?.status === 'waiting' ? focus.id : null;
  expect(plan.calendar).toEqual({ baseline: dayPlan(state), considering, preview: considering ? dayPlan(state, considering) : dayPlan(state) });
  expect(plan.queue.work).toEqual(new Map(windowRequests(state).map(request => [request.id, workFor(state, request.id)])));
  const hydrated = hydrateQueue(state, plan.queue);
  expect(hydrated).toEqual(expected);
  for (const request of hydrated.all) expect(request).toBe(state.requests.find(other => other.id === request.id));
  for (const request of hydrated.tooLate) expect(hydrated.waiting.includes(request)).toBe(true);
  for (const request of hydrated.namedOnly) expect(hydrated.buyers.includes(request)).toBe(true);
  const same = hydrateSame(state, plan.same);
  expect(same).toEqual(sameOrders(state, forecasts, selected));
  expect(plan.sameTakeable).toEqual(new Map([...same].map(([key, requests]) => [key, takeableInTurn(state, requests).length])));
  for (const group of same.values()) for (const request of group) expect(request).toBe(state.requests.find(other => other.id === request.id));
  const focused = expected.all.find(request => request.id === selected) ?? expected.waiting[0] ?? expected.all.at(-1);
  if (focused) {
    const estimate = forecasts.get(focused.id) ?? null;
    const counter = focused.status === 'waiting' && counterFor(state, focused) !== null;
    const risky = focused.status === 'waiting' && estimate !== null && !fits(estimate);
    expect(plan.selectedTicket).toEqual({ id: focused.id, work: focused.status === 'waiting' && estimate !== null ? plannedWork(state, focused.id, counter) : null, tight: focused.status === 'waiting' && estimate !== null && !risky && !fitsWithRedo(state, focused.id, counter), fix: risky ? fitsWith(state, focused.id, counter) : null, makers: counter ? null : makerChoices(state, focused) });
  } else expect(plan.selectedTicket).toBeNull();
  const ids = takeableInTurn(state);
  const waiting = windowRequests(state).filter(request => request.status === 'waiting');
  expect(plan.outlook).toEqual(state.finished ? null : { ...tonight(state), leaving: waiting.length, buyersLeaving: waiting.filter(request => reactionTo(state, request).kind === 'buy').length, fitLeaving: ids.length, fitValue: ids.reduce((sum, id) => { const reaction = reactionTo(state, state.requests.find(request => request.id === id)!); return sum + (reaction.kind === 'buy' ? reaction.price : 0); }, 0), haggling: waiting.filter(request => reactionTo(state, request).kind !== 'buy' && counterFor(state, request)).length, regularsLeaving: regularsLeaving(state).map(castName) });
  let spare = 0;
  if (expected.fitting.length > 0 && ids.length === expected.fitting.length) {
    let after = state;
    for (const id of ids) after = applyCommand(after, { type: 'accept', requestId: id }).state;
    const calendar = dayPlan(after);
    if (calendar) spare = calendar.lanes.filter(lane => lane.kind === 'human').reduce((sum, lane) => sum + lane.length - calendar.blocks.filter(block => block.resourceId === lane.id).reduce((minutes, block) => minutes + block.to - block.from, 0), 0);
  }
  expect(plan.spare).toBe(spare);
  expect(plan.exposed).toEqual(atRiskIfRedone(state).filter(risk => !expected.baseline.atRisk.includes(risk.jobId) && !expected.baseline.existingAfterSeason.includes(risk.jobId)));
  expect(state).toEqual(before);
  return plan;
}

function scheduler() {
  const pending: (() => void)[] = [];
  let calls = 0;
  const schedule: NonNullable<MorningPlanOptions['schedule']> = step => {
    calls++;
    let cancelled = false;
    pending.push(() => { if (!cancelled) step(); });
    return () => { cancelled = true; };
  };
  const flush = () => { for (let limit = 0; pending.length; limit++) { if (limit > 10_000) throw new Error('Unbounded planner'); pending.shift()!(); } };
  return { pending, schedule, flush, calls: () => calls };
}

class FakeWorker implements PlannerWorker {
  onmessage: PlannerWorker['onmessage'] = null;
  onerror: PlannerWorker['onerror'] = null;
  onmessageerror: PlannerWorker['onmessageerror'] = null;
  request: MorningPlanRequest | null = null;
  terminate = vi.fn();
  postMessage(request: MorningPlanRequest) { this.request = request; }
  respond(response: MorningPlanResponse) { this.onmessage?.({ data: response } as MessageEvent<MorningPlanResponse>); }
  success(plan = computeMorningPlan(this.request!.state, this.request!.selected, this.request!.drafts)) { this.respond({ generation: this.request!.generation, key: this.request!.key, ok: true, plan }); }
}

function patternMorning() {
  const tape = creative.tapes.find(tape => tape.id === 'main-courtyard/native-save.json')!;
  const parent = replay(tape.config as CompanyState['config'], tape.commands as Command[], creative.rules);
  expect(parent.errors).toEqual([]);
  const source = patternSources(parent.state).find(piece => piece.castId === 'clem' && piece.design.kind === 'poster')!;
  let state = createRun(adaptCareerContinuation(parent.state, [source.id], 'planner-pattern'));
  const step = (command: Command) => {
    const result = applyCommand(state, command);
    expect(result.error).toBeUndefined();
    state = result.state;
  };
  step({ type: 'preparePattern', sourceId: 'carried-1' });
  for (let day = 0; day < RULES.days && !state.finished; day++) {
    for (const news of state.news.filter(news => news.day === state.day && news.choice === null)) step({ type: 'choose', newsId: news.id, option: 0 });
    for (const request of windowRequests(state)) {
      const reaction = reactionTo(state, request);
      const brief = reaction.kind === 'buy' ? ordinaryBrief(request, reaction.offer) : null;
      const pattern = brief ? compatiblePatterns(state, brief)[0] : undefined;
      if (pattern) return { state, request, pattern };
    }
    for (const request of windowRequests(state).filter(request => request.status === 'waiting')) step({ type: 'decline', requestId: request.id });
    step({ type: 'runDay' });
  }
  throw new Error('The native test route did not produce a compatible returning brief.');
}

describe('morning planner parity', () => {
  it('matches the frozen 5.0 busy Day 9 frame and selected fallback without changing its source', () => {
    const tape = frozen.tapes.find(tape => tape.id === 'native/main-busy-courtyard')!;
    const result = replay(tape.config, tape.commands.slice(0, 62) as Command[], frozen.rules);
    expect(result.errors).toEqual([]);
    expect(result.state.day).toBe(8);
    assertParity(result.state, null);
    assertParity(result.state, 'missing-selection');
  });

  it('slices the historical tally and counts a same-day decline in the matching frame', () => {
    const tape = frozen.tapes.find(tape => tape.id === 'native/main-busy-courtyard')!;
    const { state } = replay(tape.config, tape.commands.slice(0, 62) as Command[], frozen.rules);
    const steps = lostSoFarSteps(state);
    let count = 0, next = steps.next();
    while (!next.done && count < 10_000) { count++; next = steps.next(); }
    expect(next.done).toBe(true);
    expect(count).toBeGreaterThan(state.commands.length);
    expect(next.value).toEqual(lostSoFar(state));
    const buyer = windowRequests(state).find(request => request.status === 'waiting' && reactionTo(state, request).kind === 'buy')!;
    expect(buyer).toBeDefined();
    const after = applyCommand(state, { type: 'decline', requestId: buyer.id });
    expect(after.error).toBeUndefined();
    const beforeCount = computeMorningPlan(state, null).lost.find(row => row.reason === 'were turned away by you')?.neighbours ?? 0;
    const afterPlan = assertParity(after.state, null);
    expect(afterPlan.lost.find(row => row.reason === 'were turned away by you')?.neighbours).toBe(beforeCount + 1);
  });

  it.each(['lantern-6.0.0', RULES.version])('matches native %s opening, risky and answered tickets, and an empty window', rules => {
    const state = createRun({ scenarioId: 'main-street', seed: 'first-season' }, rules);
    expect(state.rulesVersion).toBe(rules);
    const opening = assertParity(state, null);
    const risky = opening.queue.conflicts[0];
    if (risky) assertParity(state, risky);
    const accepted = applyCommand(state, { type: 'accept', requestId: opening.queue.together[0]! });
    expect(accepted.error).toBeUndefined();
    assertParity(accepted.state, opening.queue.together[0]!);
    assertParity({ ...state, requests: [] }, null);
    assertParity({ ...state, finished: true }, null);
  });

  it.each(['lantern-6.0.0', RULES.version])('matches a native %s continuation with carried artwork, pattern work and accumulated rent', rules => {
    let parent = createRun(courtyard.config, rules);
    for (const original of courtyard.commands as Command[]) {
      const command = original.type === 'acceptProject' ? { ...original, design: projectBrief(parent, original.projectId, original.approach).defaultDesign } : original;
      const result = applyCommand(parent, command);
      expect(result.error).toBeUndefined();
      parent = result.state;
    }
    expect(parent.finished).toBe(true);
    const piece = deliveredPieces(parent)[0]!;
    expect(piece).toBeDefined();
    const config = JSON.parse(JSON.stringify(buildContinuation(parent, [piece.id], 'planner-continuation')));
    let state = createRun(config, rules);
    expect(state.rulesVersion).toBe(rules);
    expect(state.config.continuation?.rentExtra).toBe(RULES.rentRise);
    assertParity(state, null);
    for (const command of [{ type: 'preparePattern', sourceId: state.config.continuation!.pieces[0]!.id }, { type: 'hire' }, { type: 'runDay' }, { type: 'runDay' }] satisfies Command[]) {
      const result = applyCommand(state, command);
      expect(result.error).toBeUndefined();
      state = result.state;
    }
    expect(state.day).toBe(2);
    expect(state.patterns).toHaveLength(1);
    assertParity(state, null);
  });

  it('matches maker choices including their production days and remaining buyers', () => {
    const { state, errors } = replay(observed.config, observed.commands as Command[], observed.rules);
    expect(errors).toEqual([]);
    const plan = assertParity(state, observed.requestId);
    expect(plan.selectedTicket?.makers?.some(maker => maker.fits)).toBe(true);
  });

  it('matches a counter offer and a failed acceptance without inventing work', () => {
    const state = createRun({ scenarioId: 'main-street', seed: 'counter-planning' });
    const request: Request = { id: 'counter', day: 0, index: 0, castId: 'eli', segment: 'small', need: 'simple', wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'walkin' };
    let counterState: CompanyState | null = null;
    for (let price = 200; price <= 1600; price += 10) {
      const candidate = { ...state, requests: [request], menu: [{ ...PRESETS.launchlet, price }] };
      if (counterFor(candidate, request)) { counterState = candidate; break; }
    }
    expect(counterState).not.toBeNull();
    const counter = assertParity(counterState!, request.id);
    expect(counter.selectedTicket?.work).not.toBeNull();
    expect(counter.selectedTicket?.makers).toBeNull();
    const failed: CompanyState = { ...counterState!, call: { jobId: 'held-call', minute: 0, cause: 'snag', minutes: 30 } };
    expect(applyCommand(failed, { type: 'accept', requestId: request.id, counter: true }).error).toBe('Answer the phone first.');
    // Match the selector even when its dry-run acceptance cannot produce an order.
    expect(assertParity(failed, request.id).selectedTicket?.work).toBeNull();
  });

  it('keys the exact tape, rules, configuration and selection even when revision stays the same', () => {
    const state = createRun({ scenarioId: 'main-street', seed: 'frame-key' });
    const key = morningPlanKey(state, null);
    expect(morningPlanKey({ ...state, commands: [{ type: 'overtime' }] }, null)).not.toBe(key);
    expect(morningPlanKey({ ...state, config: { ...state.config, seed: 'other' } }, null)).not.toBe(key);
    expect(morningPlanKey({ ...state, rulesVersion: 'lantern-5.0.0' }, null)).not.toBe(key);
    expect(morningPlanKey(state, 'd0-r0')).not.toBe(key);
    expect(morningPlanKey(structuredClone(state), null)).toBe(key);
  });

  it('drops a stale single-print draft when the offer changes to a series before replying', () => {
    let state = createRun({ scenarioId: 'main-street', seed: 'stale-draft-3' });
    state = applyCommand(state, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 50 }] }).state;
    const request = state.requests.find(request => request.id === 'd0-r0')!;
    const drafts = { [request.id]: { design: ordinaryBrief(request, state.menu[0]!)!.defaultDesign } };
    const changed = applyCommand(state, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 50, launches: 2, spacingDays: 2 }] });
    expect(changed.error).toBeUndefined();
    state = changed.state;
    expect(applyCommand(state, { type: 'accept', requestId: request.id }).error).toBeUndefined();
    expect(applyCommand(state, { type: 'accept', requestId: request.id, ...drafts[request.id] }).error).toBeDefined();
    const clean = computeMorningPlan(state, request.id);
    const retained = computeMorningPlan(state, request.id, drafts);
    expect({ ...retained, key: clean.key }).toEqual(clean);
    expect(retained.key).toBe(morningPlanKey(state, request.id, drafts));
  });

  it('quotes the chosen ordinary composition and its real pattern saving throughout the morning', () => {
    const { state, request, pattern } = patternMorning();
    const before = structuredClone(state);
    const freehand = structuredClone(pattern.design);
    freehand.pieces[0]!.palette = 'river';
    const drafts = { [request.id]: { design: pattern.design } };
    const manual = computeMorningPlan(state, request.id, { [request.id]: { design: freehand } });
    const reused = computeMorningPlan(state, request.id, drafts);
    const command: Command = { type: 'accept', requestId: request.id, design: pattern.design };
    const nativeWork = plannedCommandWork(state, command)!;
    expect(manual.selectedTicket!.work!.total! - reused.selectedTicket!.work!.total!).toBe(15);
    expect(reused.selectedTicket!.work).toEqual(nativeWork);
    expect(manual.queue.work.get(request.id)!.first - reused.queue.work.get(request.id)!.first).toBe(15);
    expect(reused.calendar.preview).toEqual(dayPlan(state, request.id, drafts[request.id]));
    expect(reused.calendar.preview).not.toEqual(manual.calendar.preview);
    expect(reused.forecasts.get(request.id)).toEqual(forecast(state, request.id, drafts[request.id]));
    expect(reused.key).not.toBe(manual.key);
    const accepted = applyCommand(state, command);
    expect(accepted.error).toBeUndefined();
    expect(accepted.state.contracts.at(-1)!.proof!.design).toEqual(pattern.design);
    expect(state).toEqual(before);
  });
});

describe('one-shot cancellable morning planning', () => {
  const state = () => createRun({ scenarioId: 'main-street', seed: 'planner-lifecycle' });

  it('terminates a successful worker and rejects old generations and mismatched keys', async () => {
    const worker = new FakeWorker();
    const task = startMorningPlan(state(), null, { workerFactory: () => worker });
    const plan = computeMorningPlan(worker.request!.state, null);
    worker.respond({ generation: worker.request!.generation - 1, key: worker.request!.key, ok: true, plan });
    worker.respond({ generation: worker.request!.generation, key: `${worker.request!.key}stale`, ok: true, plan });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.success(plan);
    await expect(task.promise).resolves.toEqual(plan);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels and terminates immediately, ignoring a late worker response after Undo or selection', async () => {
    const worker = new FakeWorker();
    const task = startMorningPlan(state(), 'd0-r0', { workerFactory: () => worker });
    task.cancel();
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.success();
    task.cancel();
    await expect(task.promise).resolves.toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('binds worker and fallback results to the selected ordinary drafts', async () => {
    const { state, request, pattern } = patternMorning();
    const drafts = { [request.id]: { design: pattern.design } };
    const worker = new FakeWorker();
    const task = startMorningPlan(state, request.id, { drafts, workerFactory: () => worker });
    expect(worker.request!.drafts).toEqual(drafts);
    const original = computeMorningPlan(state, request.id);
    worker.respond({ generation: worker.request!.generation, key: original.key, ok: true, plan: original });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.success();
    const expected = computeMorningPlan(state, request.id, drafts);
    await expect(task.promise).resolves.toEqual(expected);
    const clock = scheduler();
    const fallback = startMorningPlan(state, request.id, { drafts, workerFactory: () => null, schedule: clock.schedule });
    clock.flush();
    await expect(fallback.promise).resolves.toEqual(expected);
  });

  it('yields fallback calculations over separate scheduled steps when workers are unavailable or blocked', async () => {
    for (const factory of [() => null, () => { throw new Error('Blocked worker'); }]) {
      const clock = scheduler();
      const source = state();
      const task = startMorningPlan(source, null, { workerFactory: factory, schedule: clock.schedule });
      expect(clock.calls()).toBe(1);
      expect(clock.pending).toHaveLength(1);
      clock.pending.shift()!();
      expect(clock.pending).toHaveLength(1);
      clock.flush();
      expect(clock.calls()).toBeGreaterThan(15);
      await expect(task.promise).resolves.toEqual(computeMorningPlan(source, null));
    }
  });

  it('cancels fallback before the next calculation and does not restart it', async () => {
    const clock = scheduler();
    const task = startMorningPlan(state(), null, { workerFactory: () => null, schedule: clock.schedule });
    clock.pending.shift()!();
    const count = clock.calls();
    task.cancel();
    clock.flush();
    expect(clock.calls()).toBe(count);
    await expect(task.promise).resolves.toBeNull();
  });

  it('terminates on a worker error and falls back once, ignoring its late messages', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const clock = scheduler();
    const task = startMorningPlan(state(), null, { workerFactory: factory, schedule: clock.schedule });
    worker.onerror?.({} as ErrorEvent);
    worker.onmessageerror?.({} as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.success();
    expect(clock.calls()).toBe(1);
    clock.flush();
    await expect(task.promise).resolves.toEqual(computeMorningPlan(worker.request!.state, null));
    expect(factory).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates on timeout and calculation errors without retrying', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const task = startMorningPlan(state(), null, { workerFactory: () => worker, timeoutMs: 50 });
    const rejected = expect(task.promise).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.success();
    const broken = new FakeWorker();
    const failed = startMorningPlan(state(), null, { workerFactory: () => broken });
    const failure = expect(failed.promise).rejects.toThrow('could not be planned');
    broken.respond({ generation: broken.request!.generation, key: broken.request!.key, ok: false });
    await failure;
    expect(broken.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has a bounded calculation sequence even when no worker is used', () => {
    const steps = morningPlanSteps(state(), null);
    let count = 0, next = steps.next();
    while (!next.done && count < 1000) { count++; next = steps.next(); }
    expect(next.done).toBe(true);
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThan(1000);
    expect(next.value).toEqual(computeMorningPlan(state(), null));
    expect(RULES.days).toBe(12);
  });
});
