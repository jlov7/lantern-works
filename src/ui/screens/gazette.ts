// The street's paper on the season's last evening (AI-28, offline): a front page written only from what happened in
// this run, so every name and number on it can be checked against the season. No React here.
import { CAST_BY_ID, scenarioById } from '../../engine/rules';
import { medalFor, servedByDay, summarize } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { dayLabel } from '../format';
import { projectOutcome, seasonEnding } from '../../engine/endings';
import { nightResult, projectRecords } from '../../engine/projects';
import { hasStudioRules } from '../../engine/versions';
import { isContinuingCareer, laterStoryPayoff } from '../game/careerContinuity';

export interface Gazette {
  masthead: string;
  headline: string;
  lead: string | null;
  second: string | null;
  rivals: string | null;
  /** A letter to the editor from the season's best regular, in their kind's voice. */
  letter: string | null;
  /** The paper's corrections column, about promises kept or missed. */
  corrections: string | null;
  /** The season in a few counts, real ones and one the paper made up. */
  numbers: string | null;
  classified: string;
}

/** Story orders, most newsworthy first, with how the paper tells each one. */
const STORIES: [offer: string, story: string][] = [
  ['Summer street party', 'The summer street party went off without a hitch, launched by Lantern Works. "Everyone was there," said a neighbour. "Everyone."'],
  ['Tap takeover rescue', 'When a rival studio sent Oscar Brewing\'s launch to the wrong list, Lantern Works stepped in. The tap takeover was packed.'],
  ['Ten years of Clem', 'Clem Jazz Bar turned ten in style. Clem thanked "the studio with the lamp" from the stage.'],
  ['Second opening', 'Eli\'s show at the Pocket Stage opened a second time, and sold out a second time.'],
  ["Mara's regular", 'Moonrise Bakery\'s queue now goes round the corner every week. Mara credits three launches from Lantern Works.'],
  ['A quiet send-off', 'Hugo handed his bench to an apprentice with a quiet send-off. The careful shops approved.'],
  ['Festival bundle', 'The festival committee\'s four launches all went out on time. The bunting stayed up an extra day.'],
];

const delivered = (s: CompanyState, contractId: string) => s.contracts.find((c) => c.id === contractId)!.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered');

/** A small ad from inside the studio, picked by what the season did. */
function classified(s: CompanyState): string {
  if (s.resources.some((r) => r.role === 'junior' && r.name === 'Noor')) return 'Notice: Noor would like it known that she was right about the fonts.';
  if (s.overtimeDays.length >= 3) return 'Wanted: a quieter lamp for late nights at Lantern Works. Ask for Tomas.';
  if (s.upgrades.includes('library')) return 'For reference: one brief library, well thumbed. Not for sale.';
  if (s.staffing.aiTier !== 'none') return 'Lost: the AI desk\'s sense of humour. Last seen in a draft for a bakery.';
  return 'Wanted: a bigger kettle. Apply to Ada, Lantern Works.';
}

function rivalsLine(served: number, rivals: { label: string; served: number }[] | null, verb: string): string | null {
  if (!rivals) return null;
  const ranked = [...rivals].sort((a, b) => b.served - a.served);
  const ahead = ranked.filter((r) => r.served < served).map((r) => r.label);
  const top = ranked[0]!;
  return ahead.length === ranked.length
    ? `Across the street, no studio served more: ${ranked.map((r) => `${r.label} ${r.served}`).join(', ')}.`
    : `Across the street, ${top.label} led with ${top.served} served.${ahead.length ? ` Lantern Works ${verb} ahead of ${ahead.join(' and ')}.` : ''}`;
}

