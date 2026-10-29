import { approachFor, nightResult, projectBrief, projectFor, projectRecords, type ProjectRecord } from '../../engine/projects';
import { creativePromise, ordinaryIntentions } from '../../engine/ordinary';
import { RULES } from '../../engine/rules';
import { hasAuthorshipRules, hasCreativePromiseRules, hasStudioRules } from '../../engine/versions';
import type { CompanyState, ProjectApproach, ProjectId } from '../../engine/types';
import { artifactLabel, briefFor, portfolioAt, type WorkPiece } from './portfolio';
import { contributionLine } from './nightContributions';
import { proofObservation } from './creativeRecognition';
import { relationshipSummary } from './relationshipSummary';

export interface CommissionPayoff {
  id: string;
  kind: 'ordinary' | 'milestone' | 'night' | 'window';
  phase: 'delivered' | 'compromised' | 'ready' | 'preparing' | 'progress' | 'partial' | 'failed' | 'window';
  approach: ProjectApproach | null;
  title: string;
  line: string;
  consequence?: string;
  response?: string;
  featuredPiece?: WorkPiece;
  invitation?: { projectId: ProjectId; label: string };
  calendar: ReturnType<typeof nightResult>['calendar'];
  pieces: WorkPiece[];
  contributors: WorkPiece[];
  promised: number;
  catering?: boolean;
  slots: { label: string; piece: WorkPiece | null }[];
}
const DAY = RULES.minutesPerDay;
const inDay = (minute: number, day: number, shown: number) => minute > day * DAY && minute <= Math.min(shown, (day + 1) * DAY);

function deliveryResponse(state: CompanyState, record: ProjectRecord, piece: WorkPiece | undefined, declined: boolean): string | undefined {
  if (!hasAuthorshipRules(state.rulesVersion)) return undefined;
  if (record.status === 'failed' || record.status === 'partial') return record.delivered ? 'The finished print stays. The unfinished part of the promise is still missing.' : 'There is no finished print to hand over.';
  if (declined) return 'The original print is finished. The declined change stays part of this commission.';
  if (!piece) return undefined;
  const story = record.contract.project?.story;
  if (story && (story.stage === 'legacy' || story.stage === 'open')) {
    if (record.delivered < record.promised) return record.id === 'clem-ten' ? 'Clem makes room for the finished archive print. “The other one will sit beside it.”' : record.id === 'mara-regular' ? 'Mara checks the finished label. “Keep the next pieces with this one.”' : 'Ivo checks the finished piece. “We still need the rest for the class.”';
    if (record.id === 'clem-ten') return record.contract.project?.lentPiece ? 'Clem sets the retained print beside its new caption. “We can tell people where this came from.”' : 'Clem places the archive prints side by side. “Give them room to look.”';
    if (record.id === 'mara-regular') return record.host ? 'Mara reads the invitations beside the labels. “We can open the bakery with these.”' : 'Mara sets the invitation beside the bread. “One table. We can manage that.”';
    if (record.id === 'hugo-handover') return record.host ? 'Ivo lays the demonstration sheet on the bench. “They can follow this while I show them.”' : 'Ivo reads the reference sheet beside the tools. “Keep it here. Someone will need it.”';
  }
  const copy = piece.brief.proof?.pieces[piece.launch - 1]?.copy;
  const text = (id: string) => copy?.find(c => c.id === id)?.text;
  if (record.contract.castId === 'ivo') return record.approach === 'quiet-sendoff' ? 'Ivo holds the sign at arm’s length. “My name. Still getting used to that.”' : 'Ivo reads the workshop invitation once more. “Six places. I can do six.”';
  switch (record.approach) {
    case 'first-night': return 'Clem looks from the photograph to the old bar lettering. “Yes. Leave that just as it is.”';
    case 'new-band': return text('band') ? `Clem reads “${text('band')}” on the poster. “Their name on the wall. That’s where we start.”` : 'Clem turns the residency poster towards the light. “They’ll know which night to come.”';
    case 'quiet-sendoff': return text('dedication') ? `Hugo reads the small line: “${text('dedication')}” He checks it once more before taking the portrait.` : 'Hugo checks the bench in the portrait. “That’s right. Nothing more needed.”';
    case 'open-bench': return 'Hugo puts a finger beside Ivo’s name on the sign. “He should be the one to hang it.”';
    case 'market-debut': return 'Mara holds the banner wide. “Moonrise. You’ll be able to find us.”';
    case 'weekly-rhythm': {
      const heading = text(`card-${piece.launch}`);
      if (state.config.continuation) return record.delivered === record.promised ? 'Mara lays the counter and menu cards together. “Same bakery, whichever one they pick up.”' : 'Mara sets the new card beside the till. “That makes it easier to choose.”';
      const words = record.contract.offer.spacingDays === 0 ? [
        'Mara sets the first card against the counter. “That one goes here.”',
        'Mara places the second card beside the first. “They belong together.”',
        'Mara gathers the set. “Right. Now back to the ovens.”',
      ] : [
        'Mara clears a place for the first card. “There. We’ve started.”',
        'Mara puts the new card beside the first. “Keep that one up too.”',
        'Mara looks across the three cards. “I can keep this going.”',
      ];
      return `${heading ? `“${heading}” is ready. ` : ''}${words[piece.launch - 1]}`;
    }
    default: return undefined;
  }
}

