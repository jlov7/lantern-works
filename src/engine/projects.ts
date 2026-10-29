// Authored commissions. Quotes and history are pure views; sim.ts accepts and fulfils their promises.
import { CAST_BY_ID, RULES } from './rules';
import { hasAuthorshipRules, hasCareerRules, hasStudioRules } from './versions';
import { careerStage, projectStory, type ProjectContext } from './career';
import { approveProof, briefForProject, type ProjectDesignBrief, type DesignSpec } from './design';
import { creativePromise } from './ordinary';
import type { CareerStage, CarriedPiece, CompanyState, Contract, Job, OfferSpec, ProjectApproach, ProjectContribution, ProjectId, ProjectTerms, Request, StoryNodeId, WorkProfile } from './types';
export type { ProjectContext } from './career';

export const PROJECT_IDS: ProjectId[] = ['clem-ten', 'mara-regular', 'hugo-handover', 'lantern-night'];
export const PROJECT_APPROACHES: ProjectApproach[] = ['first-night', 'new-band', 'weekly-rhythm', 'market-debut', 'quiet-sendoff', 'open-bench', 'courtyard', 'trail'];
export const FOREGROUND_PROJECTS = PROJECT_IDS.filter(id => id !== 'lantern-night');
const DAY = RULES.minutesPerDay;

/** Early ordinary visits make the stories discoverable. They still need an offer, real work and delivery. */
export function projectIntroductions(s: CompanyState, day: number): { castId: string; visit: number }[] {
  if (!hasStudioRules(s.rulesVersion)) return [];
  const schedules: Record<string, Record<number, { castId: string; visit: number }[]>> = {
    'main-street': { 0: [{ castId: 'clem', visit: 1 }], 1: [{ castId: 'mara', visit: 1 }], 2: [{ castId: 'hugo', visit: 1 }], 3: [{ castId: 'mara', visit: 2 }] },
    'festival-week': { 0: [{ castId: 'clem', visit: 1 }, { castId: 'mara', visit: 1 }], 1: [{ castId: 'hugo', visit: 1 }], 2: [{ castId: 'mara', visit: 2 }] },
    'bespoke-rush': { 0: [{ castId: 'hugo', visit: 1 }], 1: [{ castId: 'clem', visit: 1 }], 2: [{ castId: 'mara', visit: 1 }], 4: [{ castId: 'mara', visit: 2 }] },
  };
  return (schedules[s.config.scenarioId]?.[day] ?? []).map(intro => intro.castId === 'hugo' ? { ...intro, castId: projectFor(s, 'hugo-handover').castId } : intro);
}

export const PROJECTS: Record<ProjectId, { name: string; castId: string; opens: number; closes: number; required: number; approaches: ProjectApproach[]; invitation: string }> = {
  'clem-ten': { name: 'Clem Jazz Bar turns ten', castId: 'clem', opens: 2, closes: 7, required: 1, approaches: ['first-night', 'new-band'], invitation: 'Clem has kept the photograph from the first night. The band playing the anniversary wants to make something new.' },
  'mara-regular': { name: 'A place in the week', castId: 'mara', opens: 2, closes: 6, required: 2, approaches: ['weekly-rhythm', 'market-debut'], invitation: 'Mara has more regulars now. She can keep a rhythm at the bakery, or try a stall at the market.' },
  'hugo-handover': { name: 'The next pair of hands', castId: 'hugo', opens: 2, closes: 8, required: 1, approaches: ['quiet-sendoff', 'open-bench'], invitation: 'Hugo is handing one bench to his apprentice. He wants to mark the moment, but has not decided how public to make it.' },
  'lantern-night': { name: 'Lantern Night', castId: 'association', opens: 7, closes: 9, required: 0, approaches: ['courtyard', 'trail'], invitation: 'The street association will fund one gathering. The work you have finished determines who can help.' },
};


