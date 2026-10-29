import { approachFor, nightCalendar } from '../../engine/projects';
import type { CompanyState } from '../../engine/types';
import { castName, jobLabel } from '../format';

/** Keep a commission distinct from the same neighbour's ordinary work. */
export function promiseLabel(state: CompanyState, jobId: string, ordinary: 'launch' | 'customer' = 'launch'): string {
  const job = state.jobs.find(job => job.id === jobId)!;
  const contract = state.contracts.find(contract => contract.id === job.contractId)!;
  if (!contract.project) return ordinary === 'customer' ? castName(job.castId) : jobLabel(job.id, job.castId, contract.offer.launches);
  const approach = approachFor(state, contract.project.approach);
  const piece = contract.project.id === 'lantern-night' ? `${nightCalendar(state).name}, ${approach.name}` : approach.artifact;
  return `${castName(job.castId)}: ${piece}${contract.offer.launches > 1 ? `, launch ${job.launchIndex + 1} of ${contract.offer.launches}` : ''}`;
}
