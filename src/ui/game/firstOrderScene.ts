import { bookFirstOrder, firstOrderMorning, selectFirstEdition, type FirstOrder } from './firstOrder';
import type { Shot } from './signatureCamera';
import { type Bay, type Vec3 } from './signatureTargets';
import { miniatureScene } from '../miniature/adapter';
import { frameAt } from '../timeline';

export type FirstOrderStage = {
  shot: Shot;
  selected: Bay;
  compactRead?: boolean;
  bayPosters: Record<Bay, string> | null;
  hung: { bay: Bay; key: string } | null;
  compare: Record<Bay, string> | null;
  queue: { requestId: string; castId: string; at: Vec3 }[];
  leavers: string[];
  leaverBays?: Readonly<Partial<Record<string, Bay>>>;
  clem: Vec3;
};
const CLEM_DOOR: Vec3 = [.45, 0, 5.70];
const SHOTS = { street: 'street', design: 'choose', press: 'press', lift: 'press', window: 'read' } satisfies Record<FirstOrder['step'], Shot>;

export function firstOrderBayPoster(draft: FirstOrder, bay: Bay) {
  const design = selectFirstEdition(draft, bay).design.pieces[0]!;
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(JSON.stringify(design))) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return { key: `edition:${bay}:${(hash >>> 0).toString(16).padStart(8, '0')}`, design };
}

export function firstOrderMorningFrame() {
  return frameAt(firstOrderMorning, firstOrderMorning, 0);
}

type Extra = {
  compare?: Record<Bay, string>;
  leavers?: string[];
  leaverBays?: FirstOrderStage['leaverBays'];
  shot?: Shot;
  deliveredKey?: string;
};
export function firstOrderRoom(draft: FirstOrder, step: FirstOrder['step'], extra: Extra = {}) {
  const pending = step === 'street' || step === 'design';
  const state = pending ? firstOrderMorning : bookFirstOrder(draft).state;
  const scene = miniatureScene(frameAt(state, state, 0), state);
  const bayPosters = { room: firstOrderBayPoster(draft, 'room').key, band: firstOrderBayPoster(draft, 'band').key };
  const stage: FirstOrderStage = {
    shot: extra.shot ?? (extra.compare ? 'street' : SHOTS[step]),
    selected: draft.edition,
    bayPosters,
    hung: step === 'window' && extra.deliveredKey ? { bay: draft.edition, key: extra.deliveredKey } : null,
    compare: step === 'window' ? extra.compare ?? null : null,
    queue: step === 'window' && !extra.compare ? [] : scene.neighbours.filter(item => item.n.castId !== 'clem')
      .map(item => ({ requestId: item.n.requestId, castId: item.n.castId, at: item.at })),
    leavers: pending || (step === 'window' && !extra.compare) ? [] : extra.leavers ?? [],
    leaverBays: extra.leaverBays,
    clem: CLEM_DOOR,
  };
  return { scene, stage };
}

export function firstOrderStage(draft: FirstOrder, step: FirstOrder['step'], extra: Extra = {}): FirstOrderStage {
  return firstOrderRoom(draft, step, extra).stage;
}