export interface ProjectDefinition { name: string; castId: string; opens: number; closes: number; required: number; approaches: ProjectApproach[]; invitation: string; storyNodeId?: StoryNodeId; stage?: CareerStage }
export interface ApproachDefinition { name: string; artifact: string; detail: string; benefit: string; requiresSource?: true }
export function projectFor(s: ProjectContext, id: ProjectId): ProjectDefinition {
  const base = PROJECTS[id];
  const stage = careerStage(s);
  if (stage && id !== 'lantern-night') {
    const story = projectStory(s, id)!;
    const identity = { storyNodeId: story.nodeId, stage };
    if (stage === 'opening') return { ...base, ...identity };
    if (stage === 'legacy' || stage === 'open') {
      if (id === 'clem-ten') return { ...base, ...identity, name: stage === 'legacy' ? 'Clem’s shared archive' : 'An archive rotation at Clem', invitation: stage === 'legacy' ? 'Clem is opening the archive to the street. Lend an exact print the studio retained, with a new caption and invitation, or curate a coordinated display.' : 'The archive keeps rotating. Lend a retained print with a fresh caption, or prepare the next coordinated display.' };
      if (id === 'mara-regular') return { ...base, ...identity, name: stage === 'legacy' ? 'Mara’s shared table' : 'Moonrise’s seasonal table', invitation: 'Mara can bring bread to one shared table, or open the bakery with a coordinated set of labels and invitations. The smaller promise contributes bread without making the bakery a host.' };
      return { ...base, ...identity, castId: 'ivo', name: stage === 'legacy' ? 'Ivo passes on repairs' : 'Repairs, returned to the bench', invitation: 'Ivo can share a careful reference sheet, or teach a repair class with an invitation and a demonstration sheet. A sheet contributes useful work; the class opens the workshop.' };
    }
    if (id === 'hugo-handover') {
      const past = s.config.continuation?.version === 3 ? s.config.continuation.career.stories.find(r => r.nodeId === 'ivo-opening') : undefined;
      const memory = past?.outcome === 'delivered' ? 'The handover work marked the change. ' : past?.outcome === 'compromised' ? 'The original handover print arrived, though the extra change was refused. ' : past && ['partial', 'failed'].includes(past.outcome) ? 'The handover work did not all arrive. The date has still passed. ' : 'The handover date has passed, even without a studio print to mark it. ';
      return { ...base, ...identity, castId: 'ivo', name: 'Ivo’s own workshop', invitation: `${memory}Ivo now runs his own bench. He needs a sign of his own, or a poster for a repair workshop.` };
    }
  }
  if (!s.config.continuation) return base;
  if (id === 'clem-ten') {
    const past = s.config.continuation.relationships.find(r => r.castId === 'clem')?.milestone;
    const kept = past && ['delivered', 'compromised'].includes(past.outcome) ? 'Clem has kept the work from last season. ' : '';
    return { ...base, ...(stage ? { storyNodeId: projectStory(s, id)!.nodeId, stage } : {}), name: 'Another season at Clem Jazz Bar', invitation: `${kept}There is an archive wall to grow, and a band ready for a residency.` };
  }
  if (id === 'mara-regular') return { ...base, ...(stage ? { storyNodeId: projectStory(s, id)!.nodeId, stage } : {}), name: 'Moonrise, at the counter and market', invitation: 'Mara needs a counter and menu set at home, or a clearer identity for her market stall.' };
  const handover = s.config.continuation.relationships.find(r => r.castId === 'hugo')?.milestone;
  if (id === 'hugo-handover' && handover && ['delivered', 'compromised'].includes(handover.outcome)) return { ...base, castId: 'ivo', name: 'Ivo’s own workshop', invitation: 'Ivo has the bench now. He needs a sign of his own, or a poster for the first workshop he will teach.' };
  return base;
}

