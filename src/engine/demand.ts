// How a neighbour values an offer, and which offer on the window they pick.
// Everything here is an authored, legible rule, not a demand forecast.
import { RULES, SEGMENTS } from './rules';
import type { Need, OfferSpec, Request } from './types';

export type WalkReason = 'price' | 'slow' | 'scope' | 'care' | 'lost' | 'empty';

export interface OfferValuation {
  offerIndex: number;
  /** Highest price this neighbour would pay for this offer today; 0 if ineligible. */
  wtp: number;
  blocker: Exclude<WalkReason, 'lost' | 'empty'> | null;
}

export type Reaction =
  | { kind: 'buy'; offerIndex: number; offer: OfferSpec; price: number; wtp: number; valuations: OfferValuation[] }
  | { kind: 'walk'; reason: WalkReason; valuations: OfferValuation[] };

export function validateOffer(o: OfferSpec): string | null {
  const L = RULES.limits;
  const intIn = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;
  if (typeof o.name !== 'string' || o.name.trim().length === 0 || o.name.length > L.nameLength) {
    return `Name must be 1-${L.nameLength} characters.`;
  }
  if (!intIn(o.launches, L.launches)) return 'Launches must be 1 to 4.';
  if (!intIn(o.spacingDays, L.spacingDays)) return 'Spacing must be 2 to 6 days.';
  if (!intIn(o.turnaroundDays, L.turnaroundDays)) return 'Turnaround must be 1 to 5 days.';
  if (!intIn(o.price, L.price) || o.price % 10 !== 0) return 'Price must be 50 to 5,000 in steps of 10.';
  if (o.scope !== 'simple' && o.scope !== 'any') return 'Unknown scope.';
  if (o.style !== 'custom' && o.style !== 'templated') return 'Unknown style.';
  if (o.style === 'templated' && o.scope !== 'simple') return 'Templated offers can only take simple briefs.';
  return null;
}

export function valueOffer(segmentId: Request['segment'], need: Need, wtpPercent: number, offer: OfferSpec): Omit<OfferValuation, 'offerIndex'> {
  const seg = SEGMENTS[segmentId];
  if (need === 'nuanced' && offer.scope === 'simple') return { wtp: 0, blocker: 'scope' };
  if (offer.turnaroundDays > seg.maxWaitDays) return { wtp: 0, blocker: 'slow' };
  if (offer.style === 'templated' && seg.care === 'high') return { wtp: 0, blocker: 'care' };
  const wanted = Math.min(offer.launches, seg.wantsLaunches);
  const extra = Math.max(0, offer.launches - seg.wantsLaunches);
  let value = seg.valuePerLaunch * wanted + Math.floor((seg.valuePerLaunch * seg.extraLaunchPercent) / 100) * extra;
  if (offer.style === 'templated' && seg.care === 'medium') value = Math.floor((value * 75) / 100);
  value = Math.floor((value * wtpPercent) / 100);
  return { wtp: value, blocker: offer.price <= value ? null : 'price' };
}

/** The neighbour picks the offer with the largest surplus; ties go to the cheaper, then earlier, offer. */
export function react(req: Pick<Request, 'segment' | 'need' | 'wtpPercent' | 'castId'>, menu: OfferSpec[], lostCast: readonly string[]): Reaction {
  const valuations = menu.map((offer, offerIndex) => ({ offerIndex, ...valueOffer(req.segment, req.need, req.wtpPercent, offer) }));
  if (lostCast.includes(req.castId)) return { kind: 'walk', reason: 'lost', valuations };
  if (menu.length === 0) return { kind: 'walk', reason: 'empty', valuations };
  let best: { i: number; surplus: number; price: number } | null = null;
  for (const v of valuations) {
    if (v.blocker !== null) continue;
    const price = menu[v.offerIndex]!.price;
    const surplus = v.wtp - price;
    if (!best || surplus > best.surplus || (surplus === best.surplus && price < best.price)) {
      best = { i: v.offerIndex, surplus, price };
    }
  }
  if (best) return { kind: 'buy', offerIndex: best.i, offer: menu[best.i]!, price: best.price, wtp: valuations[best.i]!.wtp, valuations };
  // Explain the most fixable objection: price beats speed beats fit beats care.
  const order: OfferValuation['blocker'][] = ['price', 'slow', 'scope', 'care'];
  const reason = order.find((r) => valuations.some((v) => v.blocker === r)) ?? 'price';
  return { kind: 'walk', reason: reason as WalkReason, valuations };
}

/**
 * A neighbour who would buy but for the price, and is close: the offer they value most and the price they would
 * pay for it, rounded down to 10 credits. Null when anything else (speed, scope, care, a grudge) is in the way.
 */
export function counterOffer(reaction: Reaction, menu: readonly OfferSpec[]): { offerIndex: number; price: number } | null {
  if (reaction.kind !== 'walk' || reaction.reason !== 'price') return null;
  let best: { offerIndex: number; price: number } | null = null;
  for (const v of reaction.valuations) {
    const offer = menu[v.offerIndex];
    if (!offer || v.blocker !== 'price' || v.wtp * 100 < offer.price * RULES.counter.minPercent) continue;
    const price = Math.floor(v.wtp / 10) * 10;
    if (price >= RULES.limits.price[0] && (!best || price > best.price)) best = { offerIndex: v.offerIndex, price };
  }
  return best;
}

/** Split a price across launches: equal shares, remainder on the last. Never drops a credit. */
export function allocate(price: number, launches: number): number[] {
  const share = Math.floor(price / launches);
  const out = Array.from({ length: launches }, () => share);
  out[launches - 1] = price - share * (launches - 1);
  return out;
}

const OBJECTIONS: Record<WalkReason, Record<Request['segment'], string>> = {
  price: {
    small: "That's more than the whole bake sale makes.",
    moment: 'Lovely, but not at that price.',
    careful: 'I would pay for care. Not that much.',
    rush: "For one day? I can't stretch to that.",
  },
  slow: {
    small: 'I need it sooner than that.',
    moment: 'The night will have come and gone by then.',
    careful: 'Even careful work has a date.',
    rush: 'It has to be today. Tomorrow at the latest.',
  },
  scope: {
    small: 'This one is a bit more involved than that.',
    moment: 'This needs more than a quick package.',
    careful: 'This needs real attention, not a quick package.',
    rush: 'It is quick, but not simple.',
  },
  care: {
    small: 'I would rather it felt made for us.',
    moment: 'It should feel like ours, not a template.',
    careful: 'People can tell a template. It has to sound like us.',
    rush: 'I would rather it felt made for us.',
  },
  lost: {
    small: 'You let me down last time.',
    moment: 'You missed our date last time. I went elsewhere.',
    careful: 'After last time, I will not risk it.',
    rush: 'You were late last time. Not again.',
  },
  empty: {
    small: 'Nothing on the window today?',
    moment: 'Nothing on the window today?',
    careful: 'Nothing on the window today?',
    rush: 'Nothing on the window today?',
  },
};

export function objection(reason: WalkReason, segment: Request['segment']): string {
  return OBJECTIONS[reason][segment];
}
