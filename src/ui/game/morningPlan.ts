import { GOALS } from '../../engine/goals';
import { lostSoFarSteps, type lostSoFar } from '../../ai/debrief';
import { RULES } from '../../engine/rules';
import { counterFor, dayPlan, fits, fitsWithRedo, forecast, reactionTo, tonight, windowRequests, workFor, type Forecast } from '../../engine/selectors';
import { applyCommand, makerBusyWith, redoBpFor, redoBpToday, routedToAi, simulateDay, workingOn } from '../../engine/sim';
import type { CompanyState, Request } from '../../engine/types';
import { castName } from '../format';
import type { MakerAvailability, MakerChoice } from './makers';
import { regularsLeaving } from './orderIntake';
import type { PlannedWork } from './plannedWork';
import { promiseLabel } from './promiseLabel';
import { studioHintSteps, type StudioHint } from './studioHint';
import { ordinaryDraftFor, type OrdinaryDraft } from './ordinaryComposition';

export type MorningDrafts = Readonly<Record<string, OrdinaryDraft>>;

const QUEUE_GROUPS = ['all', 'waiting', 'tooLate', 'buyers', 'hagglers', 'walkers', 'answered', 'fitting', 'namedOnly', 'conflicts'] as const;
type QueueGroup = typeof QUEUE_GROUPS[number];

/** Worker messages contain IDs, never cloned Request objects used in identity comparisons. */
export type QueuePlan = Record<QueueGroup, string[]> & {
  makers: Map<string, MakerAvailability[] | null>;
  baseline: Forecast;
  together: string[];
  work: Map<string, ReturnType<typeof workFor>>;
};

export interface TicketPlan {
  id: string;
  work: PlannedWork | null;
  tight: boolean;
  fix: 'overtime' | 'temp' | null;
  makers: MakerChoice[] | null;
}

export interface MorningPlan {
  key: string;
  forecasts: Map<string, Forecast>;
  queue: QueuePlan;
  outlook: (ReturnType<typeof tonight> & { leaving: number; buyersLeaving: number; fitLeaving: number; fitValue: number; haggling: number; regularsLeaving: string[] }) | null;
  selectedTicket: TicketPlan | null;
  same: Map<string, string[]>;
  sameTakeable: Map<string, number>;
  lost: ReturnType<typeof lostSoFar>;
  studioHint: StudioHint | null;
  calendar: { baseline: ReturnType<typeof dayPlan>; considering: string | null; preview: ReturnType<typeof dayPlan> };
  spare: number;
  exposed: { jobId: string; bp: number }[];
}

/** Exact command tape, configuration and rules, rather than revision alone. */
export function morningPlanKey(state: CompanyState, selected: string | null, drafts: MorningDrafts = {}): string {
  return JSON.stringify([state.rulesVersion, state.config, state.commands, selected, ...Object.keys(drafts).length ? [drafts] : []]);
}

export function hydrateQueue(state: CompanyState, queue: QueuePlan) {
  const requests = new Map(state.requests.map(request => [request.id, request]));
  const group = (name: QueueGroup) => queue[name].map(id => requests.get(id)!);
  return { all: group('all'), waiting: group('waiting'), tooLate: group('tooLate'), buyers: group('buyers'), hagglers: group('hagglers'), walkers: group('walkers'), answered: group('answered'), fitting: group('fitting'), namedOnly: group('namedOnly'), conflicts: group('conflicts'), makers: queue.makers, baseline: queue.baseline, together: queue.together };
}

export function hydrateSame(state: CompanyState, same: MorningPlan['same']): Map<string, Request[]> {
  const requests = new Map(state.requests.map(request => [request.id, request]));
  return new Map([...same].map(([key, ids]) => [key, ids.map(id => requests.get(id)!)]));
}

