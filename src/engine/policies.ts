// Scripted managers. Used for the ghost shops on the end screen and the balance sweep.
// A policy only issues ordinary commands; it gets no privileges the player lacks.
import { NEWS } from './news';
import { PRESETS, RULES } from './rules';
import { counterFor, fits, forecast, reactionTo, summarize, windowRequests } from './selectors';
import { applyCommand, callChoices, createRun, makerBusyWith, newsOptions, routedToAi, stageEffort, workingOn } from './sim';
import type { Command, CompanyState, NewsCardId, OfferSpec, Pace, Request, RunConfig, Staffing, UpgradeId } from './types';

/** all: take every buyer. forecast: take buyers in queue order while they fit. cheapest: take the least human work first. */
export type AcceptRule = 'all' | 'forecast' | 'cheapest';

/** A change the manager makes on a given morning. */
export interface PlanStep {
  day: number;
  menu?: OfferSpec[];
  staffing?: Staffing;
  hire?: boolean;
  letGo?: boolean;
  buy?: UpgradeId[];
}

export interface Policy {
  id: string;
  label: string;
  menu: OfferSpec[];
  staffing: Staffing;
  accept: AcceptRule;
  plan?: PlanStep[];
  /** How the manager answers street news: always the stated default, or a simple rule of thumb. */
  news?: 'default' | 'sensible';
  /** Book overtime on a morning when a buyer would fit only with it. */
  overtime?: boolean;
  /** Take a neighbour's counter-offer (GD-11) when it fits, after the buyers. */
  counters?: boolean;
  /** The pace set every morning; steady when left out. */
  pace?: Pace;
  /** Mid-day calls are answered with the first answer that saves the launch without losing another; false leaves every
   * call unanswered (the launch misses). */
  calls?: boolean;
  /** Take a neighbour who rings ahead for tomorrow when it fits: always, or only while the season is losing money
   * (silver and gold need a profit). Off by default, so par measures the neighbours a studio can serve; a booking
   * trades neighbours for credits, and that trade is the player's. */
  bookings?: boolean | 'whenLosing' | 'early';
  /** Tricky hand-made briefs: always Ada, always Tomas, or Tomas when Ada is busy or contested. */
  maker?: 'h1' | 'h2' | 'contested';
}

function must(state: CompanyState, cmd: Command): CompanyState {
  const res = applyCommand(state, cmd);
  if (res.error) throw new Error(`Policy issued an invalid command ${cmd.type}: ${res.error}`);
  return res.state;
}

function tryApply(state: CompanyState, cmd: Command): CompanyState {
  const res = applyCommand(state, cmd);
  return res.error ? state : res.state;
}

/** A plain rule of thumb for each card; the point is a reasonable manager, not an optimal one. */
function sensibleChoice(s: CompanyState, card: NewsCardId): number {
  const ai = s.staffing.aiTier !== 'none';
  const choice: Record<NewsCardId, number> = {
    ill: s.jobs.some((j) => j.status === 'active') ? 1 : 0,
    gazette: s.cash > 2500 ? 1 : 0,
    bulk: 1,
    rival: 0,
    aiPrice: ai ? 1 : 0,
    market: 0,
    maintenance: ai ? 1 : 0,
    rain: 1,
    student: 1,
    premiere: 1,
    loan: s.cash < 800 ? 1 : 0,
    referral: s.cash > 2000 ? 1 : 0,
    maraGrows: 1,
    eliExtended: 1,
    hugoRetires: 1,
    clemTen: 1,
    oscarRescue: 1,
    streetParty: 1,
    crossroads: 2,
    poach: s.cash > 2000 ? 1 : 0,
    blackout: 0,
    lastOffer: 0,
  };
  return choice[card];
}

/** Rough people-minutes a neighbour's order would take, for ordering the queue. */
function humanMinutesFor(s: CompanyState, r: Request): number {
  const x = reactionTo(s, r);
  if (x.kind !== 'buy') return Infinity;
  const job = { need: r.need, templated: x.offer.style === 'templated' };
  const e = (stage: 'brief' | 'produce' | 'finish') => stageEffort(s, { ...job, stage }, 'human');
  const produce = s.staffing.aiTier !== 'none' && routedToAi(s.staffing, job) ? 0 : e('produce');
  return x.offer.launches * (e('brief') + produce + e('finish'));
}

function answerNews(s: CompanyState, p: Policy): CompanyState {
  for (const n of s.news) {
    if (n.day !== s.day || n.choice !== null || (p.news ?? 'default') === 'default') continue;
    const option = Math.min(sensibleChoice(s, NEWS[n.card].id), newsOptions(s, n).length - 1);
    s = tryApply(s, { type: 'choose', newsId: n.id, option });
  }
  return s;
}

function takesBookings(s: CompanyState, p: Policy): boolean {
  return p.bookings === true || (p.bookings === 'whenLosing' && summarize(s).operatingResult < 0) || (p.bookings === 'early' && s.day < RULES.days / 2);
}

