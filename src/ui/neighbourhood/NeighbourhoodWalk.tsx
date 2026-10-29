import { useMemo } from 'react';
import type { CompanyState } from '../../engine/types';
import { streetDisplayAt } from '../game/streetDisplay';
import { CampaignArtwork } from '../portfolio/Artwork';
import { DesignedArtwork } from '../creative/DesignedArtwork';
import { useReducedMotion } from '../useReducedMotion';
import { NeighbourhoodScene } from './NeighbourhoodScene';

export function NeighbourhoodWalk({ state, minute = state.minute }: { state: CompanyState; minute?: number }) {
  const display = useMemo(() => streetDisplayAt(state, minute), [state, minute]);
  const reducedMotion = useReducedMotion();
  if (!display.locations.length && display.mode !== 'unfinished') return null;
  return <NeighbourhoodScene {...display} reducedMotion={reducedMotion} locations={display.locations.map(location => ({ ...location, earned: true, artwork: location.work ? <CampaignArtwork brief={location.work.brief} launch={location.work.launch} launches={location.work.launches} /> : <DesignedArtwork piece={location.carried!.design} copy={location.carried!.copy} label={location.title} /> }))} />;
}
