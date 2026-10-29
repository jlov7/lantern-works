import type { OfferSpec, Request, RunConfig } from '../../engine/types';
import { BriefArtwork, CampaignArtwork } from '../portfolio/Artwork';
import { briefFor } from './portfolio';

export function BriefPreview({ request, offer, config, rulesVersion }: { request: Request; offer?: OfferSpec; config?: RunConfig; rulesVersion?: string }) {
  return <details className="brief-preview"><summary><CampaignArtwork brief={briefFor(request, offer, config, undefined, rulesVersion)} miniature /><span>View the launch piece</span></summary><BriefArtwork request={request} offer={offer} config={config} rulesVersion={rulesVersion} /></details>;
}