function milestonePayoff(state: CompanyState, record: ProjectRecord, minute: number): CommissionPayoff {
  const night = nightResult(state, minute);
  const pieces = portfolioAt(state, minute).filter(p => p.contractId === record.contract.id);
  const complete = record.completedAt !== null;
  const phase = record.status === 'compromised' ? 'compromised' : complete ? 'delivered' : record.status === 'working' ? 'progress' : record.delivered ? 'partial' : 'failed';
  const featuredPiece = hasAuthorshipRules(state.rulesVersion) ? pieces.toSorted((a, b) => b.deliveredAt! - a.deliveredAt!)[0] : pieces[0];
  const declined = record.jobs.some(j => j.changeDeclined && state.events.some(e => e.type === 'project_change_declined' && e.jobId === j.id && e.minute <= minute));
  const response = [deliveryResponse(state, record, featuredPiece, declined), relationshipSummary(state, record.contract.castId, minute).line].filter(Boolean).join(' ') || undefined;
  const design = featuredPiece?.brief.proof?.design.pieces[featuredPiece.launch - 1];
  const edited = hasCreativePromiseRules(state.rulesVersion) && design && !declined && !['failed', 'partial'].includes(record.status) && JSON.stringify(design) !== JSON.stringify(projectBrief(state, record.id, record.approach, record.contract.project?.lentPiece?.id).defaultDesign.pieces[featuredPiece!.launch - 1]);
  const observation = edited ? proofObservation(record.contract.castId, design) : undefined;
  const excluded = night.project && !night.project.contract.project!.contributors.includes(record.id);
  const late = record.completedAt !== null && record.completedAt > (night.calendar.day + 1) * DAY;
  const consequence = phase === 'progress' ? `The remaining ${record.promised - record.delivered} ${record.promised - record.delivered === 1 ? 'piece is' : 'pieces are'} still promised. ${declined ? 'The declined change withheld the gathering contribution.' : 'The gathering contribution is earned when the whole set is delivered.'}` : !record.earned ? complete ? 'The original brief is delivered. Declining the extra change withheld the contribution to the gathering.' : 'The unfinished promise has not earned its contribution to the gathering.' : late ? `The work stays in the studio. It finished after ${night.calendar.name} on Day ${night.calendar.day + 1}.` : excluded ? `A separate completed commission. It was not included when ${night.calendar.name} was booked.` : record.contribution ? contributionLine(record.contract.castId === 'clem' ? 'Clem' : record.contract.castId === 'mara' ? 'Mara' : 'Ivo', record.contribution) : approachFor(state, record.approach).benefit;
  const brief = briefFor(state.requests.find(r => r.id === record.contract.requestId)!, record.contract.offer, state.config, record.contract.project?.proof, state.rulesVersion);
  return { id: record.contract.id, kind: 'milestone', phase, approach: record.approach, title: phase === 'progress' && featuredPiece ? artifactLabel(featuredPiece.brief, featuredPiece.launch) : complete ? record.artifact : `${record.artifact}: unfinished`, line: `${record.delivered} of ${record.promised} ${record.promised === 1 ? 'piece' : 'pieces'} delivered.`, consequence, response: [response, observation].filter(Boolean).join(' ') || undefined, featuredPiece, calendar: night.calendar, pieces, contributors: [], promised: record.promised, slots: record.jobs.map(j => ({ label: artifactLabel(brief, j.launchIndex + 1), piece: pieces.find(p => p.jobId === j.id) ?? null })) };
}

