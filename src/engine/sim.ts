// The authoritative simulation. Minute-stepped, deterministic, integer-only.
// State is only ever changed through applyCommand; replay(config, commands) rebuilds any run.
import { allocate, counterOffer, react, validateOffer, type Reaction } from './demand';
import { NEWS, type Effect, type NewsOption } from './news';
import { drawBp, drawInt } from './rng';
import { CAST, CAST_BY_ID, PRESETS, RULES, SEGMENTS, phaseFor, scenarioById } from './rules';
import { hasAuthorshipRules, hasCareerRules, hasCreativePromiseRules, hasStudioRules, supportsRulesVersion } from './versions';
import { nightCalendar, profileBriefMinutes, projectBlocked, projectBrief, projectIntroductions, projectQuote, type ProjectQuote } from './projects';
import { validateDesign, type ApprovedProof, type CreativeIntention } from './design';
import { approveOrdinaryProof, creativePromise, ordinaryBrief, stampOrdinaryBrief } from './ordinary';
import { featurePiecesBlocked, validateContinuation } from './continuation';
import { patternAppointments, patternForWork, patternReduction, patternSources, preparePatternBlocked, teachPatternBlocked, PATTERN_COST, PATTERN_MINUTES } from './patterns';
import { canProduce, effortPercent, MENTORING, mentoringAppointments } from './mentoring';
import type {
  CallOption,
  Command,
  CommandResult,
  CompanyState,
  Job,
  Pace,
  JournalEntry,
  Method,
  News,
  OfferSpec,
  Request,
  RequestSource,
  Resource,
  RunConfig,
  Scenario,
  SegmentId,
  SimEvent,
  Stage,
  Staffing,
  Specialization,
  RelationshipMemory,
} from './types';

const DAY = RULES.minutesPerDay;
export const SEGMENT_IDS: SegmentId[] = ['small', 'moment', 'careful', 'rush'];

/** What a neighbour you let down is offered when they come back once: a free launch, made with care. */
export const AMENDS_OFFER: OfferSpec = { name: 'Making amends', launches: 1, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 0 };

