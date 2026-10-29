// Turning an offer idea into a legal OfferSpec: the shared post-processing for model replies and the offline parser.
// Everything here is deterministic and says what it changed or assumed, so nothing is silently rewritten.
import { validateOffer } from '../engine/demand';
import { RULES } from '../engine/rules';
import type { OfferSpec } from '../engine/types';
import { offerTerms } from '../ui/format';
import { OFFER_FIELDS, TURNAROUND, type OfferField } from './fields';
import type { OfferReply } from './tasks';

export interface CompiledOffer {
  offer: OfferSpec;
  pitch: string;
  /** What the compiler changed or how it read the idea, so nothing is silently rewritten. */
  adjustments: string[];
  /** Fields the idea did not state, filled with a default. */
  assumed: OfferField[];
}

const L = RULES.limits;

/** Every launch is released before the season ends, for a buyer on `day` (0-based). */
export const fitsSeason = (o: Pick<OfferSpec, 'launches' | 'spacingDays'>, day = 0): boolean => (o.launches - 1) * o.spacingDays < RULES.days - day;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));
const credits = (n: number) => n.toLocaleString('en-GB');

/** Clamp any proposal into the legal offer space and say exactly what changed. */
export function legalise(raw: OfferSpec): { offer: OfferSpec; adjustments: string[] } {
  const adjustments: string[] = [];
  const fix = <K extends keyof OfferSpec>(k: K, v: OfferSpec[K], why: string) => {
    if (raw[k] !== v) adjustments.push(why);
    return v;
  };
  const scope = raw.style === 'templated' ? fix('scope', 'simple', 'Templated offers only take simple briefs, so scope is simple.') : raw.scope;
  const offer: OfferSpec = {
    name: fix('name', (raw.name || 'New offer').trim().slice(0, L.nameLength) || 'New offer', `Name shortened to ${L.nameLength} characters.`),
    launches: fix('launches', clamp(raw.launches, L.launches), `Launches kept between ${L.launches[0]} and ${L.launches[1]}.`),
    spacingDays: fix('spacingDays', clamp(raw.spacingDays, L.spacingDays), `Spacing kept between ${L.spacingDays[0]} and ${L.spacingDays[1]} days.`),
    turnaroundDays: fix('turnaroundDays', clamp(raw.turnaroundDays, L.turnaroundDays), `Turnaround kept between ${L.turnaroundDays[0]} and ${L.turnaroundDays[1]} days.`),
    scope,
    style: raw.style,
    price: fix('price', Math.round(clamp(raw.price, L.price) / 10) * 10, `Price rounded to the nearest 10 within ${credits(L.price[0])} to ${credits(L.price[1])}.`),
  };
  const bad = validateOffer(offer);
  if (bad) throw new Error(`legalise produced an invalid offer: ${bad}`);
  return { offer, adjustments };
}

/**
 * Make every launch start before the season ends for a buyer on `day`, changing only what the player left open:
 * first an assumed spacing, then an assumed number of launches. Stated terms are kept, with a warning.
 */
export function fitSeason(offer: OfferSpec, day: number, assumed: readonly OfferField[]): { offer: OfferSpec; adjustments: string[] } {
  const daysLeft = RULES.days - day;
  const o = { ...offer };
  const adjustments: string[] = [];
  if (fitsSeason(o, day) || o.launches === 1) return { offer: o, adjustments };
  if (assumed.includes('spacingDays')) {
    const s = Math.max(L.spacingDays[0], Math.floor((daysLeft - 1) / (o.launches - 1)));
    if (s < o.spacingDays) {
      adjustments.push(`Spacing set to every ${s} days so every launch starts before the season ends.`);
      o.spacingDays = s;
    }
  }
  if (!fitsSeason(o, day) && assumed.includes('launches')) {
    const n = Math.max(1, Math.floor((daysLeft - 1) / o.spacingDays) + 1);
    adjustments.push(`${n} launch${n === 1 ? '' : 'es'} instead of ${o.launches}, so every launch starts before the season ends.`);
    o.launches = n;
  }
  if (!fitsSeason(o, day)) {
    const fit = Math.floor((daysLeft - 1) / o.spacingDays) + 1;
    adjustments.push(`Bought today, only ${fit} of the ${o.launches} launches can start before the season ends; the rest would be refunded.`);
  }
  return { offer: o, adjustments };
}

const PITCH_TERMS = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twice|single|pair|couple|dozen|same[- ]day|next[- ]day|today|tonight|tomorrow|days?|daily|weeks?|weekly|fortnight\w*|hours?|minutes?|credits?|cr|price[ds]?|free)\b/i;

/** The pitch may not restate terms (they could disagree with the legal offer); if it does, print the terms instead. */
export function cleanPitch(pitch: string, offer: OfferSpec): { pitch: string; replaced: boolean } {
  const p = pitch.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!p || PITCH_TERMS.test(p)) return { pitch: offerTerms(offer), replaced: true };
  return { pitch: p, replaced: false };
}

