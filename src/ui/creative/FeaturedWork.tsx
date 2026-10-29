import { useState } from 'react';
import { featureablePieces, featurePiecesBlocked } from '../../engine/continuation';
import type { CompanyState } from '../../engine/types';
import { hasCareerRules } from '../../engine/versions';
import { CAST_BY_ID } from '../../engine/rules';
import { DesignedArtwork } from './DesignedArtwork';
import '../../styles/continuing-studio.css';

export function FeaturedWork({ state, onFeature, onUndo, canUndo = false, disabled = false }: { state: CompanyState; onFeature: (pieceIds: string[]) => string | null; onUndo: () => void; canUndo?: boolean; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  if (!hasCareerRules(state.rulesVersion)) return null;
  const pieces = featureablePieces(state);
  const selected = state.featuredPieceIds ?? [];
  return <section className="featured-work" aria-label="Featured work">
    <h2>At the studio window</h2>
    <p>Choose up to three delivered or retained pieces to feature. The complete season’s portfolio stays below. Choosing what to carry into another season is a separate decision.</p>
    {!pieces.length ? <p className="small">Delivered work will become available here.</p> : <details><summary>Choose featured work · {selected.length} of 3</summary>
      <fieldset className="continuation-pieces" disabled={disabled}><legend>Featured pieces · {selected.length} of 3</legend><div className="continuation-grid">{pieces.map(piece => <label className={`continuation-piece${selected.includes(piece.id) ? ' is-kept' : ''}`} key={piece.id}>
        <input type="checkbox" aria-label={`Feature ${piece.title}, ${CAST_BY_ID[piece.castId]?.name ?? piece.castId}, Season ${piece.sourceSeason}`} checked={selected.includes(piece.id)} disabled={!selected.includes(piece.id) && selected.length === 3} onChange={event => {
          const ids = event.target.checked ? [...selected, piece.id] : selected.filter(id => id !== piece.id);
          setError(featurePiecesBlocked(state, ids) ?? onFeature(ids));
        }} /><DesignedArtwork piece={piece.design} copy={piece.copy} label={piece.title} /><span>{CAST_BY_ID[piece.castId]?.name} · Season {piece.sourceSeason}</span>
      </label>)}</div></fieldset>
    </details>}
    {error && <p role="alert">{error}</p>}
    {canUndo && <button type="button" className="btn" disabled={disabled} onClick={() => { onUndo(); setError(null); }}>Undo featured-work change</button>}
  </section>;
}
