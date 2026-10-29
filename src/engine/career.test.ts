import { describe, expect, it } from 'vitest';
import creative from './fixtures/legacy-6.1.0.json';
import nativeCareers from './fixtures/career-7.0.0.json';
import { careerStage, careerStories } from './career';
import { adaptCareerContinuation, buildContinuation, deliveredPieces, featureablePieces, featuredPieces, validateContinuation } from './continuation';
import { approveProof, validateDesign } from './design';
import { seasonEnding } from './endings';
import { effortPercent } from './mentoring';
import { contractProof, creativePromise, ordinaryBrief, ordinaryIntentions, ordinaryRequestLine } from './ordinary';
import { compatiblePatterns, patternReduction } from './patterns';
import { approachFor, lendingSources, projectBlocked, projectBrief, projectFor, projectQuote, projectRecords } from './projects';
import { PRESETS } from './rules';
import { dayPlan, forecast, projectForecast, reservationForecast, workFor } from './selectors';
import { applyCommand, createRun, reactionFor, replay, stageEffort } from './sim';
import type { Command, CompanyState, ProjectApproach, RunConfig } from './types';
import { AUTHORSHIP_RULES_VERSION, CREATIVE_PROMISE_RULES_VERSION, hasCareerRules, hasCreativePromiseRules } from './versions';
import { commandSchema, configSchema } from '../ui/schema';

function step(s: CompanyState, cmd: Command): CompanyState {
  const result = applyCommand(s, cmd);
  expect(result.error, JSON.stringify(cmd)).toBeUndefined();
  return result.state;
}
function opening(id = 'main-trail/native-save.json', version = 'lantern-7.0.0'): CompanyState {
  const tape = creative.tapes.find(t => t.id === id)!;
  const result = replay(tape.config as RunConfig, tape.commands as Command[], version);
  expect(result.errors).toEqual([]);
  return result.state;
}
function close(s: CompanyState): CompanyState {
  while (!s.finished) {
    for (const request of s.requests.filter(r => r.day === s.day && r.status === 'waiting')) s = step(s, { type: 'decline', requestId: request.id });
    s = step(s, { type: 'runDay' });
  }
  return s;
}
function legacyReady(): CompanyState {
  const recorded = nativeCareers.routes.find(r => r.id === 'prosperous')!.seasons.find(s => s.stage === 'legacy')!;
  let s = createRun(recorded.config as RunConfig);
  expect(s.lostCast).not.toContain('clem');
  expect(lendingSources(s, 'clem-ten', 'first-night').length).toBeGreaterThan(0);
  s = step(s, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 100 }] });
  for (let i = 0; i < 6; i++) {
    if (s.day >= 2 && !projectBlocked(s, 'hugo-handover', 'quiet-sendoff') && !projectBlocked(s, 'mara-regular', 'market-debut')) return s;
    for (const r of s.requests.filter(r => r.day === s.day && r.status === 'waiting')) {
      const take = r.castId === 'ivo' || (r.source === 'amends' && r.castId === 'mara');
      s = step(s, { type: take && reactionFor(s, r).kind === 'buy' ? 'accept' : 'decline', requestId: r.id });
    }
    s = step(s, { type: 'runDay' });
  }
  throw new Error('Native Ivo ordinary work did not unlock the test commission.');
}

