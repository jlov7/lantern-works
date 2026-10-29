// A season carries a small studio snapshot, never its parent's tape or save identifier.
import { z } from 'zod/mini';
import { creativeIntentionSchema, designPieceSchema, motifFits, type BriefCopy, type DesignPiece } from './design';
import { CAST_BY_ID, RULES } from './rules';
import { AUTHORSHIP_RULES_VERSION, CREATIVE_PROMISE_RULES_VERSION, hasAuthorshipRules, hasCareerRules, hasCreativePromiseRules } from './versions';
import { contractProof, creativePromise, ordinaryBriefIdentityValid, ordinaryIntentions } from './ordinary';
import { CAREER_STAGES, careerStage, careerStories, nextCareerStage, nodeApproaches, PRINCIPAL_IDS, PRINCIPAL_NODE_IDS, PRINCIPAL_OUTCOMES, settledStories, STORY_NODE_IDS, storyNode } from './career';
import { specializationOn } from './mentoring';
import { PROJECTS } from './projects';
import type { CarriedPiece, CompanyState, ContinuationSnapshot, CurrentCarriedPiece, LegacyCarriedPiece, RunConfig } from './types';

const id = z.string().check(z.minLength(1), z.maxLength(80));
const integer = (lo: number, hi: number) => z.int().check(z.gte(lo), z.lte(hi));
const approaches = ['first-night', 'new-band', 'weekly-rhythm', 'market-debut', 'quiet-sendoff', 'open-bench', 'courtyard', 'trail'] as const;
const resolution = z.enum(['declined-before-promise', 'agreed-later-start', 'renegotiated-with-discount', 'promise-kept', 'promise-missed', 'amends-kept', 'change-refused']);
const projectId = z.enum(['clem-ten', 'mara-regular', 'hugo-handover', 'lantern-night']);
const copySchema = z.array(z.strictObject({ id, text: z.string().check(z.maxLength(300)), role: z.enum(['title', 'detail', 'footer']) })).check(z.maxLength(8));
const pieceArtwork = { design: designPieceSchema, title: z.string().check(z.maxLength(120)), copy: copySchema };
const pieceSchema = z.strictObject({
  id, sourceJobId: id, sourceSeason: integer(1, 10000), castId: id,
  projectId, approach: z.enum(approaches), ...pieceArtwork,
});
const currentPieceSchema = z.strictObject({
  id, sourceJobId: id, sourceSeason: integer(1, 10000), castId: id,
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ordinary'), requestId: id, intention: z.optional(creativeIntentionSchema) }),
    z.strictObject({ kind: z.literal('project'), projectId, approach: z.enum(approaches) }),
  ]), ...pieceArtwork,
});
const promiseSchema = z.strictObject({
  sourceSeason: integer(1, 10000), contractId: id, requestId: id, jobId: id, castId: id,
  deliveredAt: integer(1, RULES.days * RULES.minutesPerDay), intention: z.optional(creativeIntentionSchema), ...pieceArtwork,
});
const relationshipFields = { castId: id, regular: z.boolean(), lost: z.boolean(), ordinaryDelivered: integer(0, 1000000), lastResolution: z.nullable(resolution), milestone: z.optional(z.strictObject({ approach: z.enum(approaches), outcome: z.enum(['delivered', 'compromised', 'partial', 'failed']) })) };
const studioFields = {
  patterns: z.array(z.strictObject({ id, sourceId: id, status: z.enum(['queued', 'preparing', 'ready']), remaining: integer(0, 60), noorKnows: z.boolean() })).check(z.maxLength(3)),
  cash: integer(-1000000000, 1000000000),
  rep: z.strictObject({ small: integer(RULES.rep.min, RULES.rep.max), moment: integer(RULES.rep.min, RULES.rep.max), careful: integer(RULES.rep.min, RULES.rep.max), rush: integer(RULES.rep.min, RULES.rep.max) }),
  upgrades: z.array(z.enum(['library', 'checklist', 'styleGuide'])).check(z.maxLength(3)),
  staffing: z.strictObject({ aiTier: z.enum(['none', 'solo', 'duo']), routing: z.enum(['human', 'simple', 'all']) }),
  kit: z.strictObject({ status: z.enum(['none', 'queued', 'building', 'ready']), remaining: integer(0, RULES.effort.kitSetup) }),
  rentExtra: integer(0, 1000000),
  noor: z.optional(z.strictObject({ id, specialization: z.optional(z.enum(['proofing', 'templates'])) })),
};
const storySchema = z.strictObject({ nodeId: z.enum(STORY_NODE_IDS), stage: z.enum(CAREER_STAGES), season: integer(1, 10000) });
const careerPieceSchema = z.strictObject({
  id, sourceJobId: id, sourceSeason: integer(1, 10000), castId: id,
  source: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ordinary'), requestId: id, intention: z.optional(creativeIntentionSchema), briefId: z.optional(id) }),
    z.strictObject({ kind: z.literal('project'), projectId, approach: z.enum(approaches), story: z.optional(storySchema) }),
  ]), ...pieceArtwork,
});
const careerPromiseSchema = z.strictObject({
  sourceSeason: integer(1, 10000), contractId: id, requestId: id, jobId: id, castId: id,
  deliveredAt: integer(1, RULES.days * RULES.minutesPerDay), intention: z.optional(creativeIntentionSchema), briefId: z.optional(id), ...pieceArtwork,
});
export const continuationSchema = z.discriminatedUnion('version', [
  z.strictObject({ version: z.literal(1), season: integer(2, 10000), pieces: z.array(pieceSchema).check(z.maxLength(3)), relationships: z.array(z.strictObject(relationshipFields)).check(z.maxLength(100)), ...studioFields }),
  z.strictObject({ version: z.literal(2), season: integer(2, 10000), pieces: z.array(currentPieceSchema).check(z.maxLength(3)), relationships: z.array(z.strictObject({ ...relationshipFields, creativePromise: z.optional(promiseSchema) })).check(z.maxLength(100)), ...studioFields }),
  z.strictObject({ version: z.literal(3), season: integer(2, 10000), pieces: z.array(careerPieceSchema).check(z.maxLength(3)), relationships: z.array(z.strictObject({ ...relationshipFields, creativePromise: z.optional(careerPromiseSchema) })).check(z.maxLength(100)), ...studioFields,
    career: z.strictObject({ stage: z.enum(CAREER_STAGES), stories: z.array(z.strictObject({ nodeId: z.enum(PRINCIPAL_NODE_IDS), season: z.nullable(integer(1, 10000)), outcome: z.enum(PRINCIPAL_OUTCOMES), approach: z.optional(z.enum(approaches)) })).check(z.maxLength(9)), adaptedFrom: z.optional(z.strictObject({ rules: z.enum([AUTHORSHIP_RULES_VERSION, CREATIVE_PROMISE_RULES_VERSION]), season: integer(1, 9999) })) }),
  }),
]) satisfies z.ZodMiniType<ContinuationSnapshot>;

