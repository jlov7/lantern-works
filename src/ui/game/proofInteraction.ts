import { LAYOUTS, fitMotif, type DesignPiece, type MotifId, type LayoutId, type MotifPlacement } from '../../engine/design';

export interface ProofPoint { x: number; y: number }

/** Keep the grab point under the pointer, then use the same fit as the page tools. */
export function dragMotif(layout: LayoutId, motif: MotifPlacement, start: ProofPoint, current: ProofPoint): MotifPlacement {
  return fitMotif(layout, { ...motif, x: motif.x + current.x - start.x, y: motif.y + current.y - start.y });
}

/** A small extra mark leaves the photograph visible; existing artwork stays exact. */
export function addedMotif(piece: DesignPiece, id: MotifId): MotifPlacement {
  const art = LAYOUTS[piece.layout].art;
  const decorative = id !== 'first-photo' && piece.motifs.some(motif => motif.id === 'first-photo');
  return fitMotif(piece.layout, { id, x: art.x + (decorative ? 8 : art.width / 2), y: art.y + (decorative ? art.height - 8 : art.height / 2), scale: decorative ? 1 : 3, rotation: 0 });
}