/** Every story the season so far has earned, most newsworthy first; a page prints the first two. */
function storiesOf(s: CompanyState): string[] {
  const stories: string[] = [];
  const current = hasStudioRules(s.rulesVersion);
  const later = isContinuingCareer(s);
  if (current) {
    const night = nightResult(s);
    if (night.project) {
      const p = night.project;
      const handedOver = s.journal.some(e => e.kind === 'refund' && p.contract.jobIds.includes(e.ref) && e.note.startsWith('Handed to Bright Lantern'));
      if (handedOver) stories.push(`The customer list sale handed the unfinished ${night.calendar.name} work to Bright Lantern. Lantern Works delivered ${p.delivered} of ${p.promised} promised pieces and refunded the rest.`);
      else if (night.settled) stories.push(seasonEnding(s).line);
      else stories.push(`${night.calendar.name} is booked for Day ${night.calendar.day + 1}. ${p.delivered} of ${p.promised} pieces are ready; the event date cannot move.`);
    }
    for (const p of projectRecords(s).filter(p => p.id !== 'lantern-night' && p.status !== 'working')) stories.push(projectOutcome(p, s));
  }
  for (const [offer, story] of STORIES) if (s.contracts.some((x) => x.offer.name === offer && delivered(s, x.id))) stories.push(laterStoryPayoff(s, offer) ?? story);
  const took = s.events.find((e) => e.type === 'takeoff' && e.jobId);
  if (took) {
    const j = s.jobs.find((x) => x.id === took.jobId)!;
    const cast = CAST_BY_ID[j.castId];
    if (cast) stories.push(`On ${dayLabel(took.day)}, a launch for ${cast.business} was shared all over the street. "${cast.name} could not keep up with the door," said a neighbour.`);
  }
  const poach = s.news.find((n) => n.card === 'poach');
  if (poach?.choice === 1) stories.push(later ? 'Ada stayed at Lantern Works for the current bookings. The studio paid her a bonus.' : 'Ada of Lantern Works turned down Bright Lantern. Sources say a kettle was involved.');
  if (poach?.choice === 0) stories.push(later ? 'Ada took a three-day guest booking at Bright Lantern.' : 'Ada spent three days at Bright Lantern and came back. "They name every file final_final," she told this paper.');
  const last = s.news.find((n) => n.card === 'lastOffer');
  const closingStory = last?.choice === 1 ? 'On the last morning Lantern Works sold its customer list to Bright Lantern for 1,500 credits. Mara has taken her custom elsewhere. The kettle has not forgiven anyone.' : last?.choice === 0 ? 'On the season\'s last morning Bright Lantern offered to buy Lantern Works\' customer list. Witnesses describe a short meeting, a firm no, and a stapler.' : null;
  if (closingStory) {
    if (current) stories.push(closingStory);
    else stories.unshift(closingStory);
  }
  const dark = s.news.find((n) => n.card === 'blackout');
  if (dark && dark.choice !== null && dark.choice < 2) stories.push(later ? 'Quickprint stopped taking new orders. Lantern Works kept its window open to the extra customers.' : 'When Quickprint\'s printers broke down, Lantern Works took in its customers. "We just put the kettle on," said Ada.');
  const times = new Map<string, number>();
  for (const c of s.contracts) if (delivered(s, c.id)) times.set(c.castId, (times.get(c.castId) ?? 0) + 1);
  const [regular, n] = [...times].filter(([id]) => CAST_BY_ID[id]?.segment && id !== 'committee' && id !== 'association').sort((a, b) => b[1] - a[1])[0] ?? [];
  const cast = regular ? CAST_BY_ID[regular] : undefined;
  if (cast && n && n >= 2) stories.push(`${cast.name} of ${cast.business} went to Lantern Works ${n === 2 ? 'twice' : `${n} times`} this season. "I wouldn't go anywhere else," ${cast.name} said.`);
  if (stories.length === 0) {
    const perDay = servedByDay(s).map((x, d, a) => x - (a[d - 1] ?? 0));
    const best = perDay.indexOf(Math.max(...perDay));
    if (perDay[best]! > 0) stories.push(`The busiest day at Lantern Works was ${dayLabel(best)}, with ${perDay[best]} neighbours served.`);
  }
  return stories;
}

const LETTERS: Record<string, (n: number) => string> = {
  small: (n) => `"Dear Gazette, Lantern Works did ${n} launches for my shop this season, quick and right. My only complaint is the queue, which is now mine."`,
  moment: (n) => `"Dear Gazette, Lantern Works has launched ${n} of my big nights. Every one of them was a big night. I have told everyone, some of them twice."`,
  careful: () => '"Dear Gazette, they listened. Then they listened again. Then they made it. Recommended."',
  rush: () => '"Dear Gazette, I asked for it by tonight and got it by tonight. I would like this to be more common."',
};

/** The best regular's letter to the editor: the neighbour served most often, twice or more. */
function letterOf(s: CompanyState): string | null {
  const times = new Map<string, number>();
  for (const c of s.contracts) if (delivered(s, c.id)) times.set(c.castId, (times.get(c.castId) ?? 0) + 1);
  const [id, n] = [...times].filter(([x]) => CAST_BY_ID[x]?.segment && x !== 'committee' && x !== 'association').sort((a, b) => b[1] - a[1])[0] ?? [];
  const cast = id ? CAST_BY_ID[id] : undefined;
  if (!cast?.segment || !n || n < 2) return null;
  return `Letters. ${LETTERS[cast.segment]!(n)} ${cast.name}, ${cast.business}.`;
}