function* takeableSteps(state: CompanyState, requests = windowRequests(state), drafts: MorningDrafts = {}): Generator<void, { ids: string[]; state: CompanyState }> {
  let next = state;
  const ids: string[] = [];
  for (const request of requests) {
    yield;
    const draft = ordinaryDraftFor(next, request.id, drafts[request.id]);
    if (request.status !== 'waiting' || reactionTo(next, request).kind !== 'buy' || !fits(forecast(next, request.id, draft))) continue;
    const accepted = applyCommand(next, { type: 'accept', requestId: request.id, ...draft });
    if (accepted.error) continue;
    next = accepted.state;
    ids.push(request.id);
  }
  return { ids, state: next };
}

/** The same calendar as plannedWork, with a yield between production days. */
function* workSteps(state: CompanyState, requestId: string, counter: boolean, maker?: string, draft?: OrdinaryDraft): Generator<void, PlannedWork | null> {
  yield;
  const accepted = applyCommand(state, { type: 'accept', requestId, ...(counter ? { counter: true as const } : {}), ...(maker ? { maker } : {}), ...draft });
  if (accepted.error) return null;
  const next = accepted.state;
  const ids = new Set(next.contracts.at(-1)!.jobIds);
  const first = next.jobs.filter(job => ids.has(job.id)).sort((a, b) => a.dueAt - b.dueAt)[0]!;
  const firstDue = first.dueAt / RULES.minutesPerDay - 1;
  for (const job of next.jobs) if (job.stage !== 'rework') job.reworkFlag = false;
  let firstMinutes = 0, totalMinutes = 0;
  const days: PlannedWork['days'] = [];
  const production: PlannedWork['production'] = [];
  for (let day = state.day; day < RULES.days && !next.finished; day++) {
    yield;
    const plan = dayPlan(next)!;
    const humans = plan.lanes.filter(lane => lane.kind === 'human');
    const blocks = plan.blocks.filter(block => humans.some(lane => lane.id === block.resourceId));
    production.push(...plan.blocks.filter(block => ids.has(block.jobId) && block.stage === 'produce' && block.completed).map(block => ({ jobId: block.jobId, resourceId: block.resourceId, day: next.day })));
    const minutes = blocks.filter(block => ids.has(block.jobId)).reduce((sum, block) => sum + block.to - block.from, 0);
    firstMinutes += blocks.filter(block => block.jobId === first.id).reduce((sum, block) => sum + block.to - block.from, 0);
    totalMinutes += minutes;
    days.push({ day: next.day, minutes, capacity: humans.reduce((sum, lane) => sum + lane.length, 0), kit: blocks.filter(block => block.jobId === 'kit').reduce((sum, block) => sum + block.to - block.from, 0) });
    yield;
    simulateDay(next, { forecast: true });
    if (next.jobs.filter(job => ids.has(job.id)).every(job => job.status !== 'active' && job.status !== 'scheduled')) break;
  }
  return { first: next.jobs.find(job => job.id === first.id)!.status === 'delivered' ? firstMinutes : null, total: next.jobs.filter(job => ids.has(job.id)).every(job => job.status === 'delivered') ? totalMinutes : null, launches: ids.size, firstDue, days, production };
}

function* makerSteps(state: CompanyState, request: Request, draft?: OrdinaryDraft): Generator<void, MakerAvailability[] | null> {
  if (request.status !== 'waiting' || request.need !== 'nuanced' || reactionTo(state, request).kind !== 'buy') return null;
  if (state.staffing.aiTier !== 'none' && routedToAi(state.staffing, request)) return null;
  const ids = Object.keys(RULES.makers);
  const working = workingOn(state, state.day).map(resource => resource.id);
  if (!ids.every(id => working.includes(id))) return null;
  const choices: MakerAvailability[] = [];
  for (const id of ids) {
    yield;
    const busy = makerBusyWith(state, id);
    choices.push({ id, name: state.resources.find(resource => resource.id === id)!.name, fits: !busy && fits(forecast(state, request.id, { maker: id, ...draft })), ...(busy ? { busyWith: promiseLabel(state, busy.id, 'customer') } : {}) });
  }
  return choices;
}