interface Draft {
  name: string;
  launches: number;
  spacingDays: number;
  turnaroundDays: number;
  scope: OfferSpec['scope'];
  style: OfferSpec['style'];
  price: number;
  perLaunch: boolean;
}

/** Shared tail of both compilers: per-launch pricing, legal ranges, season fit. */
function finish(d: Draft, assumedIn: readonly OfferField[], day: number, notes: string[]): Omit<CompiledOffer, 'pitch'> {
  const assumed = OFFER_FIELDS.filter((f) => assumedIn.includes(f));
  const launches = clamp(d.launches, L.launches);
  const total = (n: number) => (d.perLaunch ? d.price * n : d.price);
  const base = legalise({ name: d.name, launches: d.launches, spacingDays: d.spacingDays, turnaroundDays: d.turnaroundDays, scope: d.scope, style: d.style, price: total(launches) });
  const fit = fitSeason(base.offer, day, assumed);
  const offer = fit.offer;
  const adjustments = [...notes, ...base.adjustments, ...fit.adjustments];
  if (d.perLaunch && offer.launches !== base.offer.launches) offer.price = legalise({ ...offer, price: total(offer.launches) }).offer.price;
  if (d.perLaunch) adjustments.unshift(`Read ${credits(d.price)} as the price of each launch: ${offer.launches} x ${credits(d.price)} = ${credits(offer.price)} credits in total.`);
  return { offer, adjustments, assumed };
}

/**
 * Post-process a model reply: same legal ranges, season fit and pitch rules as the offline parser.
 * With the idea text, a launch count or spacing the text never states counts as assumed even if the model
 * filled it from a convention ("weekly" means 3), so the season fit may shorten it.
 */
export function finishOfferReply(r: OfferReply, day = 0, text?: string): CompiledOffer {
  const d = clampDay(day);
  const draft: Draft = { ...r, turnaroundDays: TURNAROUND[r.turnaround], perLaunch: r.priceBasis === 'per_launch' };
  const unstated = text === undefined ? [] : compileOfferOffline(text, d).assumed.filter((f) => f === 'launches' || f === 'spacingDays');
  const done = finish(draft, [...r.assumed, ...unstated], d, []);
  const pitch = cleanPitch(r.pitch, done.offer);
  if (pitch.replaced && r.pitch.trim()) done.adjustments.push('The drafted pitch restated terms, so the window shows the terms instead.');
  return { ...done, pitch: pitch.pitch };
}

const clampDay = (day: number) => Math.min(RULES.days - 1, Math.max(0, Math.floor(day) || 0));

// ---------- offline parser ----------

const WORD_NUM: Record<string, number> = {
  one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, a: 1, an: 1,
};
const NUM_WORD = Object.keys(WORD_NUM).join('|');
const UNIT = '(?:launch(?:es)?|posts?|drops?|shouts?|campaigns?|releases?|announcements?|times|rounds|slots)';
const SMALL_SHOPS = /\b(little|small (?:shops?|businesses|cafes?|traders?)|cafes?|corner shops?|market stalls?|bakery|bakeries|kiosks?)\b/;

/** Lower-case and rewrite numbers so the field rules only see digits. */
function normalise(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')} `;
  t = t.replace(/[£$€]\s*/g, '');
  while (/(\d),(\d{3})\b/.test(t)) t = t.replace(/(\d),(\d{3})\b/g, '$1$2');
  t = t.replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, n: string) => String(Math.round(Number(n) * 1000)));
  t = t.replace(new RegExp(`\\b(${NUM_WORD})\\s+thousand\\b`, 'g'), (_, w: string) => String(WORD_NUM[w]! * 1000));
  t = t.replace(new RegExp(`\\b(${NUM_WORD})\\s+hundred\\b`, 'g'), (_, w: string) => String(WORD_NUM[w]! * 100));
  t = t.replace(/\b(?:a\s+)?dozen\b/g, '12').replace(/\b(?:a\s+)?(?:couple|pair)\s+of\b/g, '2').replace(/\btwice\b/g, '2 times');
  t = t.replace(/\bonce a week\b/g, 'weekly').replace(/\bsame-day\b/g, 'same day').replace(/\bnext-day\b/g, 'next day').replace(/\bone-off\b/g, 'one off');
  t = t.replace(new RegExp(`\\b(${Object.keys(WORD_NUM).filter((w) => w !== 'a' && w !== 'an').join('|')})\\b`, 'g'), (w) => String(WORD_NUM[w]));
  return t;
}

