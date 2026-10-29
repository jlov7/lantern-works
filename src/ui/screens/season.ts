// Pure summaries of a finished season for the end screen: the share text, and what happened on each day.
import { RULES, scenarioById } from '../../engine/rules';
import { medalFor, medalParFor, summarize } from '../../engine/selectors';
import type { Command, CompanyState } from '../../engine/types';
import { newsPresentation } from '../game/careerContinuity';

export const DAY_GLYPH = { delivered: '●', sold: '◐', missed: '×', quiet: '○' } as const;
export type DayMark = keyof typeof DAY_GLYPH;

/** One mark per day: a missed promise wins, then a delivery, then a sale, else a quiet day. */
export function dayMarks(s: CompanyState): DayMark[] {
  return Array.from({ length: RULES.days }, (_, d) => {
    const ev = s.events.filter((e) => e.day === d);
    if (ev.some((e) => e.type === 'missed')) return 'missed';
    if (ev.some((e) => e.type === 'delivered')) return 'delivered';
    if (s.contracts.some((c) => c.acceptedDay === d)) return 'sold';
    return 'quiet';
  });
}

export const SHARE_LIMIT = 280;

/**
 * The text a player shares: street, a strip of twelve days, served against par, and a link to play the same street.
 * Built only from the config and the replayed state, so every replay of the same moves gives the same text.
 */
export function shareText(s: CompanyState, challengeUrl: string): string {
  const sum = summarize(s);
  const par = medalParFor(s);
  const medal = medalFor(s).medal;
  const street = scenarioById(s.config.scenarioId)?.name ?? s.config.scenarioId;
  const vsPar = par ? (medal ? `${medal[0]!.toUpperCase()}${medal.slice(1)} medal; gold is ${par.gold}.` : `Bronze is ${par.bronze}.`) : '';
  const lines = [
    `Lantern Works: ${street}${s.config.continuation ? `, season ${s.config.continuation.season}` : ''}, seed ${s.config.seed}`,
    dayMarks(s)
      .map((m) => DAY_GLYPH[m])
      .join(''),
    `Served ${sum.served} neighbours. ${vsPar}`.trim(),
    `${DAY_GLYPH.delivered} delivered ${DAY_GLYPH.sold} sold ${DAY_GLYPH.missed} missed`,
  ];
  const text = `${lines.join('\n')}\n${challengeUrl}`;
  return text.length <= SHARE_LIMIT ? text : lines.join('\n').slice(0, SHARE_LIMIT);
}

/** Commands grouped by the morning they were given on (the runDay that closes each group is left out). */
export function commandsByDay(commands: readonly Command[]): Command[][] {
  const days: Command[][] = Array.from({ length: RULES.days }, () => []);
  let d = 0;
  for (const c of commands) {
    if (c.type === 'runDay') d += 1;
    else if (d < RULES.days) days[d]!.push(c);
  }
  return days;
}

const UPGRADE_WORD: Record<string, string> = { library: 'brief library', checklist: 'checklist', styleGuide: 'style guide' };

/** A few words naming the most important thing decided on each morning, for the rewind buttons. */
export function dayEvents(s: CompanyState): string[] {
  const days = commandsByDay(s.commands);
  return days.map((cmds, d) => {
    const news = s.news.find((n) => n.day === d && n.choice !== null);
    if (news) {
      return `News: ${newsPresentation(s, news).title}`;
    }
    const has = (t: Command['type']) => cmds.some((c) => c.type === t);
    if (d > 0 && has('setMenu')) return 'Offer changed';
    if (has('hire')) return `Hired ${RULES.staff.junior.name}`;
    if (has('letGo')) return `${RULES.staff.junior.name} left`;
    if (d > 0 && has('setStaff')) return 'Staffing changed';
    const buy = cmds.find((c) => c.type === 'buy');
    if (buy && buy.type === 'buy') return `Bought the ${UPGRADE_WORD[buy.item] ?? 'upgrade'}`;
    if (has('flyers')) return 'Flyers out';
    if (has('temp')) return 'Temp booked';
    if (has('overtime')) return 'Overtime';
    if (d === 0 && has('setMenu')) return 'Offer changed';
    const took = cmds.filter((c) => c.type === 'accept').length;
    if (took) return `Took ${took}`;
    return cmds.some((c) => c.type === 'decline') ? 'Turned them away' : 'A quiet morning';
  });
}