export const APPROACHES: Record<ProjectApproach, { name: string; artifact: string; detail: string; benefit: string }> = {
  'first-night': { name: 'The first-night photograph', artifact: 'Clem’s anniversary photograph', detail: 'Restore the old photograph and lettering. An extra hour of finishing, with no printing bill.', benefit: 'Clem lends the archive and hosts. A courtyard needs 60 fewer finishing minutes.' },
  'new-band': { name: 'Give the new band the wall', artifact: 'The anniversary band poster', detail: 'Make a new band poster, with 150 cr of printing paid now.', benefit: 'Clem hosts and lends the programme design. Each trail brief needs 15 fewer minutes.' },
  'weekly-rhythm': { name: 'Three weeks on the bakery wall', artifact: 'Mara’s weekly bakery cards', detail: 'Three launches, released two days apart. Each has a two-day deadline.', benefit: 'After all three are delivered, Mara hosts and supplies bread. Night materials cost 100 cr less.' },
  'market-debut': { name: 'Make the market debut', artifact: 'Mara’s market banner', detail: 'One custom banner, with 90 minutes of finishing. Due in two days.', benefit: 'Mara hosts and sends small shops your way over the next two mornings. New interest is not guaranteed sales.' },
  'quiet-sendoff': { name: 'A quiet sendoff', artifact: 'Hugo’s workshop portrait', detail: 'One careful portrait of Hugo at his bench. Three days, 500 cr.', benefit: 'A keepsake for the gathering and 8 careful reputation. Hugo is a contributor, but does not open the workshop.' },
  'open-bench': { name: 'Open the bench to the street', artifact: 'The apprentice’s workshop sign', detail: 'A new sign and a public handover. Hugo pays 500 cr; the apprentice adds 350 cr. Due in two days, with longer briefing and finishing.', benefit: 'The workshop can host the trail. Earn 4 careful reputation.' },
  courtyard: { name: 'One courtyard', artifact: 'The courtyard invitation', detail: 'One gathering, with one custom invitation. Bring the work and people you have already helped.', benefit: 'A finished commission opens the courtyard on the announced night.' },
  trail: { name: 'Light a trail through the street', artifact: 'The Lantern Night programme', detail: 'Connect at least two hosts. The whole programme must be ready for the same night.', benefit: 'Each delivered piece appears on the street. All promised pieces must arrive to complete the trail.' },
};

