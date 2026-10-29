import { CAST_BY_ID } from '../../engine/rules';
import { featuredPieces } from '../../engine/continuation';
import type { CarriedPiece, CompanyState } from '../../engine/types';
import { gatheringSceneAt } from './gatheringScene';
import { artifactLabel, portfolioAt, projectSceneAt, type WorkPiece } from './portfolio';

export interface StreetDisplayPiece {
  id: string;
  placeId: string;
  castId: string;
  name: string;
  place: string;
  title: string;
  line: string;
  contributors?: string[];
  privateKeepsake?: boolean;
  eventPiece?: boolean;
  featured?: boolean;
  lent?: boolean;
  work?: WorkPiece;
  carried?: CarriedPiece;
}

/** A completed gathering uses only its frozen contributors and delivered event pieces. */
export function streetDisplayAt(state: CompanyState, minute = state.minute) {
  const scene = projectSceneAt(state, minute);
  const night = scene.night;
  const complete = night.mode === 'delivered' || night.mode === 'compromised';
  const unfinished = night.mode === 'partial' || night.mode === 'failed';
  const mode = complete ? night.approach === 'courtyard' ? 'courtyard' : night.careful ? 'open-studios' : 'trail' : unfinished ? 'unfinished' : 'studio';
  const locations: StreetDisplayPiece[] = [];
  const seen = new Set<string>();
  const addLent = (work: WorkPiece) => {
    const contract = state.contracts.find(contract => contract.id === work.contractId);
    const carried = contract?.project?.lentPiece;
    if (!carried || locations.some(location => location.placeId === `lent-${work.contractId}`)) return;
    const commissioner = CAST_BY_ID[carried.castId]?.name ?? carried.castId;
    locations.push({ id: `lent-${work.contractId}-${carried.id}`, placeId: `lent-${work.contractId}`, castId: carried.castId, name: commissioner, place: 'Clem’s archive', title: carried.title, line: `Lent from Season ${carried.sourceSeason}. Originally commissioned by ${commissioner}. The retained artwork is shown alongside the new caption and invitation.`, carried, lent: true });
  };
  const add = (work: WorkPiece) => {
    const event = work.brief.project?.id === 'lantern-night';
    const key = event ? work.jobId : work.castId;
    if (seen.has(key)) return;
    seen.add(key);
    const cast = CAST_BY_ID[work.castId];
    const privateKeepsake = work.castId === 'hugo' && work.brief.project?.approach === 'quiet-sendoff';
    locations.push({ id: work.jobId, placeId: key, castId: work.castId, name: cast?.name ?? 'The neighbourhood', place: event ? night.name : privateKeepsake ? 'Hugo’s keepsake' : cast?.business ?? night.name, privateKeepsake, eventPiece: event, title: artifactLabel(work.brief, work.launch), line: `Delivered on Day ${work.day! + 1}. ${work.launches > 1 ? `Piece ${work.launch} of ${work.launches}. ` : ''}${work.route}`, ...(event && complete ? { contributors: [...new Set(night.contributors.map(piece => piece.castId))] } : {}), work });
    addLent(work);
  };
  if (complete || unfinished) {
    night.pieces.forEach(add);
    night.contributors.toReversed().forEach(add);
  } else {
    const pieces = portfolioAt(state, minute);
    pieces.sort((a, b) => b.deliveredAt! - a.deliveredAt! || b.jobId.localeCompare(a.jobId)).forEach(add);
    for (const carried of state.config.continuation?.pieces ?? []) {
      if (seen.has(carried.castId)) continue;
      seen.add(carried.castId);
      const cast = CAST_BY_ID[carried.castId];
      locations.push({ id: carried.id, placeId: carried.castId, castId: carried.castId, name: cast?.name ?? 'The neighbourhood', place: cast?.business ?? 'Lantern Works', title: carried.title, line: `Kept from Season ${carried.sourceSeason}. This is the composition you carried into the studio.`, carried });
    }
    locations.sort((a, b) => a.place.localeCompare(b.place) || a.placeId.localeCompare(b.placeId));
  }
  const featured = featuredPieces(state).filter(piece => !state.jobs.some(job => job.id === piece.id && (job.deliveredAt === null || job.deliveredAt > minute)));
  if (featured.length && !complete && !unfinished) locations.length = 0;
  for (const carried of featured) {
    if (locations.some(location => location.id === carried.id)) continue;
    const name = CAST_BY_ID[carried.castId]?.name ?? carried.castId;
    locations.push({ id: carried.id, placeId: `featured-${carried.id}`, castId: carried.castId, name, place: 'Studio window', title: carried.title, line: `Featured at the studio. Commissioned by ${name} in Season ${carried.sourceSeason}. This display choice earns no gathering role.`, carried, featured: true });
  }
  const eventName = complete ? night.name : unfinished ? `${night.name}: unfinished` : night.mode === 'ready' || night.mode === 'preparing' ? night.label : 'Work on the street';
  const eventNote = night.mode === 'compromised' ? 'The original programme was delivered. The extra change was declined.' : undefined;
  return { mode, eventName, eventNote, locations, hosts: gatheringSceneAt(state, minute).hosts } as const;
}
