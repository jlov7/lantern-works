import { hasCareerRules } from './versions';
import type { CareerStage, CompanyState, PrincipalNodeId, PrincipalOutcome, PrincipalStory, ProjectApproach, ProjectId, ProjectStory, StoryNodeId } from './types';

export type ProjectContext = Pick<CompanyState, 'config' | 'rulesVersion'>;
export const CAREER_STAGES = ['opening', 'practice', 'legacy', 'open'] as const;
export const PRINCIPAL_NODE_IDS = ['clem-opening', 'mara-opening', 'ivo-opening', 'clem-practice', 'mara-practice', 'ivo-practice', 'clem-legacy', 'mara-legacy', 'ivo-legacy'] as const;
export const STORY_NODE_IDS = [...PRINCIPAL_NODE_IDS, 'clem-open', 'mara-open', 'ivo-open'] as const;
export const PRINCIPAL_OUTCOMES = ['delivered', 'compromised', 'partial', 'failed', 'not-taken', 'unknown'] as const;
export const PRINCIPAL_IDS: ProjectId[] = ['clem-ten', 'mara-regular', 'hugo-handover'];

export function careerStage(s: ProjectContext): CareerStage | null {
  if (!hasCareerRules(s.rulesVersion)) return null;
  return s.config.continuation?.version === 3 ? s.config.continuation.career.stage : 'opening';
}
export function storyNode(id: ProjectId, stage: CareerStage): StoryNodeId {
  return `${id === 'clem-ten' ? 'clem' : id === 'mara-regular' ? 'mara' : 'ivo'}-${stage}` as StoryNodeId;
}
export function projectStory(s: ProjectContext, id: ProjectId): ProjectStory | undefined {
  const stage = careerStage(s);
  return stage && id !== 'lantern-night' ? { nodeId: storyNode(id, stage), stage, season: s.config.continuation?.season ?? 1 } : undefined;
}
export function nextCareerStage(stage: CareerStage): CareerStage {
  return stage === 'opening' ? 'practice' : stage === 'practice' ? 'legacy' : 'open';
}
export function settledStories(s: CompanyState, stage: Exclude<CareerStage, 'open'>, unknownMissing = false): PrincipalStory[] {
  return PRINCIPAL_IDS.map(id => {
    const c = s.contracts.find(c => c.project?.id === id);
    const jobs = c ? s.jobs.filter(j => j.contractId === c.id) : [];
    const outcome: PrincipalOutcome = !c ? unknownMissing ? 'unknown' : 'not-taken' : jobs.every(j => j.status === 'delivered') ? jobs.some(j => j.changeDeclined) ? 'compromised' : 'delivered' : jobs.some(j => j.status === 'delivered') ? 'partial' : 'failed';
    return { nodeId: storyNode(id, stage) as PrincipalNodeId, season: !c && unknownMissing ? null : s.config.continuation?.season ?? 1, outcome, ...(c?.project ? { approach: c.project.approach } : {}) };
  });
}
export function careerStories(s: CompanyState): PrincipalStory[] {
  const stage = careerStage(s);
  if (!stage) return [];
  const previous = s.config.continuation?.version === 3 ? s.config.continuation.career.stories : [];
  return structuredClone([...previous, ...(s.finished && stage !== 'open' ? settledStories(s, stage) : [])]);
}
export function nodeApproaches(nodeId: string): readonly ProjectApproach[] {
  return nodeId.startsWith('clem-') ? ['first-night', 'new-band'] : nodeId.startsWith('mara-') ? ['weekly-rhythm', 'market-debut'] : ['quiet-sendoff', 'open-bench'];
}
