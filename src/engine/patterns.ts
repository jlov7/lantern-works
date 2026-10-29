import { deliveredPieces } from './continuation';
import { RULES } from './rules';
import { hasAuthorshipRules, hasCareerRules } from './versions';
import { mentoringAppointments } from './mentoring';
import { validateDesign, type DesignBrief, type DesignPiece, type DesignSpec } from './design';
import { contractProof } from './ordinary';
import { profileBriefMinutes } from './projects';
import type { CompanyState, Job, Resource, StudioPattern } from './types';

export const PATTERN_COST = 50;
export const PATTERN_MINUTES = 60;
export const PATTERN_REDUCTION = 15;
export const MAX_PATTERNS = 3;
export function patternSources(s: CompanyState) { return [...(s.config.continuation?.pieces ?? []), ...deliveredPieces(s)]; }
export function patternMatches(a: DesignPiece, b: DesignPiece): boolean {
  return a.kind === b.kind && a.layout === b.layout && a.palette === b.palette && a.typeface === b.typeface && JSON.stringify(a.motifs) === JSON.stringify(b.motifs);
}
export function patternAppointments(s: CompanyState, day: number) { return (s.patternTeaching ?? []).filter(t => t.day === day).map(t => ({ learnerId: t.resourceId, mentorId: 'h2', minutes: PATTERN_MINUTES, teaching: t })); }
function morningBlocked(s: CompanyState): string | null {
  if (!hasAuthorshipRules(s.rulesVersion)) return 'Patterns belong to authored studios.';
  if (s.finished || s.call || s.minute !== s.day * RULES.minutesPerDay) return 'Arrange pattern work in the morning.';
  if (s.news.some(n => n.day === s.day && n.choice === null)) return 'Answer today’s street news before arranging pattern work.';
  return null;
}
function working(s: CompanyState, id: string): Resource | undefined { return s.resources.find(r => r.id === id && r.fromDay <= s.day && (r.toDay === null || r.toDay >= s.day) && !s.modifiers.some(m => m.kind === 'absent' && m.day === s.day && m.who === id)); }
export function preparePatternBlocked(s: CompanyState, sourceId: string, replacePatternId?: string): string | null {
  const blocked = morningBlocked(s); if (blocked) return blocked;
  if (!patternSources(s).some(p => p.id === sourceId)) return 'Choose an actual delivered piece as the pattern.';
  if (s.patterns?.some(p => p.sourceId === sourceId)) return 'That piece already has a pattern.';
  if (!working(s, 'h2')) return 'Tomas must be working today.';
  if (s.cash < PATTERN_COST) return 'Preparing a pattern costs 50 cr.';
  if (replacePatternId && (!s.patterns?.some(p => p.id === replacePatternId && p.status === 'ready') || s.patternTeaching?.some(t => t.patternId === replacePatternId && t.completedAt === null))) return 'Only an idle ready pattern can be replaced.';
  if ((s.patterns?.length ?? 0) >= MAX_PATTERNS && !replacePatternId) return 'Choose a ready pattern to replace. The studio has room for three.';
  return null;
}
export function teachPatternBlocked(s: CompanyState, patternId: string, resourceId: string): string | null {
  const blocked = morningBlocked(s); if (blocked) return blocked;
  if (s.day >= RULES.days - 1) return 'There is no next morning to use this pattern.';
  if (!s.patterns?.some(p => p.id === patternId && p.status === 'ready')) return 'Prepare the pattern before teaching it.';
  const noor = working(s, resourceId);
  if (noor?.role !== 'junior' || noor.name !== RULES.staff.junior.name || !working(s, 'h2')) return 'Tomas and Noor must both be working today.';
  if (noor.inheritedPatterns?.includes(patternId) || s.patternTeaching?.some(t => t.patternId === patternId && t.resourceId === resourceId)) return 'Noor already has this pattern lesson.';
  if (patternAppointments(s, s.day).some(t => [t.learnerId, t.mentorId].some(id => id === resourceId || id === 'h2')) || mentoringAppointments(s, s.day).some(t => [t.learnerId, t.mentorId].some(id => id === resourceId || id === 'h2'))) return 'One of them already has a morning appointment.';
  return null;
}
export function patternReduction(s: CompanyState, j: Pick<Job, 'contractId' | 'launchIndex' | 'stage'>, r: Resource, day: number): number {
  if (!patternForWork(s, j, r, day)) return 0;
  if (!hasCareerRules(s.rulesVersion)) return PATTERN_REDUCTION;
  const actual = s.jobs.find(job => job.contractId === j.contractId && job.launchIndex === j.launchIndex);
  return actual ? Math.min(PATTERN_REDUCTION, Math.max(0, profileBriefMinutes(s, actual.templated, actual.effort) - 5)) : 0;
}
export function patternForWork(s: CompanyState, j: Pick<Job, 'contractId' | 'launchIndex' | 'stage'>, r: Resource, day: number): StudioPattern | undefined {
  if (j.stage !== 'brief' || r.kind !== 'human') return undefined;
  const contract = s.contracts.find(c => c.id === j.contractId);
  const piece = (hasCareerRules(s.rulesVersion) && contract ? contractProof(contract) : contract?.project?.proof)?.design.pieces[j.launchIndex];
  if (!piece) return undefined;
  return (s.patterns ?? []).find(p => p.status === 'ready' && patternMatches(p.piece, piece) && (r.role === 'lead' || r.inheritedPatterns?.includes(p.id) || s.patternTeaching?.some(t => t.patternId === p.id && t.resourceId === r.id && t.completedAt !== null && t.day < day)));
}
export interface CompatiblePattern { id: string; sourceId: string; title: string; design: DesignSpec; briefReduction: number; briefReductions: number[] }
export function compatiblePatterns(s: CompanyState, brief: DesignBrief): CompatiblePattern[] {
  if (!hasAuthorshipRules(s.rulesVersion) || (!hasCareerRules(s.rulesVersion) && !('projectId' in brief))) return [];
  const sources = patternSources(s);
  return (s.patterns ?? []).flatMap(pattern => {
    if (pattern.status !== 'ready') return [];
    const design = structuredClone(brief.defaultDesign);
    let adopted = false;
    const briefReductions = design.pieces.map(() => 0);
    for (const [index, piece] of design.pieces.entries()) if (piece.kind === pattern.piece.kind) {
      const { headline: _headline, ...style } = structuredClone(pattern.piece);
      design.pieces[index] = { ...style, copy: [...piece.copy], treatment: piece.treatment };
      adopted = true;
      briefReductions[index] = Math.min(PATTERN_REDUCTION, Math.max(0, (brief.briefingMinutes?.[index] ?? RULES.effort.brief) - 5));
    }
    if (!adopted || validateDesign(brief, design).length) return [];
    return [{ id: pattern.id, sourceId: pattern.sourceId, title: sources.find(p => p.id === pattern.sourceId)?.title ?? 'A studio pattern', design, briefReduction: Math.max(...briefReductions), briefReductions }];
  });
}
