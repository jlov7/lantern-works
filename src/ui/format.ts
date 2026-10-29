import { CAST_BY_ID, PRESETS, SEGMENTS } from '../engine/rules';
import type { AiTier, OfferSpec, RequestSource, Routing } from '../engine/types';

export const credits = (n: number): string => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-GB')} cr`;

export const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-GB')}`;

export const pct = (x: number | null): string => (x === null ? 'n/a' : `${Math.floor(x * 1000) / 10}%`);

export function offerTerms(o: OfferSpec): string {
  const when = o.turnaroundDays === 1 ? 'same day' : `within ${o.turnaroundDays} days`;
  const what = o.launches === 1 ? `One launch, ready ${when}` : `${o.launches} launches, one every ${o.spacingDays} days, each ready ${when}`;
  const scope = o.scope === 'simple' ? 'simple briefs only' : 'any brief';
  const style = o.style === 'templated' ? 'from templates' : 'made to order';
  return `${what}. ${scope[0]!.toUpperCase()}${scope.slice(1)}, ${style}.`;
}

export function presetName(o: OfferSpec): string | null {
  for (const [k, p] of Object.entries(PRESETS)) {
    const { name: _n, ...a } = p;
    const { name: _m, ...b } = o;
    if (JSON.stringify(a) === JSON.stringify(b)) return k;
  }
  return null;
}

export const castName = (id: string): string => CAST_BY_ID[id]?.name ?? id;
export const castBusiness = (id: string): string => CAST_BY_ID[id]?.business ?? '';

export const segmentLabel = (id: keyof typeof SEGMENTS): string => SEGMENTS[id].label;

export const TIER_LABEL: Record<AiTier, string> = { none: 'No AI desk', solo: 'One AI desk', duo: 'Two AI desks' };

export const ROUTING_LABEL: Record<Routing, string> = {
  human: 'People make everything',
  simple: 'AI drafts simple briefs',
  all: 'AI drafts every brief',
};

export const dayLabel = (day: number): string => `Day ${day + 1}`;

/** People's minutes as hours, to the nearest half hour. */
export function hours(min: number): string {
  const h = Math.round(min / 30) / 2;
  if (h <= 0) return 'no hours';
  if (h === 0.5) return 'half an hour';
  return `${h} hour${h === 1 ? '' : 's'}`;
}

export function jobLabel(jobId: string, castId: string, launches: number): string {
  const n = Number(jobId.split('-l')[1] ?? '1');
  return launches > 1 ? `${castName(castId)}, launch ${n} of ${launches}` : `${castName(castId)}'s launch`;
}

/** Plain numbers with thousands separators, no unit. */
export const num = (n: number): string => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-GB')}`;

export const SOURCE_LABEL: Record<RequestSource, string | null> = {
  walkin: null,
  word: 'Word of mouth',
  flyer: 'Saw your flyer',
  news: 'From the news',
  amends: 'Second chance',
  premium: 'In a hurry',
  booking: 'Rang ahead',
  project: 'Milestone commission',
};

/** A chance in basis points as "1 in N", rounded for reading. */
export function oneIn(bp: number): string {
  if (bp <= 0) return 'never';
  const n = Math.max(1, Math.round(10_000 / bp));
  return n === 1 ? 'almost always' : `about 1 in ${n}`;
}

export function runwayLabel(days: number): string {
  if (!Number.isFinite(days)) return 'no running costs';
  return `${days} day${days === 1 ? '' : 's'} of costs`;
}