function nightPayoff(state: CompanyState, minute: number): CommissionPayoff | null {
  const result = nightResult(state, minute);
  const record = result.project;
  if (!record) return null;
  const pieces = portfolioAt(state, minute).filter(p => p.contractId === record.contract.id);
  const complete = pieces.length === record.promised;
  const phase = !result.settled ? complete ? 'ready' : 'preparing' : record.status === 'compromised' ? 'compromised' : complete ? 'delivered' : pieces.length ? 'partial' : 'failed';
  const place = record.approach === 'courtyard' ? 'one courtyard' : result.calendar.careful ? 'invitations and a shared catalogue' : 'a trail through the street';
  const title = phase === 'ready' ? `${result.calendar.name} is ready for Day ${result.calendar.day + 1}` : phase === 'preparing' ? `${result.calendar.name} is taking shape` : phase === 'partial' || phase === 'failed' ? `${result.calendar.name}: the promise is unfinished` : `${result.calendar.name}, ${place}`;
  const brief = briefFor(state.requests.find(r => r.id === record.contract.requestId)!, record.contract.offer, state.config, record.contract.project?.proof, state.rulesVersion);
  const slots = record.jobs.map(j => ({ label: artifactLabel(brief, j.launchIndex + 1), piece: pieces.find(p => p.jobId === j.id) ?? null }));
  const missing = slots.filter(s => !s.piece).map(s => s.label);
  const change = record.status === 'compromised' ? ' The original brief was delivered; the extra change was declined.' : '';
  const line = !result.settled ? `${pieces.length} of ${record.promised} promised pieces delivered. The gathering is on Day ${result.calendar.day + 1}.${change}` : complete ? `${record.promised} of ${record.promised} promised ${record.promised === 1 ? 'piece' : 'pieces'} delivered by the Day ${result.calendar.day + 1} deadline.${change}` : `${pieces.length} of ${record.promised} pieces delivered. Not delivered: ${missing.join(', ')}.`;
  const contributors = result.contributors.filter(p => p.earned).flatMap(p => portfolioAt(state, minute).filter(piece => piece.contractId === p.contract.id));
  return { id: record.contract.id, catering: result.contributors.some(record => record.earned && (record.contribution ? record.contribution.materialsReduction > 0 : record.approach === 'weekly-rhythm')), kind: 'night', phase, approach: record.approach, title, line, calendar: result.calendar, pieces, contributors, promised: record.promised, slots };
}

