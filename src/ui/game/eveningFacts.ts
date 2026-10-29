// What an evening says, from the states before and after the day. No React here.
import { phaseFor, RULES, scenarioById, SEGMENTS } from '../../engine/rules';
import { counterFor, dailyCosts, medalParFor, reactionTo, runwayDays, servedByDay, summarize, takeableInTurn, tonight } from '../../engine/selectors';
import { GOALS } from '../../engine/goals';
import { applyCommand, isRegular, replay, repLevel, SEGMENT_IDS, workingOn } from '../../engine/sim';
import type { Command, CompanyState, SegmentId, UpgradeId } from '../../engine/types';
import { castBusiness, castName, credits, dayLabel, hours, num } from '../format';
import { clockLabel } from '../timeline';
import { priceTarget } from './workshopMath';
import { studioHint } from './studioHint';
import { acceptedSibling } from './orderIntake';
import { bookingsWorked } from './booking';
import type { Playback } from './clock';
import { hasAuthorshipRules, hasStudioRules } from '../../engine/versions';
import { isContinuingCareer, laterStoryPayoff } from './careerContinuity';

const DAY = RULES.minutesPerDay;

export type InsightAction = 'design' | 'studio' | 'desk' | 'promises' | 'books' | 'hire' | 'patterns';
export interface Insight {
  text: string;
  action: InsightAction;
  verb: string;
}

export function dayUtil(before: CompanyState, after: CompanyState): { people: number; ai: number | null } {
  const a = after.usage;
  const b = before.usage;
  const aiShift = a.aiShift - b.aiShift;
  return { people: (a.humanBusy - b.humanBusy) / Math.max(1, a.humanShift - b.humanShift), ai: aiShift ? (a.aiBusy - b.aiBusy) / aiShift : null };
}

export function eveningFacts(play: Pick<Playback, 'before' | 'after'>) {
  const { before, after } = play;
  const day = Math.floor(before.minute / DAY);
  const events = after.events.filter((e) => e.day === day);
  const delivered = events.filter((e) => e.type === 'delivered').length;
  const missed = events.filter((e) => e.type === 'missed').length;
  const refunded = events.filter((e) => e.type === 'refunded_horizon').length;
  const earned = summarize(after).revenue - summarize(before).revenue;
  const planned = tonight(before).delivered;
  // Everything booked to today, including sales and spending made before the shop opened.
  const cashChange = after.journal.filter((e) => e.day === day).reduce((a, e) => a + e.cash, 0);
  let sentence: string;
  // A day with nothing out is still a day of work when launches are in the works: say what is coming and when.
  const works = after.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled').sort((a, b) => a.dueAt - b.dueAt);
  if (delivered === 0 && missed === 0 && refunded === 0)
    sentence = works.length
      ? `Nothing went out today, but ${works.length} launch${works.length === 1 ? ' is' : 'es are'} in the works; ${works.length === 1 ? '' : 'the first, '}${castName(works[0]!.castId)}'s${works.length === 1 ? '' : ','} is due ${works[0]!.dueAt / DAY - 1 === after.day ? 'tomorrow' : dayLabel(works[0]!.dueAt / DAY - 1)}.`
      : 'A quiet day: nothing was in the works.';
  else sentence = `You delivered ${delivered} launch${delivered === 1 ? '' : 'es'} and earned ${credits(earned)}.${missed ? ` ${missed} missed, refunded with a fee: ${missReasons(after, day).join('; ')}.` : refunded ? '' : ' Nothing was missed.'}`;
  if (refunded) sentence += ` When the season ended, ${refunded} unfinished launch${refunded === 1 ? ' was' : 'es were'} refunded: ${unfinishedReasons(after, day, 'refunded_horizon').join('; ')}.`;
  if (planned !== delivered) sentence += ` The morning plan was ${planned} out if no redos or changes.`;
  return { day, delivered, missed, earned, cashChange, sentence, first: momentOf(before, after, day, delivered), note: noteOf(after, day), chatter: chatterOf(before, after, day) };
}

/** What was unfinished at each missed deadline, with changes actually observed on that launch. */
export function missReasons(after: CompanyState, day: number): string[] {
  return unfinishedReasons(after, day, 'missed');
}

function unfinishedReasons(after: CompanyState, day: number, type: 'missed' | 'refunded_horizon'): string[] {
  return after.events
    .filter((e) => e.day === day && e.type === type && e.jobId)
    .map((e) => {
      const j = after.jobs.find((x) => x.id === e.jobId)!;
      const who = `${castName(j.castId)}'s`;
      const stage = { brief: 'briefed', produce: 'made', finish: 'finished', rework: 'redone', done: 'completed' }[j.stage];
      const work = j.remaining > 0 ? `still being ${stage}` : `waiting to be ${stage}`;
      const observed = after.events.filter((x) => x.jobId === j.id && x.minute <= e.minute);
      const notes: string[] = [];
      if (j.stage !== 'rework' && observed.some((x) => x.type === 'rework_found')) notes.push('it needed redoing');
      if (observed.some((x) => x.type === 'snag')) notes.push('a change was asked for');
      return `${who} was ${work} at closing${notes.length ? `; ${notes.join('; ')}` : ''}`;
    });
}

