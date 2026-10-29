import { useMemo, useState } from 'react';
import { adaptCareerContinuation, buildContinuation } from '../../engine/continuation';
import { careerStage } from '../../engine/career';
import { hasCareerRules } from '../../engine/versions';
import { patternSources } from '../../engine/patterns';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState, RunConfig } from '../../engine/types';
import { Modal } from '../Dialogs';
import { credits } from '../format';
import { DesignedArtwork } from './DesignedArtwork';
import '../../styles/continuing-studio.css';

export function ContinueStudio({ state, onClose, onContinue }: { state: CompanyState; onClose: () => void; onContinue: (config: RunConfig, rulesVersion: string) => void }) {
  const pieces = useMemo(() => patternSources(state).toReversed(), [state]);
  const [selected, setSelected] = useState(() => pieces.slice(0, 3).map(p => p.id));
  const season = (state.config.continuation?.season ?? 1) + 1;
  const [seed, setSeed] = useState(`${state.config.seed.slice(0, 30)}-next`);
  const [adapt, setAdapt] = useState(false);
  const oldStudio = state.rulesVersion === 'lantern-6.0.0' || state.rulesVersion === 'lantern-6.1.0';
  const stage = careerStage(state);
  const nextStage = stage === 'opening' ? 'practice' : stage === 'practice' ? 'legacy' : stage ? 'open' : adapt ? state.config.continuation ? 'legacy' : 'practice' : null;
  const next = useMemo(() => {
    try { return { config: adapt ? adaptCareerContinuation(state, selected, seed) : buildContinuation(state, selected, seed), error: null }; }
    catch (error) { return { config: null, error: error instanceof Error ? error.message : 'The studio could not continue.' }; }
  }, [state, selected, seed, adapt]);
  return <Modal title={`A new season for your studio`} onClose={onClose} wide>
    {oldStudio && <fieldset className="continuation-rules"><legend>How this studio continues</legend><label><input type="radio" name="continuation-rules" checked={!adapt} onChange={() => setAdapt(false)} /> Continue under the original rules</label><label><input type="radio" name="continuation-rules" checked={adapt} onChange={() => setAdapt(true)} /> Enter the career: {state.config.continuation ? 'legacy' : 'practice'}</label><p className="small">Entering the career closes earlier one-time chapters. Missing historical outcomes are marked unknown. Your original season stays unchanged.</p></fieldset>}
    {nextStage && <p className="continuation-purpose">{nextStage === 'practice' ? 'Next: build a practice with Clem’s archive, Mara’s market and Ivo’s independent workshop.' : nextStage === 'legacy' ? 'Next: decide what to leave with the neighbourhood through shared archives, a table and repair knowledge.' : 'The authored career ends here. Open studio continues with recurring commissions and gatherings, without more story chapters.'}</p>}
    <p>The same studio, with another season ahead. Choose up to three pieces to keep close at hand. Their patterns come with them.</p>
    <dl className="continuation-facts"><div><dt>Opening cash</dt><dd>{credits(state.cash)}</dd></div><div><dt>The studio</dt><dd>Your equipment, current AI desk and Noor’s completed skills carry on.</dd></div><div><dt>The street</dt><dd>Kept promises and broken ones stay part of the relationship.</dd></div></dl>
    <p className="small">The new season opens with this balance, then pays its first morning’s running costs. It receives no new starting grant. The season you just finished stays in your saves.</p>
    <p className="small">The offer menu resets for the new season. Ongoing staff, equipment and recurring costs carry on, along with the street’s relationships. Prepared patterns carry only with the pieces you keep. {hasCareerRules(state.rulesVersion) || adapt ? 'Featured-work choices start empty.' : ''}</p>
    <fieldset className="continuation-pieces"><legend>Keep in the studio · {selected.length} of 3</legend>
      {pieces.length ? <div className="continuation-grid">{pieces.map(piece => <label key={piece.id} className={`continuation-piece${selected.includes(piece.id) ? ' is-kept' : ''}`}><input type="checkbox" checked={selected.includes(piece.id)} disabled={!selected.includes(piece.id) && selected.length === 3} onChange={event => setSelected(ids => event.target.checked ? [...ids, piece.id] : ids.filter(id => id !== piece.id))} /><DesignedArtwork piece={piece.design} copy={piece.copy} label={piece.title} /><span>{CAST_BY_ID[piece.castId]?.name} · Season {piece.sourceSeason}</span></label>)}</div> : <p>No authored commission was delivered this season. You can still carry the studio and its relationships forward.</p>}
    </fieldset>
    <label className="continuation-seed">Next season’s street seed<input value={seed} maxLength={40} onChange={event => setSeed(event.target.value)} /></label>
    <p className="small">The seed sets the next visits and surprises. Returning commissions also depend on what happened here.</p>
    {next.error && <p role="alert">{next.error}</p>}
    <button type="button" className="btn btn-primary" disabled={!next.config} onClick={() => next.config && onContinue(next.config, adapt ? 'lantern-7.0.0' : state.rulesVersion)}>{nextStage === 'open' ? 'Continue in open studio' : `Open season ${season}`}</button>
  </Modal>;
}
