import { PROJECTS, projectFor, type ProjectRecord } from '../../engine/projects';
import type { CompanyState, ProjectContribution, ProjectTerms } from '../../engine/types';
import { castName } from '../format';

/** Only contributions frozen into this quote, from work already completed. */
export function nightContributions(project: ProjectTerms, records: (Pick<ProjectRecord, 'id' | 'approach' | 'earned'> & Partial<Pick<ProjectRecord, 'contribution'>>)[], state?: Pick<CompanyState, 'config' | 'rulesVersion'>): { name: string; detail: string }[] {
  if (project.id !== 'lantern-night') return [];
  return project.contributors.flatMap(id => {
    const record = records.find(record => record.id === id && record.earned);
    if (!record) return [];
    const castId = state ? projectFor(state, id).castId : PROJECTS[id].castId;
    if (record.contribution) return [{ name: castName(castId), detail: contributionLine(castName(castId), record.contribution, project.approach) }];
    let detail: string;
    switch (record.approach) {
      case 'first-night': detail = project.approach === 'courtyard' ? 'Clem’s archive cuts courtyard finishing by 60 min.' : 'Clem lends the archive and can host.'; break;
      case 'new-band': detail = project.approach === 'trail' ? 'Clem’s programme design cuts briefing by 15 min per launch.' : 'Clem can host, with the completed band poster.'; break;
      case 'weekly-rhythm': detail = 'Mara’s completed bakery series cuts materials by 100 cr.'; break;
      case 'market-debut': detail = 'Mara can host, with the completed market banner.'; break;
      case 'quiet-sendoff': detail = castId === 'ivo' ? 'Ivo’s signed workshop can host the trail.' : 'Hugo contributes his portrait, without opening the workshop.'; break;
      case 'open-bench': detail = castId === 'ivo' ? 'Ivo’s repair workshop is available to host.' : 'Hugo’s apprentice workshop is available to host.'; break;
      default: return [];
    }
    return [{ name: castName(castId), detail }];
  });
}

/** These are the booked facts. The caller checks whether they have been earned. */
export function contributionLine(name: string, contribution: ProjectContribution, gathering?: ProjectTerms['approach']): string {
  const facts: string[] = [];
  if (contribution.host) facts.push(`${name} can host`);
  if (contribution.materialsReduction) facts.push(`gathering materials cost ${contribution.materialsReduction} cr less`);
  if (contribution.trailBriefReduction && (!gathering || gathering === 'trail')) facts.push(`each trail briefing takes ${contribution.trailBriefReduction} fewer minutes`);
  if (contribution.courtyardFinishReduction && (!gathering || gathering === 'courtyard')) facts.push(`courtyard finishing takes ${contribution.courtyardFinishReduction} fewer minutes`);
  return facts.length ? `${facts.join('; ')}.` : `${name} contributes the finished work without hosting.`;
}
