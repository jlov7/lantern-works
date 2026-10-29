import { RULES } from '../../engine/rules';
import type { CallChoice } from '../../engine/sim';
import { credits } from '../format';
import { clockLabel } from '../timeline';

export function callConsequence(c: CallChoice, who: string, start: number, name: (id: string) => string): { text: string; saved: boolean; unavailable: boolean } {
  if (c.blocked !== null) return { text: c.blocked, saved: false, unavailable: true };
  const counts = new Map<string, number>();
  for (const id of c.alsoMissed) counts.set(name(id), (counts.get(name(id)) ?? 0) + 1);
  const neighbours = [...counts].map(([person, count]) => count > 1 ? `${person} (${count} launches)` : person);
  const also = neighbours.length ? ` But ${neighbours.join(' and ')} would then miss tonight.` : '';
  const saved = c.deliveredAt !== null || (c.option === 'ring' && c.keepsPromise);
  let text: string;
  if (c.option === 'cut') text = `${c.deliveredAt !== null ? `On time, ready by ${clockLabel(c.deliveredAt - start)}` : 'Still late, even without the change'}, but ${who} won't buy from you again, and their kind notice.${also}`;
  else if (c.option === 'ring') text = `Due tomorrow instead.${c.keepsPromise ? '' : ' Still forecast to miss that deadline.'} ${credits(c.cost)} back to them, and their kind think a little less of you.${also}`;
  else if (c.deliveredAt !== null) text = `Ready by ${clockLabel(c.deliveredAt - start)}${c.cost ? `, for ${credits(c.cost)}` : ''}${c.option === 'late' ? `; everyone ${RULES.staff.tiredPercent - 100}% slower tomorrow` : ''}.${also}`;
  else if (c.option === 'ride') text = `It misses: a refund, a ${RULES.missedFeePercent}% fee, and ${who} won't come back.`;
  else text = `Still late.${c.cost ? ` It would cost ${credits(c.cost)} anyway.` : ''}${also}`;
  for (const shared of [false, true]) {
    const risks = c.futureRisks.filter(risk => risk.shared === shared);
    if (!risks.length) continue;
    const promises = risks.map(risk => `${name(risk.jobId)} (due Day ${Math.ceil(risk.dueAt / RULES.minutesPerDay)}${risk.afterSeason ? ', season ends first' : ''})`);
    text += ` ${shared ? 'At risk across every available answer' : 'Also at risk with this answer'}: ${promises.join('; ')}.`;
  }
  if (c.gatheringBooking && !c.gatheringBooking.shared) text += ` On the last booking morning (Day ${c.gatheringBooking.day + 1}), the current work ${c.gatheringBooking.available ? 'would unlock a gathering invitation' : 'would not unlock either gathering invitation'}.`;
  return { text: c.projectConsequence ? `${text} ${c.projectConsequence}` : text, saved, unavailable: false };
}
