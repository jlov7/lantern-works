// The season debrief: a factual digest of the run (the only thing a model may draw on) and the offline debrief.
import { valueOffer, type WalkReason } from '../engine/demand';
import { GHOSTS, runPolicy } from '../engine/policies';
import { PRESETS, RULES, SCENARIOS } from '../engine/rules';
import { seasonEnding } from '../engine/endings';
import { counterFor, medalFor, summarize, takeableInTurn } from '../engine/selectors';
import { applyCommand, createRun } from '../engine/sim';
import type { CompanyState, OfferSpec, Staffing } from '../engine/types';
import { castName, ROUTING_LABEL, TIER_LABEL } from '../ui/format';

export interface Debrief {
  headline: string;
  paragraphs: string[];
  tryNext: string;
}

export const REASON_COPY: Record<WalkReason, string> = {
  price: 'found the price too high',
  slow: 'needed it sooner',
  scope: 'needed more care than the offer covered',
  care: 'wanted it made for them, not from a template',
  lost: 'would not come back after a missed promise',
  empty: 'found nothing on the window',
};
const DECLINED = 'were turned away by you';
const UNANSWERED_FIT = 'could have been taken but were left unanswered';
const UNANSWERED_FULL = "did not fit the studio's hours and were left unanswered";
const HAGGLE = 'offered their own price and were left unanswered';

/** The state just before each day opened, after that morning's answers: what the window's forecast saw. */
function* openingStatesSteps(s: CompanyState): Generator<void, CompanyState[]> {
  const out: CompanyState[] = [];
  let t = createRun(s.config, s.rulesVersion);
  for (const c of s.commands) {
    yield;
    if (c.type === 'runDay') out.push(t);
    const r = applyCommand(t, c);
    if (!r.error) t = r.state;
  }
  return out;
}

const offerKey = (o: OfferSpec) => JSON.stringify([o.name, o.launches, o.spacingDays, o.turnaroundDays, o.scope, o.style, o.price]);
const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.floor(i / 26) - 1) + letters(i % 26));
const INITIAL_MENU: OfferSpec[] = [PRESETS.bespoke];
const INITIAL_STAFF: Staffing = { aiTier: 'none', routing: 'human' };

/** Every offer the player put on the window or sold, with a neutral id (offer_A, offer_B, ...) in order of first use. */
export function offerIds(s: CompanyState): Map<string, { id: string; offer: OfferSpec }> {
  const ids = new Map<string, { id: string; offer: OfferSpec }>();
  const add = (o: OfferSpec) => {
    const k = offerKey(o);
    if (!ids.has(k)) ids.set(k, { id: `offer_${letters(ids.size)}`, offer: o });
  };
  const firstMenu = s.commands.find((c) => c.type === 'setMenu' || c.type === 'runDay');
  if (firstMenu?.type !== 'setMenu') INITIAL_MENU.forEach(add);
  for (const c of s.commands) if (c.type === 'setMenu') c.offers.forEach(add);
  for (const c of s.contracts) add(c.offer);
  s.menu.forEach(add);
  return ids;
}

/** Id to the player's own offer name, to put names back into a model's text. */
export function offerNames(s: CompanyState): Record<string, string> {
  return Object.fromEntries([...offerIds(s).values()].map((v) => [v.id, v.offer.name]));
}

/** Replace offer ids in model text with the player's offer names; an id the model invented becomes plain "offer". */
export const withOfferNames = (text: string, names: Record<string, string>): string => text.replace(/\boffer_[A-Z]+\b/g, (id) => names[id] ?? 'offer');