describe('exact career rules and finite authored stages', () => {
  it('distinguishes fresh 7.0 from fresh 6.1 without inferring a version from continuation', () => {
    const config = { scenarioId: 'main-street', seed: 'career-boundary' };
    const now = createRun(config);
    const old = createRun(config, CREATIVE_PROMISE_RULES_VERSION);
    expect(hasCareerRules(now.rulesVersion)).toBe(true);
    expect(hasCareerRules(old.rulesVersion)).toBe(false);
    expect(hasCreativePromiseRules(old.rulesVersion)).toBe(true);
    expect(careerStage(now)).toBe('opening');
    expect(careerStage(old)).toBeNull();
    expect(old).not.toHaveProperty('featuredPieceIds');
    expect(old.requests.every(r => r.briefId === undefined)).toBe(true);
    expect(now.requests.find(r => r.castId === 'clem')!.briefId).toMatch(/^clem-opening-/);
    expect(projectFor(now, 'clem-ten').storyNodeId).toBe('clem-opening');
    expect(projectFor(old, 'clem-ten')).not.toHaveProperty('storyNodeId');
  });
  it('closes untaken nodes and advances through legacy once, including a studio with negative capital', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'career-untaken' });
    for (const stage of ['opening', 'practice', 'legacy', 'open', 'open']) {
      expect(careerStage(s)).toBe(stage);
      s = close(s);
      expect(careerStories(s).every(r => r.outcome === 'not-taken')).toBe(true);
      if (stage === 'legacy') expect(seasonEnding(s).line).toContain('The authored career is complete');
      if (stage === 'open') expect(careerStories(s)).toHaveLength(9);
      const next = buildContinuation(s, []);
      expect(next.continuation!.cash).toBe(s.cash);
      s = createRun(next);
    }
    expect(s.cash).toBeLessThan(0);
  });
  it('explicitly adapts old studios without rewriting old snapshots or granting money, training or a host', () => {
    const old = opening('careful/native-save.json', CREATIVE_PROMISE_RULES_VERSION);
    expect(old.lostCast).toContain('hugo');
    const piece = deliveredPieces(old).find(p => p.castId === 'clem')!;
    const original = structuredClone(old);
    const oldNext = buildContinuation(old, [piece.id], 'career-adapter');
    expect(() => createRun(oldNext)).toThrow('explicit career adapter');
    const next = adaptCareerContinuation(old, [piece.id], 'career-adapter');
    expect(old).toEqual(original);
    expect(next.continuation).toMatchObject({ version: 3, cash: old.cash, career: { stage: 'practice', adaptedFrom: { rules: CREATIVE_PROMISE_RULES_VERSION, season: 1 } } });
    expect(next.continuation!.pieces[0]!.design).toEqual(piece.design);
    expect(next.continuation!.patterns).toEqual(oldNext.continuation!.patterns);
    const s = createRun(JSON.parse(JSON.stringify(next)));
    expect(s.lostCast).toContain('hugo');
    expect(s.lostCast).not.toContain('ivo');
    expect(projectFor(s, 'hugo-handover').castId).toBe('ivo');
    expect(projectRecords(s)).toEqual([]);
    expect(s.cash).toBe(old.cash);
    const continuing = creative.tapes.find(t => t.id === 'generated/6.1-prepared-and-taught-pattern')!;
    const finished = replay(continuing.config as RunConfig, continuing.commands as Command[], CREATIVE_PROMISE_RULES_VERSION).state;
    const later = adaptCareerContinuation(finished, ['carried-1']);
    expect(later.continuation).toMatchObject({ version: 3, career: { stage: 'legacy' } });
    if (later.continuation!.version !== 3) throw new Error('Expected career snapshot.');
    expect(later.continuation!.career.stories.find(r => r.nodeId === 'clem-opening')).toMatchObject({ outcome: 'delivered', approach: 'first-night', season: 1 });
    expect(later.continuation!.career.stories.find(r => r.nodeId === 'ivo-opening')).toMatchObject({ outcome: 'delivered', approach: 'quiet-sendoff', season: 1 });
    expect(later.continuation!.career.stories.find(r => r.nodeId === 'mara-opening')).toMatchObject({ outcome: 'unknown', season: null });
    expect(later.continuation!.patterns[0]!.noorKnows).toBe(true);
  });
  it('rejects future, duplicate and incompatible story/source records', () => {
    const config = buildContinuation(opening(), deliveredPieces(opening()).filter(p => p.source?.kind === 'project').slice(0, 1).map(p => p.id));
    const valid = config.continuation!;
    expect(valid.version).toBe(3);
    if (valid.version !== 3) throw new Error('Expected career snapshot.');
    const duplicate = structuredClone(valid); duplicate.career.stories[1] = duplicate.career.stories[0]!;
    const future = structuredClone(valid); future.career.stories[0]!.season = future.season;
    const wrong = structuredClone(valid); wrong.career.stories[0]!.approach = 'open-bench';
    const futurePiece = structuredClone(valid); futurePiece.pieces[0]!.sourceSeason = futurePiece.season;
    const wrongSource = structuredClone(valid);
    const source = wrongSource.pieces[0]!.source;
    if (source.kind !== 'project' || !source.story) throw new Error('Expected native story source.');
    source.story.nodeId = 'mara-opening';
    const futureStory = structuredClone(valid);
    if (futureStory.pieces[0]!.source.kind !== 'project') throw new Error('Expected project.');
    futureStory.pieces[0]!.source.story = { nodeId: 'clem-legacy', stage: 'legacy', season: 1 };
    for (const snapshot of [duplicate, future, wrong, futurePiece, wrongSource, futureStory]) expect(() => validateContinuation(snapshot)).toThrow();
    expect(() => createRun(config, CREATIVE_PROMISE_RULES_VERSION)).toThrow('requires career rules');
    expect(configSchema.safeParse(config).success).toBe(true);
  });
  it('accepts actual later recurring sources and rejects open-studio stories before legacy, including adapted careers', () => {
    const tape = nativeCareers.routes.find(r => r.id === 'prosperous')!.seasons.find(s => s.stage === 'open')!;
    const finished = replay(tape.config as RunConfig, tape.commands as Command[]).state;
    const actual = deliveredPieces(finished).find(p => p.castId === 'clem' && p.source?.kind === 'project')!;
    const config = buildContinuation(finished, [actual.id]);
    expect(() => validateContinuation(config.continuation)).not.toThrow();
    const original = deliveredPieces(opening()).find(p => p.castId === 'clem' && p.source?.kind === 'project')!;
    const bad = structuredClone(config.continuation!);
    if (bad.version !== 3 || !original.source || original.source.kind !== 'project') throw new Error('Expected native career sources.');
    bad.pieces[0] = { ...structuredClone(original), source: { ...original.source, story: { nodeId: 'clem-open', stage: 'open', season: 1 } } };
    expect(() => validateContinuation(bad)).toThrow('retained story source');
    bad.career.adaptedFrom = { rules: CREATIVE_PROMISE_RULES_VERSION, season: 1 };
    expect(() => validateContinuation(bad)).toThrow('retained story source');
  });
});