/** The festival set must be ready before its earlier gathering can be booked. */
export function approachFor(s: ProjectContext, approach: ProjectApproach): ApproachDefinition {
  const base = APPROACHES[approach];
  const stage = careerStage(s);
  if ((stage === 'legacy' || stage === 'open') && approach !== 'courtyard' && approach !== 'trail') {
    const later: Record<Exclude<ProjectApproach, 'courtyard' | 'trail'>, ApproachDefinition> = {
      'first-night': { name: 'Lend a retained print', artifact: 'Clem’s archive caption and invitation', detail: 'Lend an exact retained Clem print. Make one new caption/invitation, 900 cr, no materials and 60 finishing minutes.', benefit: 'Clem hosts after the new print is fully delivered. Lending gives no automatic finishing reduction.', requiresSource: true },
      'new-band': { name: 'Curate the archive display', artifact: 'Clem’s coordinated archive display', detail: 'Two coordinated prints, 1500 cr, 150 cr materials and 60 finishing minutes each.', benefit: 'Clem hosts. Each trail brief takes 15 fewer minutes.' },
      'weekly-rhythm': { name: stage === 'open' ? 'Set a seasonal table' : 'Set one shared table', artifact: 'Mara’s shared-table invitation', detail: 'One invitation, 720 cr, no materials and 60 finishing minutes.', benefit: 'Mara supplies bread, saving 100 cr of gathering materials. The bakery does not host.' },
      'market-debut': { name: 'Open the bakery', artifact: 'Mara’s bakery labels and invitations', detail: 'Three coordinated labels/invitations, released together with a two-day deadline. 1440 cr, 45 cr materials.', benefit: 'Full delivery earns bread and hosting. Bread saves 100 cr of gathering materials.' },
      'quiet-sendoff': { name: stage === 'open' ? 'Publish a repair manual sheet' : 'Make the repair reference sheet', artifact: 'Ivo’s repair reference sheet', detail: 'One careful sheet, 750 cr, no materials and 90 finishing minutes.', benefit: 'Ivo contributes the sheet. The workshop does not host a class.' },
      'open-bench': { name: stage === 'open' ? 'Bring the repair class back' : 'Teach a repair class', artifact: 'Ivo’s repair class invitation and demonstration', detail: 'A class invitation and demonstration sheet, 1400 cr, 80 cr materials. The demonstration needs 90 briefing minutes.', benefit: 'Ivo hosts after both pieces are fully delivered.' },
    };
    return later[approach];
  }
  if (s.config.continuation) {
    const names: Partial<Record<ProjectApproach, { name: string; artifact: string; detail: string }>> = {
      'first-night': { name: 'Grow the archive wall', artifact: 'Clem’s archive wall photograph', detail: 'Restore another archive photograph, 135 finishing minutes and 1320 cr.' },
      'new-band': { name: 'A Thursday residency', artifact: 'Clem’s residency poster', detail: 'A new residency poster, 90 finishing minutes and 180 cr of printing. 1400 cr.' },
      'weekly-rhythm': { name: 'The counter and menu set', artifact: 'Mara’s counter and menu cards', detail: 'Three matching cards, released together. 1440 cr, 45 cr of printing.' },
      'market-debut': { name: 'A market stall identity', artifact: 'Mara’s market stall banner', detail: 'One market identity banner, 105 finishing minutes and 120 cr of printing. 900 cr.' },
      ...(projectFor(s, 'hugo-handover').castId === 'ivo' ? {
        'quiet-sendoff': { name: 'Ivo’s name above the door', artifact: 'Ivo’s independent workshop sign', detail: 'One sign, 90 finishing minutes, 60 cr materials and 750 cr.' },
        'open-bench': { name: 'Ivo teaches a first repair', artifact: 'Ivo’s repair workshop poster', detail: 'One workshop poster with 90 briefing minutes and 75 finishing minutes. 980 cr, 80 cr printing.' },
      } : {}),
    };
    if (names[approach]) return { ...base, ...names[approach]!, ...(projectFor(s, 'hugo-handover').castId === 'ivo' && (approach === 'quiet-sendoff' || approach === 'open-bench') ? { benefit: `Ivo can host the trail. Earn ${approach === 'quiet-sendoff' ? 8 : 4} careful reputation.` } : {}) };
  }
  return approach === 'weekly-rhythm' && s.config.scenarioId === 'festival-week'
    ? { ...base, name: 'Three cards for festival week', artifact: 'Mara’s festival bakery cards', detail: 'Three launches released together. All three have a two-day deadline.' }
    : base;
}

/** Calendar days are zero-based internally. The festival genuinely peaks four days earlier. */
export function nightCalendar(s: Pick<CompanyState, 'config'>): { name: string; opens: number; closes: number; release: number; day: number; careful: boolean } {
  if (s.config.scenarioId === 'festival-week') return { name: 'The lantern walk', opens: 4, closes: 5, release: 5, day: 7, careful: false };
  const careful = s.config.scenarioId === 'bespoke-rush';
  return { name: careful ? 'Open studios' : 'Lantern Night', opens: 7, closes: 9, release: 9, day: 11, careful };
}

export interface ProjectRecord {
  id: ProjectId;
  approach: ProjectApproach;
  contract: Contract;
  jobs: Job[];
  status: 'working' | 'delivered' | 'compromised' | 'failed' | 'partial';
  acceptedDay: number;
  completedAt: number | null;
  delivered: number;
  promised: number;
  artifact: string;
  host: boolean;
  earned: boolean;
  contribution?: ProjectContribution;
}

