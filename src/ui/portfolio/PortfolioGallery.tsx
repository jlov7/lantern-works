import { useId, useMemo, useState } from 'react';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import { credits, dayLabel } from '../format';
import { artifactLabel, portfolioAt } from '../game/portfolio';
import { CampaignArtwork } from './Artwork';
import { DesignedArtwork } from '../creative/DesignedArtwork';

export function PortfolioGallery({ state, minute = state.minute, heading = 'The work you put into the world' }: { state: CompanyState; minute?: number; heading?: string }) {
  const id = useId();
  const pieces = useMemo(() => portfolioAt(state, minute).toReversed(), [state, minute]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pieces.find(p => p.jobId === selectedId) ?? pieces[0];
  const lent = selected && state.contracts.find(contract => contract.id === selected.contractId)?.project?.lentPiece;
  const customers = new Set(pieces.map(p => p.castId)).size;
  return <section className="portfolio" aria-labelledby={`${id}-heading`}>
    <header className="portfolio-heading"><div><p className="portfolio-eyebrow">Lantern Works · delivered work</p><h2 id={`${id}-heading`}>{heading}</h2></div><p className="portfolio-count">{pieces.length} {pieces.length === 1 ? 'launch' : 'launches'}<span>{customers} {customers === 1 ? 'neighbour' : 'neighbours'}</span></p></header>
    {!selected ? <p className="portfolio-empty">The first finished launch will go up here. Work earns its place when it leaves the studio.</p> : <>
      <div className="portfolio-selected" id={`${id}-selected`}>
        <figure className="portfolio-piece"><CampaignArtwork brief={selected.brief} launch={selected.launch} launches={selected.launches} /><figcaption>{selected.brief.event?.name ?? CAST_BY_ID[selected.castId]!.business} <span>· {dayLabel(selected.day!)}</span></figcaption></figure>
        <div className="portfolio-record" aria-live="polite" aria-atomic="true">
          <p className="portfolio-eyebrow">{dayLabel(selected.day!)} · Launch {selected.launch} of {selected.launches}</p>
          <h3>{artifactLabel(selected.brief, selected.launch)}</h3>
          <p className="portfolio-subject">{selected.brief.detail}</p>
          <dl>
            <div><dt>The original request</dt><dd>{selected.brief.request}</dd></div>
            <div><dt>The offer you made</dt><dd><strong>{selected.offer.name}</strong>. {selected.launches} {selected.launches === 1 ? 'launch' : 'launches'} for {credits(selected.price)}{selected.launches > 1 ? selected.offer.spacingDays ? `, ${selected.offer.spacingDays} days apart` : ', all released together' : ''}. Each ready within {selected.offer.turnaroundDays} {selected.offer.turnaroundDays === 1 ? 'day' : 'days'}. {selected.offer.style === 'templated' ? 'From the template kit.' : 'Custom work.'}</dd></div>
            <div><dt>Through the studio</dt><dd>{selected.route}.</dd></div>
            {selected.launches > 1 && <div><dt>This order, so far</dt><dd>{selected.deliveredInOrder} of {selected.launches} launches delivered. {selected.complete ? 'The whole promise is kept.' : 'This piece is delivered. The whole order is not yet complete.'}</dd></div>}
          </dl>
        </div>
      </div>
      {lent && <aside className="portfolio-loan" aria-label="Retained artwork on loan"><DesignedArtwork piece={lent.design} copy={lent.copy} label={lent.title} /><p><strong>Retained artwork on loan.</strong> Shown with this season’s new caption and invitation. Originally commissioned by {CAST_BY_ID[lent.castId]?.name} in Season {lent.sourceSeason}. Its artwork and copy are unchanged.</p></aside>}
      {pieces.length > 1 && <details className="portfolio-catalogue" open={pieces.length <= 6}>
        <summary>Browse all {pieces.length} delivered launches</summary>
        <ul aria-label="Choose a delivered launch">{pieces.map(piece => <li key={piece.jobId}><button type="button" className="portfolio-choice" data-portfolio-job={piece.jobId} aria-pressed={piece.jobId === selected.jobId} aria-controls={`${id}-selected`} onClick={() => setSelectedId(piece.jobId)}><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /><span><strong>{artifactLabel(piece.brief, piece.launch)}</strong><span>{CAST_BY_ID[piece.castId]!.name} · {dayLabel(piece.day!)}{piece.launches > 1 ? ` · ${piece.launch}/${piece.launches}` : ''}</span></span></button></li>)}</ul>
      </details>}
    </>}
  </section>;
}