function* ticketSteps(state: CompanyState, request: Request, estimate: Forecast | null, available: MakerAvailability[] | null, drafts: MorningDrafts): Generator<void, TicketPlan> {
  const draft = drafts[request.id];
  const counter = request.status === 'waiting' && counterFor(state, request) !== null;
  const risky = request.status === 'waiting' && estimate !== null && !fits(estimate);
  let fix: TicketPlan['fix'] = null;
  if (risky) for (const lever of ['overtime', 'temp'] as const) {
    yield;
    const changed = applyCommand(state, { type: lever });
    if (!changed.error && fits(forecast(changed.state, request.id, { counter, ...draft }))) { fix = lever; break; }
  }
  const work = request.status === 'waiting' && estimate !== null ? yield* workSteps(state, request.id, counter, undefined, draft) : null;
  yield;
  const tight = request.status === 'waiting' && estimate !== null && !risky && !fitsWithRedo(state, request.id, counter, draft);
  let makers: MakerChoice[] | null = null;
  if (!counter && available) {
    makers = [];
    for (const route of available) {
      const after = route.fits ? applyCommand(state, { type: 'accept', requestId: request.id, maker: route.id, ...draft }) : null;
      const planned = route.fits ? yield* workSteps(state, request.id, false, route.id, draft) : null;
      const production = planned?.production.find(task => task.jobId === after!.state.contracts.at(-1)!.jobIds[0]);
      const producer = state.resources.find(resource => resource.id === (production?.resourceId ?? route.id))!;
      const others = after && !after.error ? (yield* takeableSteps(after.state, undefined, drafts)).ids.length : 0;
      makers.push({ ...route, trait: RULES.makers[route.id]!.trait, firstTime: 100 - Math.round(redoBpFor(state, producer.kind, request.need, producer, production?.day) / 100), mins: route.fits ? planned!.first! : 0, others });
    }
  }
  return { id: request.id, work, tight, fix, makers };
}

