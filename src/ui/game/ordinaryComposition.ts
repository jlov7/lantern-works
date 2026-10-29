import { fitMotif, type CreativeIntention, type DesignBrief, type DesignSpec } from '../../engine/design';
import { ordinaryBrief } from '../../engine/ordinary';
import { counterFor, reactionTo } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { hasCreativePromiseRules } from '../../engine/versions';

export interface OrdinaryDraft { design: DesignSpec; intention?: CreativeIntention }

/** Keep an edited proof only while the current offer still promises that print. */
export function ordinaryDraftFor(state: CompanyState, requestId: string, draft: OrdinaryDraft | undefined, counter = false): OrdinaryDraft | undefined {
  if (!draft || !hasCreativePromiseRules(state.rulesVersion)) return undefined;
  const request = state.requests.find(request => request.id === requestId)!;
  const reaction = reactionTo(state, request);
  const offer = reaction.kind === 'buy' ? reaction.offer : counter ? state.menu[counterFor(state, request)?.offerIndex ?? -1] : undefined;
  return offer && ordinaryBrief(request, offer) ? draft : undefined;
}

/** A quick starting proposal, with the customer's words and the player's own line kept intact. */
export function ordinaryComposition(brief: DesignBrief, design: DesignSpec, option: number): DesignSpec {
  const layout = option === 0 ? 'gallery' : 'headline';
  return { ...design, pieces: design.pieces.map((piece, index) => {
    const motifs = piece.motifs.length ? piece.motifs : brief.defaultDesign.pieces[index]!.motifs;
    return { ...piece, layout, motifs: motifs.map(motif => fitMotif(layout, motif)) };
  }) };
}