/** Read at a display minute so future deliveries cannot appear in the workshop or evening playback. */
export function projectRecords(s: CompanyState, minute = s.minute): ProjectRecord[] {
  return s.contracts.filter(c => c.project && c.acceptedDay * DAY <= minute).map(contract => {
    const p = contract.project!;
    const jobs = contract.jobIds.map(id => s.jobs.find(j => j.id === id)!);
    const delivered = jobs.filter(j => j.deliveredAt !== null && j.deliveredAt <= minute).length;
    const completed = s.events.find(e => e.type === 'project_completed' && e.requestId === contract.requestId && e.minute <= minute);
    const compromised = jobs.some(j => j.changeDeclined && s.events.some(e => e.type === 'project_change_declined' && e.jobId === j.id && e.minute <= minute));
    const failed = jobs.some(j => (j.status === 'missed' && j.dueAt <= minute) || (j.status === 'refunded' && s.journal.some(e => e.kind === 'refund' && e.ref === j.id && !e.note.startsWith('Discount') && e.minute <= minute)));
    const status = completed ? compromised ? 'compromised' : 'delivered' : failed ? delivered ? 'partial' : 'failed' : 'working';
    return { id: p.id, approach: p.approach, contract, jobs, status, acceptedDay: contract.acceptedDay, completedAt: completed?.minute ?? null, delivered, promised: jobs.length, artifact: approachFor(s, p.approach).artifact, host: p.contribution ? p.contribution.host : (p.approach !== 'quiet-sendoff' || projectFor(s, p.id).castId === 'ivo') && p.id !== 'lantern-night', earned: !!completed && !compromised, ...(p.contribution ? { contribution: structuredClone(p.contribution) } : {}) };
  });
}

export function nightResult(s: CompanyState, minute = s.minute): { calendar: ReturnType<typeof nightCalendar>; project: ProjectRecord | null; contributors: ProjectRecord[]; settled: boolean } {
  const records = projectRecords(s, minute);
  const project = records.find(p => p.id === 'lantern-night') ?? null;
  const ids = project?.contract.project?.contributors ?? [];
  return { calendar: nightCalendar(s), project, contributors: records.filter(p => ids.includes(p.id)), settled: minute >= (nightCalendar(s).day + 1) * DAY };
}

export function ordinaryOrdersDelivered(s: CompanyState, castId: string): number {
  return (s.config.continuation?.relationships.find(r => r.castId === castId)?.ordinaryDelivered ?? 0) + s.contracts.filter(c => c.castId === castId && !c.project && s.requests.some(r => r.id === c.requestId && ['walkin', 'word', 'flyer', 'premium', 'booking'].includes(r.source)) && c.jobIds.every(id => s.jobs.find(j => j.id === id)?.status === 'delivered')).length;
}

export function projectBrief(s: CompanyState, id: ProjectId, approach: ProjectApproach, sourceId?: string): ProjectDesignBrief {
  const contributors = projectRecords(s).filter(p => p.id !== 'lantern-night' && p.earned).map(p => CAST_BY_ID[p.contract.castId]!.business);
  const stage = careerStage(s);
  const brief = briefForProject({ projectId: id, approach, scenarioId: s.config.scenarioId, eventDay: nightCalendar(s).day, contributors, ...(s.config.continuation ? { continuation: { previousApproach: s.config.continuation.relationships.find(r => r.castId === projectFor(s, id).castId)?.milestone?.approach, ivo: projectFor(s, id).castId === 'ivo' } } : {}), ...(stage ? { career: { stage, sourceTitle: lendingSources(s, id, approach).find(p => p.id === sourceId)?.title } } : {}) });
  if (stage) {
    const terms = baseProjectTerms(s, id, approach);
    brief.briefingMinutes = terms.profiles.map(profile => profileBriefMinutes(s, terms.offer.style === 'templated', profile));
  }
  return brief;
}

export function lendingSources(s: CompanyState, id: ProjectId, approach: ProjectApproach): CarriedPiece[] {
  return hasCareerRules(s.rulesVersion) && id === 'clem-ten' && approachFor(s, approach).requiresSource ? structuredClone((s.config.continuation?.pieces ?? []).filter(p => p.castId === 'clem' && p.sourceSeason < (s.config.continuation?.season ?? 1))) : [];
}