/** The window and staffing in force when each day ran, rebuilt from the player's commands. */
function perDay(s: CompanyState) {
  let menu = INITIAL_MENU;
  let staff = INITIAL_STAFF;
  const days: { menu: OfferSpec[]; staff: Staffing; accepted: number; declined: number; changes: string[] }[] = [];
  const ids = offerIds(s);
  days.push({ menu, staff, accepted: 0, declined: 0, changes: [] });
  for (const c of s.commands) {
    const d = days[days.length - 1]!;
    if (c.type === 'setMenu' && JSON.stringify(c.offers) !== JSON.stringify(menu)) {
      menu = c.offers;
      d.menu = menu;
      d.changes.push(menu.length ? `window: ${menu.map((o) => ids.get(offerKey(o))!.id).join(' and ')}` : 'window emptied');
    } else if (c.type === 'setStaff' && JSON.stringify(c.staffing) !== JSON.stringify(staff)) {
      staff = c.staffing;
      d.staff = staff;
      d.changes.push(`staff: ${TIER_LABEL[staff.aiTier]}${staff.aiTier === 'none' ? '' : `, ${ROUTING_LABEL[staff.routing]}`}`);
    } else if (c.type === 'accept') d.accepted++;
    else if (c.type === 'decline') d.declined++;
    else if (c.type === 'runDay') {
      d.menu = menu;
      d.staff = staff;
      days.push({ menu, staff, accepted: 0, declined: 0, changes: [] });
    }
  }
  return days;
}

/** Why each neighbour who arrived was not served, counted by reason. */
function* notServedReasonSteps(s: CompanyState, days: ReturnType<typeof perDay>, fullByDay?: Map<number, number>): Generator<void, Record<string, number>> {
  const out: Record<string, number> = {};
  const bump = (k: string) => (out[k] = (out[k] ?? 0) + 1);
  const jobCast = new Map(s.jobs.map((j) => [j.id, j.castId]));
  const lostOn = new Map<string, number>();
  let opening: CompanyState[] | null = null;
  const takeable: Set<string>[] = [];
  for (const e of s.events) {
    if (e.type !== 'missed' || !e.jobId) continue;
    const cast = jobCast.get(e.jobId);
    if (cast && !lostOn.has(cast)) lostOn.set(cast, e.day);
  }
  for (const r of s.requests) {
    yield;
    if (r.status !== 'walked' && r.status !== 'declined') continue;
    const menu = days[r.day]?.menu ?? [];
    const lost = lostOn.get(r.castId);
    if (lost !== undefined && lost < r.day) {
      bump(REASON_COPY.lost);
      continue;
    }
    if (menu.length === 0) {
      bump(REASON_COPY.empty);
      continue;
    }
    const blockers = menu.map((o) => valueOffer(r.segment, r.need, r.wtpPercent, o).blocker);
    // A neighbour turned away who would not have bought anything is counted by their own objection.
    if (blockers.some((b) => b === null)) {
      if (r.status === 'declined') bump(DECLINED);
      else {
        // Left at the window: say whether the studio could have taken them that morning.
        // Counted together, in queue order: two buyers who each fit alone may not both fit.
        const at = (opening ??= yield* openingStatesSteps(s))[r.day];
        const took = at ? (takeable[r.day] ??= new Set(takeableInTurn(at))) : null;
        bump(took?.has(r.id) ? UNANSWERED_FIT : UNANSWERED_FULL);
        if (!took?.has(r.id)) fullByDay?.set(r.day, (fullByDay.get(r.day) ?? 0) + 1);
      }
    }
    else {
      const why = (['price', 'slow', 'scope', 'care'] as const).find((k) => blockers.includes(k)) ?? 'price';
      // Put off only by price but named their own: left unanswered, not turned off by the price alone.
      const at = why === 'price' && r.status === 'walked' ? (opening ??= yield* openingStatesSteps(s))[r.day] : undefined;
      const morning = at?.requests.find((x) => x.id === r.id);
      bump(at && morning && counterFor(at, morning) ? HAGGLE : REASON_COPY[why]);
    }
  }
  for (const c of s.contracts) {
    const jobs = s.jobs.filter((j) => j.contractId === c.id);
    if (jobs.some((j) => j.status === 'delivered')) continue;
    bump(jobs.some((j) => j.status === 'missed') ? 'bought, but every launch they got was late' : 'bought, but nothing was finished before the season closed');
  }
  return out;
}

