import { designSchema, fitMotif, validateDesign } from '../../engine/design';
import { ordinaryBrief, ordinaryIntentions } from '../../engine/ordinary';
import { RULES } from '../../engine/rules';
import { reactionTo } from '../../engine/selectors';
import { applyCommand, createRun, stageEffort } from '../../engine/sim';
import { z } from 'zod/mini';
import { castName } from '../format';
import { FIRST_SEASON } from '../screens/firstSeason';
import { portfolioAt } from './portfolio';

const morning = createRun(FIRST_SEASON);
const request = morning.requests.find(item => item.castId === 'clem')!;
const reaction = reactionTo(morning, request);
if (reaction.kind !== 'buy') throw new Error('Clem must have a first-morning offer.');
export const firstOrderOffer = reaction.offer;
export const firstOrderBrief = ordinaryBrief(request, firstOrderOffer)!;
const waitingBuyers = morning.requests.filter(item => item !== request && reactionTo(morning, item).kind === 'buy');
export const firstOrderBuyers = waitingBuyers.length;

const editions = {
  room: { title: 'The room', maker: 'h1', makerName: 'Ada', intention: 'clem-room', layout: 'gallery' },
  band: { title: 'The musicians', maker: 'h2', makerName: 'Tomas', intention: 'clem-band', layout: 'headline' },
} as const;
const editionIds = ['room', 'band'] as const;

const orderSession = z.strictObject({
  step: z.enum(['street', 'design', 'press', 'lift', 'window']),
  edition: z.enum(editionIds),
  design: designSchema,
});
export type FirstOrder = z.infer<typeof orderSession>;
const storageKey = 'lantern.first-order.v1';
const production = stageEffort(morning, { stage: 'produce', templated: false, need: request.need }, 'human');

export const firstOrderEditions = editionIds.map(id => ({
  id,
  ...editions[id],
  minutes: Math.ceil(production * RULES.makers[editions[id].maker]!.producePercent / 100),
}));

export function selectFirstEdition(draft: FirstOrder, edition: FirstOrder['edition']): FirstOrder {
  const piece = draft.design.pieces[0]!;
  const { layout } = editions[edition];
  const motifs = firstOrderBrief.defaultDesign.pieces[0]!.motifs.map(motif => fitMotif(layout, motif));
  return { ...draft, edition, design: { ...draft.design, pieces: [{ ...piece, layout, motifs }] } };
}

export function freshFirstOrder(): FirstOrder {
  return { step: 'street', edition: 'room', design: firstOrderBrief.defaultDesign };
}

export function loadFirstOrder(): FirstOrder {
  try {
    const saved = orderSession.safeParse(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'));
    if (saved.success && !validateDesign(firstOrderBrief, saved.data.design).length) return selectFirstEdition(saved.data, saved.data.edition);
  } catch { /* Invalid or unavailable storage opens a new proof. */ }
  return freshFirstOrder();
}

export function saveFirstOrder(draft: FirstOrder) {
  try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* The proof is still playable. */ }
}

export function clearFirstOrder() {
  try { sessionStorage.removeItem(storageKey); } catch { /* The season was saved independently. */ }
}

export function bookFirstOrder(draft: FirstOrder) {
  const { maker, intention } = editions[draft.edition];
  return applyCommand(morning, { type: 'accept', requestId: request.id, maker, intention, design: draft.design });
}

export function deliverFirstOrder(draft: FirstOrder) {
  const booked = bookFirstOrder(draft);
  if (booked.error) return null;
  const day = applyCommand(booked.state, { type: 'runDay' });
  if (day.error) return null;
  const piece = portfolioAt(day.state).find(item => item.requestId === request.id && item.complete);
  if (!piece?.brief.proof || piece.deliveredAt === null) return null;
  const reaction = ordinaryIntentions(request.castId, request.briefId).find(item => item.id === editions[draft.edition].intention)!;
  const turnedAway = waitingBuyers.filter(buyer => day.state.requests.find(item => item.id === buyer.id)?.status === 'walked').map(buyer => castName(buyer.castId));
  return { state: day.state, piece, response: reaction.response, turnedAway };
}