describe('later commissions and frozen earned contributions', () => {
  it.each([
    ['first-night', 900, 0, 1, true, 0], ['new-band', 1500, 150, 2, true, 0],
    ['weekly-rhythm', 720, 0, 1, false, 100], ['market-debut', 1440, 45, 3, true, 100],
    ['quiet-sendoff', 750, 0, 1, false, 0], ['open-bench', 1400, 80, 2, true, 0],
  ] as const)('%s has its own real legacy terms', (approach, price, materials, launches, host, bread) => {
    const s = legacyReady();
    const id = ['first-night', 'new-band'].includes(approach) ? 'clem-ten' : ['weekly-rhythm', 'market-debut'].includes(approach) ? 'mara-regular' : 'hugo-handover';
    const sourceId = lendingSources(s, id, approach)[0]?.id;
    const brief = projectBrief(s, id, approach, sourceId);
    expect(validateDesign(brief, brief.defaultDesign)).toEqual([]);
    const quote = projectQuote(s, id, approach, brief.defaultDesign, sourceId)!;
    expect(quote).not.toBeNull();
    expect(quote.offer).toMatchObject({ price, launches });
    expect(quote.project).toMatchObject({ materials, story: { stage: 'legacy', season: 3 }, contribution: { host, materialsReduction: bread, courtyardFinishReduction: 0, trailBriefReduction: approach === 'new-band' ? 15 : 0 } });
    expect(quote.project.proof!.pieces).toHaveLength(launches);
    if (approach === 'open-bench') expect(quote.profiles[1]!.brief).toBe(90);
    const accepted = step(s, { type: 'acceptProject', projectId: id, approach, design: brief.defaultDesign, ...(sourceId ? { sourceId } : {}) });
    expect(accepted.contracts.at(-1)!.project).toEqual(quote.project);
    expect(projectForecast(s, id, approach, { design: brief.defaultDesign, sourceId })).not.toBeNull();
    const settled = close(accepted);
    const record = projectRecords(settled).find(p => p.id === id)!;
    expect(record).toMatchObject({ status: 'delivered', host, earned: true });
  });
  it('locks exact retained lending separately from the new caption and rejects foreign or missing sources', () => {
    const s = legacyReady();
    const source = lendingSources(s, 'clem-ten', 'first-night')[0]!;
    expect(projectBlocked(s, 'clem-ten', 'first-night')).toContain('Choose a retained');
    const pending = projectBrief(s, 'clem-ten', 'first-night');
    const brief = projectBrief(s, 'clem-ten', 'first-night', source.id);
    expect(pending.pieces[0]!.copy.map(c => c.id)).toEqual(brief.pieces[0]!.copy.map(c => c.id));
    const command: Command = { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', sourceId: source.id, design: brief.defaultDesign };
    const accepted = step(s, command);
    const lent = accepted.contracts.at(-1)!.project!.lentPiece!;
    expect(lent).toEqual(source);
    expect(lent.design).not.toEqual(brief.defaultDesign.pieces[0]);
    source.design.palette = source.design.palette === 'poppy' ? 'river' : 'poppy';
    expect(accepted.contracts.at(-1)!.project!.lentPiece).not.toEqual(source);
    for (const invalid of [{ ...command, sourceId: 'foreign' }, { ...command, sourceId: undefined }, { ...command, approach: 'new-band' as ProjectApproach }]) expect(applyCommand(s, invalid).state).toBe(s);
    expect(replay(s.config, accepted.commands, accepted.rulesVersion)).toEqual({ state: accepted, errors: [] });
    expect(replay(s.config, accepted.commands.slice(0, -1), accepted.rulesVersion).state).toEqual(s);
    expect(approachFor(s, 'first-night').requiresSource).toBe(true);
  });
});

describe('fixed recurring briefs and visible paid reuse', () => {
  it('keeps request, proof, recognition and retained source on the same brief identity', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'recurring-proof' });
    const request = s.requests.find(r => r.castId === 'clem')!;
    const offer = reactionFor(s, request);
    if (offer.kind !== 'buy') throw new Error('Expected a buyer.');
    const brief = ordinaryBrief(request, offer.offer)!;
    expect(ordinaryRequestLine(request)).toBe(brief.intention);
    s = step(s, { type: 'accept', requestId: request.id });
    expect(s.contracts[0]).toMatchObject({ briefId: request.briefId });
    expect(s.contracts[0]!.intention).toBeUndefined();
    expect(contractProof(s.contracts[0]!)!.pieces[0]!.title).toBe(brief.title);
    s = close(s);
    expect(creativePromise(s, 'clem')).toMatchObject({ briefId: request.briefId, title: brief.title });
    expect(deliveredPieces(s)[0]!.source).toMatchObject({ kind: 'ordinary', briefId: request.briefId });
    for (const stage of ['practice', 'legacy', 'open']) for (const castId of ['clem', 'mara', 'hugo', 'ivo']) for (const n of [1, 2]) {
      const briefId = `${castId}-${stage}-${n}`;
      const r = { ...request, castId, briefId };
      const later = ordinaryBrief(r, offer.offer)!;
      expect(later.title + later.intention + ordinaryIntentions(castId, briefId).map(i => i.label + i.response).join(' ')).not.toMatch(/anniversary|retirement|first workshop|first repair/i);
    }
  });
  it('adopts compatible style with new required copy and records only native application', () => {
    const finished = opening();
    const piece = deliveredPieces(finished).find(p => p.castId === 'clem' && p.design.kind === 'poster')!;
    let s = createRun(buildContinuation(finished, [piece.id], 'pattern-recurring'));
    s = step(s, { type: 'preparePattern', sourceId: 'carried-1' });
    for (const r of s.requests.filter(r => r.status === 'waiting')) s = step(s, { type: 'decline', requestId: r.id });
    s = step(s, { type: 'runDay' });
    expect(s.patterns![0]!.status).toBe('ready');
    const request = s.requests.find(r => r.castId === 'clem' && r.status === 'waiting');
    const current = request ?? { ...createRun({ scenarioId: 'main-street', seed: 'pattern-draft' }).requests.find(r => r.castId === 'clem')!, id: 'pattern-buyer', day: s.day, briefId: 'clem-practice-1' };
    if (!request) s.requests.push(current);
    current.offer = { ...PRESETS.bespoke, price: 100 };
    const offer = reactionFor(s, current);
    if (offer.kind !== 'buy') throw new Error('Expected a buyer.');
    const brief = ordinaryBrief(current, offer.offer)!;
    const reuse = compatiblePatterns(s, brief)[0]!;
    expect(reuse).toBeDefined();
    expect(reuse.briefReduction).toBe(15);
    expect(validateDesign(brief, reuse.design)).toEqual([]);
    expect(approveProof(brief, reuse.design).proof!.pieces[0]!.copy).toEqual(brief.pieces[0]!.copy);
    const accepted = step(s, { type: 'accept', requestId: current.id, design: reuse.design });
    const job = accepted.jobs.at(-1)!;
    expect(patternReduction(accepted, job, accepted.resources.find(r => r.id === 'h2')!, s.day)).toBe(15);
    const options = { design: reuse.design };
    const pending = dayPlan(s, current.id, options)!;
    const booked = dayPlan(accepted)!;
    expect(pending.blocks.filter(b => b.jobId === job.id).every(b => b.isNew)).toBe(true);
    expect(booked.blocks.filter(b => b.jobId === job.id).every(b => !b.isNew)).toBe(true);
    expect({ ...pending, blocks: pending.blocks.map(b => ({ ...b, isNew: false })) }).toEqual(booked);
    expect(forecast(s, current.id, options)).toEqual(forecast(accepted));
    expect(workFor(s, current.id, false, undefined, options)!.first).toBeGreaterThan(0);
    const settled = close(accepted);
    expect(settled.events.some(e => e.type === 'pattern_used' && e.jobId === job.id && e.patternId === reuse.id && e.amount === 15)).toBe(true);
    const old = opening('main-trail/native-save.json', CREATIVE_PROMISE_RULES_VERSION);
    const oldBrief = ordinaryBrief(old.requests.find(r => r.castId === 'clem')!, PRESETS.bespoke)!;
    expect(compatiblePatterns(old, oldBrief)).toEqual([]);
    expect(reservationForecast(s, current.id, 1, options)).toEqual(null);
  });
  it('reports no extra pattern saving when an earned contribution and library already reach the briefing floor', () => {
    const parent = opening();
    const source = deliveredPieces(parent).find(p => p.source?.kind === 'project' && p.source.projectId === 'lantern-night' && p.design.kind === 'programme')!;
    expect(source).toBeDefined();
    let s = createRun(buildContinuation(parent, [source.id], 'pattern-floor'));
    s = step(s, { type: 'buy', item: 'library' });
    s = step(s, { type: 'preparePattern', sourceId: 'carried-1' });
    while (s.day < 7) {
      for (const [id, approach] of [['clem-ten', 'new-band'], ['mara-regular', 'weekly-rhythm']] as const) if (!projectBlocked(s, id, approach)) s = step(s, { type: 'acceptProject', projectId: id, approach, design: projectBrief(s, id, approach).defaultDesign });
      for (const request of s.requests.filter(r => r.day === s.day && r.status === 'waiting')) s = step(s, { type: 'decline', requestId: request.id });
      s = step(s, { type: 'runDay' });
    }
    const brief = projectBrief(s, 'lantern-night', 'trail');
    expect(brief.briefingMinutes).toEqual([5, 5, 5]);
    const reuse = compatiblePatterns(s, brief).find(p => p.sourceId === 'carried-1')!;
    expect(reuse).toMatchObject({ briefReduction: 0, briefReductions: [0, 0, 0] });
    const accepted = step(s, { type: 'acceptProject', projectId: 'lantern-night', approach: 'trail', design: reuse.design });
    const job = accepted.jobs.find(j => j.id === accepted.contracts.at(-1)!.jobIds[0])!;
    expect(stageEffort(accepted, job, 'human')).toBe(5);
    expect(patternReduction(accepted, job, accepted.resources.find(r => r.id === 'h2')!, s.day)).toBe(0);
    const finished = close(accepted);
    expect(finished.events.filter(e => e.type === 'pattern_used' && e.jobId === job.id)).toEqual([]);
    const start = finished.events.find(e => e.type === 'task_start' && e.jobId === job.id && e.stage === 'brief')!;
    const done = finished.events.find(e => e.type === 'task_done' && e.jobId === job.id && e.stage === 'brief')!;
    const worker = finished.resources.find(r => r.id === start.resourceId)!;
    expect(done.minute - start.minute).toBe(Math.ceil(5 * effortPercent(worker, job, start.day) / 100));
  });
});