export function validateContinuation(input: unknown): ContinuationSnapshot {
  const parsed = continuationSchema.safeParse(input);
  if (!parsed.success) throw new Error('The continuing studio snapshot is malformed.');
  const s = parsed.data as ContinuationSnapshot;
  const ids = s.relationships.map(r => r.castId);
  if (new Set(ids).size !== ids.length || Object.keys(CAST_BY_ID).some(id => !ids.includes(id)) || ids.some(id => !CAST_BY_ID[id])) throw new Error('The studio must remember every neighbour exactly once.');
  if (new Set(s.pieces.map(p => p.id)).size !== s.pieces.length || s.pieces.some(p => !CAST_BY_ID[p.castId] || p.design.copy.some(id => !p.copy.some(c => c.id === id)) || p.design.motifs.some(m => !motifFits(p.design.layout, m)))) throw new Error('A carried piece has invalid source identity or customer copy.');
  if (s.version === 2 || s.version === 3) {
    const copyValid = (piece: { design: DesignPiece; copy: BriefCopy[] }) => piece.copy.length > 0 && new Set(piece.copy.map(c => c.id)).size === piece.copy.length && new Set(piece.design.copy).size === piece.design.copy.length && piece.copy.every(c => piece.design.copy.includes(c.id)) && piece.design.copy.every(token => piece.copy.some(c => c.id === token));
    const ordinaryValid = (piece: { castId: string; intention?: string; briefId?: string; design: { kind: string; treatment: string } }) => ordinaryIntentions(piece.castId, piece.briefId).length > 0 && piece.design.kind === 'poster' && piece.design.treatment === 'standard' && (!piece.briefId || ordinaryBriefIdentityValid(piece.castId, piece.briefId)) && (piece.intention === undefined || ordinaryIntentions(piece.castId, piece.briefId).some(i => i.id === piece.intention));
    if (s.pieces.some(piece => {
      if (piece.sourceSeason >= s.season || !copyValid(piece)) return true;
      const source = piece.source;
      if (source.kind === 'ordinary') return !ordinaryValid({ ...piece, intention: source.intention, ...('briefId' in source ? { briefId: source.briefId } : {}) });
      const project = PROJECTS[source.projectId];
      const castMatches = piece.castId === project.castId || (source.projectId === 'hugo-handover' && piece.castId === 'ivo') || (source.projectId === 'lantern-night' && piece.castId === 'committee');
      const story = 'story' in source ? source.story : undefined;
      const storyInvalid = story && (source.projectId === 'lantern-night' || story.nodeId !== storyNode(source.projectId, story.stage) || story.season !== piece.sourceSeason || (source.projectId === 'hugo-handover' && piece.castId !== (story.stage === 'opening' ? 'hugo' : 'ivo')));
      return !castMatches || !project.approaches.includes(source.approach) || !!storyInvalid;
    })) throw new Error('A carried piece has invalid source or intention.');
    if (s.relationships.some(r => {
      const p = r.creativePromise;
      return p && (p.castId !== r.castId || p.sourceSeason >= s.season || !ordinaryValid(p) || !copyValid(p) || !r.regular || r.ordinaryDelivered < 1 || p.design.motifs.some(m => !motifFits(p.design.layout, m)));
    })) throw new Error('A remembered creative promise has invalid source, intention or artwork.');
  }
  if (s.version === 3) {
    const { stage, stories, adaptedFrom } = s.career;
    const legacySeason = Math.max(0, ...stories.filter(r => r.nodeId.endsWith('-legacy')).map(r => r.season ?? 0));
    const previous = CAREER_STAGES.slice(0, CAREER_STAGES.indexOf(stage));
    const expected = PRINCIPAL_NODE_IDS.filter(id => previous.some(stage => id.endsWith(`-${stage}`)));
    if (stage === 'opening' || stories.length !== expected.length || new Set(stories.map(r => r.nodeId)).size !== stories.length || stories.some(r => !expected.includes(r.nodeId) || (r.season !== null && r.season >= s.season) || (r.outcome === 'unknown' ? r.season !== null : r.season === null) || (r.approach && (!nodeApproaches(r.nodeId).includes(r.approach) || ['unknown', 'not-taken'].includes(r.outcome))) || (!['unknown', 'not-taken'].includes(r.outcome) && !r.approach)) || (adaptedFrom && adaptedFrom.season >= s.season)) throw new Error('The career has invalid stage or story history.');
    if (s.pieces.some(piece => {
      if (piece.source.kind !== 'project' || !piece.source.story) return false;
      const story = piece.source.story;
      if (story.stage === 'open') return stage !== 'open' || legacySeason === 0 || story.season <= legacySeason;
      const history = stories.find(r => r.nodeId === story.nodeId);
      return !history || history.season !== story.season || history.approach !== piece.source.approach || ['unknown', 'not-taken', 'failed'].includes(history.outcome);
    })) throw new Error('A retained story source does not match the completed career history.');
  }
  if (new Set(s.patterns.map(p => p.id)).size !== s.patterns.length || new Set(s.patterns.map(p => p.sourceId)).size !== s.patterns.length || s.patterns.some(p => !s.pieces.some(piece => piece.id === p.sourceId) || (p.status === 'ready' ? p.remaining !== 0 : p.remaining <= 0) || (p.noorKnows && (!s.noor || p.status !== 'ready')))) throw new Error('A carried pattern has invalid work or teaching history.');
  if (new Set(s.upgrades).size !== s.upgrades.length || (s.noor && !/^j[1-9]\d*$/.test(s.noor.id))) throw new Error('The studio staffing or upgrades are malformed.');
  if ((s.kit.status === 'ready' || s.kit.status === 'none') ? s.kit.remaining !== 0 : s.kit.remaining <= 0) throw new Error('The template kit has inconsistent remaining work.');
  return structuredClone(s);
}