/** A counted side goal that moved today (a delivery landed, or an order fell through), with where it now stands. */
export function goalMoved(before: CompanyState, after: CompanyState): string | null {
  if (after.finished) return null;
  const g = (GOALS[after.config.scenarioId] ?? []).find((x) => x.counts && !x.met(before) && x.progress(before) !== x.progress(after));
  return g ? `Side goal, ${g.label.charAt(0).toLowerCase()}${g.label.slice(1)}: ${g.progress(after)}.` : null;
}

/**
 * One line worth a moment, at most, from the studio's own season: the first launch out, a side goal reached, word
 * of mouth taking a step, a served milestone, or a best day. Overtaking another studio needs the ghosts, so the
 * evening adds that itself.
 */
const absentOn = (s: CompanyState, who: string, day: number): boolean => s.modifiers.some((m) => m.kind === 'absent' && m.who === who && m.day === day);

/** The payoff for a story order delivered on time, by the order's name. */
const STORY_PAYOFF: Record<string, string> = {
  'Tap takeover rescue': "Oscar's tap takeover was packed. Every big-night crowd on the street now knows whose launch saved it.",
  'Ten years of Clem': "Clem Jazz Bar's tenth birthday ran past midnight, and Clem raised a glass to the studio from the stage.",
  'Summer street party': 'The street party filled Main Street from end to end. Everyone you served was there, and now the whole street knows your name.',
  'Second opening': "Eli's second opening sold out too. The Pocket Stage is talking about you.",
  "Mara's regular": "All three of Mara's regular launches went out. The bakery queue knows who to thank.",
  'A quiet send-off': "Hugo's send-off was quiet and exactly right. The careful shops on the street noticed.",
  'Festival bundle': 'All four festival launches went out. The bunting is up, and the committee is telling everyone.',
};

/**
 * The day's narrowest escape: a launch that needed redoing or changing today and still went out on time, or else one
 * that went out within half an hour of its deadline. Near misses happened and went unsaid; the panel never felt them.
 */
export function closeCall(after: CompanyState, day: number): string | null {
  const hit = new Set(after.events.filter((e) => e.day === day && (e.type === 'rework_found' || e.type === 'snag') && e.jobId).map((e) => e.jobId!));
  let best: { text: string; rank: number } | null = null;
  for (const e of after.events) {
    if (e.day !== day || e.type !== 'delivered' || !e.jobId) continue;
    const j = after.jobs.find((x) => x.id === e.jobId)!;
    const spare = j.dueAt - e.minute;
    if (spare < 0) continue;
    const at = clockLabel(e.minute - day * DAY);
    const left = spare === 0 ? 'with not a minute to spare' : `${spare < 30 ? `${spare} minutes` : hours(spare)} before it was due`;
    const saved = hit.has(j.id);
    // A recovery outranks a plain close shave; among either, the narrowest wins.
    const rank = (saved ? 0 : 10_000) + spare;
    if (spare > (saved ? 120 : 30)) continue;
    if (best && best.rank <= rank) continue;
    best = {
      rank,
      text: saved
        ? `Saved: ${castName(j.castId)}'s launch had to be ${after.events.some((x) => x.day === day && x.type === 'snag' && x.jobId === j.id) ? 'changed' : 'redone'} today and still went out at ${at}, ${left}.`
        : `Close call: ${castName(j.castId)}'s launch went out at ${at}, ${left}.`,
    };
  }
  return best?.text ?? null;
}