function correctionsOf(s: CompanyState): string | null {
  const sum = summarize(s);
  if (sum.missed > 0) return `Corrections: an earlier edition said Lantern Works never misses a deadline. It missed ${sum.missed}. We regret the error, and so does Tomas.`;
  if (sum.refundedAtClose > 0) return `Corrections: ${sum.refundedAtClose} unfinished launch${sum.refundedAtClose === 1 ? ' was' : 'es were'} refunded.`;
  return sum.served >= 10 ? 'Corrections: none. Lantern Works kept every promise, and this paper checked twice.' : null;
}

function numbersOf(s: CompanyState): string | null {
  const sum = summarize(s);
  if (sum.delivered === 0) return null;
  const late = s.overtimeDays.length;
  const regulars = new Set(s.contracts.filter((c) => s.contracts.filter((x) => x.castId === c.castId).length >= 2).map((c) => c.castId)).size;
  return [
    `By the numbers: ${sum.delivered} launch${sum.delivered === 1 ? '' : 'es'} out of the door`,
    `${sum.served} neighbours served`,
    regulars ? `${regulars} regular${regulars === 1 ? '' : 's'}` : null,
    late ? `${late} late lamp${late === 1 ? '' : 's'}` : null,
    `about ${sum.delivered * 3} cups of tea (estimated by Tomas)`,
  ]
    .filter(Boolean)
    .join(', ')
    .concat('.');
}

export function gazette(s: CompanyState, rivals: { label: string; served: number }[] | null): Gazette {
  const street = scenarioById(s.config.scenarioId)?.name ?? 'the street';
  const sum = summarize(s);
  const medal = medalFor(s).medal;
  const kept = sum.promisesKept === 1 && sum.refundedAtClose === 0 && sum.served > 0 ? ', every promise kept' : '';
  const legacyHeadline = medal
    ? `Lantern Works takes ${medal} on ${street}: ${sum.served} neighbours served${kept}`
    : `Lantern Works closes the season on ${street} with ${sum.served} neighbours served${kept}`;

  const [lead = null, second = null] = storiesOf(s);

  const rivalLine = rivalsLine(sum.served, rivals, 'finished');

  const headline = hasStudioRules(s.rulesVersion) ? `${seasonEnding(s).title}: Lantern Works closes on ${street} with ${sum.served} neighbours served${kept}` : legacyHeadline;
  return { masthead: `The ${street} Gazette`, headline, lead, second, rivals: rivalLine, letter: letterOf(s), corrections: correctionsOf(s), numbers: numbersOf(s), classified: classified(s) };
}

/** Small ads for the midweek edition, picked by how the first half went. */
function midClassified(s: CompanyState): string {
  const sum = summarize(s);
  if (sum.missed > 0) return 'Lost: one deadline, last seen at Lantern Works. Reward: a quieter week.';
  if (s.resources.some((r) => r.role === 'junior' && r.name === 'Noor')) return 'Notice: Noor has relabelled every shelf at Lantern Works. Nobody can find anything.';
  if (s.requests.filter((r) => r.day < s.day && r.status === 'walked').length >= 10) return 'Wanted: a second door at Lantern Works, for the queue. Or a second Ada.';
  return 'For sale: one kettle, overworked. Lantern Works. No offers.';
}

/** The midweek edition, on the morning the season turns: the first half so far, and what the street is talking about next. */
export function midweek(s: CompanyState, rivals: { label: string; served: number }[] | null): Gazette {
  const street = scenarioById(s.config.scenarioId)?.name ?? 'the street';
  const sum = summarize(s);
  const [lead = null, second = null] = storiesOf(s);
  const party = s.news.some((n) => n.card === 'streetParty');
  const calendar = nightResult(s).calendar;
  const rumour = hasStudioRules(s.rulesVersion)
    ? s.day > calendar.day ? `${calendar.name} has passed. Four walls, a workbench, and the work still to come.` : `${calendar.name} is on Day ${calendar.day + 1}. The studio can book it from Day ${calendar.opens + 1} to Day ${calendar.closes + 1}, with help from completed milestone commissions.`
    : party
    ? null
    : sum.served >= 10
      ? 'Rumour has it the street association is choosing a studio for its summer party this week.'
      : `Rumour has it the street association will only trust its summer party to a studio that has served ten. Lantern Works stands at ${sum.served}.`;
  return {
    masthead: `The ${street} Gazette, midweek`,
    headline: `Halfway on ${street}: Lantern Works has served ${sum.served} ${sum.served === 1 ? 'neighbour' : 'neighbours'}`,
    lead: lead ?? rumour,
    second: lead ? (second ?? rumour) : null,
    rivals: rivalsLine(sum.served, rivals, 'is'),
    letter: null,
    corrections: null,
    numbers: null,
    classified: midClassified(s),
  };
}
