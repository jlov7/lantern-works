// Season endings: a title and a line chosen from what the studio actually did, plus a short epilogue for the
// regulars it served most. Pure and deterministic, so a replay of the same moves always ends the same way.
import { CAST_BY_ID, PRESETS, RULES } from './rules';
import { summarize } from './selectors';
import { AMENDS_OFFER, repLevel } from './sim';
import { nightResult, projectRecords, PROJECTS, type ProjectRecord } from './projects';
import { hasAuthorshipRules, hasStudioRules } from './versions';
import { careerStage, type ProjectContext } from './career';
import type { CompanyState, OfferSpec, SegmentId } from './types';

export interface SeasonEnding {
  id: string;
  title: string;
  line: string;
}

/** What the endings read. Exported so tests and the distribution check can see why an ending was picked. */
export interface Traits {
  insolvent: boolean;
  /** Earned revenue less every cost, over the season. */
  operating: number;
  kept: number | null;
  sold: number;
  served: number;
  missed: number;
  /** Sold something other than the starting Bespoke Launch. */
  redesigned: boolean;
  /** Sold an offer that is not one of the starting templates. */
  invented: boolean;
  automated: boolean;
  recurringShare: number;
  templatedShare: number;
  hired: boolean;
  /** Who joined: Noor when hired, or the student from street news. */
  newcomer: string;
  overtimeDays: number;
  temps: number;
  upgrades: number;
  flyers: number;
  loan: boolean;
  amends: number;
  lost: number;
  /** Highest and lowest reputation level across customer types at the close. */
  repHigh: number;
  repLow: number;
  /** The customer type with the most sales, and its share of sales. */
  topSegment: SegmentId | null;
  topShare: number;
}

const sameOffer = (a: OfferSpec, b: OfferSpec) =>
  a.launches === b.launches && a.spacingDays === b.spacingDays && a.turnaroundDays === b.turnaroundDays && a.scope === b.scope && a.style === b.style && a.price === b.price;

