// Workshop arithmetic: what each kind of neighbour wants, who at the window would pick a draft, and its work.
import { react, valueOffer } from '../../engine/demand';
import { RULES, SEGMENTS } from '../../engine/rules';
import { dailyCosts, fits, forecast, reactionTo, windowRequests } from '../../engine/selectors';
import { applyCommand, routedToAi, stageEffort, workingOn } from '../../engine/sim';
import type { CompanyState, Need, OfferSpec, Request, Segment } from '../../engine/types';
import { credits, hours } from '../format';

/** The smallest change this kind of neighbour would buy, and roughly what they would pay for it. */
export function wants(sg: Segment, draft: OfferSpec): string {
  const need: Need = sg.nuancedBp >= 5000 ? 'nuanced' : 'simple';
  const o = { ...draft };
  const parts: string[] = [];
  if (o.turnaroundDays > sg.maxWaitDays) {
    o.turnaroundDays = sg.maxWaitDays;
    parts.push(sg.maxWaitDays === 1 ? 'ready same day' : `ready within ${sg.maxWaitDays} days`);
  }
  if ((sg.care === 'high' || need === 'nuanced') && o.style === 'templated') {
    o.style = 'custom';
    parts.push('made to order');
  }
  if (need === 'nuanced' && o.scope === 'simple') {
    o.scope = 'any';
    parts.push('any brief');
  }
  parts.push(`about ${credits(valueOffer(sg.id, need, 100, o).wtp)}`);
  return `Wants: ${parts.join(', ')}.`;
}

export interface Reach {
  kinds: number;
  waiting: number;
  buyThis: number;
  switched: number;
}

export function reachOf(state: CompanyState, draft: OfferSpec, slot: number): Reach {
  const menuWith = [...state.menu.slice(0, slot), draft, ...state.menu.slice(slot + 1)].slice(0, RULES.maxMenu);
  const draftIndex = Math.min(slot, menuWith.length - 1);
  const waiting = windowRequests(state).filter((r) => r.status === 'waiting' && !r.offer);
  let buyThis = 0;
  let switched = 0;
  for (const r of waiting) {
    const now = react(r, state.menu, state.lostCast);
    const next = react(r, menuWith, state.lostCast);
    if (next.kind === 'buy' && next.offerIndex === draftIndex) {
      buyThis++;
      if (now.kind === 'buy' && now.offerIndex !== slot) switched++;
    }
  }
  const kinds = Object.values(SEGMENTS).filter((sg) => valueOffer(sg.id, 'simple', 100, draft).blocker === null || (sg.nuancedBp > 0 && valueOffer(sg.id, 'nuanced', 100, draft).blocker === null)).length;
  return { kinds, waiting: waiting.length, buyThis, switched };
}

/**
 * Of today's waiting neighbours who would pick the draft, how many the studio could take in queue order without
 * putting any promise at risk. The same forecast the window's tickets use, so the two never disagree.
 */
export function fitsToday(state: CompanyState, draft: OfferSpec, slot: number): { buyers: number; fit: number; afterSeason: number } {
  const menuWith = [...state.menu.slice(0, slot), draft, ...state.menu.slice(slot + 1)].slice(0, RULES.maxMenu);
  const draftIndex = Math.min(slot, menuWith.length - 1);
  const set = applyCommand(state, { type: 'setMenu', offers: menuWith });
  if (set.error) return { buyers: 0, fit: 0, afterSeason: 0 };
  let s = set.state;
  let buyers = 0;
  let fit = 0;
  let afterSeason = 0;
  for (const r of windowRequests(s)) {
    if (r.status !== 'waiting' || r.offer) continue;
    const re = reactionTo(s, r);
    if (re.kind !== 'buy' || re.offerIndex !== draftIndex) continue;
    buyers++;
    const f = forecast(s, r.id);
    // Launches after the season ends are counted apart: more hands would not help them.
    if (f.newAfterSeason.length) afterSeason++;
    if (!fits(f)) continue;
    const res = applyCommand(s, { type: 'accept', requestId: r.id });
    if (res.error) continue;
    s = res.state;
    fit++;
  }
  return { buyers, fit, afterSeason };
}