/** Every source is a delivered piece, even if the rest of its commission failed. */
export function deliveredPieces(s: CompanyState): CarriedPiece[] {
  return s.jobs.flatMap<CarriedPiece>(j => {
    const c = s.contracts.find(c => c.id === j.contractId);
    const proof = c && contractProof(c);
    const piece = proof?.design.pieces[j.launchIndex];
    const page = proof?.pieces[j.launchIndex];
    if (j.status !== 'delivered' || j.deliveredAt === null || !c || !piece || !page) return [];
    const identity = { id: j.id, sourceJobId: j.id, sourceSeason: s.config.continuation?.season ?? 1, castId: c.castId };
    const artwork = { design: structuredClone(piece), title: page.title, copy: structuredClone(page.copy) };
    if (!hasCreativePromiseRules(s.rulesVersion)) return c.project ? [{ ...identity, projectId: c.project.id, approach: c.project.approach, ...artwork }] : [];
    const source: CurrentCarriedPiece['source'] = c.project ? { kind: 'project', projectId: c.project.id, approach: c.project.approach, ...(c.project.story ? { story: structuredClone(c.project.story) } : {}) } : { kind: 'ordinary', requestId: c.requestId, ...(c.intention ? { intention: c.intention } : {}), ...(c.briefId ? { briefId: c.briefId } : {}) };
    return [{ ...identity, source, ...artwork }];
  });
}

