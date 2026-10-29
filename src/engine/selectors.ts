// Read-only views over CompanyState. The UI derives every number it shows from here.
import { counterOffer, type Reaction } from './demand';
import { RULES } from './rules';
import { effortPercent, mentoringAppointments } from './mentoring';
import { patternAppointments } from './patterns';
import { projectBrief } from './projects';
import { hasAuthorshipRules, hasCareerRules } from './versions';
import type { CreativeIntention, DesignSpec } from './design';
import { applyCommand, getScenario, isOutageDay, paceOn, reactionFor, redoBpToday, shopCostOn, routedToAi, simulateDay, stageEffort, workingOn } from './sim';
import type { Command, CompanyState, Job, ProjectApproach, ProjectId, Request } from './types';

export function windowRequests(s: CompanyState): Request[] {
  return s.requests.filter((r) => r.day === s.day && r.source !== 'project');
}

export function reactionTo(s: CompanyState, r: Request): Reaction {
  return reactionFor(s, r);
}

export interface Forecast {
  /** Jobs that would miss their deadline if nothing goes wrong and nothing new is accepted. */
  atRisk: string[];
  /** The extra request's own launches that would miss. */
  newAtRisk: string[];
  /** The extra request's launches that could not be finished before the season ends, so would be refunded. */
  newAfterSeason: string[];
  /** Existing live launches left unfinished at season close, so refunded rather than marked late. */
  existingAfterSeason: string[];
}

/**
 * Dry-run the promises already made (plus, optionally, one more) with no rework and no new arrivals.
 * Uses only information the player already has, so it never leaks future luck or demand.
 */
export interface OrdinaryDesignOptions { design?: DesignSpec; intention?: CreativeIntention }
export function forecast(s: CompanyState, acceptRequestId?: string, opts: OrdinaryDesignOptions & { redo?: boolean; counter?: boolean; maker?: string } = {}): Forecast {
  const command: Command | undefined = acceptRequestId ? { type: 'accept', requestId: acceptRequestId, ...(opts.counter ? { counter: true as const } : {}), ...(opts.maker ? { maker: opts.maker } : {}), ...(opts.design !== undefined ? { design: opts.design } : {}), ...(opts.intention !== undefined ? { intention: opts.intention } : {}) } : undefined;
  return commandForecast(s, command, opts.redo);
}

export function projectForecast(s: CompanyState, projectId: ProjectId, approach: ProjectApproach, opts: { maker?: string; redo?: boolean; design?: DesignSpec; sourceId?: string } = {}): Forecast | null {
  const command: Command = { type: 'acceptProject', projectId, approach, ...(opts.maker ? { maker: opts.maker } : {}), ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}), ...(hasAuthorshipRules(s.rulesVersion) ? { design: opts.design ?? projectBrief(s, projectId, approach, opts.sourceId).defaultDesign } : {}) };
  return applyCommand(s, command).error ? null : commandForecast(s, command, opts.redo);
}

export function reservationForecast(s: CompanyState, requestId: string, startsInDays: 1 | 2, opts: OrdinaryDesignOptions = {}): Forecast | null {
  const command: Command = { type: 'reserve', requestId, startsInDays, ...(opts.design !== undefined ? { design: opts.design } : {}), ...(opts.intention !== undefined ? { intention: opts.intention } : {}) };
  return applyCommand(s, command).error ? null : commandForecast(s, command);
}