export interface ProjectQuote {
  project: ProjectTerms;
  request: Request;
  offer: OfferSpec;
  /** One profile per launch, retained even if a later upgrade changes the base effort. */
  profiles: WorkProfile[];
  jobs: { releaseDay: number; dueAt: number }[];
}

export function projectBlocked(s: CompanyState, id: ProjectId, approach: ProjectApproach, sourceId?: string): string | null {
  if (!hasStudioRules(s.rulesVersion)) return 'This saved season uses the original commission rules.';
  if (s.finished || s.call || s.minute !== s.day * DAY) return 'Book commissions in the morning.';
  if (!PROJECT_IDS.includes(id)) return 'That is not an approach to this commission.';
  const def = projectFor(s, id);
  if (!def.approaches.includes(approach)) return 'That is not an approach to this commission.';
  if (s.contracts.some(c => c.project?.id === id)) return 'You have already booked this commission.';
  const cal = nightCalendar(s);
  const opens = id === 'lantern-night' ? cal.opens : def.opens;
  const closes = id === 'lantern-night' ? cal.closes : def.closes;
  if (s.day < opens) return `Opens on Day ${opens + 1}.`;
  if (s.day > closes) return 'This invitation has closed.';
  if (id !== 'lantern-night') {
    if (s.lostCast.includes(def.castId)) return 'They are no longer commissioning work from the studio.';
    const done = ordinaryOrdersDelivered(s, def.castId);
    if (done < def.required) return `Deliver ${def.required - done} more ordinary ${def.required - done === 1 ? 'order' : 'orders'} for ${def.castId === 'clem' ? 'Clem' : def.castId === 'mara' ? 'Mara' : def.castId === 'ivo' ? 'Ivo' : 'Hugo'} first.`;
  } else {
    const done = projectRecords(s).filter(p => p.id !== id && p.earned);
    if (approach === 'courtyard' && !done.length) return 'Complete one milestone commission before booking the gathering.';
    if (approach === 'trail' && done.filter(p => p.host).length < 2) return hasCareerRules(s.rulesVersion) ? 'Complete current-season commissions for two hosts first. A sheet or bread contribution alone does not open a host.' : 'Complete commissions for two hosts first. Hugo’s quiet sendoff contributes a keepsake, not an open workshop.';
  }
  if (hasCareerRules(s.rulesVersion)) {
    if (approachFor(s, approach).requiresSource) {
      if (!sourceId) return 'Choose a retained Clem print to lend. Its exact artwork stays unchanged.';
      if (!lendingSources(s, id, approach).some(p => p.id === sourceId)) return 'Choose an eligible retained Clem print from this studio.';
    } else if (sourceId !== undefined) return 'This approach does not borrow a retained print.';
  } else if (sourceId !== undefined) return 'This saved season does not lend retained prints.';
  return null;
}