/** People's minutes a simple launch of this offer takes with today's desk, from the engine's own effort rule. */
export function launchMinutes(state: CompanyState, offer: OfferSpec): number {
  const job = { templated: offer.style === 'templated', need: 'simple' as const };
  const toAi = state.staffing.aiTier !== 'none' && routedToAi(state.staffing, job);
  return stageEffort(state, { ...job, stage: 'brief' }, 'human') + stageEffort(state, { ...job, stage: 'finish' }, 'human') + (toAi ? 0 : stageEffort(state, { ...job, stage: 'produce' }, 'human'));
}

/**
 * What each offer on the window earns per hour of people's time (a simple launch, with today's desk), against what the
 * studio costs to run per hour of people's time, both to the nearest 5 cr. Null when nobody works today. Shown on the
 * sign: panel players filled the season with a cheap offer, kept every promise and finished at a loss, unaware.
 */
export function offerRates(state: CompanyState): { costs: number; earns: number[]; under: boolean[] } | null {
  const rates = state.menu.map((o) => offerEconomics(state, o));
  return rates[0] ? { costs: rates[0].costs, earns: rates.map((r) => r?.earns ?? 0), under: rates.map((r) => r?.under ?? true) } : null;
}

/** A draft's simple-launch economics at today's staffing, before redos or unused hours. */
export function offerEconomics(state: CompanyState, offer: OfferSpec): { earns: number; costs: number; cover: number; minutes: number; under: boolean } | null {
  const people = workingOn(state, state.day);
  const overtime = state.overtimeDays.includes(state.day);
  const shift = overtime ? RULES.minutesPerDay : RULES.humanShift;
  const have = people.reduce((a, r) => a + Math.floor((shift * 100) / r.speedPercent), 0);
  const minutes = launchMinutes(state, offer);
  if (!have || !minutes || !offer.price) return null;
  const total = dailyCosts(state).total + (overtime ? people.length * RULES.staff.overtimePerPerson : 0);
  const perLaunch = offer.price / offer.launches;
  return { earns: Math.round(perLaunch / (minutes / 60) / 5) * 5, costs: Math.round(total / (have / 60) / 5) * 5, cover: Math.ceil(total / perLaunch), minutes, under: perLaunch * have < total * minutes };
}

/** People's time a simple launch of this offer takes with today's desk, in words, against the hours in today. */
export function workNote(state: CompanyState, draft: OfferSpec): string {
  const templated = draft.style === 'templated';
  const toAi = state.staffing.aiTier !== 'none' && routedToAi(state.staffing, { need: 'simple' });
  const mins = launchMinutes(state, draft);
  const have = workingOn(state, state.day).reduce((a, r) => a + Math.floor((RULES.humanShift * 100) / r.speedPercent), 0);
  const kit = templated && state.kit.status !== 'ready' ? ` The template kit is not built yet: the first templated job spends about ${Math.round(RULES.effort.kitSetup / 60)} hours of one person's day building it, and halves the making after that.` : '';
  return `A simple launch needs about ${hours(mins)} of people's time with your current desk${toAi ? ' (the AI desk does the making)' : ''}. The people in today have about ${hours(have)} a day.${kit}`;
}

/**
 * For neighbours put off only by price: the offer most of them are closest to affording, and the price (to the 10
 * below what the least willing would pay) at which every one of them would buy it.
 */
export function priceTarget(state: CompanyState, rs: Request[]): { offerIndex: number; price: number; prices: number[] } | null {
  const best = rs
    .map((r) => reactionTo(state, r))
    .filter((x) => x.kind === 'walk' && x.reason === 'price')
    .map((x) => x.valuations.filter((v) => v.blocker === 'price' && v.wtp > 0).sort((a, b) => b.wtp / (state.menu[b.offerIndex]?.price ?? 1) - a.wtp / (state.menu[a.offerIndex]?.price ?? 1))[0])
    .filter((v) => v !== undefined);
  if (!best.length) return null;
  const counts = new Map<number, number>();
  for (const v of best) counts.set(v.offerIndex, (counts.get(v.offerIndex) ?? 0) + 1);
  const offerIndex = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const prices = best.filter((v) => v.offerIndex === offerIndex).map((v) => Math.floor(v.wtp / 10) * 10);
  const price = Math.max(RULES.limits.price[0], Math.min(...prices));
  return { offerIndex, price, prices };
}