function commandForecast(s: CompanyState, command?: Command, redo = false): Forecast {
  let t = s;
  let newJobs: string[] = [];
  if (command) {
    const res = applyCommand(s, command);
    if (res.error) return { atRisk: [], newAtRisk: [], newAfterSeason: [], existingAfterSeason: [] };
    t = res.state;
    const c = t.contracts[t.contracts.length - 1]!;
    newJobs = c.jobIds;
  }
  const f = structuredClone(t);
  for (const j of f.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
  const open = (j: Job) => j.status === 'active' || j.status === 'scheduled';
  const lastDue = Math.max(0, ...f.jobs.filter(open).map((j) => j.dueAt));
  while (!f.finished && f.minute < lastDue) simulateDay(f, { forecast: true, redo: redo ? newJobs : undefined });
  const missed = f.jobs.filter((j) => j.status === 'missed' && t.jobs.find((x) => x.id === j.id)?.status !== 'missed').map((j) => j.id);
  const afterSeason = f.jobs.filter((j) => j.status === 'refunded' && newJobs.includes(j.id)).map((j) => j.id);
  const closingRefunds = new Set(f.events.slice(t.events.length).filter((e) => e.type === 'refunded_horizon').map((e) => e.jobId));
  const existingAfterSeason = t.jobs.filter((j) => open(j) && !newJobs.includes(j.id) && closingRefunds.has(j.id)).map((j) => j.id);
  return { atRisk: missed.filter((id) => !newJobs.includes(id)), newAtRisk: missed.filter((id) => newJobs.includes(id)), newAfterSeason: afterSeason, existingAfterSeason };
}

/**
 * The one rule for "this fits": taking them puts no promise at risk, theirs or anyone's, and their whole order
 * can ship before the season ends. Used by the player's "Take everyone who fits" and by the ghost studios.
 */
export function fits(f: Forecast): boolean {
  return f.atRisk.length === 0 && f.newAtRisk.length === 0 && f.newAfterSeason.length === 0 && f.existingAfterSeason.length === 0;
}

/**
 * What opening now would bring by tonight if nothing needs redoing: launches out, revenue earned and launches
 * missed. The same no-rework assumption as `forecast`, run for today only, so the player can check it this evening.
 */
export function tonight(s: CompanyState): { delivered: number; earned: number; missed: number; running: number } {
  if (s.finished) return { delivered: 0, earned: 0, missed: 0, running: 0 };
  const f = structuredClone(s);
  for (const j of f.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
  simulateDay(f, { forecast: true });
  const today = (type: string) => f.events.filter((e) => e.day === s.day && e.type === type).length;
  // What the day costs to run (wages with any overtime, rent, AI desks), charged as it opens and closes.
  const running = -f.journal.slice(s.journal.length).filter((e) => e.kind === 'wages' || e.kind === 'shop' || e.kind === 'ai').reduce((a, e) => a + e.cash, 0);
  return { delivered: today('delivered'), earned: f.revenue - s.revenue, missed: today('missed'), running };
}

/**
 * The waiting buyers "Take everyone who fits" would take: in queue order (or the order given), each judged after
 * the ones before it.
 */
export function takeableInTurn(s: CompanyState, order: Request[] = windowRequests(s)): string[] {
  let t = s;
  const out: string[] = [];
  for (const r of order) {
    if (r.status !== 'waiting' || reactionFor(t, r).kind !== 'buy' || !fits(forecast(t, r.id))) continue;
    const res = applyCommand(t, { type: 'accept', requestId: r.id });
    if (res.error) continue;
    t = res.state;
    out.push(r.id);
  }
  return out;
}

/**
 * A buyer who fits as things stand: would their order still fit if it needed redoing once? The forecast assumes no
 * rework, so this is the one surprise "Fits" cannot rule out. Asks about a supposed redo, never the real dice.
 */
export function fitsWithRedo(s: CompanyState, requestId: string, counter = false, opts: OrdinaryDesignOptions = {}): boolean {
  return fits(forecast(s, requestId, { redo: true, counter, ...opts }));
}

/**
 * Promises due by tomorrow that one redo would make late, with the chance of that redo: the risk the player is
 * carrying into the day. Asks about a supposed redo, never the real dice (a flag already drawn stays hidden).
 */
export function atRiskIfRedone(s: CompanyState): { jobId: string; bp: number }[] {
  if (s.finished) return [];
  const horizon = (s.day + 2) * RULES.minutesPerDay;
  const out: { jobId: string; bp: number }[] = [];
  for (const j of s.jobs) {
    // Only work not yet made: whether made work needs redoing is decided as it is made.
    if (j.status !== 'active' || j.dueAt > horizon || (j.stage !== 'brief' && j.stage !== 'produce')) continue;
    const f = structuredClone(s);
    for (const x of f.jobs) if (x.stage !== 'rework') x.reworkFlag = false;
    while (!f.finished && f.minute < j.dueAt) simulateDay(f, { forecast: true, redo: [j.id] });
    if (f.jobs.find((x) => x.id === j.id)?.status !== 'missed') continue;
    const method = j.method ?? (s.staffing.aiTier !== 'none' && routedToAi(s.staffing, j) ? 'ai' : 'human');
    out.push({ jobId: j.id, bp: redoBpToday(s, method, j.need) });
  }
  return out;
}

/** A neighbour put off only by price who has named their own: the offer and price they would take. */
export function counterFor(s: CompanyState, r: Request): { offerIndex: number; price: number } | null {
  return r.offer ? null : counterOffer(reactionFor(s, r), s.menu);
}

/**
 * A buyer who does not fit as things stand: the first same-day lever (overtime, then a temp) that would make them
 * fit, judged by the same forecast. Null when neither is allowed today or neither is enough.
 */
export function fitsWith(s: CompanyState, requestId: string, counter = false): 'overtime' | 'temp' | null {
  for (const lever of ['overtime', 'temp'] as const) {
    const r = applyCommand(s, { type: lever });
    if (!r.error && fits(forecast(r.state, requestId, { counter }))) return lever;
  }
  return null;
}

export interface Summary {
  arrived: number;
  served: number;
  walked: number;
  declined: number;
  delivered: number;
  missed: number;
  refundedAtClose: number;
  promisesKept: number | null;
  /** Sales made, whether or not the whole order was delivered. */
  sold: number;
  cash: number;
  revenue: number;
  unearned: number;
  receipts: number;
  refunds: number;
  wages: number;
  shop: number;
  ai: number;
  fees: number;
  /** Upgrades, flyers and street-news choices that cost money, plus loan interest. */
  other: number;
  operatingResult: number;
  humanUtil: number;
  aiUtil: number | null;
  lostNeighbours: number;
}

export function summarize(s: CompanyState): Summary {
  const seen = s.requests.filter((r) => r.day < s.day || s.finished);
  const sum = (kind: string) => s.journal.filter((e) => e.kind === kind).reduce((a, e) => a + e.cash, 0);
  const delivered = s.jobs.filter((j) => j.status === 'delivered').length;
  const missed = s.jobs.filter((j) => j.status === 'missed').length;
  // Served means the whole order was delivered: a club refunded at the season's close does not count.
  const served = s.contracts.filter((c) => c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length;
  const wages = -sum('wages');
  const shop = -sum('shop');
  const aiCost = -sum('ai');
  const fees = -sum('fee');
  const other = -(sum('upgrade') + sum('marketing') + sum('news') + sum('interest') + sum('materials') + sum('pattern'));
  return {
    arrived: s.requests.filter((r) => r.day <= s.day).length,
    served,
    sold: s.contracts.length,
    walked: seen.filter((r) => r.status === 'walked').length,
    declined: seen.filter((r) => r.status === 'declined').length,
    delivered,
    missed,
    refundedAtClose: s.jobs.filter((j) => j.status === 'refunded').length,
    promisesKept: delivered + missed === 0 ? null : delivered / (delivered + missed),
    cash: s.cash,
    revenue: s.revenue,
    unearned: s.unearned,
    receipts: sum('receipt'),
    refunds: -sum('refund'),
    wages,
    shop,
    ai: aiCost,
    fees,
    other,
    operatingResult: s.revenue - wages - shop - aiCost - fees - other,
    humanUtil: s.usage.humanShift === 0 ? 0 : s.usage.humanBusy / s.usage.humanShift,
    aiUtil: s.usage.aiShift === 0 ? null : s.usage.aiBusy / s.usage.aiShift,
    lostNeighbours: s.lostCast.length,
  };
}

/** Neighbours served (whole order delivered) by the end of each day. */
export function servedByDay(s: CompanyState): number[] {
  const times: number[] = [];
  for (const c of s.contracts) {
    const jobs = c.jobIds.map((id) => s.jobs.find((j) => j.id === id)!);
    if (jobs.every((j) => j.status === 'delivered')) times.push(Math.max(...jobs.map((j) => j.deliveredAt!)));
  }
  return Array.from({ length: RULES.days }, (_, d) => times.filter((t) => t <= (d + 1) * RULES.minutesPerDay).length);
}

/** Daily running costs at the current staffing. */
export function dailyCosts(s: CompanyState): { wages: number; shop: number; ai: number; total: number } {
  const d = s.day;
  const wages = s.resources
    .filter((r) => r.kind === 'human' && r.fromDay <= d && (r.toDay === null || r.toDay >= d))
    .reduce((a, r) => a + (s.modifiers.some((m) => m.kind === 'absent' && m.who === r.id && m.day === d && !m.paid) ? 0 : r.dailyCost), 0);
  const tier = RULES.ai[s.staffing.aiTier];
  const ai = tier.dailyCost + tier.slots * s.modifiers.reduce((a, m) => a + (m.kind === 'aiCost' && m.fromDay <= d ? m.delta : 0), 0);
  const shop = shopCostOn(s, d);
  return { wages, shop, ai, total: wages + shop + ai };
}

/** How many days of running costs the cash covers at today's staffing. */
export function runwayDays(s: CompanyState): number {
  const c = dailyCosts(s).total;
  return c <= 0 ? Infinity : Math.floor(Math.max(0, s.cash) / c);
}

export type Medal = 'gold' | 'silver' | 'bronze' | null;

/**
 * Neighbours served for each medal, per scenario, from `pnpm metrics` (docs/METRICS.md). Bronze: a no-AI redesign
 * (Bespoke and Launchlet) played passively, so getting the window right and keeping promises earns it. Silver: 90%
 * of a no-AI studio that hires and buys the brief library, so no medal needs AI. Gold: what Bright Lantern, the
 * strongest rival, serves, with promises kept. Silver and gold also need the season in profit.
 */
export const PAR: Record<string, { bronze: number; silver: number; gold: number }> = {
  'main-street': { bronze: 20, silver: 29, gold: 55 },
  'festival-week': { bronze: 22, silver: 31, gold: 55 },
  'bespoke-rush': { bronze: 19, silver: 25, gold: 46 },
};

export function medalParFor(s: CompanyState): (typeof PAR)[string] | undefined {
  return s.config.continuation ? undefined : PAR[s.config.scenarioId];
}

export function medalFor(s: CompanyState): { medal: Medal; reason: string } {
  if (s.config.continuation) return { medal: null, reason: 'This studio carried work and resources into the season. Medal thresholds apply to a fresh start.' };
  const sum = summarize(s);
  const par = medalParFor(s);
  if (!par) return { medal: null, reason: 'Custom street' };
  if (sum.cash < 0) return { medal: null, reason: 'Medals need the studio to finish solvent.' };
  if (sum.promisesKept !== null && sum.promisesKept < 0.9) return { medal: null, reason: 'Medals need at least 90% of promises kept.' };
  // Silver and gold also need the season in profit: served is the medal's measure, but not at any price.
  const inProfit = sum.operatingResult >= 0;
  if (sum.served >= par.gold && inProfit) return { medal: 'gold', reason: `${sum.served} neighbours served (gold is ${par.gold}).` };
  if (sum.served >= par.silver && inProfit) return { medal: 'silver', reason: `${sum.served} served. Gold is ${par.gold}.` };
  if (sum.served >= par.silver) return { medal: 'bronze', reason: `${sum.served} served, enough for ${sum.served >= par.gold ? 'gold' : 'silver'}, but the season ended at a loss: silver and gold need a profit.` };
  if (sum.served >= par.bronze) return { medal: 'bronze', reason: `${sum.served} served. Silver is ${par.silver}.` };
  return { medal: null, reason: `${sum.served} served. Bronze is ${par.bronze}.` };
}

/** Human minutes of work already promised for each of the next few days, for the planning gauge. */
export function humanLoad(s: CompanyState, days = 3): { committed: number; available: number } {
  const horizonEnd = (s.day + days) * RULES.minutesPerDay;
  let committed = s.kit.status === 'queued' || s.kit.status === 'building' ? s.kit.remaining || RULES.effort.kitSetup : 0;
  committed += (s.patterns ?? []).reduce((sum, p) => sum + p.remaining, 0);
  for (const j of s.jobs) {
    if ((j.status !== 'active' && j.status !== 'scheduled') || j.releaseDay * RULES.minutesPerDay >= horizonEnd) continue;
    committed += remainingHumanMinutes(s, j);
  }
  let available = 0;
  for (let d = s.day; d < s.day + days && d < RULES.days; d++) {
    available += availableHumanMinutes(s, d);
  }
  return { committed, available };
}

function availableHumanMinutes(s: CompanyState, day: number): number {
  const length = s.overtimeDays.includes(day) ? RULES.aiShift : RULES.humanShift;
  const lessons = [...mentoringAppointments(s, day), ...patternAppointments(s, day)];
  return workingOn(s, day).reduce((a, r) => {
    const lesson = lessons.find(m => m.mentorId === r.id || m.learnerId === r.id);
    return a + Math.floor(((length - (lesson?.minutes ?? 0)) * 100) / effortPercent(r, { stage: 'brief' }, day));
  }, 0);
}

/**
 * People's minutes still needed for launches due by the end of `lastDay` (and an unbuilt template kit, which comes
 * first), against people's minutes from today to then. The three-day gauge can look roomy while today is already full.
 */
export function loadBy(s: CompanyState, lastDay: number): { committed: number; available: number } {
  const end = (lastDay + 1) * RULES.minutesPerDay;
  const due = s.jobs.filter((j) => (j.status === 'active' || j.status === 'scheduled') && j.dueAt <= end);
  let committed = due.some((j) => j.templated) && (s.kit.status === 'queued' || s.kit.status === 'building') ? s.kit.remaining || RULES.effort.kitSetup : 0;
  committed += (s.patterns ?? []).reduce((sum, p) => sum + p.remaining, 0);
  for (const j of due) committed += remainingHumanMinutes(s, j);
  let available = 0;
  for (let d = s.day; d <= lastDay && d < RULES.days; d++) {
    available += availableHumanMinutes(s, d);
  }
  return { committed, available };
}

/** Today's share of `loadBy`: what is due tonight against today's people-hours. */
export const todayLoad = (s: CompanyState): { committed: number; available: number } => loadBy(s, s.day);

/**
 * People's minutes a buyer's first launch would need (the AI desk's making not counted), and the day it is due, from a dry-run take. Puts a number on "fits" that the player can check against the hours they have.
 */
export function workFor(s: CompanyState, requestId: string, counter = false, maker?: string, opts: OrdinaryDesignOptions = {}): { first: number; launches: number; firstDue: number } | null {
  const res = applyCommand(s, { type: 'accept', requestId, ...(counter ? { counter: true as const } : {}), ...(maker ? { maker } : {}), ...(opts.design !== undefined ? { design: opts.design } : {}), ...(opts.intention !== undefined ? { intention: opts.intention } : {}) });
  if (res.error) return null;
  const t = res.state;
  const jobs = t.contracts[t.contracts.length - 1]!.jobIds.map((id) => t.jobs.find((j) => j.id === id)!).sort((a, b) => a.dueAt - b.dueAt);
  if (hasCareerRules(s.rulesVersion)) {
    const f = structuredClone(t);
    let first = 0;
    while (!f.finished && ['active', 'scheduled'].includes(f.jobs.find(j => j.id === jobs[0]!.id)!.status)) {
      const plan = dayPlan(f);
      first += plan?.blocks.filter(b => b.jobId === jobs[0]!.id && plan.lanes.some(l => l.id === b.resourceId && l.kind === 'human')).reduce((n, b) => n + b.to - b.from, 0) ?? 0;
      simulateDay(f, { forecast: true });
    }
    return { first, launches: jobs.length, firstDue: jobs[0]!.dueAt / RULES.minutesPerDay - 1 };
  }
  return { first: remainingHumanMinutes(t, jobs[0]!), launches: jobs.length, firstDue: jobs[0]!.dueAt / RULES.minutesPerDay - 1 };
}

function remainingHumanMinutes(s: CompanyState, j: Job): number {
  const e = RULES.effort;
  const holder = j.assignee ? s.resources.find((r) => r.id === j.assignee) : undefined;
  const dayStart = s.day * RULES.minutesPerDay;
  const outageToday = isOutageDay(s, s.day) || getScenario(s.config.scenarioId).shocks.some((k) => k.startMinute < dayStart + RULES.minutesPerDay && k.endMinute > dayStart);
  const toAi = (jj: Job) => !outageToday && s.staffing.aiTier !== 'none' && routedToAi(s.staffing, jj);
  // Stages not started yet are worked at today's pace (an estimate: work started on a later day takes that day's).
  const pace = paceOn(s, s.day);
  const at = (mins: number) => (pace === 'steady' ? mins : Math.ceil((mins * RULES.pace[pace].effortPercent) / 100));
  const quick = j.maker !== undefined ? (RULES.makers[j.maker]?.producePercent ?? 100) : 100;
  const humanProduce = at(Math.ceil((stageEffort(s, { ...j, stage: 'produce' }, 'human') * quick) / 100));
  const brief = at(stageEffort(s, { ...j, stage: 'brief' }, 'human'));
  const finish = at(stageEffort(s, { ...j, stage: 'finish' }, 'human'));
  // The current stage: if someone holds it, what they still owe; otherwise its full effort.
  const current = (stage: Job['stage']): number => {
    if (holder) return holder.kind === 'human' ? j.remaining : 0;
    if (stage === 'brief') return brief;
    if (stage === 'produce') return toAi(j) ? 0 : humanProduce;
    if (stage === 'finish') return finish;
    if (stage === 'rework') return at(e.rework);
    return 0;
  };
  switch (j.stage) {
    case 'brief':
      return current('brief') + (toAi(j) ? 0 : humanProduce) + finish;
    case 'produce':
      return current('produce') + finish;
    case 'finish':
    case 'rework':
      return current(j.stage);
    default:
      return 0;
  }
}

/**
 * What the hired junior has cost and brought so far: wages for the days played, her hours of work, and her share
 * of earned revenue by her share of all the work done (minutes weighted by speed). An estimate, labelled as one.
 */
export function juniorPayoff(s: CompanyState): { name: string; wages: number; hours: number; worth: number } | null {
  const j = s.resources.find((r) => r.role === 'junior' && r.name === RULES.staff.junior.name);
  if (!j) return null;
  const played = s.finished ? RULES.days : s.day;
  const days = Math.max(0, Math.min(played, (j.toDay ?? Infinity) + 1) - j.fromDay);
  if (days === 0) return null;
  const done = (r: { busyMinutes: number; speedPercent: number }) => r.busyMinutes * r.speedPercent;
  const work = s.resources.reduce((a, r) => a + done(r), 0);
  return { name: j.name, wages: days * j.dailyCost, hours: Math.round(j.busyMinutes / 60), worth: work === 0 ? 0 : Math.round((s.revenue * done(j)) / work / 10) * 10 };
}

/** One stretch of work in today's plan: who does which stage of whose job, in minutes from opening. */
export interface PlanBlock {
  resourceId: string;
  /** The job worked on, or 'kit' while the template kit is being built. */
  jobId: string;
  stage: Job['stage'] | 'kit' | 'mentoring' | 'pattern';
  from: number;
  to: number;
  /** Part of the buyer being considered, not yet taken. */
  isNew: boolean;
  /** The native task completed today, rather than stopping at the shift boundary. */
  completed: boolean;
}

/**
 * Today's work, hour by hour, as the forecast expects it (no redos): every stretch each person and desk works, and
 * how long each one is in today. With a buyer to consider, the plan as it would be if they were taken, their work
 * marked new: "fits" made visible instead of asserted.
 */
export function dayPlan(s: CompanyState, considerId?: string, opts: OrdinaryDesignOptions & { counter?: boolean; maker?: string } = {}): { lanes: { id: string; name: string; kind: 'human' | 'ai'; length: number }[]; blocks: PlanBlock[] } | null {
  if (s.finished) return null;
  let t = s;
  let fresh: string[] = [];
  if (considerId) {
    const res = applyCommand(s, { type: 'accept', requestId: considerId, ...(opts.counter ? { counter: true as const } : {}), ...(opts.maker ? { maker: opts.maker } : {}), ...(opts.design !== undefined ? { design: opts.design } : {}), ...(opts.intention !== undefined ? { intention: opts.intention } : {}) });
    if (!res.error) {
      t = res.state;
      fresh = t.contracts[t.contracts.length - 1]!.jobIds;
    }
  }
  const f = structuredClone(t);
  for (const j of f.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
  simulateDay(f, { forecast: true });
  const start = s.day * RULES.minutesPerDay;
  const late = f.overtimeDays.includes(s.day);
  // A retiring desk can drain its task and disappear during the forecast. Keep its lane from opening.
  const desks = t.resources.filter((r) => r.kind === 'ai' && (!r.retired || r.busyWith !== null));
  const lanes = [...workingOn(f, s.day), ...desks].map((r) => ({ id: r.id, name: r.name, kind: r.kind, length: r.kind === 'ai' || late ? RULES.aiShift : RULES.humanShift }));
  const blocks: PlanBlock[] = [];
  const open = new Map<string, PlanBlock>();
  const events = f.events.slice(t.events.length);
  for (const lane of lanes) {
    const r = t.resources.find((r) => r.id === lane.id);
    if (!r?.busyWith) continue;
    const j = t.jobs.find((j) => j.id === r.busyWith);
    if (!f.resources.some((next) => next.id === r.id && next.busyMinutes > r.busyMinutes) &&
      !events.some((e) => e.day === s.day && e.type === 'task_done' && e.resourceId === r.id && e.jobId === r.busyWith && e.stage === j?.stage)) continue;
    const b: PlanBlock = { resourceId: r.id, jobId: r.busyWith, stage: j?.stage ?? (t.patterns?.some(p => p.id === r.busyWith) ? 'pattern' : 'kit'), from: 0, to: 0, isNew: !!j && fresh.includes(j.id), completed: false };
    open.set(r.id, b);
    blocks.push(b);
  }
  for (const e of events) {
    if (e.day !== s.day || !e.resourceId) continue;
    if (e.type === 'task_start') {
      // Morning effects can put held work down before this person's first new assignment.
      if (open.has(e.resourceId)) open.get(e.resourceId)!.to = e.minute - start;
      const b: PlanBlock = { resourceId: e.resourceId, jobId: e.jobId ?? 'kit', stage: e.stage ?? 'kit', from: e.minute - start, to: e.minute - start, isNew: !!e.jobId && fresh.includes(e.jobId), completed: false };
      open.set(e.resourceId, b);
      blocks.push(b);
    } else if (e.type === 'task_done' || e.type === 'kit_ready') {
      const b = open.get(e.resourceId);
      if (b && b.jobId === (e.jobId ?? 'kit') && b.stage === e.stage) {
        b.to = e.minute - start;
        b.completed = true;
        open.delete(e.resourceId);
      }
    }
  }
  // Work still in hand at closing runs to the end of that lane's day.
  for (const [id, b] of open) b.to = lanes.find((l) => l.id === id)?.length ?? RULES.aiShift;
  for (const b of blocks) b.to = Math.min(b.to, lanes.find((l) => l.id === b.resourceId)?.length ?? RULES.aiShift);
  for (const lesson of [...mentoringAppointments(t, s.day), ...patternAppointments(t, s.day)]) {
    for (const resourceId of [lesson.learnerId, lesson.mentorId]) {
      for (const b of blocks) if (b.resourceId === resourceId && b.from < lesson.minutes) b.from = lesson.minutes;
      blocks.push({ resourceId, jobId: 'mentoring', stage: 'mentoring', from: 0, to: lesson.minutes, isNew: false, completed: true });
    }
  }
  return { lanes, blocks: blocks.filter((b) => b.to > b.from) };
}