/** Exact terms, including only contributions already earned when the quote is taken. */
function baseProjectTerms(s: CompanyState, id: ProjectId, approach: ProjectApproach) {
  const def = projectFor(s, id);
  let offer: OfferSpec = { name: approachFor(s, approach).name, launches: 1, spacingDays: 0, turnaroundDays: 3, scope: 'any', style: 'custom', price: 1200 };
  let need: Request['need'] = 'nuanced';
  let materials = 0;
  let profiles: WorkProfile[] = [{}];
  const completed = projectRecords(s).filter(p => p.id !== 'lantern-night' && p.earned);
  let contributors: ProjectId[] = [];
  const has = (a: ProjectApproach) => completed.some(p => p.approach === a);
  switch (approach) {
    case 'first-night': profiles = [{ finish: 120 }]; break;
    case 'new-band': materials = 150; break;
    case 'weekly-rhythm':
      offer = { ...offer, launches: 3, spacingDays: s.config.scenarioId === 'festival-week' ? 0 : 2, turnaroundDays: 2, scope: 'simple', style: 'templated', price: 1260 };
      need = 'simple'; profiles = [{}, {}, {}]; break;
    case 'market-debut':
      offer = { ...offer, turnaroundDays: 2, scope: 'simple', price: 720 };
      need = 'simple'; profiles = [{ finish: 90 }]; break;
    case 'quiet-sendoff': offer.price = 500; break;
    case 'open-bench': offer = { ...offer, price: 850, turnaroundDays: 2 }; profiles = [{ brief: 105, finish: 120 }]; break;
    case 'courtyard':
    case 'trail': {
      const cal = nightCalendar(s);
      contributors = completed.map(p => p.id);
      const trail = approach === 'trail';
      const launches = trail ? cal.careful ? 2 : 3 : 1;
      const price = trail ? cal.careful ? 2400 : 2200 : 1800;
      const baseMaterials = trail ? cal.careful ? 200 : 300 : 100;
      const career = hasCareerRules(s.rulesVersion);
      const materialsReduction = completed.reduce((n, p) => n + (p.contribution?.materialsReduction ?? 0), 0);
      const courtyardReduction = completed.reduce((n, p) => n + (p.contribution?.courtyardFinishReduction ?? 0), 0);
      const trailReduction = completed.reduce((n, p) => n + (p.contribution?.trailBriefReduction ?? 0), 0);
      materials = career ? Math.max(0, baseMaterials - materialsReduction) : baseMaterials - (has('weekly-rhythm') ? 100 : 0);
      need = trail && !cal.careful ? 'simple' : 'nuanced';
      offer = { ...offer, name: cal.careful ? trail ? 'Invitations and a shared catalogue' : 'A courtyard invitation' : APPROACHES[approach].name, launches, startsInDays: cal.release - s.day, turnaroundDays: cal.day - cal.release + 1, price, scope: need === 'simple' ? 'simple' : 'any', style: need === 'simple' ? 'templated' : 'custom' };
      profiles = Array.from({ length: launches }, (_, i) => ({ ...(!trail ? { finish: has('first-night') ? 60 : 120 } : cal.careful && i === 0 && has('first-night') ? { finish: 0 } : {}), ...(trail && has('new-band') ? { briefReduction: 15 } : {}) }));
      if (career) profiles = Array.from({ length: launches }, (_, i) => ({ ...(!trail ? { finish: Math.max(0, 120 - courtyardReduction) } : cal.careful && i === 0 && courtyardReduction ? { finish: Math.max(0, 60 - courtyardReduction) } : {}), ...(trail && trailReduction ? { briefReduction: trailReduction } : {}) }));
      break;
    }
  }
  if (s.config.continuation && id !== 'lantern-night') {
    switch (approach) {
      case 'first-night': offer.price = 1320; profiles = [{ finish: 135 }]; break;
      case 'new-band': offer.price = 1400; profiles = [{ finish: 90 }]; materials = 180; break;
      case 'weekly-rhythm': offer.price = 1440; offer.spacingDays = 0; materials = 45; break;
      case 'market-debut': offer.price = 900; profiles = [{ finish: 105 }]; materials = 120; break;
      case 'quiet-sendoff': if (def.castId === 'ivo') { offer.price = 750; profiles = [{ finish: 90 }]; materials = 60; } break;
      case 'open-bench': if (def.castId === 'ivo') { offer.price = 980; profiles = [{ brief: 90, finish: 75 }]; materials = 80; } break;
    }
  }
  const stage = careerStage(s);
  if ((stage === 'legacy' || stage === 'open') && id !== 'lantern-night') {
    need = 'simple';
    offer = { ...offer, launches: 1, spacingDays: 0, turnaroundDays: 3, scope: 'simple', style: 'custom' };
    materials = 0;
    switch (approach) {
      case 'first-night': offer.price = 900; profiles = [{ finish: 60 }]; break;
      case 'new-band': offer = { ...offer, price: 1500, launches: 2 }; materials = 150; profiles = [{ finish: 60 }, { finish: 60 }]; break;
      case 'weekly-rhythm': offer.price = 720; profiles = [{ finish: 60 }]; break;
      case 'market-debut': offer = { ...offer, price: 1440, launches: 3, style: 'templated', turnaroundDays: 2 }; materials = 45; profiles = [{}, {}, {}]; break;
      case 'quiet-sendoff': offer.price = 750; profiles = [{ finish: 90 }]; break;
      case 'open-bench': offer = { ...offer, price: 1400, launches: 2 }; materials = 80; profiles = [{}, { brief: 90 }]; break;
    }
  }
  return { offer, need, materials, profiles, contributors };
}