export function momentOf(before: CompanyState, after: CompanyState, day: number, delivered: number): string | null {
  const firstOut = summarize(before).delivered === 0 ? after.events.find((e) => e.day === day && e.type === 'delivered') : undefined;
  const firstJob = firstOut?.jobId ? after.jobs.find((j) => j.id === firstOut.jobId) : undefined;
  const took = after.events.find((e) => e.day === day && e.type === 'takeoff' && e.jobId);
  if (took) {
    const j = after.jobs.find((x) => x.id === took.jobId)!;
    const seg = after.contracts.find((c) => c.id === j.contractId)!.segment;
    return `${firstJob ? 'First launch out, and a surprise' : 'Surprise'}: ${castName(j.castId)}'s launch for ${castBusiness(j.castId)} is being shared all over the street. ${RULES.takeoff.arrivals} more "${SEGMENTS[seg].label}" customers come by tomorrow, and their kind think better of you.`;
  }
  for (const e of after.events) {
    if (e.day !== day || e.type !== 'delivered' || !e.jobId) continue;
    const j = after.jobs.find((x) => x.id === e.jobId)!;
    const c = after.contracts.find((x) => x.id === j.contractId)!;
    const line = laterStoryPayoff(after, c.offer.name) ?? STORY_PAYOFF[c.offer.name];
    if (line && c.jobIds.every((id) => after.jobs.find((x) => x.id === id)?.status === 'delivered')) return line;
  }
  // Ada and Bright Lantern: the payoff for either answer.
  const poach = after.news.find((n) => n.card === 'poach');
  const later = isContinuingCareer(after);
  if (poach?.choice === 1 && poach.day === day) return later ? 'Ada stayed at Lantern Works for the current bookings. The studio paid her a bonus.' : 'Ada stayed. She spent some of the bonus on a better kettle for everyone.';
  if (poach?.choice === 0 && absentOn(after, 'h1', day - 1) && !absentOn(after, 'h1', day))
    return later ? 'Ada is back from her guest booking at Bright Lantern.' : 'Ada is back from Bright Lantern, and staying: "Their AI desk names every file final_final. I missed this place."';
  const dark = after.news.find((n) => n.card === 'blackout');
  if (dark && dark.choice !== null && dark.choice < 2 && dark.day + 1 === day && delivered > 0)
    return 'Quickprint\'s customers found their way to you. Tomas has started calling them "the regulars we borrowed".';
  if (firstJob) return `First launch out: ${castName(firstJob.castId)} at ${castBusiness(firstJob.castId)} is telling the street.`;
  const par = medalParFor(after);
  const was = servedByDay(after)[day - 1] ?? 0;
  const now = servedByDay(after)[day] ?? 0;
  const medal = par && (['gold', 'silver', 'bronze'] as const).find((m) => was < par[m] && now >= par[m]);
  if (par && medal) {
    const next = medal === 'bronze' ? `Silver is ${par.silver}.` : medal === 'silver' ? `Gold is ${par.gold}.` : 'The best this street has.';
    const left = RULES.days - day - 1;
    return `${medal.charAt(0).toUpperCase()}${medal.slice(1)} reached: ${now} served${left ? ` with ${left} day${left === 1 ? '' : 's'} to go` : ''}. It is yours if you finish solvent and keep 90% of promises${medal === 'bronze' ? '' : ', with the season in profit'}. ${next}`;
  }
  const goal = (GOALS[after.config.scenarioId] ?? []).find((g) => !g.met(before) && g.met(after));
  if (goal) return `Side goal reached: ${goal.label.charAt(0).toLowerCase()}${goal.label.slice(1)}. The stamp is yours.`;
  const close = closeCall(after, day);
  if (close) return close;
  for (const seg of SEGMENT_IDS) {
    const was = repLevel(before.rep[seg]);
    const now = repLevel(after.rep[seg]);
    const p = Math.abs(now) * RULES.rep.wtpPerLevel;
    if (now > was && now > 0) return `Word is out among "${SEGMENTS[seg].label}" customers: they now pay ${p}% more and send friends.`;
    if (now < was && now < 0) {
      // Say what soured them: a miss today, or neighbours of theirs turned away or left waiting.
      const missedHere = after.events.some((e) => e.day === day && e.type === 'missed' && after.contracts.find((c) => c.id === after.jobs.find((j) => j.id === e.jobId)?.contractId)?.segment === seg);
      return `${missedHere ? 'Word of a miss is out' : 'Word is souring'}: "${SEGMENTS[seg].label}" customers now pay ${p}% less, and some stay away.`;
    }
  }
  const mark = Math.floor(now / 10) * 10;
  if (mark >= 10 && was < mark) return `${now} neighbours served this season.`;
  const best = Math.max(0, ...Array.from({ length: day }, (_, d) => after.events.filter((e) => e.day === d && e.type === 'delivered').length));
  if (day >= 2 && delivered > best && delivered >= 3) return `Your best day yet: ${delivered} launches out of the door.`;
  return null;
}

const THANKS: Record<SegmentId, string[]> = {
  small: ['Sold out before lunch. People kept asking for more.', 'Three new faces came in asking about it.', 'Small, quick and right. Exactly what I wanted.', 'One of my regulars read it out loud at the counter.'],
  moment: ['The room was full. People queued outside.', 'Someone cried at the speech, in a good way.', 'It felt as big as I hoped. Thank you.', 'People keep asking who did the launch.'],
  careful: ['You got the tone exactly. Nobody else would have.', 'Quiet, careful and right. My customers felt it.', 'I read it twice. It sounds like us.', 'Every word was the right one. Thank you.'],
  rush: ['Made it with an hour to spare. You saved the night.', "I thought it was too late. It wasn't.", 'Done before I had finished panicking.', 'Out of the door in time, and the crowd came.'],
};
const SORRY: Record<SegmentId, string[]> = {
  small: ['The sale came and went without it.', 'I told my regulars it was coming. It never did.'],
  moment: ['The night happened. The launch did not.', 'Half the room never knew it was on.'],
  careful: ['I trusted you with this one.', 'It mattered, and it was late.'],
  rush: ['Late is the same as never, for this.', 'I needed it tonight. Tonight has gone.'],
};