/** Only this evening's new outcome appears. A later morning cannot leak into the closing card. */
export function eveningCommissionPayoffs(state: CompanyState, day: number, minute = (day + 1) * DAY): CommissionPayoff[] {
  if (!hasStudioRules(state.rulesVersion)) return [];
  const records = projectRecords(state, minute);
  const night = nightResult(state, minute);
  const resolution = night.project && day === night.calendar.day && minute >= (day + 1) * DAY;
  const progress = night.project?.jobs.some(j => j.deliveredAt !== null && inDay(j.deliveredAt, day, minute));
  const outcomes: CommissionPayoff[] = [];
  if (resolution || progress) {
    const payoff = nightPayoff(state, minute);
    if (payoff) outcomes.push(payoff);
  }
  for (const record of records.filter(p => p.id !== 'lantern-night')) {
    const completed = record.completedAt !== null && inDay(record.completedAt, day, minute);
    const failed = ['failed', 'partial'].includes(record.status) && state.events.some(e => e.jobId && record.contract.jobIds.includes(e.jobId) && ['missed', 'refunded_horizon'].includes(e.type) && inDay(e.minute, day, minute));
    const delivered = hasAuthorshipRules(state.rulesVersion) && record.jobs.some(j => j.deliveredAt !== null && inDay(j.deliveredAt, day, minute));
    if (completed || failed || delivered) outcomes.push(milestonePayoff(state, record, minute));
  }
  if (hasCreativePromiseRules(state.rulesVersion)) {
    const pieces = portfolioAt(state, minute);
    for (const castId of ['clem', 'mara', 'hugo', 'ivo']) {
      const promise = creativePromise(state, castId, minute);
      if (!promise || !inDay(promise.deliveredAt, day, minute)) continue;
      const piece = pieces.find(piece => piece.jobId === promise.jobId);
      if (!piece) continue;
      const intention = ordinaryIntentions(castId, promise.briefId).find(option => option.id === promise.intention);
      const projectId: ProjectId = castId === 'clem' ? 'clem-ten' : castId === 'mara' ? 'mara-regular' : 'hugo-handover';
      const project = projectFor(state, projectId);
      const relationship = relationshipSummary(state, castId, minute);
      const unsettled = relationship.lost;
      const consequence = unsettled ? `This piece is delivered. ${relationship.line}` : intention ? `“${intention.response}”` : 'The work is delivered. It counts towards the ordinary orders needed for a commission.';
      outcomes.push({ id: `ordinary-${promise.contractId}`, kind: 'ordinary', phase: 'delivered', approach: null, title: promise.title, line: 'Your approved print, delivered.', response: proofObservation(castId, promise.design), consequence, featuredPiece: piece, pieces: [piece], contributors: [], promised: 1, slots: [{ label: promise.title, piece }], calendar: night.calendar,
        ...(!unsettled && !state.contracts.some(contract => contract.project?.id === projectId) ? { invitation: { projectId, label: `See ${project.name}` } } : {}),
      });
    }
  }
  return outcomes;
}

/** One quiet evening after the festival, without replaying its completed programme. */
export function eveningCommissionAftermath(state: CompanyState, day: number): string | null {
  if (!hasAuthorshipRules(state.rulesVersion)) return null;
  const night = nightResult(state, (day + 1) * DAY);
  if (!night.project?.completedAt || day !== night.calendar.day + 1 || night.calendar.day >= RULES.days - 1) return null;
  const delivered = state.jobs.filter(j => !state.contracts.find(c => c.id === j.contractId)?.project && j.deliveredAt !== null && inDay(j.deliveredAt, day, (day + 1) * DAY)).length;
  return `${night.calendar.name} is behind you. ${delivered ? `Today, ${delivered} more ordinary ${delivered === 1 ? 'launch left' : 'launches left'} the studio.` : 'The studio has its ordinary promises again.'}`;
}

/** The final picture keeps the selected event in the foreground, or displays the work actually made. */
export function seasonCommissionPayoff(state: CompanyState, minute = state.minute): CommissionPayoff | null {
  if (!hasStudioRules(state.rulesVersion)) return null;
  const night = nightPayoff(state, minute);
  if (night) return night;
  const pieces = portfolioAt(state, minute);
  if (!pieces.length) return null;
  const milestones = projectRecords(state, minute).filter(p => p.id !== 'lantern-night' && p.completedAt !== null);
  const kept = pieces.filter(p => milestones.some(m => m.contract.id === p.contractId));
  const display = [...kept, ...pieces.filter(p => !kept.some(k => k.jobId === p.jobId)).toReversed()].slice(0, 6);
  return { id: 'studio-window', kind: 'window', phase: 'window', approach: null, title: 'The work in your window', line: 'A display of the launches this studio delivered.', calendar: nightResult(state, minute).calendar, pieces: display, contributors: [], promised: display.length, slots: display.map(piece => ({ label: artifactLabel(piece.brief, piece.launch), piece })) };
}