function complete<T>(steps: Generator<void, T>): T {
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

function notServedReasons(s: CompanyState, days: ReturnType<typeof perDay>, fullByDay?: Map<number, number>): Record<string, number> {
  return complete(notServedReasonSteps(s, days, fullByDay));
}

/** Mid-season: why the neighbours who have left so far did not buy, most common first (orders still open are not counted). */
export function lostSoFar(s: CompanyState): { reason: string; neighbours: number }[] {
  return complete(lostSoFarSteps(s));
}

/** UI fallback callers can yield between requests and historical replay commands. */
export function* lostSoFarSteps(s: CompanyState): Generator<void, ReturnType<typeof lostSoFar>> {
  return Object.entries(yield* notServedReasonSteps(s, perDay(s)))
    .filter(([reason]) => !reason.startsWith('bought, but'))
    .sort((a, b) => b[1] - a[1])
    .map(([reason, neighbours]) => ({ reason, neighbours }));
}

export interface DigestOptions {
  /** Also run the two ghost shops on the same street and seed (about 70 ms). */
  ghosts?: boolean;
}

/** A compact, factual digest of the run: the only thing the debrief may draw on. Offers appear as neutral ids. */
export function digest(s: CompanyState, opts: DigestOptions = {}) {
  const sum = summarize(s);
  const ids = offerIds(s);
  const days = perDay(s);
  const medal = medalFor(s);
  const sold = new Map<string, number>();
  for (const c of s.contracts) sold.set(offerKey(c.offer), (sold.get(offerKey(c.offer)) ?? 0) + 1);
  const startingCash = s.cash - s.journal.reduce((a, e) => a + e.cash, 0);
  const timeline = days
    .slice(0, Math.max(1, s.day))
    .map((d, i) => (d.changes.length ? `Day ${i + 1}: ${d.changes.join('; ')}` : null))
    .filter((x): x is string => x !== null);
  const fullByDay = new Map<number, number>();
  const notServed = Object.entries(notServedReasons(s, days, fullByDay))
    .sort((a, b) => b[1] - a[1])
    .map(([reason, neighbours]) => ({ reason, neighbours }));
  let ghosts: { shop: string; neighboursServed: number; endingCashCredits: number }[] | undefined;
  if (opts.ghosts) {
    try {
      ghosts = Object.values(GHOSTS).map((g) => {
        const gs = summarize(runPolicy(s.config, g, {}, s.rulesVersion));
        return { shop: g.label, neighboursServed: gs.served, endingCashCredits: gs.cash };
      });
    } catch {
      ghosts = undefined;
    }
  }
  return {
    street: SCENARIOS.find((x) => x.id === s.config.scenarioId)?.name ?? 'A custom street',
    seasonDays: RULES.days,
    daysPlayed: s.day,
    ending: seasonEnding(s).title,
    medal: medal.medal ?? 'none',
    medalReason: medal.reason,
    neighboursArrived: sum.arrived,
    neighboursServed: sum.served,
    neighboursNotServed: sum.arrived - sum.served,
    // The mornings that lost most buyers to hours, by day number, so "did not fit" can be traced to when.
    notFitDays: [...fullByDay]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 3)
      .sort((a, b) => a[0] - b[0])
      .map(([day, neighbours]) => ({ day: day + 1, neighbours })),
    sales: s.contracts.length,
    launchesDelivered: sum.delivered,
    launchesMissed: sum.missed,
    launchesRefundedAtSeasonEnd: sum.refundedAtClose,
    startingCashCredits: startingCash,
    endingCashCredits: sum.cash,
    earnedRevenueCredits: sum.revenue,
    operatingResultCredits: sum.operatingResult,
    costsCredits: { wages: sum.wages, shop: sum.shop, aiDesk: sum.ai, missedFees: sum.fees },
    peopleBusyPercent: Math.round(sum.humanUtil * 100),
    aiDeskBusyPercent: sum.aiUtil === null ? null : Math.round(sum.aiUtil * 100),
    offers: [...ids.entries()].map(([k, v]) => ({
      id: v.id,
      launches: v.offer.launches,
      spacingDays: v.offer.spacingDays,
      turnaroundDays: v.offer.turnaroundDays,
      scope: v.offer.scope,
      style: v.offer.style,
      priceCredits: v.offer.price,
      timesSold: sold.get(k) ?? 0,
    })),
    notServed,
    lostNeighbours: s.lostCast.map(castName),
    timeline,
    days: Array.from({ length: s.day }, (_, d) => ({
      day: d + 1,
      arrived: s.requests.filter((r) => r.day === d).length,
      sold: days[d]?.accepted ?? 0,
      declined: days[d]?.declined ?? 0,
      delivered: s.events.filter((e) => e.day === d && e.type === 'delivered').length,
      missed: s.events.filter((e) => e.day === d && e.type === 'missed').length,
    })),
    ...(ghosts ? { ghosts } : {}),
  };
}