/**
 * A note from one neighbour about today: a miss first (it matters most), otherwise the biggest launch delivered.
 * Which line is picked follows the launch, so a replay of the same day says the same thing.
 */
export function noteOf(after: CompanyState, day: number): string | null {
  const today = (type: 'missed' | 'delivered') =>
    after.events
      .filter((e) => e.day === day && e.type === type && e.jobId)
      .map((e) => after.jobs.find((j) => j.id === e.jobId)!)
      .map((j) => ({ j, c: after.contracts.find((c) => c.id === j.contractId)! }))
      .filter(({ c }) => !hasStudioRules(after.rulesVersion) || !c.project);
  const pick = <T,>(xs: T[], key: string) => xs[[...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % xs.length]!;
  const missed = today('missed')[0];
  if (missed) return `${castName(missed.j.castId)} at ${castBusiness(missed.j.castId)}: "${pick(SORRY[missed.c.segment], missed.j.id)}"`;
  const best = today('delivered').sort((a, b) => b.c.price - a.c.price)[0];
  if (!best) return null;
  return `${castName(best.j.castId)} at ${castBusiness(best.j.castId)}: "${pick(THANKS[best.c.segment], best.j.id)}"`;
}

/** Where the season is heading at this rate, and what the next medal it would miss needs from here. */
export function paceLine(served: number, day: number, par: { bronze: number; silver: number; gold: number }): string {
  const left = RULES.days - (day + 1);
  const avg = served / (day + 1);
  const heading = Math.round(avg * RULES.days);
  const next = (['bronze', 'silver', 'gold'] as const).find((m) => heading < par[m]);
  if (!next) return `Heading for about ${heading} served: gold pace (${par.gold}).`;
  const perDay = Math.ceil((par[next] - served) / Math.max(1, left));
  return `Heading for about ${heading} served. ${next.charAt(0).toUpperCase()}${next.slice(1)} (${par[next]}) needs ${perDay} a day from here; you average ${avg.toFixed(1)}.`;
}

/** One line from the studio about the day it just had, picked by what happened. Lines of one kind are used in turn,
 * so a season never hears the same one twice; a replay of the same day hears the same line. */
const CHATTER: Record<string, string[]> = {
  takeoff: [
    `Ada: "Someone on the bus was reading our launch out loud. I pretended not to know them."`,
    `Tomas: "We're being shared. I've never been shared. I feel like a cake recipe."`,
    `Tomas: "Three people asked who made it. I said 'the team'. I meant me."`,
  ],
  missed: [
    `Ada: "We'll make it up to them. I've written the deadline on the kettle."`,
    `Tomas: "I'm writing the deadlines on my hand from now on. Both hands."`,
    `Ada: "That one stings. Tomorrow we promise less and keep all of it."`,
  ],
  overtime: [
    `Tomas: "Five o'clock. I can no longer feel the stapler."`,
    `Ada: "Overtime again. I've started naming the lamps. That one's Gerald."`,
    `Tomas: "The street lights came on before we left. Very atmospheric. Very tired."`,
  ],
  noor: [`Noor: "First day. I've already reorganised the brief drawer. You're welcome."`],
  big: [
    `Tomas: "All out of the door before three. I'm having a biscuit. Two biscuits."`,
    `Ada: "If this keeps up we'll need a bigger kettle."`,
    `Tomas: "I high-fived the printer. It didn't respond, but I could tell."`,
    `Ada: "Busy days are the best days. Ask me again tomorrow."`,
  ],
  quiet: [
    `Ada: "Quiet day. I alphabetised the fonts."`,
    `Tomas: "I made a launch for the cat. It went well. She's very popular now."`,
    `Ada: "Nothing went out today. Plenty comes in tomorrow, I can feel it."`,
  ],
  ai: [
    `Tomas: "The AI desk wrote a poem about bread. Nobody asked it to."`,
    `Ada: "The AI desk and I had words about commas. I won."`,
    `Tomas: "The AI desk finished early and just sat there humming. Show-off."`,
  ],
  plain: [
    `Ada: "Lights off at six. Same again tomorrow."`,
    `Tomas: "Good day. Nobody cried, not even me."`,
    `Ada: "The street's getting to know us. The baker waved. Properly waved."`,
    `Tomas: "Ada says we're finding our rhythm. I've found the biscuits."`,
    `Ada: "Every promise kept today. That's the whole job, really."`,
    `Tomas: "Someone left a thank-you note under the door. I'm keeping it."`,
  ],
};

function chatterKind(s: CompanyState, day: number): string {
  const today = (type: string) => s.events.filter((e) => e.day === day && e.type === type).length;
  if (today('takeoff')) return 'takeoff';
  if (today('missed')) return 'missed';
  if (s.resources.some((r) => r.role === 'junior' && r.name === RULES.staff.junior.name && r.fromDay === day)) return 'noor';
  if (s.overtimeDays.includes(day)) return 'overtime';
  if (today('delivered') >= 3) return 'big';
  if (today('delivered') === 0) return 'quiet';
  if (s.journal.some((e) => e.day === day && e.kind === 'ai')) return 'ai';
  return 'plain';
}

export function chatterOf(_before: CompanyState, after: CompanyState, day: number): string {
  if (after.finished && day === RULES.days - 1) return 'Ada: "That is the season. Let us see how we did."';
  const kind = chatterKind(after, day);
  const used = Array.from({ length: day }, (_, d) => chatterKind(after, d)).filter((k) => k === kind).length;
  const lines = CHATTER[kind]!;
  return lines[(used + after.config.seed.length) % lines.length]!;
}

/**
 * What the morning should repeat from last night: its moment and any miss with its cause. Players who skim the
 * evening still meet the surprise, and the reason a promise broke, before they decide anything.
 */
export function overnight(s: CompanyState, previousMorning?: CompanyState): string[] {
  if (s.day === 0 || s.finished) return [];
  const runs = s.commands.flatMap((c, i) => (c.type === 'runDay' ? [i] : []));
  const last = runs[runs.length - 1];
  if (last === undefined) return [];
  const before = previousMorning ?? replay(s.config, s.commands.slice(0, last), s.rulesVersion).state;
  const day = s.day - 1;
  const delivered = s.events.filter((e) => e.day === day && e.type === 'delivered').length;
  const out: string[] = [];
  const moment = momentOf(before, s, day, delivered);
  if (moment) out.push(moment);
  const misses = missReasons(s, day);
  if (misses.length) out.push(`${misses.length === 1 ? 'A promise' : `${misses.length} promises`} broke: ${misses.join('; ')}. Refunded with a fee.`);
  // The money, every morning: what came in against what the studio costs to run, and where that leaves profit.
  const spent = (kind: string) => -s.journal.filter((e) => e.day === day && e.kind === kind).reduce((a, e) => a + e.cash, 0);
  const [wages, rent, ai] = [spent('wages'), spent('shop'), spent('ai')];
  const earned = s.journal.filter((e) => e.day === day).reduce((a, e) => a + e.revenue, 0);
  const profit = summarize(s).operatingResult;
  // From the fifth morning, where the season is heading at the pace so far, so a slide shows before the end.
  const heading = profitHeading(s);
  // A season heading down gets its own warning above (lossWarning); here, only the good news.
  const pace = heading === null || heading < 0 ? '' : ` At this pace the season ends about ${credits(heading)} up.`;
  out.push(
    `you earned ${credits(earned)} against ${credits(wages + rent + ai)} of running costs (wages ${num(wages)}, rent ${num(rent)}${ai ? `, AI desk ${num(ai)}` : ''}). Profit so far: ${profit < 0 ? '-' : ''}${credits(Math.abs(profit))}.${pace}`,
  );
  return out;
}

/**
 * A season heading for a loss, said plainly from the fifth morning: profit so far, where the pace leads, and what a day
 * earns against what it costs. Null while the season is heading for profit.
 */
/**
 * Where the season's profit is heading at the pace so far, to the nearest 100 cr; null before the fifth morning.
 * Scored against 144 ghost seasons (three streets, four seeds, four studios), profit-so-far at its own pace was the
 * closest of five ways tried: a median miss of about 1,900 cr from Day 5. Counting launches paid for but not yet out
 * as earned tripled the miss, and every way missed by about 4,000 before Day 5, so it is not said then.
 */
export function profitHeading(s: CompanyState): number | null {
  if (s.day < 4 || s.finished) return null;
  const profit = summarize(s).operatingResult;
  return Math.round((profit + (profit / s.day) * (RULES.days - s.day)) / 100) * 100;
}

export function lossWarning(s: CompanyState): string | null {
  const heading = profitHeading(s);
  if (heading === null || heading >= 0) return null;
  const sum = summarize(s);
  const spent = -s.journal.filter((e) => e.kind === 'wages' || e.kind === 'shop' || e.kind === 'ai').reduce((a, e) => a + e.cash, 0);
  return `Heading for a loss: about ${credits(Math.abs(heading))} down by the end, earning about ${credits(Math.round(sum.revenue / s.day / 10) * 10)} a day against ${credits(Math.round(spent / s.day / 10) * 10)} a day to run. A loss caps the medal at bronze.`;
}

/**
 * In the last four days, cash that would not see the season out at today's costs if nothing more were sold, credit
 * line repayment included. A medal needs the studio solvent at the close; a panel run lost one to a 38 cr overdraft
 * that nothing had warned of.
 */
export function cashWarning(s: CompanyState): string | null {
  const left = RULES.days - s.day;
  if (s.finished || left > 4) return null;
  const repay = s.modifiers.reduce((a, m) => a + (m.kind === 'repay' ? m.principal + m.interest : 0), 0);
  const end = s.cash - dailyCosts(s).total * left - repay;
  if (end >= 0) return null;
  return `Cash: at today's costs, and selling nothing more, the studio ends about ${credits(Math.ceil(-end / 10) * 10)} short${repay ? ` (with the ${credits(repay)} credit line repaid on the last morning)` : ''}. A medal needs it solvent at the close.`;
}

/** The studios you passed today, counting neighbours served so far. */
export function overtaken(you: number[], others: { label: string; served: number[] }[], day: number): string[] {
  if (day === 0) return [];
  return others.filter((o) => (you[day - 1] ?? 0) <= (o.served[day - 1] ?? 0) && (you[day] ?? 0) > (o.served[day] ?? 0)).map((o) => o.label);
}

const WALK_WORDS: Record<string, string> = {
  price: 'found the price too high',
  slow: 'needed it sooner',
  scope: 'had a brief the offers do not cover',
  care: 'wanted it made to order',
  lost: 'still upset about last time',
  empty: 'found nothing on the window',
  unansweredFit: 'could have been taken, but you left them unanswered',
  haggle: 'offered their own price at the window and got no answer',
  unansweredFull: "didn't fit your hours",
};

/** Why the neighbours who walked today left, from their reaction that morning, and what the ones who did not fit would have paid. */
function walked(before: CompanyState, after: CompanyState, day: number): { counts: Map<string, number>; fullValue: number } {
  const counts = new Map<string, number>();
  let fullValue = 0;
  // Who could have been taken, counted together in queue order: two who each fit alone may not both fit.
  const takeable = new Set(takeableInTurn(before));
  for (const r of after.requests) {
    if (r.day !== day || r.status !== 'walked') continue;
    const morning = before.requests.find((x) => x.id === r.id) ?? r;
    const re = reactionTo(before, morning);
    // A neighbour who named their own price and was left waiting did not leave over the price alone.
    const why = re.kind !== 'buy' ? (re.reason === 'price' && counterFor(before, morning) ? 'haggle' : re.reason) : takeable.has(r.id) ? 'unansweredFit' : 'unansweredFull';
    if (re.kind === 'buy' && why === 'unansweredFull') fullValue += re.price;
    counts.set(why, (counts.get(why) ?? 0) + 1);
  }
  return { counts, fullValue };
}

/** Why the neighbours who walked today left, largest group first. */
export function walkReasons(before: CompanyState, after: CompanyState, day: number): string[] {
  return reasonWords(walked(before, after, day).counts);
}

const reasonWords = (counts: Map<string, number>): string[] => [...counts].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${n} ${WALK_WORDS[why] ?? why}`);

/** The cheapest way to more hours tomorrow, with its price: hiring the junior, else overtime. */
function moreHours(s: CompanyState): string {
  const j = RULES.staff.junior;
  if (!s.resources.some((r) => r.role === 'junior' && r.name === j.name && (r.toDay === null || r.toDay > s.day))) return `Hiring ${j.name} adds about ${Math.round(((RULES.humanShift / 60) * 100) / j.speedPercent)} hours of work a day for ${j.dailyCost} cr`;
  const people = workingOn(s, s.day).filter((r) => r.kind === 'human').length;
  return `Overtime costs ${RULES.staff.overtimePerPerson * people} cr a day`;
}

/** The visit and choice that lost a regular today, even when tomorrow has a prep suggestion. */
export function regularLoss(after: CompanyState, day: number): string | null {
  const losses = after.requests.filter(r => r.day === day && ((r.status === 'declined' && !hasAuthorshipRules(after.rulesVersion)) || r.status === 'walked') && after.lostCast.includes(r.castId) && isRegular(after, r.castId));
  const separate = losses.filter(r => acceptedSibling(after, r));
  const lostBy = (status: 'declined' | 'walked') => [...new Set(losses.filter(r => r.status === status && !separate.includes(r)).map(r => castName(r.castId)))];
  const join = (ns: string[]) => (ns.length <= 2 ? ns.join(' and ') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);
  const turned = lostBy('declined');
  const waited = lostBy('walked');
  const parts = [
    turned.length ? `${join(turned)} came back today and ${turned.length === 1 ? 'was' : 'were'} turned away` : '',
    waited.length ? `${join(waited)} came back today and ${waited.length === 1 ? 'was' : 'were'} left waiting when you opened` : '',
  ].filter(Boolean);
  const ordinary = parts.length ? `${parts.join('; ')}. Regulars who are not served do not come back.` : '';
  const extra = separate.map(r => `You took ${acceptedSibling(after, r)!.offer.name} for ${castName(r.castId)}, but ${r.status === 'declined' ? 'turned another order away' : 'left another order waiting when you opened'}. ${castName(r.castId)} will not return.`);
  return [ordinary, ...extra].filter(Boolean).join(' ') || null;
}

export function insightsFor(before: CompanyState, after: CompanyState, day: number, missed: number): Insight[] {
  const util = dayUtil(before, after);
  const walkedN = after.requests.filter((r) => r.day === day && r.status === 'walked').length;
  const out: Insight[] = [];
  // The street changes tomorrow: the one evening a new window is worth thinking about, said before anything else.
  const scenario = scenarioById(after.config.scenarioId);
  const next = scenario && !after.finished ? phaseFor(scenario, after.day) : null;
  if (next?.note && next.fromDay === after.day) {
    const rising = SEGMENT_IDS.filter((g) => next.segmentWeights[g] > phaseFor(scenario!, day).segmentWeights[g]).map((g) => `"${SEGMENTS[g].label}"`);
    out.push({ text: `Tomorrow the street changes. ${next.note}${rising.length ? ` More ${rising.join(' and ')} customers will come to the window.` : ''}`, action: 'design', verb: 'Redesign the window' });
  }
  // Regulars turned away or left waiting today: they do not come back, which is worth saying the evening it happens.
  // Which visit and which choice lost them: a panel critic could not tell, having served the same people two days before.
  const lost = regularLoss(after, day);
  if (lost) out.push({ text: lost, action: 'promises', verb: 'See promises' });
  if (missed) out.push({ text: `Each miss costs a refund, a ${RULES.missedFeePercent}% fee and that neighbour.`, action: 'promises', verb: 'See promises' });
  if (walkedN >= 2) {
    const { counts, fullValue } = walked(before, after, day);
    const reasons = reasonWords(counts);
    const full = reasons[0]?.endsWith("didn't fit your hours");
    const worth = full && fullValue > 0 ? ` Those who didn't fit would have paid ${credits(fullValue)}.${after.finished && hasStudioRules(after.rulesVersion) ? '' : ` ${moreHours(after)}.`}` : '';
    // A booking taken yesterday spent today's hours before today's buyers came: say so, so the trade is learned.
    const booked = reasons.some((r) => r.endsWith("didn't fit your hours")) ? bookingsWorked(after, day) : [];
    const bookedText = booked.length ? ` ${booked.map((b) => `${b.name}'s booking, taken yesterday, used about ${hours(b.minutes)}`).join('; ')} of today's.` : '';
    // The puzzle the panel kept raising: buyers did not fit, yet people sat idle part of the day.
    const idle = full && util.people < 0.85 ? ` People were busy only ${Math.round(util.people * 100)}% of their hours, but the free hours came where no launch was ready for them: each one is briefed, made and finished in turn, and a same-day job needs its hours early.` : '';
    // Lost to hours with Noor not yet hired: the note's button hires her, so the evening is a decision, not a signpost.
    const canHire = !applyCommand(after, { type: 'hire' }).error;
    const act = full
      ? canHire
        ? { action: 'hire' as const, verb: `Hire ${RULES.staff.junior.name} (${RULES.staff.junior.dailyCost} cr a day)` }
        : { action: 'studio' as const, verb: 'See the studio' }
      : { action: 'design' as const, verb: 'Design an offer' };
    out.push({ text: `${walkedN} walked away: ${reasons.join('; ')}.${bookedText}${worth}${idle}`, ...act });
  }
  if (util.ai !== null && util.ai < 0.3 && util.people > 0.8) out.push({ text: 'The AI desk sat idle while people were flat out. Briefing and finishing are the bottleneck.', action: 'studio', verb: 'Get help' });
  else if (util.ai !== null && util.ai < 0.2) out.push({ text: 'The AI desk was mostly idle. It only helps when there is making to do.', action: 'desk', verb: 'Change the desk' });
  if (util.people < 0.4 && !after.finished) out.push({ text: 'People had a quiet day. There is room for more work.', action: 'studio', verb: 'Hand out flyers' });
  if (!after.finished && runwayDays(after) < 2) out.push({ text: 'Cash covers less than two days of running costs.', action: 'books', verb: 'Open the books' });
  return out;
}

/** One way to set up tomorrow from the evening, answering what today lost. */
export interface Prep {
  label: string;
  why: string;
  command: Command;
}

/**
 * At most two moves for tomorrow, each aimed at what today cost: hours (hire, else overtime), price (reprice the
 * offer they wanted), or a quiet studio (flyers). Each is checked against the engine, so every button works.
 */
export function prepFor(before: CompanyState, after: CompanyState, day: number): Prep[] {
  if (after.finished) return [];
  const ok = (c: Command) => !applyCommand(after, c).error;
  const { counts, fullValue } = walked(before, after, day);
  const out: Prep[] = [];
  const short = counts.get('unansweredFull') ?? 0;
  if (short > 0) {
    const j = RULES.staff.junior;
    const people = workingOn(after, after.day).filter((r) => r.kind === 'human').length;
    // Honest stakes: what overtime would really have freed this morning, not everything that walked.
    const hint = studioHint(before);
    const ot = hint?.lever === 'overtime' && hint.unlocks ? hint.unlocks : null;
    if (ok({ type: 'hire' })) {
      const from = after.day + 1;
      const wages = Math.max(0, RULES.days - from) * j.dailyCost;
      // Her gain in the same terms as her cost: this morning's studio with her in it, and who would then have fitted.
      // Her briefing and finishing free the others to make, which an hours sum misses.
      const mins = (RULES.humanShift * 100) / j.speedPercent;
      const withHer = structuredClone(before);
      withHer.resources.push({ id: 'what-if', kind: 'human', role: 'junior', name: j.name, speedPercent: j.speedPercent, fromDay: before.day, toDay: null, dailyCost: j.dailyCost, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0 });
      const more = Math.min(short, takeableInTurn(withHer).length - takeableInTurn(before).length);
      const gain = more > 0 ? ` Had she been here today, ${more} more would have fitted, worth about ${credits(Math.round(((fullValue / short) * more) / 10) * 10)}.` : ` She adds about ${Math.round(mins / 60)} hours of briefs and finishing a day.`;
      out.push({ label: `Hire ${j.name} (${j.dailyCost} cr a day)`, why: `${short} didn't fit today's hours, worth ${credits(fullValue)}.${gain} She starts ${dayLabel(from)}: ${credits(wages)} to the season's end.`, command: { type: 'hire' } });
    } else if (ot && ot.value > RULES.staff.overtimePerPerson * people && ok({ type: 'overtime' }))
      out.push({ label: `Book overtime for ${dayLabel(after.day)} (${credits(RULES.staff.overtimePerPerson * people)})`, why: `Today, overtime would have let you take ${ot.n} more, worth ${credits(ot.value)}. It pays off tomorrow only if the window is as busy.`, command: { type: 'overtime' } });
  }
  const priced = after.requests.filter((r) => r.day === day && r.status === 'walked').map((r) => before.requests.find((x) => x.id === r.id) ?? r);
  // Three or more, so a lone haggler does not bring the same price nudge every evening.
  // Only with hours to spare: when hours are the limit, a lower price just earns less for the same work.
  const spare = short === 0 && dayUtil(before, after).people < 0.75;
  const t = spare && (counts.get('price') ?? 0) >= 3 ? priceTarget(before, priced) : null;
  const offer = t ? after.menu[t.offerIndex] : undefined;
  // A modest cut only: a deep one rarely pays, and the window still shows it for anyone who wants it.
  if (t && offer && t.price < offer.price && t.price >= offer.price * 0.8) {
    const command: Command = { type: 'setMenu', offers: after.menu.map((o, k) => (k === t.offerIndex ? { ...o, price: t.price } : o)) };
    if (ok(command)) out.push({ label: `Price ${offer.name} at ${credits(t.price)}`, why: `${t.prices.length} found ${offer.name} too dear today and would have paid about ${credits(t.price)}. Everyone who buys it pays that too: ${credits(offer.price - t.price)} less on each sale.`, command });
  }
  // More neighbours only help when the ones who fitted were taken; otherwise the answer is at the window.
  if (out.length === 0 && !counts.get('unansweredFit') && dayUtil(before, after).people < 0.6) {
    const served = new Map<SegmentId, number>();
    for (const c of after.contracts) if (after.requests.find((r) => r.id === c.requestId)?.day === day) {
      const seg = after.requests.find((r) => r.id === c.requestId)!.segment;
      served.set(seg, (served.get(seg) ?? 0) + 1);
    }
    const segment = [...served].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'small';
    const command: Command = { type: 'flyers', segment };
    if (ok(command)) out.push({ label: `Hand out flyers to "${SEGMENTS[segment].label}" (${credits(RULES.flyers.cost)})`, why: `People were busy ${Math.round(dayUtil(before, after).people * 100)}% of their hours today. Flyers bring ${RULES.flyers.count} more neighbours of that kind on ${dayLabel(after.day + 1)}.`, command });
  }
  // A calm evening, nothing lost to hours or price: the moment to invest, if an upgrade fits this studio and the cash.
  if (out.length === 0 && short === 0 && (counts.get('price') ?? 0) === 0 && after.day <= RULES.days - 4) {
    const runway = 2 * dailyCosts(after).total;
    const fit: Record<UpgradeId, boolean> = {
      checklist: true,
      library: after.menu.some((o) => o.style === 'templated'),
      styleGuide: after.staffing.aiTier !== 'none',
    };
    const item = (['checklist', 'library', 'styleGuide'] as const).find((u) => fit[u] && !after.upgrades.includes(u) && after.cash >= RULES.upgrades[u].cost + runway && ok({ type: 'buy', item: u }));
    if (item) {
      const up = RULES.upgrades[item];
      // What the upgrade answers in this season so far, so its detail means something.
      const redos = after.events.filter((e) => e.type === 'rework_found').length;
      const why = item === 'library' ? 'Briefs are where the hours go.' : redos ? `${redos === 1 ? '1 launch has' : `${redos} launches have`} needed redoing so far.` : '';
      out.push({ label: `Buy the ${up.label.replace(/^[A-Z]/, (m) => m.toLowerCase())} (${credits(up.cost)})`, why: `${up.detail}${why ? ` ${why}` : ''}`, command: { type: 'buy', item } });
    }
  }
  return out.slice(0, 2);
}