/** Find the first match, blank it out of the text so later rules cannot reuse it, and return its groups. */
function take(state: { t: string }, re: RegExp): RegExpMatchArray | null {
  const m = state.t.match(re);
  if (!m || m.index === undefined) return null;
  state.t = state.t.slice(0, m.index) + ' '.repeat(m[0].length) + state.t.slice(m.index + m[0].length);
  return m;
}

/** Offline, deterministic reading of an offer idea. Labelled as such in the UI. `day` is 0-based. */
export function compileOfferOffline(text: string, day = 0): CompiledOffer {
  const d = clampDay(day);
  const nameMatch = text.match(/\b(?:called|named)\s+["']([^"']{1,40})["']/i) ?? text.match(/\b(?:called|named)\s+([A-Za-z][A-Za-z' ]{0,27}?)\s*(?=[,.;!]|$)/i);
  const s = { t: normalise(nameMatch ? text.replace(nameMatch[0], ' ') : text) };
  const assumed: OfferField[] = [];
  const notes: string[] = [];

  // Negations first, so "no templates" never reads as templated and "no rush" never as same day.
  const noTemplate = take(s, /\b(?:no|not|never|without|don't use|do not use|isn't|nothing)\b[^.,;:]{0,20}?\btemplat\w*/);
  const noCustom = take(s, /\b(?:no|not|without)\s+(?:custom|bespoke)\b/);
  take(s, /\bsame day\s+(?:isn't|is not|not)\s+(?:needed|necessary|required|important)/);
  const noRush = take(s, /\b(?:no|not|isn't|never)\s+(?:a\s+)?(?:rush\w*|hurry|urgent)\b/);
  const notComplex = take(s, /\b(?:not|nothing|no)\s+(?:for\s+)?(?:too\s+)?(?:complicated|complex|involved|fancy|nuanced)\b(?:\s+briefs?)?/);
  const notSimple = take(s, /\bnot\s+(?:just\s+)?simple\b/);

  // Spacing.
  let spacing: number | null = null;
  let m: RegExpMatchArray | null;
  if (take(s, /\bevery other day\b/)) spacing = 2;
  else if ((m = take(s, /\bevery\s+(\d+)\s+days?\b/) ?? take(s, /\b(\d+)\s+days?\s+(?:apart|between)\b/) ?? take(s, /\bspaced\s+(?:out\s+)?(?:by\s+)?(\d+)\s+days?(?:\s+apart)?/) ?? take(s, /\bgaps? of\s+(\d+)\s+days?/))) spacing = Number(m[1]);
  else if (take(s, /\b(?:daily|every day|each day)\b/)) spacing = 1;
  else if (take(s, /\ba week apart\b/)) spacing = 7;
  else if (take(s, /\b(?:fortnightly|every 2 weeks|monthly|every month)\b/)) spacing = 6;
  else if (take(s, /\b(?:weekly|every week|each week|per week)\b/)) {
    spacing = 4;
    assumed.push('spacingDays');
    notes.push(`A season is only ${RULES.days} days, so "weekly" became every 4 days.`);
  }
  const recurring = spacing !== null || /\b(?:regular\w*|recurring|subscription|club|series)\b/.test(s.t);

  // Turnaround.
  let turnaround: number | null = null;
  const hours = take(s, /\b(\d+)\s*-?\s*(?:hours?|hrs?|h)\b/);
  if (hours) turnaround = Number(hours[1]) <= 12 ? 1 : Number(hours[1]) <= 48 ? 2 : Math.ceil(Number(hours[1]) / 24);
  else if ((m = take(s, /\b(?:within|in|up to|under|inside|take|takes|taking|turnaround of|turn around in)\s+(\d+)\s+days?\b/) ?? take(s, /\b(\d+)\s*-?\s*days?\s+(?:max\w*|turnaround|to deliver|delivery|to turn around|or less|tops|lead time)\b/))) turnaround = Number(m[1]);
  else if (take(s, /\b(?:within|in|inside)\s+a\s+week\b|\ba week to deliver\b/)) turnaround = 7;
  else if (take(s, /\b(?:same day|today|tonight|within hours|by close|rush\w*|urgent|last[- ]minute|asap)\b/)) turnaround = 1;
  else if (take(s, /\b(?:next day|tomorrow|overnight)\b/)) turnaround = 2;
  else if (noRush || take(s, /\b(?:relaxed|take (?:their|your|my) time|no hurry|slow)\b/)) turnaround = 5;
  else if (/\b(?:quick|fast|speedy|express|prompt)\b/.test(s.t)) turnaround = 2;

  // Launch count.
  let launches: number | null = null;
  const counts = [...s.t.matchAll(new RegExp(`\\b(\\d+)\\s+(?:(?!a\\b|an\\b|per\\b|each\\b|every\\b|for\\b|at\\b)[a-z-]+\\s+){0,3}?${UNIT}\\b`, 'g'))];
  const count = counts.find((c) => Number(c[1]) > 0 && Number(c[1]) < 50);
  if (count) launches = Number(count[1]);
  else if ((m = take(s, /\bfor (?:all|the) (\d+)\b/) ?? take(s, /\b(\d+) of them\b/))) launches = Number(m[1]);
  else if (/\bfor (?:both|the pair)\b/.test(s.t)) launches = 2;
  else if (/\b1 off\b/.test(s.t) || (!recurring && /\blaunch\b(?!\s+(?:series|club|package|pack|bundle))/.test(s.t) && !/\blaunches\b/.test(s.t))) launches = 1;
  if (count?.index !== undefined) s.t = s.t.slice(0, count.index) + ' '.repeat(count[1]!.length) + s.t.slice(count.index + count[1]!.length);

  // Price: prefer numbers marked as money, then the last plain number that is not a count or a duration.
  const prices: { v: number; at: number; rank: number; per: boolean }[] = [];
  for (const p of s.t.matchAll(/(\d+(?:\.\d+)?)/g)) {
    const at = p.index ?? 0;
    const before = s.t.slice(Math.max(0, at - 16), at);
    const after = s.t.slice(at + p[0].length, at + p[0].length + 24);
    if (/-\s*$/.test(before) || /(?:launch(?:es)?|posts?|drops?)\s*$/.test(before)) continue;
    if (/^\s*(?:days?|hours?|launch|posts?|drops?|times|%|percent|of\b)/.test(after)) continue;
    const money = /^\s*(?:cr\b|credits?\b)/.test(after) ? 2 : /(?:for|at|price[sd]?(?: at| of| to| is)?|costs?|charge|charging|about|around|~|of|is|just)\s*$/.test(before) ? 1 : 0;
    const per = /^\s*(?:cr\b|credits?\b)?\s*(?:a go|a pop|each|apiece|a time|every time|for each|per\s+(?:launch|post|drop|go|time|week)|a\s+(?:launch|post|drop|week))\b/.test(after);
    prices.push({ v: Number(p[1]), at, rank: money, per });
  }
  const inRange = (v: number) => v >= L.price[0] && v <= L.price[1];
  const best = prices.filter((p) => p.rank > 0 || p.v >= 20).sort((a, b) => Number(inRange(b.v)) - Number(inRange(a.v)) || b.rank - a.rank || b.at - a.at)[0];

  // Style and scope.
  let style: OfferSpec['style'] | null = noTemplate ? 'custom' : noCustom ? 'templated' : null;
  if (!style && /\btemplat\w*|\boff the shelf\b|\btemplate kit\b/.test(s.t)) style = 'templated';
  else if (!style && /\b(?:custom|bespoke|tailor\w*|made to order|made-to-order|handmade|from scratch|1 off|careful\w*)\b/.test(s.t)) style = 'custom';
  let scope: OfferSpec['scope'] | null = notComplex ? 'simple' : notSimple ? 'any' : null;
  if (!scope && /\b(?:any (?:kind of |sort of )?briefs?|any brief|anything|any job|all kinds|complex|complicated|involved|nuanced|careful\w*)\b/.test(s.t)) scope = 'any';
  else if (!scope && /\b(?:simple|basic|straightforward|little|small|nothing fancy|easy)\b/.test(s.t)) scope = 'simple';

  // Defaults for whatever the idea left open.
  if (launches === null) {
    launches = recurring ? 3 : 1;
    assumed.push('launches');
  }
  if (spacing === null) {
    spacing = 3;
    if (launches > 1) assumed.push('spacingDays');
  }
  if (turnaround === null) {
    turnaround = SMALL_SHOPS.test(s.t) ? 2 : 3;
    assumed.push('turnaroundDays');
    if (turnaround === 2) notes.push('No turnaround stated; small shops usually need it by the next day, so next day.');
  }
  if (style === null) {
    style = 'custom';
    assumed.push('style');
  }
  if (scope === null) {
    scope = style === 'templated' ? 'simple' : 'any';
    assumed.push('scope');
  }
  let price: number;
  let perLaunch = false;
  if (best) {
    price = best.v;
    perLaunch = best.per && launches > 1;
    if (best.per && launches === 1) perLaunch = false;
  } else {
    price = style === 'templated' ? 320 * launches : launches === 1 ? 900 : 340 * launches;
    assumed.push('price');
  }
  const name = nameMatch?.[1]?.trim() || (recurring ? 'Weekly Window' : style === 'templated' ? 'Quick Launch' : launches > 1 ? 'Launch Series' : 'Custom Launch');
  if (!nameMatch) assumed.push('name');

  const done = finish({ name, launches, spacingDays: spacing, turnaroundDays: turnaround, scope, style, price, perLaunch }, assumed, d, notes);
  return { ...done, pitch: offerTerms(done.offer) };
}