function currentPiece(piece: CarriedPiece): CurrentCarriedPiece {
  if (piece.source) return piece;
  const { projectId, approach, ...data } = piece;
  return { ...data, source: { kind: 'project', projectId, approach } };
}

export function buildContinuation(finished: CompanyState, selectedJobIds: string[], seed = `${finished.config.seed.slice(0, 30)}-next`): RunConfig {
  if (!hasAuthorshipRules(finished.rulesVersion)) throw new Error('Only an authored studio can continue into another season.');
  if (!finished.finished || finished.day !== RULES.days || finished.minute !== RULES.days * RULES.minutesPerDay || finished.call || finished.unearned !== 0 || finished.jobs.some(j => j.status === 'scheduled' || j.status === 'active' || j.assignee !== null)) throw new Error('Finish and settle every promise before continuing the studio.');
  if (!Array.isArray(selectedJobIds) || selectedJobIds.length > 3 || new Set(selectedJobIds).size !== selectedJobIds.length) throw new Error('Choose up to three distinct delivered pieces.');
  if (!seed || seed.length > 40) throw new Error('The next season needs a seed of 1 to 40 characters.');
  const available = [...(finished.config.continuation?.pieces ?? []), ...deliveredPieces(finished)];
  const pieces = selectedJobIds.map(id => {
    const p = available.find(p => p.id === id);
    if (!p) throw new Error(`Piece ${id} was not delivered with an authored proof.`);
    return { ...structuredClone(p), id: `carried-${selectedJobIds.indexOf(id) + 1}` };
  });
  const inherited = finished.config.continuation?.relationships ?? [];
  const relationships = Object.keys(CAST_BY_ID).map(castId => {
    const previous = inherited.find(r => r.castId === castId);
    const contracts = finished.contracts.filter(c => c.castId === castId);
    const complete = contracts.filter(c => c.jobIds.length > 0 && c.jobIds.every(id => finished.jobs.find(j => j.id === id)?.status === 'delivered'));
    const milestone = contracts.findLast(c => c.project);
    const projectJobs = milestone ? finished.jobs.filter(j => j.contractId === milestone.id) : [];
    const outcome = projectJobs.every(j => j.status === 'delivered') ? projectJobs.some(j => j.changeDeclined) ? 'compromised' : 'delivered' : projectJobs.some(j => j.status === 'delivered') ? 'partial' : 'failed';
    const promise = hasCreativePromiseRules(finished.rulesVersion) ? creativePromise(finished, castId) ?? previous?.creativePromise : undefined;
    return { castId, regular: previous?.regular === true || complete.length > 0, lost: finished.lostCast.includes(castId), ordinaryDelivered: (previous?.ordinaryDelivered ?? 0) + complete.filter(c => !c.project && finished.requests.some(r => r.id === c.requestId && ['walkin', 'word', 'flyer', 'premium', 'booking'].includes(r.source))).length, lastResolution: finished.relationshipMemory?.findLast(r => r.castId === castId)?.kind ?? previous?.lastResolution ?? null, ...(milestone?.project ? { milestone: { approach: milestone.project.approach, outcome: outcome as 'delivered' | 'compromised' | 'partial' | 'failed' } } : previous?.milestone ? { milestone: previous.milestone } : {}), ...(promise ? { creativePromise: promise } : {}) };
  });
  const noor = finished.resources.find(r => r.role === 'junior' && r.name === RULES.staff.junior.name && r.fromDay < RULES.days && (r.toDay === null || r.toDay >= RULES.days));
  const specialization = noor ? specializationOn(noor, RULES.days) : null;
  const patterns = (finished.patterns ?? []).filter(p => selectedJobIds.includes(p.sourceId)).map((p, index) => ({ id: `carried-pattern-${index + 1}`, sourceId: pieces[selectedJobIds.indexOf(p.sourceId)]!.id, status: p.status, remaining: p.remaining, noorKnows: !!noor && (noor.inheritedPatterns?.includes(p.id) === true || finished.patternTeaching?.some(t => t.patternId === p.id && t.resourceId === noor.id && t.completedAt !== null && t.day < RULES.days) === true) }));
  const stage = careerStage(finished);
  const snapshot = { version: stage ? 3 : hasCreativePromiseRules(finished.rulesVersion) ? 2 : 1, season: (finished.config.continuation?.season ?? 1) + 1, pieces: hasCreativePromiseRules(finished.rulesVersion) ? pieces.map(currentPiece) : pieces as LegacyCarriedPiece[], relationships, patterns, cash: finished.cash, rep: finished.rep, upgrades: finished.upgrades, staffing: finished.staffing, kit: { status: finished.kit.status, remaining: finished.kit.remaining }, rentExtra: finished.modifiers.reduce((sum, m) => sum + (m.kind === 'rent' && m.fromDay < RULES.days ? m.extra : 0), 0), ...(noor ? { noor: { id: noor.id, ...(specialization ? { specialization } : {}) } } : {}), ...(stage ? { career: { stage: nextCareerStage(stage), stories: careerStories(finished), ...(finished.config.continuation?.version === 3 && finished.config.continuation.career.adaptedFrom ? { adaptedFrom: finished.config.continuation.career.adaptedFrom } : {}) } } : {}) };
  return { scenarioId: finished.config.scenarioId, seed, continuation: validateContinuation(snapshot) };
}

