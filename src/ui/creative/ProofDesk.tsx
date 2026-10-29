import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { LAYOUT_IDS, LAYOUTS, MOTIFS, PALETTE_IDS, PALETTES, TYPEFACE_IDS, TYPEFACES, TREATMENTS, fitMotif, motifFits, motifSize, quoteDesign, validateDesign, type DesignBrief, type DesignPiece, type DesignSpec, type MotifPlacement } from '../../engine/design';
import type { CompatiblePattern } from '../../engine/patterns';
import { DesignedArtwork } from './DesignedArtwork';
import { Motif } from './Motif';
import { patternBriefingLine } from '../game/patternDisclosure';
import { addedMotif, dragMotif, type ProofPoint } from '../game/proofInteraction';
import '../../styles/creative.css';

export interface ProofDeskProps { brief: DesignBrief; design: DesignSpec; onChange: (design: DesignSpec) => void; disabled?: boolean; focused?: boolean; onReview?: () => void; patterns?: CompatiblePattern[] }

const MODES = ['Page', 'Illustrations', 'Finish'] as const;
type ToolMode = typeof MODES[number];
interface Drag { pointer: number; piece: number; motif: number; layout: DesignPiece['layout']; start: ProofPoint; original: MotifPlacement; preview: MotifPlacement }