export type Digest = ReturnType<typeof digest>;

/** What the player already tried this season, from their own commands and sales. */
export function tried(s: CompanyState) {
  const menus = [INITIAL_MENU, ...s.commands.flatMap((c) => (c.type === 'setMenu' ? [c.offers] : [])), s.contracts.map((c) => c.offer)];
  const offers = menus.flat();
  const staffs = s.commands.flatMap((c) => (c.type === 'setStaff' ? [c.staffing] : []));
  return {
    aiDesk: s.journal.some((e) => e.kind === 'ai') || staffs.some((x) => x.aiTier !== 'none'),
    routeAll: staffs.some((x) => x.aiTier !== 'none' && x.routing === 'all'),
    templated: offers.some((o) => o.style === 'templated'),
    multiLaunch: offers.some((o) => o.launches > 1),
    hire: s.commands.some((c) => c.type === 'hire') || s.resources.some((r) => r.role === 'junior'),
    overtime: s.commands.some((c) => c.type === 'overtime'),
  };
}

export type TryNextId = 'fewer-promises' | 'answer-all' | 'design-for-walkers' | 'hire' | 'overtime' | 'ai-desk' | 'templated' | 'route-all' | 'multi-launch' | 'other-street';

/** The offline "try next": the first suggestion that applies and that the season did not already do. */
export function pickTryNext(s: CompanyState, d: Digest = digest(s)): { id: TryNextId; text: string } {
  const t = tried(s);
  const aiIdle = d.aiDeskBusyPercent !== null && d.aiDeskBusyPercent < 30;
  const soldSmall = s.contracts.some((c) => c.offer.style === 'templated' || c.offer.launches > 1 || c.offer.turnaroundDays <= 2);
  const topReason = d.notServed.find((r) => r.reason !== DECLINED && r.reason !== UNANSWERED_FULL)?.reason;
  if (d.launchesMissed > 2) return { id: 'fewer-promises', text: 'Turn a few more people away when the forecast warns; missed promises cost the fee and the neighbour.' };
  // A deliberate refusal does not establish that the buyer lacked capacity.
  const full = d.notServed.find((r) => r.reason === UNANSWERED_FULL)?.neighbours ?? 0;
  const other = Math.max(0, ...d.notServed.filter((r) => r.reason !== UNANSWERED_FULL).map((r) => r.neighbours));
  const lost = `${full} neighbours did not fit the studio's hours and were left unanswered`;
  if (full >= 5 && full >= other) {
    if (!t.hire) return { id: 'hire', text: `${lost}, more than left for any other reason. Try hiring Noor in the first days: a junior adds hours from the next morning.` };
    if (!t.overtime) return { id: 'overtime', text: `${lost}. Try overtime on the busiest mornings, though not two days running.` };
    // More hands were tried and hours were still the limit: shorten the work instead, never a price or offer tip.
    if (!t.templated) return { id: 'templated', text: `${lost}, even with more hands. Try a templated offer: once the kit is built, briefs and making take about half the time.` };
    if (!t.aiDesk) return { id: 'ai-desk', text: `${lost}, even with more hands. Try one AI desk making the simple briefs, so people only brief and finish.` };
    return { id: 'fewer-promises', text: `${lost}, with every way to more hours tried. Choose who gets the hours on the busiest mornings: the bigger orders first.` };
  }
  const ready = d.notServed.find((r) => r.reason === UNANSWERED_FIT)?.neighbours ?? 0;
  if (topReason === UNANSWERED_FIT && ready >= 5)
    return { id: 'answer-all', text: `${ready} neighbours were ready to buy and fitted your hours, but were still at the window when you opened. Answer everyone before opening: "Take everyone who fits" takes them in turn.` };
  const named = d.notServed.find((r) => r.reason === HAGGLE)?.neighbours ?? 0;
  if (topReason === HAGGLE && named >= 5)
    return { id: 'answer-all', text: `${named} neighbours named their own price at the window and were left waiting until they gave up. Answer them before opening: take their price or turn them down.` };
  if (d.neighboursServed < d.neighboursArrived / 2 && topReason && d.notServed[0]?.reason === topReason && other > full) return { id: 'design-for-walkers', text: `Most neighbours left without a launch, most often because they ${topReason}. Try an offer aimed at them.` };
  if (d.peopleBusyPercent >= 85 && !t.hire) return { id: 'hire', text: 'Your people were the limit. Try hiring a junior early: briefing and finishing are where the hours go.' };
  if (full >= 3 && !t.overtime) return { id: 'overtime', text: `${lost}. Try overtime on the busiest mornings, though not two days running.` };
  if (soldSmall && !t.aiDesk) return { id: 'ai-desk', text: 'Try the same street with one AI desk making the simple briefs.' };
  if (aiIdle && !t.templated) return { id: 'templated', text: 'Your AI desk was mostly idle: briefing and finishing were the limit. Try a templated offer, which shortens the briefing.' };
  if (aiIdle && !t.routeAll) return { id: 'route-all', text: 'Your AI desk was mostly idle. Try routing every brief to it and watch the rework.' };
  if (!t.multiLaunch) return { id: 'multi-launch', text: 'Try an offer with several launches, so one sale brings repeat work.' };
  return { id: 'other-street', text: 'Try a different street, or rewind to a morning where you hesitated.' };
}

