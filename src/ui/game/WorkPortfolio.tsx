import { useMemo } from 'react';
import type { CompanyState } from '../../engine/types';
import { PortfolioGallery } from '../portfolio/PortfolioGallery';
import { useClock, type Playback } from './clock';
import { hasAuthorshipRules } from '../../engine/versions';
import { NeighbourhoodWalk } from '../neighbourhood/NeighbourhoodWalk';
import { FeaturedWork } from '../creative/FeaturedWork';

/** Reveal a piece when its delivery is on screen, without repainting the whole workspace each minute. */
export function WorkPortfolio({ state, play, onFeature, onUndo, canUndo, disabled }: { state: CompanyState; play: Playback | null; onFeature: (pieceIds: string[]) => string | null; onUndo: () => void; canUndo: boolean; disabled?: boolean }) {
  const deliveries = useMemo(() => play?.after.jobs.flatMap(job => job.deliveredAt === null ? [] : [job.deliveredAt]).sort((a, b) => a - b) ?? [], [play]);
  const minute = useClock(play?.clock ?? null, clock => play && !clock.done ? deliveries.findLast(time => time <= clock.t) ?? play.before.minute : state.minute);
  const shown = play && !play.clock.get().done ? play.after : state;
  return <>{hasAuthorshipRules(shown.rulesVersion) && <NeighbourhoodWalk state={shown} minute={minute} />}{(!play || play.clock.get().done) && <FeaturedWork state={state} onFeature={onFeature} onUndo={onUndo} canUndo={canUndo} disabled={disabled} />}<PortfolioGallery state={shown} minute={minute} /></>;
}