export function getScenario(id: string): Scenario {
  const s = scenarioById(id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}

/** Reputation level for a customer type: -2 (they avoid you) to 4 (they send their friends). */
export function repLevel(rep: number): number {
  return Math.max(-2, Math.min(4, Math.trunc(rep / RULES.rep.perLevel)));
}

function addRep(s: CompanyState, segment: SegmentId, delta: number): void {
  s.rep[segment] = Math.max(RULES.rep.min, Math.min(RULES.rep.max, s.rep[segment] + delta));
}

function remember(s: CompanyState, kind: RelationshipMemory['kind'], castId: string, minute: number, requestId?: string, contractId?: string): void {
  if (!s.relationshipMemory) return;
  s.relationshipMemory.push({ castId, day: Math.min(s.day, RULES.days - 1), minute, kind, ...(requestId ? { requestId } : {}), ...(contractId ? { contractId } : {}) });
}

/** A clear refusal leaves room for another visit; the next possible day is not a promised arrival. */
export function nextEligibleVisit(s: CompanyState, castId: string): number {
  if (!s.relationshipMemory || !isRegular(s, castId)) return 0;
  return s.relationshipMemory.filter(m => m.castId === castId && m.kind === 'declined-before-promise').reduce((day, memory) => Math.max(day, memory.day + 2), 0);
}

/** Price expectation shifts from street news, percent, for a customer type on a day. */
export function wtpShift(s: CompanyState, segment: SegmentId, day: number): number {
  let p = 0;
  for (const m of s.modifiers) if (m.kind === 'wtp' && m.segment === segment && m.fromDay <= day && day <= m.toDay) p += m.percent;
  return p;
}

/** How a neighbour at the window reacts: a fixed order they brought, or a choice from the window. */
export function reactionFor(s: CompanyState, req: Request): Reaction {
  if (req.offer) return { kind: 'buy', offerIndex: -1, offer: req.offer, price: req.offer.price, wtp: req.offer.price, valuations: [] };
  return react(req, s.menu, s.lostCast);
}

// ---------- arrivals ----------

function visitsSoFar(s: CompanyState): Map<string, number> {
  const seen = new Map<string, number>();
  for (const r of s.requests) seen.set(r.castId, (seen.get(r.castId) ?? 0) + 1);
  return seen;
}

/**
 * The morning's neighbours. Ordinary walk-ins come from the keyed tape (a pure function of seed, street and day);
 * word of mouth, flyers and street news add to them, and a poor reputation keeps some away.
 */
export function arrivalsFor(s: CompanyState, day: number): Request[] {
  const scenario = getScenario(s.config.scenarioId);
  const phase = phaseFor(scenario, day);
  const key = [RULES.tapeVersion, s.config.seed, s.config.scenarioId, day];
  const weights = SEGMENT_IDS.map((id) => [id, phase.segmentWeights[id]] as const).filter(([, w]) => w > 0);
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const visits = visitsSoFar(s);
  const used = new Set<string>();
  const amended = new Set(s.requests.filter((r) => r.source === 'amends').map((r) => r.castId));
  const quiet = Math.min(90, s.modifiers.reduce((a, m) => a + (m.kind === 'quiet' && m.day === day ? m.percent : 0), 0));
  const out: Request[] = [];
  const J = RULES.wtpJitterPercent;

  const arrive = (segment: SegmentId, source: RequestSource, slot: (string | number)[], introduced?: string) => {
    const members = introduced ? [CAST_BY_ID[introduced]!] : CAST.filter((c) => c.segment === segment);
    const start = drawInt(members.length, ...key, ...slot, 'cast');
    for (let k = 0; k < members.length; k++) {
      const cast = members[(start + k) % members.length]!;
      if (used.has(cast.id) || (visits.get(cast.id) ?? 0) >= RULES.maxVisits || s.lostCast.includes(cast.id) || day < nextEligibleVisit(s, cast.id)) continue;
      used.add(cast.id);
      const n = (visits.get(cast.id) ?? 0) + 1;
      visits.set(cast.id, n);
      const index = out.length;
      out.push({
        id: `d${day}-r${index}`,
        day,
        index,
        castId: cast.id,
        segment,
        need: drawBp(SEGMENTS[segment].nuancedBp, ...key, ...slot, 'need') ? 'nuanced' : 'simple',
        wtpPercent: 100 - J + drawInt(2 * J + 1, ...key, ...slot, 'wtp') + repLevel(s.rep[segment]) * RULES.rep.wtpPerLevel + wtpShift(s, segment, day),
        lineIndex: (n - 1 + drawInt(cast.lines.length, ...key, ...slot, 'line')) % cast.lines.length,
        status: 'waiting',
        source,
      });
      return;
    }
  };

  const n = scenario.arrivals[day] ?? 0;
  const introductions = projectIntroductions(s, day);
  for (let i = 0; i < n; i++) {
    const intro = introductions[i];
    if (intro && (visits.get(intro.castId) ?? 0) < intro.visit && !s.lostCast.includes(intro.castId) && !used.has(intro.castId)) {
      arrive(CAST_BY_ID[intro.castId]!.segment, 'walkin', ['introduction', intro.castId], intro.castId);
      continue;
    }
    let pick = drawInt(total, ...key, i, 'segment');
    let segment: SegmentId = weights[0]![0];
    for (const [id, w] of weights) {
      if (pick < w) {
        segment = id;
        break;
      }
      pick -= w;
    }
    if (quiet > 0 && drawBp(quiet * 100, ...key, i, 'quiet')) continue;
    const lvl = repLevel(s.rep[segment]);
    if (lvl < 0 && drawBp(-lvl * RULES.rep.skipBpPerLevel, ...key, i, 'skip')) continue;
    arrive(segment, 'walkin', [i]);
  }
  for (const seg of SEGMENT_IDS) {
    const lvl = repLevel(s.rep[seg]);
    if (lvl > 0 && phase.segmentWeights[seg] > 0 && drawBp(lvl * RULES.rep.wordBpPerLevel, ...key, seg, 'word')) arrive(seg, 'word', [seg, 'word']);
  }
  s.modifiers.forEach((m, mi) => {
    if (m.kind !== 'arrivals' || m.day !== day) return;
    for (let c = 0; c < m.count; c++) arrive(m.segment, m.source, ['mod', mi, c]);
  });
  // Most mornings one neighbour in a hurry wants what they would buy from the window, out tonight, and pays well over
  // the window's price for one launch: money against neighbours. If nothing on the window suits them, they do not come.
  if (day >= 1 && day <= RULES.days - 2 && drawBp(RULES.rushPremium.bp, ...key, 'premium')) {
    const at = out.length;
    arrive('rush', 'premium', ['premium']);
    const r = out[at];
    const x = r ? react(r, s.menu, s.lostCast) : null;
    if (r && x?.kind === 'buy') {
      const price = Math.round((x.price / x.offer.launches) * RULES.rushPremium.percent / 1000) * 10;
      r.offer = { ...x.offer, name: `${x.offer.name}, made to order tonight`, launches: 1, turnaroundDays: 1, scope: 'any', style: 'custom', price };
    } else if (r) out.splice(at, 1);
  }
  // Some mornings a neighbour with one big night ahead rings to book for tomorrow: several launches of what they would
  // buy from the window, at a premium, with the work starting tomorrow. One neighbour, a lot of credits, and most of
  // tomorrow's hours before tomorrow's own buyers arrive.
  if (day >= 1 && day <= RULES.days - 3 && drawBp(RULES.booking.bp, ...key, 'booking')) {
    const at = out.length;
    arrive('moment', 'booking', ['booking']);
    const r = out[at];
    const x = r ? react(r, s.menu, s.lostCast) : null;
    if (r && x?.kind === 'buy') {
      const { minutes, maxLaunches, percent, turnaroundDays } = RULES.booking;
      const job = { templated: x.offer.style === 'templated', need: r.need };
      const per = (['brief', 'produce', 'finish'] as const).reduce((a, stage) => a + stageEffort(s, { ...job, stage }, 'human'), 0);
      const launches = Math.max(1, Math.min(maxLaunches, Math.round(minutes / per)));
      const price = Math.round(((x.price / x.offer.launches) * launches * percent) / 1000) * 10;
      r.offer = { ...x.offer, name: `${x.offer.name}${launches > 1 ? `, ${launches}` : ''} for a big night`, launches, spacingDays: 0, turnaroundDays, startsInDays: 1, price };
      r.repOnDelivery = RULES.booking.rep;
    } else if (r) out.splice(at, 1);
  }
  // A neighbour you let down comes back once, outside the visit cap, so a second chance always happens.
  for (const m of s.modifiers) {
    if (m.kind !== 'returns' || m.day !== day || !s.lostCast.includes(m.castId) || amended.has(m.castId) || used.has(m.castId)) continue;
    used.add(m.castId);
    const index = out.length;
    out.push({ id: `d${day}-r${index}`, day, index, castId: m.castId, segment: m.segment, need: 'nuanced', wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'amends', offer: AMENDS_OFFER });
  }
  for (const request of out) stampOrdinaryBrief(s, request);
  return out;
}

/** Street news for a morning: a keyed draw from the street's deck, never the same card twice a season. */
function drawNews(s: CompanyState, day: number): void {
  if (day < 2) return;
  const key = [RULES.tapeVersion, s.config.seed, s.config.scenarioId, day, 'news'];
  // A regular's story takes the morning as soon as it is true; otherwise the street's deck may draw a card.
  const onBoard = (id: string) => hasStudioRules(s.rulesVersion) && ['clemTen', 'maraGrows', 'hugoRetires', 'streetParty'].includes(id);
  const story = (Object.keys(NEWS) as (keyof typeof NEWS)[]).find((id) => !onBoard(id) && NEWS[id].story && !s.news.some((n) => n.card === id) && NEWS[id].eligible(s, day));
  if (story) {
    s.news.push({ id: `n${day}`, day, card: story, choice: null });
    emit(s, { minute: day * DAY, type: 'news' });
    return;
  }
  // The deck draws from day 3 to the second-to-last morning; the last morning belongs to a story.
  if (day > RULES.days - 2 || !drawBp(RULES.newsBp, ...key, 'happens')) return;
  const deck = getScenario(s.config.scenarioId).news;
  const pool = (Object.entries(deck) as [keyof typeof NEWS, number][]).filter(([id, w]) => {
    const card = NEWS[id];
    return w > 0 && !onBoard(id) && !s.news.some((n) => n.card === id) && card.eligible(s, day) && (!card.cast || card.cast(s).length > 0);
  });
  if (pool.length === 0) return;
  let pick = drawInt(pool.reduce((a, [, w]) => a + w, 0), ...key, 'card');
  let id = pool[0]![0];
  for (const [c, w] of pool) {
    if (pick < w) {
      id = c;
      break;
    }
    pick -= w;
  }
  const casts = NEWS[id].cast?.(s);
  const castId = casts ? casts[drawInt(casts.length, ...key, 'cast')] : undefined;
  s.news.push({ id: `n${day}`, day, card: id, choice: null, ...(castId ? { castId } : {}) });
  emit(s, { minute: day * DAY, type: 'news' });
}

function morning(s: CompanyState): void {
  s.requests.push(...arrivalsFor(s, s.day));
  drawNews(s, s.day);
}

// ---------- setup ----------

function lead(id: string, name: string): Resource {
  return { id, kind: 'human', role: 'lead', name, speedPercent: 100, fromDay: 0, toDay: null, dailyCost: RULES.humanDailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 };
}

export function createRun(config: RunConfig, rulesVersion: string = RULES.version): CompanyState {
  if (!supportsRulesVersion(rulesVersion)) throw new Error(`Unsupported rules version: ${rulesVersion}`);
  getScenario(config.scenarioId);
  if (config.continuation && !hasAuthorshipRules(rulesVersion)) throw new Error('Continuations require authored studio rules.');
  const continuation = config.continuation ? validateContinuation(config.continuation) : undefined;
  if (continuation?.version === 2 && !hasCreativePromiseRules(rulesVersion)) throw new Error('This continuing studio requires creative promise rules.');
  if (continuation?.version === 3 && !hasCareerRules(rulesVersion)) throw new Error('This continuing studio requires career rules.');
  if (continuation && continuation.version !== 3 && hasCareerRules(rulesVersion)) throw new Error('Use the explicit career adapter to continue an earlier studio under 7.0.');
  const s: CompanyState = {
    rulesVersion,
    config: hasAuthorshipRules(rulesVersion) ? structuredClone(config) : { ...config },
    revision: 0,
    day: 0,
    minute: 0,
    finished: false,
    menu: [{ ...PRESETS.bespoke }],
    staffing: { aiTier: 'none', routing: 'human' },
    resources: RULES.humans.map((h) => lead(h.id, h.name)),
    requests: [],
    contracts: [],
    jobs: [],
    kit: { status: 'none', remaining: 0, assignee: null },
    cash: RULES.initialCash,
    unearned: 0,
    revenue: 0,
    journal: [],
    events: [],
    usage: { humanBusy: 0, humanShift: 0, aiBusy: 0, aiShift: 0 },
    lostCast: [],
    ...(hasAuthorshipRules(rulesVersion) ? { relationshipMemory: [], patterns: [], patternTeaching: [] } : {}),
    ...(hasCareerRules(rulesVersion) ? { featuredPieceIds: [] } : {}),
    rep: { small: 0, moment: 0, careful: 0, rush: 0 },
    news: [],
    modifiers: [],
    upgrades: [],
    overtimeDays: [],
    paceDays: [],
    flyerDays: [],
    tempDays: [],
    call: null,
    callDays: [],
    commands: [],
  };
  if (continuation) {
    s.config.continuation = continuation;
    s.cash = 0;
    post(s, { minute: 0, kind: 'capital', cash: continuation.cash, unearned: 0, revenue: 0, ref: 'opening-studio', note: 'Closing capital carried from the previous season' });
    s.rep = structuredClone(continuation.rep);
    s.upgrades = [...continuation.upgrades];
    s.staffing = { ...continuation.staffing };
    resizeAi(s);
    s.kit = { ...continuation.kit, status: continuation.kit.status === 'building' ? 'queued' : continuation.kit.status, assignee: null };
    s.patterns = continuation.patterns.map(p => ({ id: p.id, sourceId: p.sourceId, piece: structuredClone(continuation.pieces.find(piece => piece.id === p.sourceId)!.design), status: p.status === 'preparing' ? 'queued' : p.status, remaining: p.remaining, assignee: null }));
    s.lostCast = continuation.relationships.filter(r => r.lost).map(r => r.castId);
    for (const castId of s.lostCast) s.modifiers.push({ kind: 'returns', castId, segment: CAST_BY_ID[castId]!.segment, day: 1 });
    if (continuation.rentExtra) s.modifiers.push({ kind: 'rent', fromDay: 0, extra: continuation.rentExtra });
    if (continuation.noor) {
      const j = RULES.staff.junior;
      s.resources.push({ id: continuation.noor.id, kind: 'human', role: 'junior', name: j.name, speedPercent: j.speedPercent, fromDay: 0, toDay: null, dailyCost: j.dailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0, ...(continuation.noor.specialization ? { inheritedSpecialization: continuation.noor.specialization } : {}), ...(continuation.patterns.some(p => p.noorKnows) ? { inheritedPatterns: continuation.patterns.filter(p => p.noorKnows).map(p => p.id) } : {}) });
    }
  }
  morning(s);
  return s;
}

function post(s: CompanyState, entry: Omit<JournalEntry, 'day'>): void {
  const e = { ...entry, day: s.day };
  s.journal.push(e);
  s.cash += e.cash;
  s.unearned += e.unearned;
  s.revenue += e.revenue;
}

function spend(s: CompanyState, kind: JournalEntry['kind'], amount: number, note: string, ref = `day${s.day}`): void {
  post(s, { minute: s.minute, kind, cash: -amount, unearned: 0, revenue: 0, ref, note });
}

function emit(s: CompanyState, e: Omit<SimEvent, 'day'>): void {
  s.events.push({ ...e, day: s.day });
}

function reject(state: CompanyState, error: string): CommandResult {
  return { state, error };
}

/** People on the books on a day (leads, a junior, a temp), whether or not they are in. */
function employed(s: CompanyState, day: number): Resource[] {
  return s.resources.filter((r) => r.kind === 'human' && r.fromDay <= day && (r.toDay === null || r.toDay >= day));
}

function absence(s: CompanyState, who: string, day: number): { paid: boolean } | null {
  const m = s.modifiers.find((x) => x.kind === 'absent' && x.who === who && x.day === day);
  return m && m.kind === 'absent' ? { paid: m.paid } : null;
}

/** People actually in the studio on a day. */
export function workingOn(s: CompanyState, day: number): Resource[] {
  return employed(s, day).filter((r) => !absence(s, r.id, day));
}

/** Options for a news card in the current state. */
export function newsOptions(s: CompanyState, n: News): NewsOption[] {
  const card = NEWS[n.card];
  const castName = n.castId ? (CAST_BY_ID[n.castId]?.name ?? n.castId) : undefined;
  return card.options({ s, day: n.day, ...(n.castId ? { castId: n.castId } : {}), ...(castName ? { castName } : {}) });
}

function bookTemp(s: CompanyState, day: number): void {
  s.tempDays.push(day);
  s.resources.push({
    id: `t${day}`,
    kind: 'human',
    role: 'temp',
    name: RULES.staff.temp.name,
    speedPercent: 100,
    fromDay: day,
    toDay: day,
    dailyCost: 0,
    busyWith: null,
    retired: false,
    busyMinutes: 0,
    shiftMinutes: 0,
  });
  spend(s, 'wages', RULES.staff.temp.cost, `Temp (${RULES.staff.temp.name}) for the day`);
}

function applyEffect(s: CompanyState, e: Effect): void {
  const d = s.day;
  switch (e.k) {
    case 'cost':
      spend(s, 'news', e.amount, e.note);
      break;
    case 'handover':
      s.modifiers.push({ kind: 'handover', day: d });
      break;
    case 'absent':
      for (let k = 0; k < (e.days ?? 1); k++) s.modifiers.push({ kind: 'absent', who: e.who, day: d + e.when + k, paid: e.paid });
      break;
    case 'temp':
      if (!s.tempDays.includes(d + e.when)) bookTemp(s, d + e.when);
      break;
    case 'wtp':
      s.modifiers.push({ kind: 'wtp', segment: e.segment, percent: e.percent, fromDay: d + 1, toDay: d + e.days });
      break;
    case 'arrivals':
      for (let k = 1; k <= (e.days ?? 1); k++) s.modifiers.push({ kind: 'arrivals', segment: e.segment, count: e.count, day: d + k, source: 'news' });
      break;
    case 'aiCost':
      s.modifiers.push({ kind: 'aiCost', delta: e.delta, fromDay: d + 1 });
      break;
    case 'outage':
      s.modifiers.push({ kind: 'outage', day: d + 1 });
      break;
    case 'noOutage':
      s.modifiers.push({ kind: 'noOutage', day: d + 1 });
      break;
    case 'quiet':
      s.modifiers.push({ kind: 'quiet', day: d + 1, percent: e.percent });
      break;
    case 'rep':
      addRep(s, e.segment, e.delta);
      break;
    case 'request': {
      const index = s.requests.filter((r) => r.day === d).length;
      s.requests.push({ id: `d${d}-n`, day: d, index, castId: e.castId, segment: e.segment, need: e.need, wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'news', offer: e.offer, ...(e.repOnDelivery ? { repOnDelivery: e.repOnDelivery } : {}) });
      break;
    }
    case 'student': {
      const st = RULES.staff.student;
      s.resources.push({ id: `st${d}`, kind: 'human', role: 'junior', name: st.name, speedPercent: st.speedPercent, fromDay: d + 1, toDay: d + st.days, dailyCost: st.dailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
      emit(s, { minute: s.minute, type: 'hired', resourceId: `st${d}` });
      break;
    }
    case 'loan':
      post(s, { minute: s.minute, kind: 'loan', cash: e.amount, unearned: 0, revenue: 0, ref: `day${d}`, note: 'Bank credit line' });
      s.modifiers.push({ kind: 'repay', day: RULES.days - 1, principal: e.amount, interest: e.interest });
      break;
  }
}

function choose(s: CompanyState, n: News, option: number): void {
  n.choice = option;
  for (const e of newsOptions(s, n)[option]!.effects) applyEffect(s, e);
}

// ---------- commands ----------

function makerBlocked(s: CompanyState, maker?: string): string | null {
  if (maker !== undefined && !(maker in RULES.makers && s.resources.some(r => r.id === maker))) return 'Nobody by that name makes launches here.';
  if (maker !== undefined && makerBusyWith(s, maker)) return 'They are already on a job of their own; it has to go out first.';
  return null;
}

/** All orders take payment once and freeze the same production and refund obligations. */
function acceptOrder(s: CompanyState, req: Request, offer: OfferSpec, price: number, opts: { maker?: string; counter?: true; project?: ProjectQuote; reserved?: true; proof?: ApprovedProof; intention?: CreativeIntention } = {}): void {
  const d = s.day;
  const seq = s.contracts.length + 1;
  const contractId = `c${seq}`;
  const shares = allocate(price, offer.launches);
  const jobIds: string[] = [];
  for (let k = 0; k < offer.launches; k++) {
    const releaseDay = d + (offer.startsInDays ?? 0) + k * offer.spacingDays;
    const job: Job = {
      id: `${contractId}-l${k + 1}`,
      contractId,
      castId: req.castId,
      launchIndex: k,
      releaseDay,
      dueAt: (releaseDay + offer.turnaroundDays) * DAY,
      allocation: shares[k]!,
      need: req.need,
      templated: offer.style === 'templated',
      status: releaseDay === d ? 'active' : 'scheduled',
      stage: 'brief',
      remaining: 0,
      assignee: null,
      method: null,
      reworkFlag: false,
      deliveredAt: null,
      ...(opts.maker !== undefined ? { maker: opts.maker } : {}),
      ...(opts.project ? { effort: { ...opts.project.profiles[k]! } } : {}),
    };
    s.jobs.push(job);
    jobIds.push(job.id);
  }
  s.contracts.push({ id: contractId, seq, requestId: req.id, castId: req.castId, segment: req.segment, offer, price, acceptedDay: d, jobIds, ...(req.repOnDelivery ? { repOnDelivery: req.repOnDelivery } : {}), ...(opts.project ? { project: structuredClone(opts.project.project) } : {}), ...(opts.reserved ? { reserved: true as const } : {}), ...(opts.proof ? { proof: structuredClone(opts.proof) } : {}), ...(opts.intention ? { intention: opts.intention } : {}), ...(req.briefId ? { briefId: req.briefId } : {}) });
  req.status = 'accepted';
  req.contractId = contractId;
  post(s, { minute: s.minute, kind: 'receipt', cash: price, unearned: price, revenue: 0, ref: contractId, note: `${offer.name} paid up front${opts.counter ? ' (their price)' : ''}` });
  if (opts.project?.project.materials) spend(s, 'materials', opts.project.project.materials, `${offer.name}: materials`, contractId);
  if (offer.style === 'templated' && s.kit.status === 'none') s.kit = { status: 'queued', remaining: RULES.effort.kitSetup, assignee: null };
}

export function reservationBlocked(s: CompanyState, requestId: string, startsInDays: number): string | null {
  if (!hasStudioRules(s.rulesVersion)) return 'This saved season uses the original booking rules.';
  if (s.finished || s.call || s.minute !== s.day * DAY) return 'Book studio slots in the morning.';
  if (startsInDays !== 1 && startsInDays !== 2) return 'Choose tomorrow or the following morning.';
  const req = s.requests.find(r => r.id === requestId && r.day === s.day && r.status === 'waiting');
  if (!req || req.offer || !['walkin', 'word', 'flyer', 'news'].includes(req.source)) return 'Only an ordinary waiting customer can book this slot.';
  if (s.lostCast.includes(req.castId) || !isRegular(s, req.castId)) return 'Future studio slots are for regulars whose work you have delivered.';
  const reaction = reactionFor(s, req);
  if (reaction.kind !== 'buy') return 'They do not want the current window offer.';
  const o = reaction.offer;
  if (startsInDays + o.turnaroundDays > SEGMENTS[req.segment].maxWaitDays) return 'That date is longer than this customer can wait.';
  if (s.day + startsInDays + (o.launches - 1) * o.spacingDays + o.turnaroundDays > RULES.days) return 'The last launch would fall after the season closes.';
  return null;
}

export function mentoringBlocked(s: CompanyState, resourceId: string, specialization: Specialization): string | null {
  if (!hasStudioRules(s.rulesVersion)) return 'This saved season uses the original staffing rules.';
  if (s.finished || s.call || s.minute !== s.day * DAY) return 'Arrange mentoring in the morning.';
  if (s.day >= RULES.days - 1) return 'There is no next morning to put the training to work.';
  if (specialization !== 'proofing' && specialization !== 'templates') return 'Choose proofing or templates.';
  const noor = workingOn(s, s.day).find(r => r.id === resourceId && r.role === 'junior' && r.name === RULES.staff.junior.name);
  if (!noor) return 'Noor must be working today.';
  if (noor.mentorship || noor.inheritedSpecialization) return 'Noor has already chosen a specialism in this hiring spell.';
  if (s.news.some(n => n.day === s.day && n.choice === null)) return 'Answer today’s street news before booking the two people together.';
  const choice = MENTORING[specialization];
  if (patternAppointments(s, s.day).some(a => [a.learnerId, a.mentorId].some(id => id === resourceId || id === choice.mentorId))) return 'One of them already has a morning appointment.';
  if (!workingOn(s, s.day).some(r => r.id === choice.mentorId)) return `${choice.mentor} is not in today.`;
  return null;
}

export function applyCommand(state: CompanyState, cmd: Command): CommandResult {
  if (cmd.type === 'featurePieces') {
    const blocked = featurePiecesBlocked(state, cmd.pieceIds);
    if (blocked) return reject(state, blocked);
    const s = structuredClone(state);
    s.featuredPieceIds = [...cmd.pieceIds];
    s.revision += 1;
    s.commands.push(structuredClone(cmd));
    return { state: s };
  }
  if (state.finished) return reject(state, 'The season is over.');
  if (state.call && cmd.type !== 'answer') return reject(state, 'Answer the phone first.');
  const s = structuredClone(state);
  const d = s.day;
  switch (cmd.type) {
    case 'accept': {
      if ('proof' in cmd) return reject(state, 'Supply a composition for approval, not an approved proof.');
      if (hasCareerRules(s.rulesVersion) && cmd.intention !== undefined && cmd.design === undefined) return reject(state, 'Choose an intention with an explicitly approved composition.');
      if (!hasCreativePromiseRules(s.rulesVersion) && (cmd.design !== undefined || cmd.intention !== undefined)) return reject(state, 'This season keeps its original ordinary artwork.');
      const req = s.requests.find((r) => r.id === cmd.requestId);
      if (!req || req.day !== d) return reject(state, 'That neighbour is not at the window.');
      if (req.status !== 'waiting') return reject(state, 'That request has already been answered.');
      const reaction = reactionFor(s, req);
      let offer: OfferSpec;
      let price: number;
      if (cmd.counter) {
        const c = req.offer ? null : counterOffer(reaction, s.menu);
        if (!c) return reject(state, 'They have not named a price for anything on the window.');
        offer = { ...s.menu[c.offerIndex]! };
        price = c.price;
        s.modifiers.push({ kind: 'wtp', segment: req.segment, percent: -RULES.counter.wtpDropPercent, fromDay: d + 1, toDay: d + RULES.counter.days });
      } else {
        if (reaction.kind !== 'buy') return reject(state, 'They will not buy anything on the window as it stands.');
        offer = { ...reaction.offer };
        price = offer.price;
      }
      const blocked = makerBlocked(s, cmd.maker);
      if (blocked) return reject(state, blocked);
      const design = cmd.design ?? (hasCareerRules(s.rulesVersion) ? ordinaryBrief(req, offer)?.defaultDesign : undefined);
      const { proof, errors } = approveOrdinaryProof(req, offer, design, cmd.intention);
      if (errors.length) return reject(state, errors[0]!);
      acceptOrder(s, req, offer, price, { ...(cmd.maker !== undefined ? { maker: cmd.maker } : {}), ...(cmd.counter ? { counter: cmd.counter } : {}), ...(proof ? { proof } : {}), ...(cmd.intention ? { intention: cmd.intention } : {}) });
      break;
    }
    case 'acceptProject': {
      const blocked = projectBlocked(s, cmd.projectId, cmd.approach, cmd.sourceId) ?? makerBlocked(s, cmd.maker);
      if (blocked) return reject(state, blocked);
      if (hasAuthorshipRules(s.rulesVersion)) {
        if (!cmd.design) return reject(state, 'Compose and approve a proof before booking this commission.');
        const errors = validateDesign(projectBrief(s, cmd.projectId, cmd.approach, cmd.sourceId), cmd.design);
        if (errors.length) return reject(state, errors[0]!);
      } else if (cmd.design) return reject(state, 'This season keeps its original commission artwork.');
      const quote = projectQuote(s, cmd.projectId, cmd.approach, cmd.design, cmd.sourceId);
      if (!quote) return reject(state, 'This commission cannot finish within the season.');
      if (hasCreativePromiseRules(s.rulesVersion)) {
        const promise = creativePromise(s, quote.request.castId) ?? s.config.continuation?.relationships.find(r => r.castId === quote.request.castId)?.creativePromise;
        if (promise) quote.project.creativePromise = structuredClone(promise);
      }
      s.requests.push(quote.request);
      acceptOrder(s, quote.request, quote.offer, quote.offer.price, { project: quote, ...(cmd.maker !== undefined ? { maker: cmd.maker } : {}) });
      break;
    }
    case 'reserve': {
      if ('proof' in cmd) return reject(state, 'Supply a composition for approval, not an approved proof.');
      if (hasCareerRules(s.rulesVersion) && cmd.intention !== undefined && cmd.design === undefined) return reject(state, 'Choose an intention with an explicitly approved composition.');
      if (!hasCreativePromiseRules(s.rulesVersion) && (cmd.design !== undefined || cmd.intention !== undefined)) return reject(state, 'This season keeps its original ordinary artwork.');
      const blocked = reservationBlocked(s, cmd.requestId, cmd.startsInDays);
      if (blocked) return reject(state, blocked);
      const req = s.requests.find(r => r.id === cmd.requestId)!;
      const reaction = reactionFor(s, req);
      if (reaction.kind !== 'buy') return reject(state, 'They do not want the current window offer.');
      const offer = { ...reaction.offer, startsInDays: cmd.startsInDays };
      const design = cmd.design ?? (hasCareerRules(s.rulesVersion) ? ordinaryBrief(req, offer)?.defaultDesign : undefined);
      const { proof, errors } = approveOrdinaryProof(req, offer, design, cmd.intention);
      if (errors.length) return reject(state, errors[0]!);
      acceptOrder(s, req, offer, offer.price, { reserved: true, ...(proof ? { proof } : {}), ...(cmd.intention ? { intention: cmd.intention } : {}) });
      remember(s, 'agreed-later-start', req.castId, s.minute, req.id, req.contractId);
      break;
    }
    case 'decline': {
      const req = s.requests.find((r) => r.id === cmd.requestId);
      if (!req || req.day !== d) return reject(state, 'That neighbour is not at the window.');
      if (req.status !== 'waiting') return reject(state, 'That request has already been answered.');
      if (reactionFor(s, req).kind === 'buy' && req.source !== 'amends') {
        addRep(s, req.segment, RULES.rep.declinedBuyer);
        if (!hasAuthorshipRules(s.rulesVersion)) loseRegular(s, req);
      }
      req.status = 'declined';
      remember(s, 'declined-before-promise', req.castId, s.minute, req.id);
      break;
    }
    case 'setMenu': {
      if (s.requests.some((r) => r.day === d && r.status !== 'waiting')) {
        return reject(state, "The sign is up for today. Change it tomorrow morning, or undo this morning's answers first.");
      }
      if (!Array.isArray(cmd.offers) || cmd.offers.length < 1 || cmd.offers.length > RULES.maxMenu) {
        return reject(state, `The window holds 1 to ${RULES.maxMenu} offers.`);
      }
      for (const o of cmd.offers) {
        const err = validateOffer(o);
        if (err) return reject(state, err);
      }
      if (new Set(cmd.offers.map((o) => o.name.trim().toLowerCase())).size !== cmd.offers.length) {
        return reject(state, 'Two offers on the window need two different names.');
      }
      s.menu = cmd.offers.map((o) => ({ ...o, name: o.name.trim() }));
      break;
    }
    case 'setStaff': {
      const err = staffError(cmd.staffing);
      if (err) return reject(state, err);
      s.staffing = { ...cmd.staffing };
      resizeAi(s);
      break;
    }
    case 'choose': {
      const n = s.news.find((x) => x.id === cmd.newsId);
      if (!n || n.day !== d) return reject(state, 'That news is not from this morning.');
      if (n.choice !== null) return reject(state, 'You have already decided that one.');
      if (!Number.isInteger(cmd.option) || cmd.option < 0 || cmd.option >= newsOptions(s, n).length) return reject(state, 'That is not one of the options.');
      choose(s, n, cmd.option);
      break;
    }
    case 'preparePattern': {
      const blocked = preparePatternBlocked(s, cmd.sourceId, cmd.replacePatternId);
      if (blocked) return reject(state, blocked);
      if (cmd.replacePatternId) s.patterns = s.patterns!.filter(p => p.id !== cmd.replacePatternId);
      const source = patternSources(s).find(p => p.id === cmd.sourceId)!;
      const id = `pattern-${s.commands.filter(c => c.type === 'preparePattern').length + 1}`;
      s.patterns!.push({ id, sourceId: source.id, piece: structuredClone(source.design), status: 'queued', remaining: PATTERN_MINUTES, assignee: null });
      spend(s, 'pattern', PATTERN_COST, 'Prepare a reusable studio pattern', id);
      break;
    }
    case 'teachPattern': {
      const blocked = teachPatternBlocked(s, cmd.patternId, cmd.resourceId);
      if (blocked) return reject(state, blocked);
      s.patternTeaching!.push({ patternId: cmd.patternId, resourceId: cmd.resourceId, day: d, completedAt: null });
      break;
    }
    case 'hire': {
      const j = RULES.staff.junior;
      if (s.resources.some((r) => r.role === 'junior' && r.name === j.name && (r.toDay === null || r.toDay >= d))) return reject(state, `${j.name} already works here.`);
      if (d >= RULES.days - 1) return reject(state, 'Too late in the season to bring someone new in.');
      const id = `j${hasAuthorshipRules(s.rulesVersion) ? Math.max(Number(s.config.continuation?.noor?.id.slice(1) ?? 0), ...s.resources.filter(r => /^j\d+$/.test(r.id)).map(r => Number(r.id.slice(1))), ...s.events.filter(e => /^j\d+$/.test(e.resourceId ?? '')).map(e => Number(e.resourceId!.slice(1)))) + 1 : hasStudioRules(s.rulesVersion) ? s.events.filter(e => e.type === 'hired' && /^j\d+$/.test(e.resourceId ?? '')).length + 1 : s.resources.filter((r) => r.role === 'junior').length + 1}`;
      s.resources.push({ id, kind: 'human', role: 'junior', name: j.name, speedPercent: j.speedPercent, fromDay: d + 1, toDay: null, dailyCost: j.dailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
      emit(s, { minute: s.minute, type: 'hired', resourceId: id });
      break;
    }
    case 'mentor': {
      const blocked = mentoringBlocked(s, cmd.resourceId, cmd.specialization);
      if (blocked) return reject(state, blocked);
      s.resources.find(r => r.id === cmd.resourceId)!.mentorship = { kind: cmd.specialization, day: d, mentorId: MENTORING[cmd.specialization].mentorId, completedAt: null };
      break;
    }
    case 'letGo': {
      const r = s.resources.find((x) => x.id === cmd.resourceId);
      if (!r || r.role !== 'junior' || (r.toDay !== null && r.toDay < d)) return reject(state, 'Nobody by that name to let go.');
      if (r.fromDay > d) s.resources = s.resources.filter((x) => x !== r);
      else r.toDay = d;
      break;
    }
    case 'temp': {
      if (s.tempDays.includes(d)) return reject(state, 'A temp is already booked for today.');
      bookTemp(s, d);
      break;
    }
    case 'pace': {
      if (!['steady', 'push', 'careful'].includes(cmd.pace)) return reject(state, 'Unknown pace.');
      if (cmd.pace === 'push' && paceOn(s, d - 1) === 'push') return reject(state, 'They pushed yesterday. Not two days running.');
      s.paceDays = s.paceDays.filter((p) => p.day !== d);
      if (cmd.pace !== 'steady') s.paceDays.push({ day: d, pace: cmd.pace });
      break;
    }
    case 'overtime': {
      if (s.overtimeDays.includes(d)) return reject(state, 'Overtime is already booked for today.');
      if (s.overtimeDays.includes(d - 1)) return reject(state, 'They stayed late yesterday. Not two days running.');
      // Charged when the shop opens, for everyone in that day, so booking order never changes the price.
      s.overtimeDays.push(d);
      break;
    }
    case 'buy': {
      const u = RULES.upgrades[cmd.item];
      if (!u) return reject(state, 'Unknown upgrade.');
      if (s.upgrades.includes(cmd.item)) return reject(state, `You already have the ${u.label.toLowerCase()}.`);
      s.upgrades.push(cmd.item);
      spend(s, 'upgrade', u.cost, u.label);
      break;
    }
    case 'flyers': {
      if (!SEGMENT_IDS.includes(cmd.segment)) return reject(state, 'Unknown kind of neighbour.');
      if (s.flyerDays.includes(d)) return reject(state, 'Flyers already went out today.');
      if (d >= RULES.days - 1) return reject(state, 'There is no tomorrow left for flyers to bring anyone.');
      s.flyerDays.push(d);
      spend(s, 'marketing', RULES.flyers.cost, `Flyers for ${SEGMENTS[cmd.segment].label.toLowerCase()}`);
      s.modifiers.push({ kind: 'arrivals', segment: cmd.segment, count: RULES.flyers.count, day: d + 1, source: 'flyer' });
      break;
    }
    case 'runDay':
      simulateDay(s, cmd.calls ? { calls: true } : {});
      break;
    case 'answer': {
      if (!s.call) return reject(state, 'Nobody is on the phone.');
      const why = callBlocked(s, cmd.option);
      if (why) return reject(state, why);
      answer(s, cmd.option);
      runFrom(s, s.minute, {});
      break;
    }
    default:
      return reject(state, 'Unknown command.');
  }
  s.revision += 1;
  s.commands.push(hasAuthorshipRules(s.rulesVersion) ? structuredClone(cmd) : cmd);
  return { state: s };
}

function staffError(st: Staffing): string | null {
  if (!st || !(st.aiTier in RULES.ai)) return 'Unknown AI desk tier.';
  if (!['human', 'simple', 'all'].includes(st.routing)) return 'Unknown routing.';
  if (st.aiTier === 'none' && st.routing !== 'human') return 'Add an AI desk before routing work to it.';
  return null;
}

/** Match AI slots to the chosen tier. Busy slots beyond the tier drain; idle ones leave. */
function resizeAi(s: CompanyState): void {
  const want = RULES.ai[s.staffing.aiTier].slots;
  const ai = s.resources.filter((r) => r.kind === 'ai');
  let active = ai.filter((r) => !r.retired).length;
  for (const r of ai) {
    if (active < want && r.retired) {
      r.retired = false;
      active++;
    }
  }
  for (let i = 1; active < want; i++) {
    const id = `ai${i}`;
    if (!s.resources.some((r) => r.id === id)) {
      s.resources.push({ id, kind: 'ai', role: 'ai', name: `AI desk ${i}`, speedPercent: 100, fromDay: 0, toDay: null, dailyCost: 0, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
      active++;
    }
  }
  for (const r of [...ai].reverse()) {
    if (active <= want) break;
    if (!r.retired) {
      r.retired = true;
      active--;
    }
  }
  s.resources = s.resources.filter((r) => !(r.retired && r.busyWith === null));
}

// ---------- the working day ----------

const STAGE_RANK: Record<Stage, number> = { rework: 0, finish: 1, produce: 2, brief: 3, done: 9 };

export function routedToAi(staffing: Staffing, j: Pick<Job, 'need'>): boolean {
  return staffing.routing === 'all' || (staffing.routing === 'simple' && j.need === 'simple');
}

/** Minutes a stage takes at normal speed, given the kit and upgrades. */
export function stageEffort(s: Pick<CompanyState, 'kit' | 'upgrades'>, j: Pick<Job, 'stage' | 'templated' | 'need' | 'effort'>, method: Method): number {
  switch (j.stage) {
    case 'brief':
      return profileBriefMinutes(s, j.templated, j.effort);
    case 'produce': {
      const base = RULES.effort.produce[method][j.need];
      return j.templated && s.kit.status === 'ready' ? Math.ceil((base * RULES.templatePercent) / 100) : base;
    }
    case 'finish':
      return j.effort?.finish ?? RULES.effort.finish;
    case 'rework':
      return RULES.effort.rework;
    default:
      throw new Error(`No effort for stage ${j.stage}`);
  }
}

/** Chance in basis points that produced work needs rework. */
/** The pace people work at on a day: steady unless the morning chose otherwise. */
export function paceOn(s: Pick<CompanyState, 'paceDays'>, day: number): Pace {
  return s.paceDays.find((p) => p.day === day)?.pace ?? 'steady';
}

export function reworkBp(s: Pick<CompanyState, 'upgrades'>, method: Method, need: Job['need']): number {
  const base = RULES.reworkBp[method][need];
  const halved = method === 'human' ? s.upgrades.includes('checklist') : s.upgrades.includes('styleGuide');
  return halved ? Math.floor(base / 2) : base;
}

/** Neighbours served so far: whole orders delivered. */
function servedCount(s: CompanyState): number {
  return s.contracts.filter((c) => c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length;
}

/** Rent and supplies on a day: the usual, plus the rise if the review went (or, on its morning, will go) against you. */
export function shopCostOn(s: CompanyState, d: number): number {
  const review = getScenario(s.config.scenarioId).review;
  const reviewRise = d === review.day && d === s.day && !s.events.some((e) => e.type === 'review') && servedCount(s) < review.served;
  if (hasAuthorshipRules(s.rulesVersion)) return RULES.shopDailyCost + s.modifiers.reduce((sum, m) => sum + (m.kind === 'rent' && m.fromDay <= d ? m.extra : 0), 0) + (reviewRise ? RULES.rentRise : 0);
  const risen = s.modifiers.some((m) => m.kind === 'rent' && m.fromDay <= d) || reviewRise;
  return RULES.shopDailyCost + (risen ? RULES.rentRise : 0);
}

/** The chance, in basis points, that work made today needs redoing: the method's odds at today's pace. */
export function redoBpToday(s: Pick<CompanyState, 'upgrades' | 'paceDays' | 'day'>, method: Method, need: Job['need'], maker?: string): number {
  const today = paceOn(s, s.day);
  const pace = today === 'careful' && method !== 'human' ? 'steady' : today;
  const hand = maker !== undefined && method === 'human' && need === 'nuanced' ? (RULES.makers[maker]?.trickyReworkPercent ?? 100) : 100;
  return Math.min(10_000, Math.round((((reworkBp(s, method, need) * (pace === 'steady' ? 100 : RULES.pace[pace].reworkPercent)) / 100) * hand) / 100));
}

/** The production check used by the simulation, including the assigned person's skill and temp risk. */
export function redoBpFor(s: Pick<CompanyState, 'upgrades' | 'paceDays' | 'day'>, method: Method, need: Job['need'], producer: Pick<Resource, 'id' | 'role'>, day = s.day): number {
  const today = paceOn(s, day);
  const pace = today === 'careful' && method !== 'human' ? 'steady' : today;
  const temp = producer.role === 'temp' ? RULES.staff.temp.reworkPercent : 100;
  const hand = method === 'human' && need === 'nuanced' ? (RULES.makers[producer.id]?.trickyReworkPercent ?? 100) : 100;
  return Math.min(10_000, Math.round((((((reworkBp(s, method, need) * (pace === 'steady' ? 100 : RULES.pace[pace].reworkPercent)) / 100) * temp) / 100) * hand) / 100));
}

const protectedDay = (s: CompanyState, day: number) => s.modifiers.some((m) => m.kind === 'noOutage' && m.day === day);

export function isOutageDay(s: CompanyState, day: number): boolean {
  return !protectedDay(s, day) && s.modifiers.some((m) => m.kind === 'outage' && m.day === day);
}

function isOutage(s: CompanyState, m: number): boolean {
  const day = Math.floor(m / DAY);
  if (protectedDay(s, day)) return false;
  return isOutageDay(s, day) || getScenario(s.config.scenarioId).shocks.some((k) => k.kind === 'ai_outage' && m >= k.startMinute && m < k.endMinute);
}

function readyJobs(s: CompanyState): Job[] {
  const seq = new Map(s.contracts.map((c) => [c.id, c.seq]));
  return s.jobs
    .filter((j) => j.status === 'active' && j.assignee === null && j.stage !== 'done')
    .sort(
      (a, b) =>
        a.dueAt - b.dueAt ||
        STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
        (seq.get(a.contractId) ?? 0) - (seq.get(b.contractId) ?? 0) ||
        a.launchIndex - b.launchIndex,
    );
}

function assignmentWork(s: CompanyState, r: Resource, j: Job, m: number): { remaining: number; resume: boolean } {
  const method: Method = r.kind;
  // Work put down by someone who is not in today is picked up where they left it, unless the maker changes.
  // Put-down work is stored at normal speed (see putDown) and scaled to whoever picks it up.
  const resume = j.remaining > 0 && !(j.stage === 'produce' && j.method !== method);
  // Work started on a pushed or careful day keeps that day's pace until it is done.
  const pace = method === 'human' ? paceOn(s, Math.floor(m / DAY)) : 'steady';
  // A change the neighbour asked for is more finishing.
  const quick = j.stage === 'produce' && method === 'human' ? (RULES.makers[r.id]?.producePercent ?? 100) : 100;
  const base = Math.ceil(((j.stage === 'brief' ? Math.max(5, stageEffort(s, j, method) - patternReduction(s, j, r, Math.floor(m / DAY))) : stageEffort(s, j, method)) * quick) / 100) + (j.stage === 'finish' && !resume ? (j.snag ?? 0) : 0);
  const day = Math.floor(m / DAY);
  const tired = method === 'human' && s.overtimeDays.includes(day - 1) ? RULES.staff.tiredPercent : 100;
  const effort = resume ? j.remaining : Math.ceil((base * (pace === 'steady' ? 100 : RULES.pace[pace].effortPercent) * tired) / 10000);
  return { remaining: Math.ceil((effort * effortPercent(r, j, day)) / 100), resume };
}

function assign(s: CompanyState, r: Resource, j: Job, m: number): void {
  const { remaining, resume } = assignmentWork(s, r, j, m);
  if (j.stage === 'produce') j.method = r.kind;
  if (j.stage === 'finish' && !resume) j.snag = 0;
  j.remaining = remaining;
  j.assignee = r.id;
  if (hasStudioRules(s.rulesVersion)) j.assigneeSpeed = effortPercent(r, j, Math.floor(m / DAY));
  r.busyWith = j.id;
  emit(s, { minute: m, type: 'task_start', jobId: j.id, resourceId: r.id, stage: j.stage });
  if (!resume && hasCareerRules(s.rulesVersion)) {
    const pattern = patternForWork(s, j, r, Math.floor(m / DAY));
    const reduction = patternReduction(s, j, r, Math.floor(m / DAY));
    if (pattern && reduction > 0) emit(s, { minute: m, type: 'pattern_used', jobId: j.id, resourceId: r.id, patternId: pattern.id, stage: 'brief', amount: reduction });
  }
}

/** The open job a maker with a set number of their own jobs is already on, when they have no slot free. */
export function makerBusyWith(s: CompanyState, maker: string): Job | undefined {
  const slots = RULES.makers[maker]?.slots;
  if (slots === undefined) return undefined;
  const mine = s.jobs.filter((j) => j.maker === maker && (j.status === 'scheduled' || j.status === 'active'));
  return mine.length >= slots ? mine[0] : undefined;
}

/** Making chosen for someone else waits for them, on a day they are in; on a day they are out, anyone may make it. */
function waitsForMaker(s: CompanyState, j: Job, r: Resource, day: number): boolean {
  return j.stage === 'produce' && j.maker !== undefined && j.maker !== r.id && workingOn(s, day).some((x) => x.id === j.maker);
}

function leaveForLead(s: CompanyState, r: Resource, j: Job, m: number, offset: number, shiftEnd: Map<string, number>): boolean {
  if (r.role !== 'temp' || j.stage !== 'produce') return false;
  const tempWork = assignmentWork(s, r, j, m).remaining;
  if (tempWork <= (shiftEnd.get(r.id) ?? 0) - offset) return false;
  return s.resources.some((lead) => {
    if (lead.role !== 'lead' || lead.busyWith === null || waitsForMaker(s, j, lead, Math.floor(m / DAY))) return false;
    const held = lead.busyWith === 'kit' ? s.kit.remaining : s.patterns?.find(p => p.id === lead.busyWith)?.remaining ?? s.jobs.find((x) => x.id === lead.busyWith)!.remaining;
    // Compare active work, without predicting a future shift or reserving the lead's next task.
    return held <= (shiftEnd.get(lead.id) ?? 0) - offset && held + assignmentWork(s, lead, j, m).remaining < tempWork;
  });
}

function dispatch(s: CompanyState, m: number, offset: number, outage: boolean, shiftEnd: Map<string, number>): void {
  const day = Math.floor(m / DAY);
  const inLesson = (id: string) => [...mentoringAppointments(s, day), ...patternAppointments(s, day)].some(a => (a.learnerId === id || a.mentorId === id) && offset < a.minutes);
  s.resources = s.resources.filter((r) => !(r.retired && r.busyWith === null));
  const aiSlots = s.resources.filter((r) => r.kind === 'ai' && !r.retired);
  const aiAvailable = aiSlots.length > 0 && !outage;
  if (aiAvailable) {
    for (const r of aiSlots) {
      if (r.busyWith !== null) continue;
      const j = readyJobs(s).find((x) => x.stage === 'produce' && routedToAi(s.staffing, x));
      if (!j) break;
      assign(s, r, j, m);
    }
  }
  for (const r of s.resources) {
    if (r.kind !== 'human' || r.busyWith !== null || offset >= (shiftEnd.get(r.id) ?? 0) || inLesson(r.id)) continue;
    const pattern = r.id === 'h2' ? s.patterns?.find(p => p.status === 'queued') : undefined;
    if (pattern) {
      pattern.status = 'preparing'; pattern.assignee = r.id; r.busyWith = pattern.id;
      emit(s, { minute: m, type: 'task_start', resourceId: r.id, stage: 'pattern', jobId: pattern.id });
      continue;
    }
    if (r.role !== 'junior' && s.kit.status === 'queued' && s.kit.assignee === null) {
      s.kit.status = 'building';
      s.kit.assignee = r.id;
      r.busyWith = 'kit';
      emit(s, { minute: m, type: 'task_start', resourceId: r.id, stage: 'kit' });
      continue;
    }
    const j = readyJobs(s).find((x) => (x.stage !== 'produce' || !routedToAi(s.staffing, x) || !aiAvailable) && (x.stage !== 'produce' || canProduce(r, x, day)) && !waitsForMaker(s, x, r, day) && !leaveForLead(s, r, x, m, offset, shiftEnd));
    if (!j) continue;
    assign(s, r, j, m);
  }
}

function deliver(s: CompanyState, j: Job, t: number): void {
  j.status = 'delivered';
  j.stage = 'done';
  j.deliveredAt = t;
  post(s, { minute: t, kind: 'earn', cash: 0, unearned: -j.allocation, revenue: j.allocation, ref: j.id, note: 'Launch delivered' });
  emit(s, { minute: t, type: 'delivered', jobId: j.id, amount: j.allocation });
  const c = s.contracts.find((x) => x.id === j.contractId)!;
  if (c.jobIds.every(id => s.jobs.find(x => x.id === id)?.status === 'delivered') && !s.jobs.some(x => x.contractId === c.id && x.changeDeclined)) remember(s, c.offer.name === AMENDS_OFFER.name && c.price === 0 ? 'amends-kept' : 'promise-kept', c.castId, t, c.requestId, c.id);
  addRep(s, c.segment, RULES.rep.delivered);
  if (c.repOnDelivery && c.jobIds.every((id) => s.jobs.find((x) => x.id === id)?.status === 'delivered')) addRep(s, c.segment, c.repOnDelivery);
  if (c.project && c.jobIds.every(id => s.jobs.find(x => x.id === id)?.status === 'delivered')) {
    emit(s, { minute: t, type: 'project_completed', jobId: j.id, requestId: c.requestId });
    if (!s.jobs.some(x => x.contractId === c.id && x.changeDeclined) && !['legacy', 'open'].includes(c.project.story?.stage ?? '')) {
      if (c.project.approach === 'quiet-sendoff') addRep(s, 'careful', 8);
      if (c.project.approach === 'open-bench') addRep(s, 'careful', 4);
      if (c.project.approach === 'market-debut') {
        for (let day = s.day + 1; day <= s.day + 2 && day < RULES.days; day++) s.modifiers.push({ kind: 'arrivals', segment: 'small', count: 1, day, source: 'word' });
      }
    }
  }
  if (c.offer.name === AMENDS_OFFER.name && c.price === 0) {
    s.lostCast = s.lostCast.filter((id) => id !== c.castId);
    addRep(s, c.segment, RULES.rep.amends);
  }
}

function complete(s: CompanyState, r: Resource, t: number, noRework: boolean, redo?: readonly string[]): void {
  const pattern = s.patterns?.find(p => p.id === r.busyWith);
  if (pattern) {
    pattern.status = 'ready'; pattern.assignee = null; pattern.remaining = 0; r.busyWith = null;
    emit(s, { minute: t, type: 'task_done', resourceId: r.id, stage: 'pattern', jobId: pattern.id });
    emit(s, { minute: t, type: 'pattern_ready', resourceId: r.id, jobId: pattern.id });
    return;
  }
  if (r.busyWith === 'kit') {
    s.kit = { status: 'ready', remaining: 0, assignee: null };
    r.busyWith = null;
    emit(s, { minute: t, type: 'kit_ready', resourceId: r.id, stage: 'kit' });
    return;
  }
  const j = s.jobs.find((x) => x.id === r.busyWith)!;
  r.busyWith = null;
  j.assignee = null;
  emit(s, { minute: t, type: 'task_done', jobId: j.id, resourceId: r.id, stage: j.stage });
  switch (j.stage) {
    case 'brief':
      j.stage = 'produce';
      break;
    case 'produce': {
      const method = j.method ?? 'human';
      // Rushed briefs carry through to whoever makes it, the AI desk included; care is people's own making.
      const bp = redoBpFor(s, method, j.need, r, Math.floor(t / DAY));
      // Keyed on the buyer and the launch, not the job id: job ids follow the order contracts were taken, so keying on
      // them let taking one more buyer reshuffle every later redo in the season.
      const buyer = s.contracts.find((c) => c.id === j.contractId)?.requestId ?? j.id;
      j.reworkFlag = (redo?.includes(j.id) ?? false) || (!noRework && drawBp(bp, RULES.tapeVersion, s.config.seed, buyer, j.launchIndex, method, 'rework'));
      j.stage = 'finish';
      // A completed archive can supply all finishing for one catalogue. Zero work costs no extra minute.
      if (stageEffort(s, j, method) === 0 && !(j.snag ?? 0)) {
        if (j.reworkFlag) {
          j.stage = 'rework';
          emit(s, { minute: t, type: 'rework_found', jobId: j.id });
        } else deliver(s, j, t);
      }
      break;
    }
    case 'finish':
      if (j.reworkFlag) {
        j.stage = 'rework';
        emit(s, { minute: t, type: 'rework_found', jobId: j.id });
      } else deliver(s, j, t);
      break;
    case 'rework':
      j.reworkFlag = false;
      deliver(s, j, t);
      break;
    default:
      throw new Error(`Completed a job in stage ${j.stage}`);
  }
}

function release(s: CompanyState, j: Job): void {
  if (j.assignee) {
    const r = s.resources.find((x) => x.id === j.assignee);
    if (r) r.busyWith = null;
    j.assignee = null;
  }
}

/** Someone not in today puts their work down so others can pick it up. */
function putDown(s: CompanyState, r: Resource): void {
  if (r.busyWith === null) return;
  const pattern = s.patterns?.find(p => p.id === r.busyWith);
  if (pattern) { pattern.status = 'queued'; pattern.assignee = null; }
  else if (r.busyWith === 'kit') {
    s.kit.status = 'queued';
    s.kit.assignee = null;
  } else {
    const j = s.jobs.find((x) => x.id === r.busyWith);
    if (j) {
      j.assignee = null;
      j.remaining = Math.ceil((j.remaining * 100) / (j.assigneeSpeed ?? r.speedPercent));
    }
  }
  r.busyWith = null;
}

export interface DayOptions {
  /** Forecast mode: assume no rework and no new arrivals, so the preview never leaks future luck. */
  forecast?: boolean;
  /** Forecast mode only: suppose these jobs each need one redo, to ask "what if it has to be done again?". */
  redo?: readonly string[];
  /** Stop for a call when a promise due tonight is suddenly forecast to miss (at most once a day). */
  calls?: boolean;
}

export function simulateDay(s: CompanyState, opts: DayOptions = {}): void {
  beginDay(s);
  runFrom(s, s.day * DAY, opts);
}

/** Someone you have delivered a whole order for: a regular, who expects to be served. */
export function isRegular(s: CompanyState, castId: string): boolean {
  return s.config.continuation?.relationships.some(r => r.castId === castId && r.regular) === true || s.contracts.some((c) => c.castId === castId && c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered'));
}

/** A regular who wanted to buy and was turned away, or left waiting, does not come back. */
function loseRegular(s: CompanyState, req: Request): void {
  if (isRegular(s, req.castId) && !s.lostCast.includes(req.castId)) s.lostCast.push(req.castId);
}

/** The morning's bills, absences and shifts: everything that happens once, as the shop opens. */
function beginDay(s: CompanyState): void {
  const d = s.day;
  const start = d * DAY;
  for (const n of s.news) if (n.day === d && n.choice === null) choose(s, n, 0);
  for (const req of s.requests) {
    if (req.day === d && req.status === 'waiting') {
      if (reactionFor(s, req).kind === 'buy' && req.source !== 'amends') {
        addRep(s, req.segment, RULES.rep.ignoredBuyer);
        loseRegular(s, req);
      }
      req.status = 'walked';
      emit(s, { minute: start, type: 'walked', requestId: req.id });
    }
  }
  emit(s, { minute: start, type: 'day_start' });
  for (const lesson of mentoringAppointments(s, d)) emit(s, { minute: start, type: 'mentoring_start', resourceId: lesson.learnerId, mentorId: lesson.mentorId, specialization: lesson.kind, amount: lesson.minutes });

  for (const lesson of patternAppointments(s, d)) emit(s, { minute: start, type: 'pattern_teaching_start', resourceId: lesson.learnerId, mentorId: lesson.mentorId, jobId: lesson.teaching.patternId, amount: lesson.minutes });
  const onBooks = employed(s, d);
  const wages = onBooks.reduce((a, r) => a + (absence(s, r.id, d)?.paid === false ? 0 : r.dailyCost), 0);
  if (wages > 0) post(s, { minute: start, kind: 'wages', cash: -wages, unearned: 0, revenue: 0, ref: `day${d}`, note: 'Wages' });
  // The rent review, on its morning: served by last night against the street's target.
  const review = getScenario(s.config.scenarioId).review;
  const shop = shopCostOn(s, d);
  if (d === review.day) {
    const served = servedCount(s);
    if (served < review.served) s.modifiers.push({ kind: 'rent', fromDay: d, extra: RULES.rentRise });
    emit(s, { minute: start, type: 'review', amount: served });
  }
  post(s, { minute: start, kind: 'shop', cash: -shop, unearned: 0, revenue: 0, ref: `day${d}`, note: shop > RULES.shopDailyCost ? 'Rent (after the review) and supplies' : 'Rent and supplies' });
  const tier = RULES.ai[s.staffing.aiTier];
  const aiCost = tier.dailyCost + (tier.slots > 0 ? tier.slots * s.modifiers.reduce((a, m) => a + (m.kind === 'aiCost' && m.fromDay <= d ? m.delta : 0), 0) : 0);
  if (aiCost > 0) post(s, { minute: start, kind: 'ai', cash: -aiCost, unearned: 0, revenue: 0, ref: `day${d}`, note: `AI desk (${s.staffing.aiTier})` });
  for (const m of s.modifiers) {
    if (m.kind !== 'repay' || m.day !== d) continue;
    post(s, { minute: start, kind: 'loan', cash: -m.principal, unearned: 0, revenue: 0, ref: `day${d}`, note: 'Credit line repaid' });
    post(s, { minute: start, kind: 'interest', cash: -m.interest, unearned: 0, revenue: 0, ref: `day${d}`, note: 'Credit line interest' });
  }
  if (s.overtimeDays.includes(d)) {
    const people = workingOn(s, d).length;
    post(s, { minute: start, kind: 'wages', cash: -people * RULES.staff.overtimePerPerson, unearned: 0, revenue: 0, ref: `day${d}`, note: `Overtime until 5pm (${people})` });
  }
  for (const j of s.jobs) if (j.status === 'scheduled' && j.releaseDay === d) j.status = 'active';
  // A sold customer list takes everything still in the works with it, orders taken this morning included.
  if (s.modifiers.some((m) => m.kind === 'handover' && m.day === d)) {
    for (const j of s.jobs) {
      if (j.status !== 'active' && j.status !== 'scheduled') continue;
      release(s, j);
      j.status = 'refunded';
      post(s, { minute: start, kind: 'refund', cash: -j.allocation, unearned: -j.allocation, revenue: 0, ref: j.id, note: 'Handed to Bright Lantern with the customer list' });
    }
  }

  const working = new Set(workingOn(s, d).map((r) => r.id));
  const late = s.overtimeDays.includes(d);
  for (const r of s.resources) {
    let shift: number;
    if (r.kind === 'human') {
      if (!working.has(r.id)) putDown(s, r);
      shift = working.has(r.id) ? (late ? RULES.aiShift : RULES.humanShift) : 0;
      s.usage.humanShift += shift;
    } else {
      shift = r.retired && r.busyWith === null ? 0 : RULES.aiShift;
      s.usage.aiShift += shift;
    }
    r.shiftMinutes += shift;
  }
  s.resources = s.resources.filter((r) => r.kind === 'ai' || r.toDay === null || r.toDay >= d);

  if (isOutageDay(s, d)) emit(s, { minute: start, type: 'outage_start' });
}

/** When each person's day ends, in minutes after opening: 3pm, 5pm with overtime, or 0 when not in. */
function shiftEnds(s: CompanyState, d: number): Map<string, number> {
  const working = new Set(workingOn(s, d).map((r) => r.id));
  const late = s.overtimeDays.includes(d) ? RULES.aiShift : RULES.humanShift;
  return new Map(s.resources.map((r) => [r.id, r.kind === 'human' ? (working.has(r.id) ? late : 0) : RULES.aiShift]));
}

/** Today's snag, if any: when the neighbour rings and how much more finishing they ask for. A keyed draw. */
function snagOn(s: CompanyState, d: number): { at: number; minutes: number } | null {
  const k = RULES.snag;
  const key = [RULES.tapeVersion, s.config.seed, s.config.scenarioId, d, 'snag'];
  if (d < k.fromDay || !drawBp(k.bp, ...key)) return null;
  const steps = (k.minutes[1] - k.minutes[0]) / 15 + 1;
  return { at: d * DAY + k.from + drawInt(k.to - k.from + 1, ...key, 'when'), minutes: k.minutes[0] + 15 * drawInt(steps, ...key, 'size') };
}

/** A neighbour with a launch due tonight rings with a change: more finishing, now if it is being finished. */
function applySnag(s: CompanyState, m: number, minutes: number): void {
  const end = (s.day + 1) * DAY;
  const open = s.jobs.filter((j) => j.status === 'active' && j.dueAt <= end && (j.stage === 'brief' || j.stage === 'produce' || j.stage === 'finish'));
  if (!open.length) return;
  const j = open[drawInt(open.length, RULES.tapeVersion, s.config.seed, s.day, 'snag', 'which')]!;
  const r = j.stage === 'finish' && j.assignee ? s.resources.find((x) => x.id === j.assignee) : undefined;
  if (r) j.remaining += Math.ceil((minutes * (j.assigneeSpeed ?? r.speedPercent)) / 100);
  else j.snag = (j.snag ?? 0) + minutes;
  emit(s, { minute: m, type: 'snag', jobId: j.id, amount: minutes });
}

/** Whether a launch would miss tonight if the rest of the day went as planned (no luck either way). */
function wouldMiss(s: CompanyState, jobId: string, from: number): boolean {
  const f = structuredClone(s);
  runFrom(f, from, { forecast: true });
  return f.jobs.find((j) => j.id === jobId)?.status === 'missed';
}

/** The working day from minute `from` to closing; stops early, with `s.call` set, when a call has to be answered. */
function runFrom(s: CompanyState, from: number, opts: DayOptions): void {
  const d = s.day;
  if (opts.forecast) {
    for (const j of s.jobs) {
      if (j.stage !== 'rework' && !opts.redo?.includes(j.id)) j.reworkFlag = false;
    }
  }
  const start = d * DAY;
  const shiftEnd = shiftEnds(s, d);
  const shocks = getScenario(s.config.scenarioId).shocks;
  const snag = opts.forecast ? null : snagOn(s, d);
  // Work only becomes available at the start of the day, when a task completes, or when an outage ends, so
  // dispatching only then gives exactly the same schedule as dispatching every minute, much faster.
  let dirty = true;
  let wasOutage = false;
  const lessons = [...mentoringAppointments(s, d), ...patternAppointments(s, d)];
  for (let m = from; m < start + DAY; m++) {
    const offset = m - start;
    const mark = s.events.length;
    for (const k of shocks) {
      if (protectedDay(s, d)) break;
      if (k.startMinute === m) emit(s, { minute: m, type: 'outage_start' });
      if (k.endMinute === m) emit(s, { minute: m, type: 'outage_end' });
    }
    if (snag?.at === m) applySnag(s, m, snag.minutes);
    const outage = isOutage(s, m);
    if (outage !== wasOutage) dirty = true;
    wasOutage = outage;
    if (dirty) dispatch(s, m, offset, outage, shiftEnd);
    dirty = false;
    for (const r of s.resources) {
      const lesson = lessons.find(a => (a.learnerId === r.id || a.mentorId === r.id) && offset < a.minutes);
      if (lesson) {
        r.busyMinutes++;
        s.usage.humanBusy++;
        continue;
      }
      if (r.busyWith === null) continue;
      if (r.kind === 'human' && offset >= (shiftEnd.get(r.id) ?? 0)) continue;
      if (r.kind === 'ai' && outage) continue;
      r.busyMinutes++;
      if (r.kind === 'human') s.usage.humanBusy++;
      else s.usage.aiBusy++;
      const pattern = s.patterns?.find(p => p.id === r.busyWith);
      if (pattern) {
        if (--pattern.remaining === 0) { complete(s, r, m + 1, opts.forecast === true); dirty = true; }
        continue;
      }
      if (r.busyWith === 'kit') {
        if (--s.kit.remaining === 0) {
          complete(s, r, m + 1, opts.forecast === true, opts.forecast ? opts.redo : undefined);
          dirty = true;
        }
        continue;
      }
      const j = s.jobs.find((x) => x.id === r.busyWith)!;
      if (--j.remaining === 0) {
        complete(s, r, m + 1, opts.forecast === true, opts.forecast ? opts.redo : undefined);
        dirty = true;
      }
    }
    for (const lesson of lessons) {
      if (offset + 1 !== lesson.minutes) continue;
      if ('teaching' in lesson) {
        lesson.teaching.completedAt = m + 1;
        emit(s, { minute: m + 1, type: 'pattern_teaching_done', resourceId: lesson.learnerId, mentorId: lesson.mentorId, jobId: lesson.teaching.patternId });
      } else {
        s.resources.find(r => r.id === lesson.learnerId)!.mentorship!.completedAt = m + 1;
        emit(s, { minute: m + 1, type: 'mentoring_done', resourceId: lesson.learnerId, mentorId: lesson.mentorId, specialization: lesson.kind });
      }
      dirty = true;
    }
    // A change asked for, or a redo found, on a launch due tonight that now misses: stop and ring the studio.
    if (opts.calls && !s.callDays.includes(d)) {
      for (const e of s.events.slice(mark)) {
        if ((e.type !== 'snag' && e.type !== 'rework_found') || !e.jobId) continue;
        const j = s.jobs.find((x) => x.id === e.jobId)!;
        if (j.dueAt > start + DAY || !wouldMiss(s, j.id, m + 1)) continue;
        s.call = { jobId: j.id, minute: m + 1, cause: e.type === 'snag' ? 'snag' : 'rework', minutes: e.type === 'snag' ? (e.amount ?? 0) : 0 };
        s.callDays.push(d);
        s.minute = m + 1;
        emit(s, { minute: m + 1, type: 'call', jobId: j.id });
        return;
      }
    }
  }
  endDay(s, opts);
}

/** Closing: misses, the season's end, a launch that takes off, word of mouth settling, and the next morning. */
function endDay(s: CompanyState, opts: DayOptions): void {
  const d = s.day;
  const start = d * DAY;
  const outageDay = isOutageDay(s, d);
  if (outageDay) emit(s, { minute: start + DAY - 1, type: 'outage_end' });

  const end = start + DAY;
  for (const j of s.jobs) {
    if (j.status === 'active' && j.dueAt <= end) {
      release(s, j);
      j.status = 'missed';
      const fee = Math.floor((j.allocation * RULES.missedFeePercent) / 100);
      post(s, { minute: end, kind: 'refund', cash: -j.allocation, unearned: -j.allocation, revenue: 0, ref: j.id, note: 'Missed promise refunded' });
      post(s, { minute: end, kind: 'fee', cash: -fee, unearned: 0, revenue: 0, ref: j.id, note: 'Missed promise fee' });
      emit(s, { minute: end, type: 'missed', jobId: j.id, amount: j.allocation });
      remember(s, 'promise-missed', j.castId, end, undefined, j.contractId);
      if (!s.lostCast.includes(j.castId)) {
        s.lostCast.push(j.castId);
        const c = s.contracts.find((x) => x.id === j.contractId)!;
        if (d + 2 < RULES.days && c.price > 0) s.modifiers.push({ kind: 'returns', castId: j.castId, segment: c.segment, day: d + 2 });
      }
      addRep(s, s.contracts.find((c) => c.id === j.contractId)!.segment, RULES.rep.missed);
    }
  }
  if (d + 1 >= RULES.days) {
    for (const j of s.jobs) {
      if (j.status === 'active' || j.status === 'scheduled') {
        release(s, j);
        j.status = 'refunded';
        post(s, { minute: end, kind: 'refund', cash: -j.allocation, unearned: -j.allocation, revenue: 0, ref: j.id, note: 'Season ended before this launch; refunded' });
        emit(s, { minute: end, type: 'refunded_horizon', jobId: j.id, amount: j.allocation });
      }
    }
    s.finished = true;
  }
  // A launch that takes off: a keyed draw, never in a forecast, so the preview cannot promise luck.
  const out = s.events.filter((e) => e.day === d && e.type === 'delivered' && e.jobId);
  if (!opts.forecast && d + 1 < RULES.days && out.length && s.events.filter((e) => e.type === 'takeoff').length < RULES.takeoff.max) {
    const key = [RULES.tapeVersion, s.config.seed, s.config.scenarioId, d, 'takeoff'];
    if (drawBp(RULES.takeoff.bp, ...key)) {
      const e = out[drawInt(out.length, ...key, 'which')]!;
      const c = s.contracts.find((x) => x.id === s.jobs.find((j) => j.id === e.jobId)!.contractId)!;
      s.modifiers.push({ kind: 'arrivals', segment: c.segment, count: RULES.takeoff.arrivals, day: d + 1, source: 'word' });
      addRep(s, c.segment, RULES.takeoff.rep);
      emit(s, { minute: end, type: 'takeoff', jobId: e.jobId });
    }
  }
  for (const seg of SEGMENT_IDS) {
    const r = s.rep[seg];
    if (r !== 0) s.rep[seg] = r > 0 ? Math.max(0, r - RULES.rep.decay) : Math.min(0, r + RULES.rep.decay);
  }
  emit(s, { minute: end, type: 'day_end' });
  s.day = d + 1;
  s.minute = end;
  if (!s.finished && !opts.forecast) morning(s);
}

// ---------- calls ----------

/** Why an answer cannot be given now, or null. */
export function callBlocked(s: CompanyState, option: CallOption): string | null {
  const call = s.call;
  if (!call) return 'Nobody is on the phone.';
  const d = s.day;
  switch (option) {
    case 'late':
      if (s.overtimeDays.includes(d)) return 'They are already staying until 5pm.';
      if (s.overtimeDays.includes(d - 1)) return 'They stayed late yesterday. Not two days running.';
      return null;
    case 'cut':
      return call.cause === 'rework' ? 'Work that needs redoing cannot go out as it is.' : null;
    case 'ring':
      if (s.contracts.find(c => c.jobIds.includes(call.jobId))?.project?.id === 'lantern-night') return 'The event date cannot move.';
      return d + 1 >= RULES.days ? 'There is no tomorrow left to move it to.' : null;
    case 'ride':
      return null;
    default:
      return 'Unknown answer.';
  }
}

/** Apply an answer to the call; the day then runs on from the call's minute. */
function answer(s: CompanyState, option: CallOption): void {
  const call = s.call!;
  const d = s.day;
  const j = s.jobs.find((x) => x.id === call.jobId)!;
  s.call = null;
  if (option === 'late') {
    s.overtimeDays.push(d);
    const people = workingOn(s, d);
    const extra = RULES.aiShift - RULES.humanShift;
    for (const r of people) r.shiftMinutes += extra;
    s.usage.humanShift += extra * people.length;
    post(s, { minute: s.minute, kind: 'wages', cash: -people.length * RULES.staff.overtimePerPerson, unearned: 0, revenue: 0, ref: `day${d}`, note: `Overtime until 5pm (${people.length}), called in` });
  } else if (option === 'cut') {
    // On time without the change: no money back, but that neighbour will not buy again and their kind notice.
    const r = j.assignee ? s.resources.find((x) => x.id === j.assignee) : undefined;
    if (r && j.stage === 'finish') j.remaining = Math.max(1, j.remaining - Math.ceil((call.minutes * (j.assigneeSpeed ?? r.speedPercent)) / 100));
    else j.snag = Math.max(0, (j.snag ?? 0) - call.minutes);
    if (!s.lostCast.includes(j.castId)) s.lostCast.push(j.castId);
    remember(s, 'change-refused', j.castId, s.minute, undefined, j.contractId);
    if (s.contracts.find(c => c.id === j.contractId)?.project) {
      j.changeDeclined = true;
      emit(s, { minute: s.minute, type: 'project_change_declined', jobId: j.id });
    }
    addRep(s, s.contracts.find((c) => c.id === j.contractId)!.segment, RULES.cut.rep);
  } else if (option === 'ring') {
    j.dueAt += DAY;
    const off = Math.floor((j.allocation * RULES.ring.discountPercent) / 100);
    j.allocation -= off;
    post(s, { minute: s.minute, kind: 'refund', cash: -off, unearned: -off, revenue: 0, ref: j.id, note: "Discount for a day's grace" });
    addRep(s, s.contracts.find((c) => c.id === j.contractId)!.segment, RULES.ring.rep);
    remember(s, 'renegotiated-with-discount', j.castId, s.minute, undefined, j.contractId);
  }
}

export interface CallChoice {
  option: CallOption;
  /** Why it cannot be chosen, or null. */
  blocked: string | null;
  /** Credits it costs now. */
  cost: number;
  /** When the launch would be delivered, in absolute minutes, or null if it would miss. Forecast: no more luck either way. */
  deliveredAt: number | null;
  /** Other launches due tonight that would then miss. */
  alsoMissed: string[];
  /** Whether the called promise ships by its deadline, including a move to tomorrow. */
  keepsPromise: boolean;
  /** Existing promises due after tonight that miss, or outlast the season, under the current plan. */
  futureRisks: { jobId: string; dueAt: number; afterSeason: boolean; shared: boolean }[];
  projectConsequence?: string;
  gatheringBooking?: { day: number; available: boolean; shared: boolean };
}

/** Each answer through existing deadlines, with no future luck, arrivals or changes to the plan. */
export function callChoices(s: CompanyState): CallChoice[] {
  const call = s.call;
  if (!call) return [];
  const end = (s.day + 1) * DAY;
  const missedBefore = (x: CompanyState) => new Set(x.jobs.filter((j) => j.status === 'missed').map((j) => j.id));
  const before = missedBefore(s);
  const choices: CallChoice[] = (['late', 'cut', 'ring', 'ride'] as const).map((option) => {
    const blocked = callBlocked(s, option);
    if (blocked) return { option, blocked, cost: 0, deliveredAt: null, alsoMissed: [], keepsPromise: false, futureRisks: [] };
    const f = structuredClone(s);
    const cash = f.cash;
    answer(f, option);
    const cost = cash - f.cash;
    runFrom(f, f.minute, { forecast: true });
    const j = f.jobs.find((x) => x.id === call.jobId)!;
    const deliveredAt = j.status === 'delivered' ? j.deliveredAt : null;
    const alsoMissed = f.jobs.filter((x) => x.id !== call.jobId && x.status === 'missed' && !before.has(x.id) && x.dueAt <= end).map((x) => x.id);
    const booking = nightCalendar(s);
    const gatheringBooking = hasStudioRules(s.rulesVersion) && s.day + 1 === booking.closes && !s.contracts.some(contract => contract.project?.id === 'lantern-night')
      ? { day: booking.closes, available: (['courtyard', 'trail'] as const).some(approach => projectBlocked(f, 'lantern-night', approach) === null), shared: false } : undefined;
    const lastDue = Math.max(0, ...f.jobs.filter(x => x.status === 'active' || x.status === 'scheduled').map(x => x.dueAt));
    while (!f.finished && f.minute < lastDue) simulateDay(f, { forecast: true });
    const closingRefunds = new Set(f.events.slice(s.events.length).filter(e => e.type === 'refunded_horizon').map(e => e.jobId));
    const futureRisks = f.jobs.filter(x => x.id !== call.jobId && x.dueAt > end && (x.status === 'missed' || closingRefunds.has(x.id)) && s.jobs.some(original => original.id === x.id && (original.status === 'active' || original.status === 'scheduled')))
      .map(x => ({ jobId: x.id, dueAt: x.dueAt, afterSeason: closingRefunds.has(x.id), shared: false }));
    const project = s.contracts.find(c => c.id === j.contractId)?.project;
    const projectConsequence = option === 'cut' && project ? project.id === 'lantern-night' ? 'The original work can still be delivered; the ending will record the declined change.' : 'The original work can still be delivered, but their hosting and other contribution will be lost.' : null;
    return { option, blocked: null, cost, deliveredAt, alsoMissed, keepsPromise: j.status === 'delivered', futureRisks, ...(projectConsequence ? { projectConsequence } : {}), ...(gatheringBooking ? { gatheringBooking } : {}) };
  });
  const available = choices.filter(choice => choice.blocked === null);
  for (const choice of available) if (choice.gatheringBooking) choice.gatheringBooking.shared = available.every(other => other.gatheringBooking?.available === choice.gatheringBooking!.available);
  for (const choice of available) for (const risk of choice.futureRisks) {
    risk.shared = available.every(other => other.futureRisks.some(x => x.jobId === risk.jobId));
  }
  return choices;
}

/** Rebuild a run from its config and command log. Rejected commands are reported, not skipped silently. */
export function replay(config: RunConfig, commands: readonly Command[], rulesVersion: string = RULES.version): { state: CompanyState; errors: { index: number; error: string }[] } {
  let state = createRun(config, rulesVersion);
  const errors: { index: number; error: string }[] = [];
  commands.forEach((cmd, index) => {
    const res = applyCommand(state, cmd);
    if (res.error) errors.push({ index, error: res.error });
    state = res.state;
  });
  return { state, errors };
}