const n = (x: number) => x.toLocaleString('en-GB');

export function debriefOffline(s: CompanyState): Debrief {
  const d = digest(s);
  const names = offerNames(s);
  const top = [...d.offers].sort((a, b) => b.timesSold - a.timesSold)[0];
  const refunded = d.launchesRefundedAtSeasonEnd > 0 ? ` ${d.launchesRefundedAtSeasonEnd} unfinished launches were refunded when the season closed, so they never counted as revenue.` : '';
  const p1 =
    d.sales > 0 && top
      ? `You sold ${d.sales} times, most often ${names[top.id]} (${top.timesSold}). ${d.launchesDelivered} launches shipped and ${d.launchesMissed} missed.${refunded} People were busy ${d.peopleBusyPercent}% of their hours${d.aiDeskBusyPercent === null ? '.' : `; the AI desk ${d.aiDeskBusyPercent}% of its hours.`}`
      : 'Nobody bought anything this season, so wages ran down the cash with nothing coming in.';
  const why = d.notServed[0];
  // Buyers lost to hours, traced to their mornings: more came than the people in could brief, make and finish by their
  // deadlines, and hours free later in the day cannot do same-day work that has not been briefed yet.
  const full = d.notServed.find((r) => r.reason === UNANSWERED_FULL);
  const when =
    full && d.notFitDays.length
      ? ` ${why === full ? 'The most who did not fit came' : `Another ${full.neighbours} did not fit your hours, the most`} on ${d.notFitDays.map((x) => `Day ${x.day} (${x.neighbours})`).join(', ').replace(/, ([^,]*)$/, ' and $1')}: mornings when more buyers came than the people in could brief, make and finish by their deadlines. Hours free later in a day cannot take same-day work, so more hands on those mornings (Noor, a temp or overtime) is what would have served them.`
      : '';
  const p2 = `${d.neighboursNotServed} of ${d.neighboursArrived} neighbours left without a launch${why ? `; ${why.neighbours} ${why.reason}` : ''}.${when} Ending cash was ${n(d.endingCashCredits)} credits and the operating result ${n(d.operatingResultCredits)}.`;
  return { headline: d.ending, paragraphs: [p1, p2], tryNext: pickTryNext(s, d).text };
}

export function reasonCopy(r: WalkReason): string {
  return REASON_COPY[r];
}