export function ProofDesk({ brief, design, onChange, disabled = false, focused = false, onReview, patterns = [] }: ProofDeskProps) {
  const uid = useId();
  const easel = useRef<HTMLDivElement>(null);
  const interaction = useRef<SVGSVGElement>(null);
  const capture = useRef<HTMLButtonElement | null>(null);
  const tools = useRef<HTMLDivElement>(null);
  const [pieceIndex, setPieceIndex] = useState(0);
  const [motifIndex, setMotifIndex] = useState(0);
  const [mode, setMode] = useState<ToolMode>('Page');
  const [drag, setDrag] = useState<Drag | null>(null);
  const activeDrag = useRef<Drag | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [tallEasel, setTallEasel] = useState(false);
  const [flowTools, setFlowTools] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      setTallEasel(easel.current!.getBoundingClientRect().height > window.innerHeight / 2);
      setFlowTools(window.innerHeight < 620 || parseFloat(getComputedStyle(document.documentElement).fontSize) > 20);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(easel.current!);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useLayoutEffect(() => { if (focused) tools.current!.scrollTop = 0; }, [mode, focused, pieceIndex]);
  const index = Math.min(pieceIndex, design.pieces.length - 1);
  const piece = design.pieces[index]!;
  const page = brief.pieces[index]!;
  const selectedIndex = Math.min(motifIndex, piece.motifs.length - 1);
  const selected = piece.motifs[selectedIndex];
  const preview = drag && !disabled && drag.piece === index && drag.layout === piece.layout ? { ...piece, motifs: piece.motifs.map((m, i) => i === drag.motif ? drag.preview : m) } : piece;
  const art = LAYOUTS[piece.layout].art;
  const motifName = (motif: MotifPlacement) => piece.kind === 'portrait' && motif.id === 'bench' ? 'Hugo at the bench' : MOTIFS[motif.id];
  const errors = validateDesign(brief, design);
  const extras = quoteDesign(brief, design);
  const cost = extras[index]!;
  const matchingPatterns = patterns;
  const hasFamily = brief.requirements.some(r => r.rule.kind === 'shared-palette');
  const change = (patch: Partial<DesignPiece>) => onChange({ ...design, pieces: design.pieces.map((p, i) => i === index ? { ...p, ...patch } : p) });
  const move = (patch: Partial<MotifPlacement>) => {
    if (!selected || disabled) return;
    const moved = fitMotif(piece.layout, { ...selected, ...patch });
    change({ motifs: piece.motifs.map((m, i) => i === selectedIndex ? moved : m) });
  };
  const select = (i: number) => { setMotifIndex(i); setMode('Illustrations'); };
  const point = (event: PointerEvent<HTMLButtonElement>): ProofPoint => {
    const matrix = interaction.current!.getScreenCTM()!;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  };
  const updateDrag = (next: Drag | null) => { activeDrag.current = next; setDrag(next); };
  const cancelDrag = () => {
    const current = activeDrag.current;
    updateDrag(null);
    if (current && capture.current?.hasPointerCapture(current.pointer)) capture.current.releasePointerCapture(current.pointer);
    capture.current = null;
  };
  const beginDrag = (event: PointerEvent<HTMLButtonElement>, i: number) => {
    if (disabled || !event.isPrimary || event.button !== 0 || activeDrag.current) return;
    select(i);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    capture.current = event.currentTarget;
    const motif = piece.motifs[i]!;
    updateDrag({ pointer: event.pointerId, piece: index, motif: i, layout: piece.layout, start: point(event), original: motif, preview: motif });
  };
  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = activeDrag.current;
    if (!current || current.pointer !== event.pointerId) return;
    updateDrag({ ...current, preview: dragMotif(current.layout, current.original, current.start, point(event)) });
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = activeDrag.current;
    if (!current || current.pointer !== event.pointerId) return;
    updateDrag(null);
    if (!cancel && !disabled && current.piece === index && current.layout === piece.layout) {
      const placed = dragMotif(current.layout, current.original, current.start, point(event));
      change({ motifs: piece.motifs.map((m, i) => i === current.motif ? placed : m) });
      setAnnouncement(`${motifName(placed)} placed at ${placed.x}, ${placed.y}.`);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    capture.current = null;
  };
  const moveWithKeys = (event: KeyboardEvent, i = selectedIndex) => {
    if (disabled) return;
    if (event.key === 'Escape' && activeDrag.current) { event.preventDefault(); cancelDrag(); setAnnouncement('Move cancelled.'); return; }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const motif = piece.motifs[i];
    if (!motif) return;
    const moved = fitMotif(piece.layout, { ...motif, x: motif.x + (event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0), y: motif.y + (event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0) });
    change({ motifs: piece.motifs.map((m, n) => n === i ? moved : m) });
  };
  return <section className={`proof-desk${focused ? ' proof-desk--focused' : ''}${focused && flowTools ? ' proof-desk--flow' : ''}`} aria-label="Creative proof desk">
    {!focused && <header className="proof-desk__heading"><h2>{brief.title}</h2><p>{brief.intention}</p></header>}
    {design.pieces.length > 1 && <nav className="proof-desk__pieces" aria-label="Choose a piece">{brief.pieces.map((p, i) => <button key={p.title} type="button" aria-pressed={index === i} onClick={() => { setPieceIndex(i); setMotifIndex(0); }}><span>0{i + 1}</span>{p.title}</button>)}</nav>}
    <div className="proof-desk__workspace">
      <div className={`proof-desk__easel${tallEasel ? ' is-tall' : ''}`} ref={easel} tabIndex={-1} aria-label="Current proof">
        <div className="proof-desk__paper-note"><span>{page.title}</span><span>Proof {index + 1} / {design.pieces.length}</span></div>
        <div className={`proof-desk__sheet${drag ? ' is-moving' : ''}`} onPointerDownCapture={event => { if (activeDrag.current && activeDrag.current.pointer !== event.pointerId) cancelDrag(); }}>
          <DesignedArtwork piece={preview} copy={page.copy} label={page.title} />
          <svg ref={interaction} className="proof-desk__interaction" viewBox="0 0 100 100" aria-hidden="true">
            {mode === 'Illustrations' && <rect className="proof-desk__picture-area" x={art.x} y={art.y} width={art.width} height={art.height} aria-hidden="true" />}
            {mode === 'Illustrations' && selected && <rect className="proof-desk__selection" x={preview.motifs[selectedIndex]!.x - motifSize(selected.scale) / 2} y={preview.motifs[selectedIndex]!.y - motifSize(selected.scale) / 2} width={motifSize(selected.scale)} height={motifSize(selected.scale)} rx=".8" />}
          </svg>
          {preview.motifs.map((motif, i) => { const size = motifSize(motif.scale); return <button key={i} type="button" className={`proof-desk__grab${mode === 'Illustrations' && selectedIndex === i ? ' is-selected' : ''}`} style={{ left: `${motif.x}%`, top: `${motif.y}%`, width: `${size}%`, height: `${size}%`, zIndex: selectedIndex === i ? 1 : 0 }} disabled={disabled} aria-label={`Arrange ${i + 1}. ${motifName(motif)}`} aria-pressed={selectedIndex === i} aria-describedby={`${uid}-drag-help`} onClick={() => select(i)} onFocus={() => select(i)} onKeyDown={event => moveWithKeys(event, i)} onPointerDown={event => beginDrag(event, i)} onPointerMove={continueDrag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)} />; })}
        </div>
        <p className="proof-desk__caption" id={`${uid}-drag-help`}>{disabled ? 'The approved composition.' : 'Drag an illustration. Use arrow keys for small moves.'}<span>Swipe the paper edges to scroll.</span></p>
        <div className="proof-desk__tray" role="tablist" aria-label="Proof tools">{MODES.map((name, i) => <button key={name} ref={node => { tabs.current[i] = node; }} id={`${uid}-tab-${name}`} type="button" role="tab" aria-selected={mode === name} aria-controls={`${uid}-panel-${name}`} tabIndex={mode === name ? 0 : -1} onClick={() => setMode(name)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (i + 1) % MODES.length : event.key === 'ArrowLeft' ? (i + MODES.length - 1) % MODES.length : event.key === 'Home' ? 0 : event.key === 'End' ? MODES.length - 1 : undefined; if (next === undefined) return; event.preventDefault(); setMode(MODES[next]!); tabs.current[next]?.focus(); }}>{name}</button>)}</div>
      </div>
      <div ref={tools} className="proof-desk__tools" role={focused ? 'region' : undefined} aria-label={focused ? `${mode} tools` : undefined} tabIndex={focused ? 0 : undefined}>
      <div role="tabpanel" id={`${uid}-panel-Page`} aria-labelledby={`${uid}-tab-Page`} hidden={mode !== 'Page'} tabIndex={0}>
      {matchingPatterns.length > 0 && <fieldset className="proof-desk__patterns" disabled={disabled}><legend>Start from a studio pattern</legend><p>This customer's words stay in place. Savings apply when the maker knows the pattern.</p>{matchingPatterns.map(pattern => <div key={pattern.id}><button type="button" onClick={() => onChange(structuredClone(pattern.design))}>Use {pattern.title}</button><p className="small">{patternBriefingLine(pattern.briefReductions, brief.pieces.map(piece => piece.title))}</p></div>)}<button type="button" onClick={() => onChange(structuredClone(brief.defaultDesign))}>Use the standard proof</button></fieldset>}
      <fieldset disabled={disabled}><legend className="proof-desk__tool-title">Set the page</legend>
        <div className="proof-desk__control"><span id={`${uid}-layout`}>Composition</span><div className="proof-desk__choices" role="group" aria-labelledby={`${uid}-layout`}>{LAYOUT_IDS.map(layout => <button key={layout} type="button" aria-pressed={piece.layout === layout} onClick={() => change({ layout, motifs: piece.motifs.map(m => fitMotif(layout, m)) })}><span className={`proof-desk__layout-mark proof-desk__layout-mark--${layout}`} aria-hidden="true"><i /><i /></span>{LAYOUTS[layout].name}</button>)}</div></div>
        <div className="proof-desk__control"><span id={`${uid}-palette`}>Paper & ink</span><div className="proof-desk__choices proof-desk__choices--palette" role="group" aria-labelledby={`${uid}-palette`}>{PALETTE_IDS.map(palette => <button key={palette} type="button" aria-pressed={piece.palette === palette} onClick={() => change({ palette })}><span className="proof-desk__swatch" aria-hidden="true" style={{ background: PALETTES[palette].paper, color: PALETTES[palette].ink }}><i style={{ background: PALETTES[palette].ink }} /><i style={{ background: PALETTES[palette].accent }} /></span>{PALETTES[palette].name}</button>)}</div>{hasFamily && <button className="proof-desk__family" type="button" onClick={() => onChange({ ...design, pieces: design.pieces.map(p => ({ ...p, palette: piece.palette })) })}>Use this palette on all three cards</button>}</div>
        <div className="proof-desk__control"><span id={`${uid}-typeface`}>Lettering</span><div className="proof-desk__choices proof-desk__choices--type" role="group" aria-labelledby={`${uid}-typeface`}>{TYPEFACE_IDS.map(typeface => <button key={typeface} type="button" aria-pressed={piece.typeface === typeface} style={{ fontFamily: TYPEFACES[typeface].family }} onClick={() => change({ typeface })}>{TYPEFACES[typeface].name}</button>)}</div></div>
        <label className="proof-desk__headline">A line of your own <span>Optional · {piece.headline?.length ?? 0}/64</span><input type="text" maxLength={64} value={piece.headline ?? ''} onChange={e => change({ headline: e.target.value })} placeholder="Leave a little room for the night" /></label>
      </fieldset></div>
      <div role="tabpanel" id={`${uid}-panel-Illustrations`} aria-labelledby={`${uid}-tab-Illustrations`} hidden={mode !== 'Illustrations'} tabIndex={0}>
      <fieldset disabled={disabled}><legend className="proof-desk__tool-title">Illustrate the piece</legend>
        {piece.motifs.length > 0 && <div className="proof-desk__placement"><label>Illustration to arrange<select value={selectedIndex} onChange={e => setMotifIndex(Number(e.target.value))}>{piece.motifs.map((m, i) => <option key={i} value={i}>{i + 1}. {motifName(m)}</option>)}</select></label><div className="proof-desk__move" role="group" aria-label="Move selected illustration" onKeyDown={event => moveWithKeys(event)}>
          <button type="button" disabled={!selected || !motifFits(piece.layout, { ...selected, x: selected.x - 2 })} onClick={() => selected && move({ x: selected.x - 2 })} aria-label="Move illustration left">Left</button><button type="button" disabled={!selected || !motifFits(piece.layout, { ...selected, y: selected.y - 2 })} onClick={() => selected && move({ y: selected.y - 2 })} aria-label="Move illustration up">Up</button><button type="button" disabled={!selected || !motifFits(piece.layout, { ...selected, y: selected.y + 2 })} onClick={() => selected && move({ y: selected.y + 2 })} aria-label="Move illustration down">Down</button><button type="button" disabled={!selected || !motifFits(piece.layout, { ...selected, x: selected.x + 2 })} onClick={() => selected && move({ x: selected.x + 2 })} aria-label="Move illustration right">Right</button></div><p className="proof-desk__hint">Arrow keys also move the selected illustration.</p>
          <div className="proof-desk__transform"><label>Size<select value={selected?.scale ?? 1} onChange={e => move({ scale: Number(e.target.value) as 1 | 2 | 3 })}><option value="1">Small</option><option value="2">Medium</option><option value="3" disabled={motifSize(3) > Math.min(LAYOUTS[piece.layout].art.width, LAYOUTS[piece.layout].art.height)}>Large{motifSize(3) > Math.min(LAYOUTS[piece.layout].art.width, LAYOUTS[piece.layout].art.height) ? ' (needs more space)' : ''}</option></select></label><button type="button" onClick={() => selected && move({ rotation: ((selected.rotation + 90) % 360) as MotifPlacement['rotation'] })}>Turn 90°</button><button type="button" onClick={() => { change({ motifs: piece.motifs.filter((_, i) => i !== selectedIndex) }); setMotifIndex(Math.max(0, selectedIndex - 1)); }}>Remove</button></div><p className="proof-desk__position">{selected && `${motifName(selected)} · ${preview.motifs[selectedIndex]?.x}, ${preview.motifs[selectedIndex]?.y} · ${selected.rotation}°`}</p>
        </div>}
        <p className="proof-desk__hint">Add another illustration. {piece.motifs.length} of 8 places used.</p><div className="proof-desk__motif-library">{page.motifs.map(id => <button key={id} type="button" disabled={piece.motifs.length >= 8} onClick={() => { change({ motifs: [...piece.motifs, addedMotif(piece, id)] }); setMotifIndex(piece.motifs.length); }}><Motif id={id} portrait={piece.kind === 'portrait'} /><span>Add {piece.kind === 'portrait' && id === 'bench' ? 'Hugo at the bench' : MOTIFS[id].toLowerCase()}</span></button>)}</div>
      </fieldset></div>
      <div role="tabpanel" id={`${uid}-panel-Finish`} aria-labelledby={`${uid}-tab-Finish`} hidden={mode !== 'Finish'} tabIndex={0}>
      <fieldset disabled={disabled}><legend className="proof-desk__tool-title">Finish & customer text</legend><label className="proof-desk__finish">Production treatment<select value={piece.treatment} onChange={e => change({ treatment: e.target.value as DesignPiece['treatment'] })}>{TREATMENTS.map(treatment => {
        const quote = quoteDesign(brief, { ...design, pieces: design.pieces.map((p, i) => i === index ? { ...p, treatment } : p) })[index]!;
        return <option key={treatment} value={treatment}>{treatment === 'standard' ? 'Two inks · included' : `${treatment === 'third-ink' ? 'Third ink' : 'Hand border'} · ${quote.materials} cr / ${quote.finishMinutes} min`}</option>;
      })}</select></label><p className="proof-desk__cost">This piece: <strong>{cost.materials ? `+${cost.materials} cr materials` : 'No extra materials'}</strong>{cost.finishMinutes ? ` · +${cost.finishMinutes} finishing minutes` : ' · Standard finishing'}</p>
        <div className="proof-desk__copy">{page.copy.map(c => <label key={c.id}><input type="checkbox" checked={piece.copy.includes(c.id)} onChange={e => change({ copy: e.target.checked ? [...piece.copy, c.id] : piece.copy.filter(id => id !== c.id) })} /><span>{c.text}<small>Customer text · required</small></span></label>)}</div>
      </fieldset></div><p className="proof-desk__announcement" aria-live="polite">{announcement}</p></div>
    </div>
    <footer className="proof-desk__review"><div aria-live="polite">{errors.length ? <><strong>{errors.length} {errors.length === 1 ? 'promise needs' : 'promises need'} attention</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></> : <><strong>The customer’s promises are present.</strong><p>Composition and character are yours to judge.</p></>}</div><div className="proof-desk__review-action"><p>Whole proof: {extras.reduce((sum, e) => sum + e.materials, 0)} cr extra materials · {extras.reduce((sum, e) => sum + e.finishMinutes, 0)} extra finishing minutes</p>{onReview && <button type="button" disabled={disabled || errors.length > 0} onClick={onReview}>Review this proof</button>}</div></footer>
  </section>;
}
