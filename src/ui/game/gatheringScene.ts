import { nightResult } from '../../engine/projects';
import type { CompanyState } from '../../engine/types';
import { portfolioAt, projectSceneAt } from './portfolio';

/** A staged host is an authored role, not an attendance or turnout record. */
export function gatheringSceneAt(state: CompanyState, minute = state.minute) {
  const night = projectSceneAt(state, minute).night;
  const result = nightResult(state, minute);
  const delivered = portfolioAt(state, minute);
  const contributions = result.contributors.filter(record => record.earned).map(record => ({
    castId: record.contract.castId,
    projectId: record.id,
    pieceIds: delivered.filter(piece => piece.contractId === record.contract.id).map(piece => piece.jobId),
  }));
  const hosts = night.mode === 'delivered' || night.mode === 'compromised' ? result.contributors.filter(record => record.earned && record.host && !(record.approach === 'quiet-sendoff' && record.contract.castId === 'hugo')).map(record => ({
    castId: record.contract.castId,
    projectId: record.id,
  })) : [];
  return { status: night.mode, deliveredPieceIds: result.project ? night.pieces.map(piece => piece.jobId) : [], contributions, hosts, attendees: null } as const;
}