export function adaptCareerContinuation(finished: CompanyState, selectedJobIds: string[], seed?: string): RunConfig {
  if (finished.rulesVersion !== AUTHORSHIP_RULES_VERSION && finished.rulesVersion !== CREATIVE_PROMISE_RULES_VERSION) throw new Error('Only a finished 6.0 or 6.1 studio uses the career adapter.');
  const config = buildContinuation(finished, selectedJobIds, seed);
  const snapshot = config.continuation!;
  const oldContinuation = !!finished.config.continuation;
  const previous = PRINCIPAL_IDS.map(id => {
    const castId = id === 'clem-ten' ? 'clem' : id === 'mara-regular' ? 'mara' : 'hugo';
    const known = finished.config.continuation?.season === 2 ? finished.config.continuation.relationships.find(r => r.castId === castId)?.milestone : undefined;
    return { nodeId: storyNode(id, 'opening'), season: known ? 1 : null, outcome: known?.outcome ?? 'unknown', ...(known ? { approach: known.approach } : {}) };
  });
  const stories = oldContinuation ? [...previous, ...settledStories(finished, 'practice', true)] : settledStories(finished, 'opening', true);
  config.continuation = validateContinuation({ ...snapshot, version: 3, pieces: snapshot.pieces.map(currentPiece), career: { stage: oldContinuation ? 'legacy' : 'practice', stories, adaptedFrom: { rules: finished.rulesVersion, season: finished.config.continuation?.season ?? 1 } } });
  return config;
}

export function featureablePieces(s: CompanyState): CarriedPiece[] {
  return hasCareerRules(s.rulesVersion) ? structuredClone([...(s.config.continuation?.pieces ?? []), ...deliveredPieces(s)]) : [];
}
export function featuredPieces(s: CompanyState): CarriedPiece[] {
  const available = featureablePieces(s);
  return (s.featuredPieceIds ?? []).flatMap(id => { const piece = available.find(p => p.id === id); return piece ? [piece] : []; });
}
export function featurePiecesBlocked(s: CompanyState, pieceIds: readonly string[]): string | null {
  if (!hasCareerRules(s.rulesVersion)) return 'Featured work belongs to career studios.';
  if (!Array.isArray(pieceIds) || pieceIds.length > 3 || new Set(pieceIds).size !== pieceIds.length) return 'Choose up to three distinct delivered pieces to feature.';
  const available = featureablePieces(s);
  if (pieceIds.some(id => typeof id !== 'string' || !available.some(p => p.id === id && p.sourceSeason <= (s.config.continuation?.season ?? 1)))) return 'Feature only current or retained work delivered by this studio.';
  return null;
}