/** Each yield separates a forecast, production day or buyer. No storage or real commands are changed. */
export function* morningPlanSteps(state: CompanyState, selected: string | null, drafts: MorningDrafts = {}): Generator<void, MorningPlan> {
  const all = windowRequests(state);
  const currentDrafts: MorningDrafts = Object.fromEntries(all.flatMap(request => {
    const draft = ordinaryDraftFor(state, request.id, drafts[request.id], true);
    return draft ? [[request.id, draft]] : [];
  }));
  const waiting = all.filter(request => request.status === 'waiting');
  const forecasts = new Map<string, Forecast>();
  if (!state.finished) for (const request of waiting) {
    yield;
    if (reactionTo(state, request).kind === 'buy') forecasts.set(request.id, forecast(state, request.id, currentDrafts[request.id]));
    else if (counterFor(state, request)) forecasts.set(request.id, forecast(state, request.id, { counter: true, ...currentDrafts[request.id] }));
  }
  const makers = new Map<string, MakerAvailability[] | null>();
  for (const request of all) makers.set(request.id, yield* makerSteps(state, request, currentDrafts[request.id]));
  const work = new Map<string, ReturnType<typeof workFor>>();
  for (const request of all) {
    yield;
    work.set(request.id, workFor(state, request.id, false, undefined, currentDrafts[request.id]));
  }
  const withMaker = (request: Request) => makers.get(request.id)?.some(maker => maker.fits) ?? false;
  const tooLate = waiting.filter(request => {
    const reaction = reactionTo(state, request), estimate = forecasts.get(request.id);
    return reaction.kind === 'buy' && estimate !== undefined && estimate.newAfterSeason.length >= reaction.offer.launches && !withMaker(request);
  });
  const buyers = waiting.filter(request => reactionTo(state, request).kind === 'buy' && !tooLate.includes(request));
  const hagglers = waiting.filter(request => reactionTo(state, request).kind === 'walk' && counterFor(state, request));
  const walkers = waiting.filter(request => reactionTo(state, request).kind === 'walk' && !hagglers.includes(request));
  const answered = all.filter(request => request.status !== 'waiting');
  const fitting = buyers.filter(request => { const estimate = forecasts.get(request.id); return estimate !== undefined && fits(estimate); });
  const namedOnly = buyers.filter(request => !fitting.includes(request) && withMaker(request));
  const conflicts = buyers.filter(request => !fitting.includes(request) && !withMaker(request));
  yield;
  const baseline = forecast(state);
  const together = yield* takeableSteps(state, all, currentDrafts);
  const groups = { all, waiting, tooLate, buyers, hagglers, walkers, answered, fitting, namedOnly, conflicts };
  const ids = Object.fromEntries(QUEUE_GROUPS.map(name => [name, groups[name].map(request => request.id)])) as Record<QueueGroup, string[]>;
  const queue: QueuePlan = { ...ids, makers, baseline, together: together.ids, work };
  yield;
  const fitValue = together.ids.reduce((sum, id) => { const reaction = reactionTo(state, all.find(request => request.id === id)!); return sum + (reaction.kind === 'buy' ? reaction.price : 0); }, 0);
  const outlook = state.finished ? null : { ...tonight(state), leaving: waiting.length, buyersLeaving: waiting.filter(request => reactionTo(state, request).kind === 'buy').length, fitLeaving: together.ids.length, fitValue, haggling: hagglers.length, regularsLeaving: regularsLeaving(state).map(castName) };
  const focused = all.find(request => request.id === selected) ?? waiting[0] ?? all.at(-1);
  const selectedTicket = focused ? yield* ticketSteps(state, focused, forecasts.get(focused.id) ?? null, makers.get(focused.id) ?? null, currentDrafts) : null;
  const same = new Map<string, string[]>();
  if (state.day !== 0) for (const request of all) {
    yield;
    if (request.status !== 'waiting') continue;
    const reaction = reactionTo(state, request), estimate = forecasts.get(request.id);
    if (reaction.kind !== 'buy' || !['walkin', 'word', 'flyer'].includes(request.source) || request.offer || request.need !== 'simple' || request.id === selected || !estimate || !fits(estimate)) continue;
    if (state.contracts.some(contract => contract.castId === request.castId) || !fitsWithRedo(state, request.id, false, currentDrafts[request.id])) continue;
    const planned = work.get(request.id);
    if (!planned) continue;
    const goal = (GOALS[state.config.scenarioId] ?? []).find(goal => goal.counts?.(request) && !goal.met(state))?.id ?? '';
    const key = `${reaction.offerIndex}|${reaction.offer.price}|${planned.firstDue}|${planned.first}|${planned.launches}|${goal}`;
    same.set(key, [...(same.get(key) ?? []), request.id]);
  }
  const sameGroups = new Map([...same].filter(([, requests]) => requests.length >= 2));
  const sameTakeable = new Map<string, number>();
  for (const [key, ids] of sameGroups) sameTakeable.set(key, (yield* takeableSteps(state, ids.map(id => all.find(request => request.id === id)!), currentDrafts)).ids.length);
  yield;
  let spare = 0;
  if (fitting.length > 0 && together.ids.length === fitting.length) {
    const plan = dayPlan(together.state);
    if (plan) spare = plan.lanes.filter(lane => lane.kind === 'human').reduce((sum, lane) => sum + lane.length - plan.blocks.filter(block => block.resourceId === lane.id).reduce((minutes, block) => minutes + block.to - block.from, 0), 0);
  }
  const exposed: MorningPlan['exposed'] = [];
  if (!state.finished) for (const job of state.jobs) {
    if (job.status !== 'active' || job.dueAt > (state.day + 2) * RULES.minutesPerDay || (job.stage !== 'brief' && job.stage !== 'produce')) continue;
    const future = structuredClone(state);
    for (const next of future.jobs) if (next.stage !== 'rework') next.reworkFlag = false;
    while (!future.finished && future.minute < job.dueAt) { yield; simulateDay(future, { forecast: true, redo: [job.id] }); }
    if (future.jobs.find(next => next.id === job.id)?.status !== 'missed' || baseline.atRisk.includes(job.id) || baseline.existingAfterSeason.includes(job.id)) continue;
    const method = job.method ?? (state.staffing.aiTier !== 'none' && routedToAi(state.staffing, job) ? 'ai' : 'human');
    exposed.push({ jobId: job.id, bp: redoBpToday(state, method, job.need) });
  }
  const lost = state.day < 2 || state.finished ? [] : yield* lostSoFarSteps(state);
  const studioHint = yield* studioHintSteps(state);
  yield;
  const baseCalendar = dayPlan(state);
  const considering = focused?.status === 'waiting' ? focused.id : null;
  yield;
  const calendar = { baseline: baseCalendar, considering, preview: considering ? dayPlan(state, considering, currentDrafts[considering]) : baseCalendar };
  return { key: morningPlanKey(state, selected, drafts), forecasts, queue, outlook, selectedTicket, same: sameGroups, sameTakeable, lost, studioHint, calendar, spare, exposed };
}

