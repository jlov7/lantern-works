import type { DesignPiece } from '../../engine/design';
import { creativePromise, ordinaryIntentions } from '../../engine/ordinary';
import { projectFor } from '../../engine/projects';
import type { CompanyState, CreativePromise, ProjectId } from '../../engine/types';

/** Notice something printed on the actual piece, without inventing a preference or a crowd. */
export function proofObservation(castId: string, piece: DesignPiece): string {
  const line = piece.headline?.trim();
  if (line) {
    if (castId === 'clem') return `Clem reads your line aloud: “${line}” He tries it once more, quieter.`;
    if (castId === 'mara') return `Mara reads “${line}” and rests the print against the counter.`;
    if (castId === 'hugo') return `Hugo reads “${line}” through the lower half of his glasses. He keeps a finger under the words.`;
    if (castId === 'ivo') return `Ivo reads “${line}” and turns the piece towards the workshop door.`;
  }
  if (castId === 'clem') return piece.palette === 'midnight'
    ? 'Clem tips the dark paper towards the window. “Like the room before the first set.”'
    : piece.motifs.some(motif => motif.id === 'first-photo') ? 'Clem looks into the old photograph. “I can still hear that night.”' : 'Clem holds the print beside the door. “That’s where this one goes.”';
  if (castId === 'mara') return piece.layout === 'headline'
    ? 'Mara reads the heading from the far side of the counter. “There. I can see it from here.”'
    : 'Mara clears a space beside the till and sets the print where she can see it.';
  if (castId === 'hugo') return piece.motifs.some(motif => motif.id === 'bench')
    ? 'Hugo looks at the bench in the picture, then at his own. “That drawer still sticks.”'
    : 'Hugo studies the small details, holding the print by its edges.';
  if (castId === 'ivo') return 'Ivo holds the piece against the door, steps back, then moves it a little higher.';
  return 'The finished piece leaves the studio.';
}

/** A booked commission remembers its own source, even if another ordinary piece arrives later. */
export function commissionInspiration(state: CompanyState, id: ProjectId): CreativePromise | null {
  const booked = state.contracts.find(contract => contract.project?.id === id);
  if (booked) return booked.project!.creativePromise ?? null;
  if (id === 'lantern-night') return null;
  const castId = projectFor(state, id).castId;
  if (state.lostCast.includes(castId)) return null;
  return creativePromise(state, castId) ?? state.config.continuation?.relationships.find(relationship => relationship.castId === castId)?.creativePromise ?? null;
}

export function intentionFor(promise: CreativePromise) {
  return ordinaryIntentions(promise.castId, promise.briefId).find(option => option.id === promise.intention);
}

/** A planned match or a lesson is not evidence of use on a delivered print. */
export function deliveredPatternUses(state: CompanyState, patternId: string): number {
  return new Set(state.events.filter(event => event.type === 'pattern_used' && event.patternId === patternId && state.jobs.some(job => job.id === event.jobId && job.status === 'delivered' && job.deliveredAt !== null)).map(event => event.jobId)).size;
}
