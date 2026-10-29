// Stamps reward exploring different studios, never "using AI" for its own sake.
import { goalsFor } from '../engine/goals';
import { PRESETS } from '../engine/rules';
import { medalFor, summarize } from '../engine/selectors';
import { AMENDS_OFFER } from '../engine/sim';
import type { CompanyState } from '../engine/types';
import { projectRecords } from '../engine/projects';
import { noorWork } from '../engine/mentoring';

/** What a stamp may know beyond the season itself: results of the ghost studios, once they are worked out. */
export interface StampContext {
  brightServed?: number;
}

export type Glyph = 'door' | 'knot' | 'loop' | 'bulb' | 'doors' | 'hand' | 'star' | 'flag' | 'feather' | 'house' | 'person' | 'coin' | 'moon' | 'heart' | 'lantern' | 'pair';

export interface Stamp {
  id: string;
  title: string;
  hint: string;
  glyph: Glyph;
  earned: (s: CompanyState, ctx: StampContext) => boolean;
}

const isPreset = (o: CompanyState['menu'][number]) =>
  Object.values(PRESETS).some((p) => p.launches === o.launches && p.spacingDays === o.spacingDays && p.turnaroundDays === o.turnaroundDays && p.scope === o.scope && p.style === o.style && p.price === o.price);

/** Sales from the window, not orders that arrived with their own terms (street news, amends). */
const windowSales = (s: CompanyState) => {
  const fixed = new Set(s.requests.filter((r) => r.offer).map((r) => r.id));
  return s.contracts.filter((c) => !fixed.has(c.requestId) && c.offer.name !== AMENDS_OFFER.name);
};

const wholeOrder = (s: CompanyState, c: CompanyState['contracts'][number]) => c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered');

export const STAMPS: Stamp[] = [
  { id: 'night-courtyard', title: 'One courtyard', glyph: 'house', hint: 'Finish the season with the courtyard commission fully delivered.', earned: s => s.finished && projectRecords(s).some(p => p.id === 'lantern-night' && p.approach === 'courtyard' && p.completedAt !== null) },
  { id: 'night-trail', title: 'A street lit together', glyph: 'lantern', hint: 'Finish the season with the trail or open-studios commission fully delivered.', earned: s => s.finished && projectRecords(s).some(p => p.id === 'lantern-night' && p.approach === 'trail' && p.completedAt !== null) },
  { id: 'noor-own-work', title: 'A hand of her own', glyph: 'hand', hint: 'Keep Noor at the studio and finish three tasks using her chosen specialism.', earned: s => s.finished && (noorWork(s)?.completed ?? 0) >= 3 },
  { id: 'booked-and-kept', title: 'Room in the diary', glyph: 'loop', hint: 'Deliver three reserved orders and miss or refund none of them.', earned: s => {
    const reserved = s.contracts.filter(c => c.reserved);
    return s.finished && reserved.filter(c => wholeOrder(s, c)).length >= 3 && reserved.every(c => c.jobIds.every(id => !['missed', 'refunded'].includes(s.jobs.find(j => j.id === id)!.status)));
  } },
  { id: 'first-season', title: 'Doors open', glyph: 'door', hint: 'Finish a season.', earned: (s) => s.finished },
  { id: 'every-promise', title: 'Every promise kept', glyph: 'knot', hint: 'Finish with at least ten launches and none missed.', earned: (s) => s.finished && summarize(s).delivered >= 10 && summarize(s).missed === 0 },
  { id: 'club', title: 'Regulars', glyph: 'loop', hint: 'Sell a recurring offer to five neighbours.', earned: (s) => s.contracts.filter((c) => c.offer.launches > 1).length >= 5 },
  { id: 'inventor', title: 'Inventor', glyph: 'bulb', hint: 'Sell an offer you designed yourself, not a starting template.', earned: (s) => windowSales(s).some((c) => !isPreset(c.offer)) },
  { id: 'two-doors', title: 'Two doors', glyph: 'doors', hint: 'Sell two different offers in one season.', earned: (s) => new Set(windowSales(s).map((c) => JSON.stringify(c.offer))).size >= 2 },
  { id: 'no-ai', title: 'By hand', glyph: 'hand', hint: 'Win a medal without an AI desk.', earned: (s) => s.finished && !s.journal.some((e) => e.kind === 'ai') && medalFor(s).medal !== null },
  { id: 'gold', title: 'Gold window', glyph: 'star', hint: 'Win gold on any street.', earned: (s) => s.finished && medalFor(s).medal === 'gold' },
  { id: 'festival', title: 'Festival survivor', glyph: 'flag', hint: 'Finish Festival Week solvent with 90% of promises kept.', earned: (s) => s.finished && s.config.scenarioId === 'festival-week' && s.cash >= 0 && (summarize(s).promisesKept ?? 1) >= 0.9 },
  { id: 'careful', title: 'A careful hand', glyph: 'feather', hint: 'Finish Careful Season without losing a single neighbour.', earned: (s) => s.finished && s.config.scenarioId === 'bespoke-rush' && s.lostCast.length === 0 && s.contracts.length >= 10 },
  { id: 'full-house', title: 'Full house', glyph: 'house', hint: 'Serve 40 neighbours in one season.', earned: (s) => summarize(s).served >= 40 },
  { id: 'first-hire', title: 'A third pair of hands', glyph: 'person', hint: 'Hire someone to join the studio.', earned: (s) => s.commands.some((c) => c.type === 'hire') },
  { id: 'paid-news', title: 'Money where it matters', glyph: 'coin', hint: 'Answer street news with an option that costs money.', earned: (s) => s.journal.some((e) => e.kind === 'news') },
  { id: 'late-promises', title: 'Late and true', glyph: 'moon', hint: 'Finish a season with overtime booked and no promise missed.', earned: (s) => s.finished && s.overtimeDays.length > 0 && summarize(s).delivered > 0 && summarize(s).missed === 0 },
  { id: 'amends', title: 'Made amends', glyph: 'heart', hint: 'Win back a neighbour you let down.', earned: (s) => s.contracts.some((c) => c.offer.name === AMENDS_OFFER.name && wholeOrder(s, c)) },
  { id: 'beat-bright', title: 'Brighter than Bright', glyph: 'lantern', hint: 'Serve more neighbours than Bright Lantern on the same street.', earned: (s, ctx) => s.finished && ctx.brightServed !== undefined && summarize(s).served > ctx.brightServed },
  { id: 'both-goals', title: 'Both goals', glyph: 'pair', hint: "Meet both of a street's side goals in one season.", earned: (s) => { const g = goalsFor(s); return g.length > 0 && g.every((x) => x.met); } },
];

export function earnedStamps(s: CompanyState, ctx: StampContext = {}): string[] {
  return STAMPS.filter((st) => st.earned(s, ctx)).map((st) => st.id);
}
