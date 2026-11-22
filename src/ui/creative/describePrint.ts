import { MOTIFS, type BriefCopy, type DesignPiece } from '../../engine/design';

export function describePrint(piece: DesignPiece, copy: BriefCopy[], label?: string): string {
  const selectedCopy = copy.filter(line => piece.copy.includes(line.id));
  return [label, ...selectedCopy.map(c => c.text), piece.headline, ...piece.motifs.map(m => piece.kind === 'portrait' && m.id === 'bench' ? 'Hugo at his watchmaker’s bench' : MOTIFS[m.id])].filter(Boolean).join('. ');
}