export function traits(s: CompanyState): Traits {
  const sum = summarize(s);
  // Only offers from the window count as design choices; amends and street-news orders arrive with their own terms.
  const fixed = new Set(s.requests.filter((r) => r.offer).map((r) => r.id));
  const offers = s.contracts.filter((c) => !fixed.has(c.requestId) && c.offer.name !== AMENDS_OFFER.name).map((c) => c.offer);
  const presets = Object.values(PRESETS);
  const bySegment = new Map<SegmentId, number>();
  for (const c of s.contracts) bySegment.set(c.segment, (bySegment.get(c.segment) ?? 0) + 1);
  const top = [...bySegment.entries()].sort((a, b) => b[1] - a[1])[0];
  const levels = Object.values(s.rep).map(repLevel);
  const share = (n: number) => (offers.length ? n / offers.length : 0);
  return {
    insolvent: sum.cash < 0,
    operating: sum.operatingResult,
    kept: sum.promisesKept,
    sold: sum.sold,
    served: sum.served,
    missed: sum.missed,
    redesigned: offers.some((o) => !sameOffer(o, PRESETS.bespoke)),
    invented: offers.some((o) => !presets.some((p) => sameOffer(o, p))),
    automated: s.journal.some((e) => e.kind === 'ai'),
    recurringShare: share(offers.filter((o) => o.launches > 1).length),
    templatedShare: share(offers.filter((o) => o.style === 'templated').length),
    hired: s.commands.some((c) => c.type === 'hire') || s.resources.some((r) => r.role === 'junior'),
    newcomer: s.resources.find((r) => r.role === 'junior')?.name ?? 'Someone new',
    overtimeDays: s.overtimeDays.length,
    temps: s.tempDays.length,
    upgrades: s.upgrades.length,
    flyers: s.flyerDays.length,
    loan: s.journal.some((e) => e.kind === 'loan' && e.cash > 0),
    amends: s.contracts.filter((c) => c.offer.name === AMENDS_OFFER.name && c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length,
    lost: sum.lostNeighbours,
    repHigh: Math.max(...levels),
    repLow: Math.min(...levels),
    topSegment: top ? top[0] : null,
    topShare: top && s.contracts.length ? top[1] / s.contracts.length : 0,
  };
}

/** Ordered: the first rule that matches names the season. */
const RULES_IN_ORDER: { id: string; when: (t: Traits) => boolean; title: string; line: (t: Traits) => string }[] = [
  { id: 'runway', when: (t) => t.insolvent, title: 'Ran out of runway', line: () => 'The promises were real, but the cash ran out first.' },
  { id: 'quiet', when: (t) => t.sold === 0, title: 'The quiet window', line: () => 'Nobody bought anything this season.' },
  { id: 'overreach', when: (t) => t.kept !== null && t.kept < 0.8, title: 'Promises outgrew the studio', line: () => 'You sold more than the studio could finish.' },
  { id: 'thin', when: (t) => t.operating < 0 && t.sold > 0, title: 'Busy, and in the red', line: (t) => `The work went out, but costs ran ahead of it: the season closed ${Math.abs(t.operating).toLocaleString('en-GB')} credits down.` },
  { id: 'amends', when: (t) => t.amends > 0 && t.lost === 0, title: 'Second chances', line: (t) => `You let someone down, then won them back${t.amends > 1 ? ` ${t.amends} times` : ''}. The street noticed.` },
  { id: 'borrowed', when: (t) => t.loan, title: 'On borrowed lamplight', line: () => 'The bank carried you through the lean days, and you paid it back.' },
  { id: 'club', when: (t) => t.recurringShare >= 0.5, title: 'The neighbourhood club', line: () => 'You turned one-off customers into regulars.' },
  { id: 'crew', when: (t) => t.hired && t.overtimeDays >= 2, title: 'A bigger crew, late nights', line: (t) => `${t.newcomer} joined, and the lamps stayed on until five on ${t.overtimeDays} evenings.` },
  { id: 'grown', when: (t) => t.hired, title: 'The studio grew', line: (t) => `${t.newcomer} joined the desks, and there was work to keep three people busy.` },
  { id: 'kit', when: (t) => t.upgrades >= 2, title: 'Well equipped', line: (t) => `${t.upgrades} upgrades on the shelf. The studio runs on habits now, not heroics.` },
  { id: 'late', when: (t) => t.overtimeDays >= 3, title: 'The late lamp', line: (t) => `Overtime on ${t.overtimeDays} days. The studio stayed open late to make more room.` },
  { id: 'inventor', when: (t) => t.invented && t.automated, title: 'A new kind of shop', line: () => 'An offer nobody on the street had seen, made with machinery nobody had trusted.' },
  { id: 'inventor-hand', when: (t) => t.invented, title: 'Your own design', line: () => 'You sold something you invented, made by hand.' },
  { id: 'counter', when: (t) => t.templatedShare >= 0.5 && t.automated, title: 'The quick-launch counter', line: () => 'Small, fast and standard. The street came to you.' },
  { id: 'counter-hand', when: (t) => t.templatedShare >= 0.5, title: 'Templates and two pairs of hands', line: () => 'Quick, standard work, all made by people.' },
  { id: 'loved', when: (t) => t.repHigh >= 2 && t.missed === 0, title: 'Word got round', line: () => 'The neighbours told their friends.' },
  { id: 'mixed', when: (t) => t.repLow < 0 && t.repHigh >= 1, title: 'Loved by some', line: () => 'One kind of customer sang your praises; another stopped coming.' },
  { id: 'both', when: (t) => t.redesigned && t.automated, title: 'New offer, new machinery', line: () => 'You changed what you sold and how it was made.' },
  { id: 'redesign-hand', when: (t) => t.redesigned, title: 'Same hands, new window', line: () => 'A different offer on the window, made by the same two people.' },
  { id: 'faster', when: (t) => t.automated, title: 'The faster studio', line: () => 'Same offer, more machinery.' },
  { id: 'bespoke', when: () => true, title: 'Small and bespoke', line: () => 'Two people, careful work, no shortcuts.' },
];

export const ENDING_IDS = [...RULES_IN_ORDER.map((r) => r.id), 'night-unfinished', 'night-courtyard', 'night-trail', 'neighbourhood', 'milestone-clem-ten', 'milestone-mara-regular', 'milestone-hugo-handover'];

export function projectOutcome(p: ProjectRecord, s: ProjectContext): string {
  const who = CAST_BY_ID[p.contract.castId]?.name ?? p.contract.castId;
  if (p.status === 'working') return `${p.artifact} is still in the works: ${p.delivered} of ${p.promised} delivered.`;
  if (p.status === 'failed' || p.status === 'partial') {
    const refunded = p.jobs.filter(j => j.status === 'missed' || j.status === 'refunded').length;
    return `${s.config.continuation ? p.artifact : PROJECTS[p.id].name}: ${p.delivered} of ${p.promised} promised pieces delivered; ${refunded} ${refunded === 1 ? 'piece' : 'pieces'} missed or refunded.`;
  }
  if (p.status === 'compromised') return `${p.artifact} was delivered. An extra change was declined, so ${who} did not contribute further.`;
  const stage = p.contract.project?.story?.stage;
  if (stage === 'legacy' || stage === 'open') {
    const later: Partial<Record<ProjectRecord['approach'], string>> = {
      'first-night': `The retained print “${p.contract.project!.lentPiece?.title ?? 'Archive print'}” was lent exactly as made. Its new caption and invitation are delivered; Clem hosts.`,
      'new-band': 'Two coordinated prints give Clem’s shared archive its next display. Clem hosts and contributes the programme design.',
      'weekly-rhythm': 'Mara’s shared-table invitation is delivered. She supplies bread; the bakery does not host.',
      'market-debut': 'Mara’s whole set of bakery labels and invitations is delivered. Moonrise opens as a host and supplies bread.',
      'quiet-sendoff': 'Ivo’s careful reference sheet is ready to use and keep. He contributes the sheet without opening a class.',
      'open-bench': 'Ivo’s class invitation and demonstration sheet are both delivered. The workshop opens to the repair class.',
    };
    if (later[p.approach]) return later[p.approach]!;
  }
  if (stage === 'practice' && p.contract.castId === 'ivo' && p.approach === 'open-bench') return 'Ivo’s repair workshop has a poster of its own. The invitation is to learn a repair at his bench.';
  if (s.config.continuation && p.contract.project?.proof) {
    const returning: Partial<Record<ProjectRecord['approach'], string>> = {
      'first-night': 'Another restored photograph has joined Clem’s archive wall.',
      'new-band': 'The Thursday residency has its own poster at Clem Jazz Bar.',
      'weekly-rhythm': 'Mara’s counter and menu cards are ready together at Moonrise Bakery.',
      'market-debut': 'Mara’s new banner gives the market stall a familiar face.',
      ...(p.contract.castId === 'ivo' ? {
        'quiet-sendoff': 'Ivo’s own name is above the workshop door. The old bench has a new hand.',
        'open-bench': 'Ivo’s repair workshop has a poster of its own. The invitation is to learn the first repair.',
      } : {}),
    };
    if (returning[p.approach]) return returning[p.approach]!;
  }
  const stories: Partial<Record<ProjectRecord['approach'], string>> = {
    'first-night': 'Clem’s first-night photograph is back on the wall. The old lettering stays.',
    'new-band': 'The new band has the anniversary wall at Clem Jazz Bar. Their lettering carries into the street.',
    'weekly-rhythm': p.contract.offer.spacingDays === 0 ? 'Three coordinated cards carry Moonrise Bakery through festival week.' : 'Three different cards mark three weeks at Moonrise Bakery. Mara has a rhythm she can keep.',
    'market-debut': 'Mara has a banner for the market stall. She sent new interest toward the studio.',
    'quiet-sendoff': 'Hugo’s portrait keeps the old bench in view. The handover stayed quiet.',
    'open-bench': 'The apprentice’s name is on the workshop sign. Hugo has made room for another pair of hands.',
  };
  return stories[p.approach] ?? `${p.artifact} was delivered.`;
}

function studioEnding(s: CompanyState, t: Traits): SeasonEnding | null {
  const night = nightResult(s);
  const records = projectRecords(s).filter(p => p.id !== 'lantern-night');
  const completed = records.filter(p => p.completedAt !== null);
  const money = t.operating < 0 ? `The season lost ${Math.abs(t.operating).toLocaleString('en-GB')} cr.` : `The season earned ${t.operating.toLocaleString('en-GB')} cr after costs.`;
  const otherMisses = s.jobs.filter(j => (j.status === 'missed' || j.status === 'refunded') && !night.project?.contract.jobIds.includes(j.id)).length;
  const misses = otherMisses ? ` ${otherMisses} other ${otherMisses === 1 ? 'launch was' : 'launches were'} missed or refunded.` : '';
  if (t.insolvent) return { id: 'runway', title: 'The work stayed. The cash ran out.', line: `${completed.length ? `${completed.length} milestone ${completed.length === 1 ? 'commission remains' : 'commissions remain'} on the street. ` : ''}The studio closed ${Math.abs(s.cash).toLocaleString('en-GB')} cr overdrawn. ${money}` };
  if (night.project) {
    const p = night.project;
    if (p.completedAt === null) return { id: 'night-unfinished', title: `${night.calendar.name}, unfinished`, line: `${p.delivered} of ${p.promised} promised pieces were delivered for Day ${night.calendar.day + 1}. The rest were refunded. ${money}${misses}` };
    const names = new Intl.ListFormat('en-GB').format(night.contributors.map(c => CAST_BY_ID[c.contract.castId]?.name ?? c.contract.castId));
    const plan = p.approach === 'courtyard' ? 'A courtyard full of your work' : night.calendar.careful ? 'The doors opened together' : 'A trail of your own making';
    const after = hasAuthorshipRules(s.rulesVersion) && night.calendar.day < RULES.days - 1 ? s.jobs.filter(j => !s.contracts.find(c => c.id === j.contractId)?.project && j.deliveredAt !== null && j.deliveredAt > (night.calendar.day + 1) * RULES.minutesPerDay).length : 0;
    const aftermath = after ? ` After the gathering, ${after} more ordinary ${after === 1 ? 'launch left' : 'launches left'} the studio.` : '';
    return { id: `night-${p.approach}`, title: plan, line: `${night.calendar.name} was ready for Day ${night.calendar.day + 1}, with completed work for ${names || 'the neighbourhood'}. ${p.status === 'compromised' ? 'The original programme was delivered; an extra change was declined. ' : ''}${money}${misses}${aftermath}` };
  }
  if (completed.length >= 2 && records.every(p => p.status === 'delivered') && t.operating >= 0) return { id: 'neighbourhood', title: 'A studio the street can point to', line: `${completed.map(p => CAST_BY_ID[p.contract.castId]!.name).join(' and ')} each have a finished milestone commission. Your window holds the season’s work. ${money}${misses}` };
  if (completed.length) {
    const p = [...completed].sort((a, b) => b.completedAt! - a.completedAt!)[0]!;
    return { id: `milestone-${p.id}`, title: p.artifact, line: `${projectOutcome(p, s)} ${money}${misses}` };
  }
  return null;
}

export function seasonEnding(s: CompanyState): SeasonEnding {
  const t = traits(s);
  const stage = careerStage(s);
  const career = stage === 'legacy' && s.finished ? ' The authored career is complete. Its delivered work, missed promises and untaken choices remain in the record. Open studio continues with recurring work and gatherings.' : stage === 'open' ? ' Open studio continues with recurring work and gatherings; the authored career has ended.' : '';
  if (hasStudioRules(s.rulesVersion)) {
    const story = studioEnding(s, t);
    if (story) return { ...story, line: `${story.line}${t.lost ? ` ${t.lost} ${t.lost === 1 ? 'neighbour no longer returns' : 'neighbours no longer return'}.` : ''}${career}` };
  }
  const r = RULES_IN_ORDER.find((x) => x.when(t))!;
  return { id: r.id, title: r.title, line: `${r.line(t)}${career}` };
}

export interface Epilogue {
  castId: string;
  name: string;
  line: string;
}

const COUNT = ['', 'once', 'twice', 'three times', 'four times'];

function relationshipDistance(s: CompanyState, castId: string): string | null {
  if (!hasAuthorshipRules(s.rulesVersion) || !s.lostCast.includes(castId)) return null;
  const name = CAST_BY_ID[castId]?.name ?? castId;
  const memories = s.relationshipMemory ?? [];
  const amends = Math.max(-1, ...memories.filter(m => m.castId === castId && m.kind === 'amends-kept').map(m => m.minute));
  const memory = memories.filter(m => m.castId === castId && m.minute > amends && (m.kind === 'promise-missed' || m.kind === 'change-refused')).toSorted((a, b) => b.minute - a.minute)[0];
  if (memory) return `${name} no longer commissions work here after ${memory.kind === 'promise-missed' ? 'a missed promise' : 'a refused change'} on Day ${memory.day + 1}.`;
  const visit = s.events.filter(e => e.type === 'walked' && e.minute > amends && s.requests.some(r => r.id === e.requestId && r.castId === castId)).toSorted((a, b) => b.minute - a.minute)[0];
  return visit ? `${name}’s Day ${visit.day + 1} visit ended without an order. They no longer commission work here.` : `${name} no longer commissions work here.`;
}

/** One line each for the three regulars you served most (whole orders delivered), most first. */
export function epilogues(s: CompanyState): Epilogue[] {
  const served = new Map<string, { n: number; launches: number; first: number; amends: boolean }>();
  for (const c of s.contracts) {
    const done = c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered');
    if (!done) continue;
    const e = served.get(c.castId) ?? { n: 0, launches: 0, first: c.seq, amends: false };
    e.n += 1;
    e.launches += c.offer.launches;
    if (c.offer.name === AMENDS_OFFER.name) e.amends = true;
    served.set(c.castId, e);
  }
  const top = [...served.entries()].sort((a, b) => b[1].n - a[1].n || b[1].launches - a[1].launches || a[1].first - b[1].first).slice(0, 3);
  let regular = 0;
  const ordinary = top.map(([castId, e]) => {
    const cast = CAST_BY_ID[castId];
    const name = cast?.name ?? castId;
    const business = cast?.business ?? 'their shop';
    const seg = cast?.segment ?? 'small';
    const lvl = repLevel(s.rep[seg]);
    let line: string;
    if (e.amends) line = `${name} gave you a second chance, and ${business} has your card in the window again.`;
    else if (e.n >= 3) {
      const times = COUNT[e.n] ?? `${e.n} times`;
      line = [
        `${name} came to you ${times}. ${business} now sends new customers your way.`,
        `${name} stopped shopping around: ${times} this season. Ask at ${business} and they point you here.`,
        `${name} was at the window ${times}, and ${business} keeps your card by the till.`,
      ][regular++ % 3]!;
    }
    else if (e.launches >= 3) line = `${name} took ${e.launches} launches for ${business} and stopped worrying about announcements.`;
    else if (seg === 'careful') line = `${name} read every word before ${business} went public, and signed off without changes.`;
    else if (seg === 'moment') line = `${name}'s big night at ${business} went out on time, and people came.`;
    else if (seg === 'rush') line = `${name} asked late${e.n === 2 ? ', twice' : ''}, and ${business} still made it.`;
    else line = lvl >= 1 ? `${name} at ${business} tells the other small shops about you.` : `${name} at ${business} got what was asked for, on the day it was promised.`;
    const distance = relationshipDistance(s, castId);
    if (distance) line = `${name} received ${e.n} finished ${e.n === 1 ? 'order' : 'orders'} from the studio. ${distance}`;
    return { castId, name, line };
  });
  if (!hasStudioRules(s.rulesVersion)) return ordinary;
  const milestones = projectRecords(s).filter(p => p.id !== 'lantern-night' && p.completedAt !== null).map(p => {
    const distance = relationshipDistance(s, p.contract.castId);
    return { castId: p.contract.castId, name: CAST_BY_ID[p.contract.castId]!.name, line: `${projectOutcome(p, s)}${distance ? ` ${distance}` : ''}` };
  });
  return [...milestones, ...ordinary.filter(e => !milestones.some(p => p.castId === e.castId))].slice(0, 3);
}