export function profileBriefMinutes(s: Pick<CompanyState, 'upgrades'>, templated: boolean, effort?: WorkProfile): number {
  return Math.max(5, (effort?.brief ?? (templated ? (s.upgrades.includes('library') ? RULES.libraryBrief : RULES.effort.templatedBrief) : RULES.effort.brief)) - (effort?.briefReduction ?? 0));
}

export function projectQuote(s: CompanyState, id: ProjectId, approach: ProjectApproach, design?: DesignSpec, sourceId?: string): ProjectQuote | null {
  if (projectBlocked(s, id, approach, sourceId)) return null;
  const def = projectFor(s, id);
  const stage = careerStage(s);
  let { offer, need, materials, profiles, contributors } = baseProjectTerms(s, id, approach);
  const jobs = Array.from({ length: offer.launches }, (_, k) => {
    const releaseDay = s.day + (offer.startsInDays ?? 0) + k * offer.spacingDays;
    return { releaseDay, dueAt: (releaseDay + offer.turnaroundDays) * DAY };
  });
  if (jobs.some(j => j.dueAt > RULES.days * DAY)) return null;
  const project: ProjectTerms = { id, approach, materials, contributors };
  if (hasCareerRules(s.rulesVersion) && id !== 'lantern-night') {
    project.story = projectStory(s, id)!;
    const later = stage === 'legacy' || stage === 'open';
    project.contribution = { host: later ? ['first-night', 'new-band', 'market-debut', 'open-bench'].includes(approach) : approach !== 'quiet-sendoff' || def.castId === 'ivo', materialsReduction: approach === 'weekly-rhythm' || (later && approach === 'market-debut') ? 100 : 0, trailBriefReduction: approach === 'new-band' ? 15 : 0, courtyardFinishReduction: approach === 'first-night' && !later ? 60 : 0 };
    const source = lendingSources(s, id, approach).find(p => p.id === sourceId);
    if (source?.source) project.lentPiece = structuredClone(source);
    const promise = creativePromise(s, def.castId) ?? s.config.continuation?.relationships.find(r => r.castId === def.castId)?.creativePromise;
    if (promise) project.creativePromise = structuredClone(promise);
  }
  if (hasAuthorshipRules(s.rulesVersion)) {
    const brief = projectBrief(s, id, approach, sourceId);
    const approved = approveProof(brief, design ?? brief.defaultDesign);
    if (!approved.proof) return null;
    project.proof = approved.proof;
    project.materials += approved.proof.extras.reduce((sum, extra) => sum + extra.materials, 0);
    profiles = profiles.map((profile, index) => {
      const extra = approved.proof!.extras[index]!.finishMinutes;
      return extra ? { ...profile, finish: (profile.finish ?? RULES.effort.finish) + extra } : profile;
    });
  }
  const castId = id === 'lantern-night' && s.config.scenarioId === 'festival-week' ? 'committee' : def.castId;
  const request: Request = { id: `project-${id}`, day: s.day, index: s.requests.filter(r => r.day === s.day).length, castId, segment: CAST_BY_ID[castId]!.segment, need, wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'project', offer, project: { id, approach } };
  return { project, request, offer, profiles, jobs };
}
