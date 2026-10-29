import { useId, useState } from 'react';
import { PALETTE_IDS, PALETTES, type DesignBrief } from '../../engine/design';
import type { CompatiblePattern } from '../../engine/patterns';
import { ordinaryIntentions } from '../../engine/ordinary';
import { CAST_BY_ID } from '../../engine/rules';
import { Modal } from '../Dialogs';
import { patternBriefingLine } from '../game/patternDisclosure';
import { ordinaryComposition, type OrdinaryDraft } from '../game/ordinaryComposition';
import { DesignedArtwork, DesignedPrint } from './DesignedArtwork';
import '../../styles/first-proof.css';

export function FirstProof({ castId, briefId, patterns = [], brief, draft, disabled, onChange }: {
  castId: string;
  briefId?: string;
  patterns?: CompatiblePattern[];
  brief: DesignBrief;
  draft: OrdinaryDraft;
  disabled: boolean;
  onChange: (draft: OrdinaryDraft) => void;
}) {
  const id = useId();
  const piece = draft.design.pieces[0]!;
  const [lineOpen, setLineOpen] = useState(!!piece.headline);
  const [inspecting, setInspecting] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const choices = ordinaryIntentions(castId, briefId);
  const changePiece = (patch: Partial<typeof piece>) => onChange({ ...draft, design: { ...draft.design, pieces: [{ ...piece, ...patch }] } });
  return <section className="first-proof" aria-labelledby={`${id}-heading`}>
    <h4 id={`${id}-heading`}>What should it say about this place?</h4>
    <div className="first-proof__table">
      <button type="button" className="first-proof__paper" aria-label="Inspect working proof" aria-haspopup="dialog" onClick={event => { event.currentTarget.focus(); setZoomed(false); setInspecting(true); }}><DesignedPrint piece={piece} copy={brief.pieces[0]!.copy} label={brief.pieces[0]!.title} /><span>Inspect print</span></button>
      <fieldset disabled={disabled} className="first-proof__directions"><legend>Tell {CAST_BY_ID[castId]!.name} what you have in mind</legend>
        {choices.map((choice, index) => <button type="button" key={choice.id} aria-pressed={draft.intention === choice.id} onClick={() => onChange({ design: ordinaryComposition(brief, draft.design, index), intention: choice.id })}>{choice.label}</button>)}
        <div className="first-proof__inks" role="group" aria-label="Choose paper and ink">{PALETTE_IDS.map(palette => <button key={palette} type="button" aria-label={PALETTES[palette].name} aria-pressed={piece.palette === palette} style={{ backgroundColor: PALETTES[palette].paper, color: PALETTES[palette].ink }} onClick={() => changePiece({ palette })}><span aria-hidden="true">Aa</span></button>)}</div>
      </fieldset>
    </div>
    {patterns.length > 0 && <fieldset className="first-proof__patterns" disabled={disabled}><legend>Start from a studio pattern</legend><p>Keep this customer's words. Savings apply when the maker knows the pattern.</p>{patterns.map(pattern => <div key={pattern.id}><button type="button" className="btn" onClick={() => onChange({ design: structuredClone(pattern.design) })}>Use {pattern.title}</button><p className="small">{patternBriefingLine(pattern.briefReductions, brief.pieces.map(piece => piece.title))}</p></div>)}<button type="button" className="btn btn-quiet" onClick={() => onChange({ design: structuredClone(brief.defaultDesign) })}>Use the standard proof</button></fieldset>}
    <details className="first-proof__own-line" open={lineOpen} onToggle={event => setLineOpen(event.currentTarget.open)}><summary>Add a line of your own</summary><label>Your line <span>{piece.headline?.length ?? 0}/64</span><input type="text" value={piece.headline ?? ''} maxLength={64} disabled={disabled} onChange={event => changePiece({ headline: event.target.value })} /></label></details>
    <p className="first-proof__promise">The customer’s words stay on the print. These choices are included in the quoted price and work.</p>
    {inspecting && <Modal title="Your working proof" onClose={() => setInspecting(false)}>
      <div className="first-proof-inspection">
        <div className="first-proof-inspection__tools">
          <button type="button" className="btn btn-quiet" aria-controls={`${id}-print`} aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? 'Fit print' : 'Zoom in'}</button>
          <p id={`${id}-inspection-help`}>{zoomed ? 'Scroll or use arrow keys to inspect.' : 'Zoom in to read the small print.'}</p>
        </div>
        <div id={`${id}-print`} className={`first-proof-inspection__viewport${zoomed ? ' is-zoomed' : ''}`} role="region" aria-label="Working proof" aria-describedby={`${id}-inspection-help`} tabIndex={0} onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const region = event.currentTarget;
          const movement: Record<string, [number, number]> = {
            ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40],
            PageUp: [0, -region.clientHeight], PageDown: [0, region.clientHeight],
            Home: [0, -region.scrollTop], End: [0, region.scrollHeight - region.scrollTop],
          };
          const delta = movement[event.key];
          if (!delta) return;
          event.preventDefault();
          region.scrollBy({ left: delta[0], top: delta[1], behavior: 'instant' });
        }}>
          <DesignedArtwork piece={piece} copy={brief.pieces[0]!.copy} label={brief.pieces[0]!.title} />
        </div>
      </div>
    </Modal>}
  </section>;
}