/** Synchronous reference for tests and non-interactive callers. UI callers use startMorningPlan. */
export function computeMorningPlan(state: CompanyState, selected: string | null, drafts: MorningDrafts = {}): MorningPlan {
  const steps = morningPlanSteps(state, selected, drafts);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

export interface MorningPlanRequest { generation: number; key: string; state: CompanyState; selected: string | null; drafts: MorningDrafts }
export type MorningPlanResponse = { generation: number; key: string } & ({ ok: true; plan: MorningPlan } | { ok: false });
export interface PlannerWorker {
  onmessage: ((event: MessageEvent<MorningPlanResponse>) => unknown) | null;
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessageerror: ((event: MessageEvent) => unknown) | null;
  postMessage: (request: MorningPlanRequest) => void;
  terminate: () => void;
}
export interface MorningPlanOptions {
  drafts?: MorningDrafts;
  workerFactory?: () => PlannerWorker | null;
  /** Schedule one calculation step and return its cancellation function. */
  schedule?: (step: () => void) => () => void;
  timeoutMs?: number;
}
export interface MorningPlanTask { promise: Promise<MorningPlan | null>; cancel: () => void }

let generation = 0;
const scheduleStep = (step: () => void) => { const timer = setTimeout(step, 0); return () => clearTimeout(timer); };

export function startMorningPlan(state: CompanyState, selected: string | null, options: MorningPlanOptions = {}): MorningPlanTask {
  const drafts = options.drafts ?? {};
  const request: MorningPlanRequest = { generation: ++generation, key: morningPlanKey(state, selected, drafts), state, selected, drafts };
  let cancel = () => {};
  const promise = new Promise<MorningPlan | null>((resolve, reject) => {
    let worker: PlannerWorker | null = null;
    let unschedule: (() => void) | undefined;
    let settled = false;
    let fallbackStarted = false;
    const stopWorker = () => { worker?.terminate(); worker = null; };
    const finish = (plan: MorningPlan | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unschedule?.();
      stopWorker();
      if (error) reject(error); else resolve(plan);
    };
    const timeout = setTimeout(() => finish(null, new Error('Planning this morning took too long.')), options.timeoutMs ?? 30_000);
    cancel = () => finish(null);
    const fallback = () => {
      if (settled || fallbackStarted) return;
      stopWorker();
      fallbackStarted = true;
      const steps = morningPlanSteps(state, selected, drafts);
      const step = () => {
        if (settled) return;
        try {
          const next = steps.next();
          if (next.done) finish(next.value);
          else unschedule = (options.schedule ?? scheduleStep)(step);
        } catch { finish(null, new Error('This morning could not be planned.')); }
      };
      unschedule = (options.schedule ?? scheduleStep)(step);
    };
    try {
      worker = options.workerFactory ? options.workerFactory() : typeof Worker === 'undefined' ? null : new Worker(new URL('./morningPlan.worker.ts', import.meta.url), { type: 'module' });
    } catch { /* Worker construction can be blocked by browser policy. */ }
    if (!worker) { fallback(); return; }
    worker.onmessage = event => {
      const response = event.data;
      if (settled || fallbackStarted || response.generation !== request.generation || response.key !== request.key) return;
      if (response.ok && response.plan.key === request.key) finish(response.plan);
      else finish(null, new Error('This morning could not be planned.'));
    };
    worker.onerror = fallback;
    worker.onmessageerror = fallback;
    try { worker.postMessage(request); } catch { fallback(); }
  });
  return { promise, cancel: () => cancel() };
}