describe('native curation is separate from inheritance', () => {
  it('saves an ordered selection after the ending, undoes it, and leaves every production fact and continuation unchanged', () => {
    const finished = opening();
    const available = featureablePieces(finished);
    expect(available.length).toBeGreaterThan(3);
    const ids = available.slice(0, 3).map(p => p.id);
    const next = buildContinuation(finished, [ids[0]!], 'featured-independent');
    const command: Command = { type: 'featurePieces', pieceIds: ids };
    expect(commandSchema.safeParse(command).success).toBe(true);
    const curated = step(finished, command);
    expect(featuredPieces(curated).map(p => p.id)).toEqual(ids);
    const { featuredPieceIds: _selected, commands: _commands, revision: _revision, ...facts } = curated;
    const { featuredPieceIds: _beforeSelected, commands: _beforeCommands, revision: _beforeRevision, ...before } = finished;
    expect(facts).toEqual(before);
    expect(buildContinuation(curated, [ids[0]!], 'featured-independent')).toEqual(next);
    expect(replay(curated.config, curated.commands, curated.rulesVersion)).toEqual({ state: curated, errors: [] });
    expect(replay(curated.config, curated.commands.slice(0, -1), curated.rulesVersion).state).toEqual(finished);
    expect(featuredPieces(step(curated, { type: 'featurePieces', pieceIds: [] }))).toEqual([]);
    for (const pieceIds of [[ids[0]!, ids[0]!], ids.concat('fourth'), ['foreign']]) expect(applyCommand(curated, { type: 'featurePieces', pieceIds }).state).toBe(curated);
    expect(createRun(next).featuredPieceIds).toEqual([]);
    expect(applyCommand(createRun({ scenarioId: 'main-street', seed: 'old-feature' }, AUTHORSHIP_RULES_VERSION), command).error).toContain('career');
    let parent: CompanyState | null = curated;
    const independent = JSON.parse(JSON.stringify(buildContinuation(parent, [ids[0]!])));
    parent = null;
    expect(replay(independent, [{ type: 'runDay' }]).errors).toEqual([]);
  });
});