function makerFor(s: CompanyState, r: Request, p: Policy): string | undefined {
  if (!p.maker || r.need !== 'nuanced' || reactionTo(s, r).kind !== 'buy' || (s.staffing.aiTier !== 'none' && routedToAi(s.staffing, r))) return undefined;
  // As on the ticket, there is a choice only when both makers are in.
  const working = workingOn(s, s.day).map((x) => x.id);
  if (!Object.keys(RULES.makers).every((id) => working.includes(id))) return undefined;
  if (p.maker !== 'contested') return p.maker;
  if (makerBusyWith(s, 'h1')) return 'h2';
  const contested = windowRequests(s).some((x) => x.id !== r.id && x.status === 'waiting' && x.need === 'nuanced'
    && (x.source !== 'booking' || takesBookings(s, p)) && reactionTo(s, x).kind === 'buy'
    && fits(forecast(s, x.id, { maker: 'h1' })));
  return contested ? 'h2' : 'h1';
}

/** Optional observer for measurement scripts; never changes what the manager does. */
export interface PolicyHooks {
  onBuyer?: (s: CompanyState, requestId: string, fit: boolean) => void;
  onMorning?: (s: CompanyState) => void;
}

export function runPolicy(config: RunConfig, p: Policy, hooks: PolicyHooks = {}, rulesVersion: string = RULES.version): CompanyState {
  let s = createRun(config, rulesVersion);
  s = must(s, { type: 'setMenu', offers: p.menu });
  s = must(s, { type: 'setStaff', staffing: p.staffing });
  while (!s.finished) {
    for (const step of p.plan ?? []) {
      if (step.day !== s.day) continue;
      if (step.menu) s = tryApply(s, { type: 'setMenu', offers: step.menu });
      if (step.staffing) s = tryApply(s, { type: 'setStaff', staffing: step.staffing });
      if (step.hire) s = tryApply(s, { type: 'hire' });
      if (step.letGo) for (const r of s.resources.filter((x) => x.role === 'junior')) s = tryApply(s, { type: 'letGo', resourceId: r.id });
      for (const item of step.buy ?? []) s = tryApply(s, { type: 'buy', item });
    }
    hooks.onMorning?.(s);
    // Push is refused the day after a push, so a pushing manager pushes every other morning.
    if (p.pace && p.pace !== 'steady') s = tryApply(s, { type: 'pace', pace: p.pace });
    s = answerNews(s, p);
    const queue = windowRequests(s).filter((r) => r.status === 'waiting');
    if (p.accept === 'cheapest') queue.sort((a, b) => humanMinutesFor(s, a) - humanMinutesFor(s, b) || a.index - b.index);
    for (const r of queue) {
      if (r.status !== 'waiting') continue;
      if (r.source === 'booking' && !takesBookings(s, p)) {
        s = must(s, { type: 'decline', requestId: r.id });
        continue;
      }
      const buys = reactionTo(s, r).kind === 'buy';
      const maker = makerFor(s, r, p);
      const opts = maker ? { maker } : {};
      // A rejected accept has an empty forecast, so check the maker's slot before asking whether the work fits.
      if (maker && makerBusyWith(s, maker)) {
        if (buys) hooks.onBuyer?.(s, r.id, false);
        s = must(s, { type: 'decline', requestId: r.id });
        continue;
      }
      const fit = buys && (p.accept !== 'all' || hooks.onBuyer) ? fits(forecast(s, r.id, opts)) : false;
      if (buys) hooks.onBuyer?.(s, r.id, fit);
      let ok = buys && (p.accept === 'all' || fit);
      if (buys && !ok && p.overtime && !s.overtimeDays.includes(s.day)) {
        const late = applyCommand(s, { type: 'overtime' });
        if (!late.error && fits(forecast(late.state, r.id, opts))) {
          s = late.state;
          ok = true;
        }
      }
      // A counter-offer (GD-11), when the manager takes them and it fits.
      if (!buys && p.counters && counterFor(s, r) && fits(forecast(s, r.id, { counter: true }))) {
        s = must(s, { type: 'accept', requestId: r.id, counter: true });
        continue;
      }
      s = must(s, ok ? { type: 'accept', requestId: r.id, ...opts } : { type: 'decline', requestId: r.id });
    }

    s = must(s, p.calls === false ? { type: 'runDay' } : { type: 'runDay', calls: true });
    while (s.call) {
      const save = callChoices(s).find((c) => !c.blocked && c.deliveredAt !== null && !c.alsoMissed.length);
      s = must(s, { type: 'answer', option: save?.option ?? 'ride' });
    }
  }
  return s;
}

export const GHOSTS = {
  old: {
    id: 'old',
    label: 'Old Lantern',
    menu: [PRESETS.bespoke],
    staffing: { aiTier: 'none', routing: 'human' },
    accept: 'forecast',
  },
  faster: {
    id: 'faster',
    label: 'Faster Lantern',
    menu: [PRESETS.bespoke],
    staffing: { aiTier: 'solo', routing: 'all' },
    accept: 'forecast',
  },
  hand: {
    id: 'hand',
    label: 'Handmade Lantern',
    menu: [PRESETS.bespoke, PRESETS.launchlet],
    staffing: { aiTier: 'none', routing: 'human' },
    accept: 'forecast',
    news: 'sensible',
    overtime: true,
    plan: [{ day: 0, hire: true, buy: ['library'] }],
  },
  bright: {
    id: 'bright',
    label: 'Bright Lantern',
    menu: [PRESETS.bespoke, PRESETS.launchlet],
    staffing: { aiTier: 'solo', routing: 'all' },
    accept: 'forecast',
    news: 'sensible',
    overtime: true,
  },
} satisfies Record<string, Policy>;
