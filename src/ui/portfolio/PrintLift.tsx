import { useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { artifactLabel, type WorkPiece } from '../game/portfolio';
import { describePrint } from '../creative/describePrint';
import { DesignedPrint } from '../creative/DesignedArtwork';
import '../../styles/print-lift.css';

/** Each hinged band reveals a different third of one approved print. */
export function PrintLift({ piece, reducedMotion, onPlacementEnd }: { piece: WorkPiece; reducedMotion: boolean; onPlacementEnd: () => void }) {
  const source = useId();
  const proof = piece.brief.proof!;
  const copy = proof.pieces[piece.launch - 1]!.copy;
  const design = proof.design.pieces[piece.launch - 1]!;
  const title = artifactLabel(piece.brief, piece.launch);
  const [lifted, setLifted] = useState(false);
  const [dragLift, setDragLift] = useState<number | null>(null);
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const ignoreDragClick = useRef(false);
  const progress = reducedMotion ? Number(lifted) : dragLift ?? Number(lifted);
  const style = {
    '--ink-glint': .45 * progress,
    '--lift-x': `${24 * progress}px`, '--lift-y': `${-11 * progress}px`,
    '--lift-z': `${34 * progress}px`, '--lift-angle': `${-8 * progress}deg`,
    '--middle-angle': `${-13 * progress}deg`, '--edge-angle': `${-21 * progress}deg`,
    '--lift-shadow': `${5 + 16 * progress}px`, '--lift-blur': `${10 + 20 * progress}px`,
  } as CSSProperties;

  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    onPlacementEnd();
    ignoreDragClick.current = false;
    if (reducedMotion) return;
    start.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current?.pointerId !== event.pointerId) return;
    const distance = event.clientX - start.current.x;
    if (Math.abs(event.clientY - start.current.y) > 8 && Math.abs(event.clientY - start.current.y) > Math.abs(distance)) {
      ignoreDragClick.current = true;
      start.current = null;
      setDragLift(null);
      return;
    }
    if (ignoreDragClick.current || Math.abs(distance) > 8) {
      ignoreDragClick.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      setDragLift(Math.max(0, Math.min(1, Number(lifted) + distance / 105)));
    }
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current?.pointerId !== event.pointerId) return;
    const distance = event.clientX - start.current.x;
    start.current = null;
    setDragLift(null);
    if (!ignoreDragClick.current && Math.abs(distance) <= 8) return;
    if (Math.abs(distance) > 8) setLifted(distance > 0);
    ignoreDragClick.current = true;
  };

  const band = (index: number) => (
    <span className="print-lift__crop">
      <svg className="print-lift__slice" viewBox="0 0 100 100" style={{ top: `${-index * 100}%` }}>
        <use href={`#${source}`} width="100" height="100" />
      </svg>
    </span>
  );
  return <div className="payoff-milestone-art print-lift" data-payoff-piece={piece.jobId} data-approach={piece.brief.project?.approach} onAnimationEnd={onPlacementEnd} data-lifted={lifted} data-dragging={dragLift !== null || undefined} data-reduced-motion={reducedMotion}>
    <span className="vh" id={source + '-description'}>{describePrint(design, copy, title)}</span>
    <button type="button" className="print-lift__control" aria-label={lifted ? 'Lay Clem’s print down' : 'Lift Clem’s print'} aria-describedby={source + '-description'}
      style={style}
      onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { start.current = null; setDragLift(null); }}
      onClick={event => { onPlacementEnd(); if (event.detail === 0 || !ignoreDragClick.current) setLifted(value => !value); }}>
      <span className="print-lift__press" aria-hidden="true"><span className="print-lift__rail" /></span>
      <span className="print-lift__sheet" aria-hidden="true">
        <svg className="print-lift__master" width="0" height="0"><defs><symbol id={source} viewBox="0 0 100 100">
          <DesignedPrint piece={design} copy={copy} label={title} />
        </symbol></defs></svg>
        <span className="print-lift__panel print-lift__panel--top">{band(0)}
          <span className="print-lift__panel print-lift__panel--middle">{band(1)}
            <span className="print-lift__panel print-lift__panel--edge">{band(2)}</span>
          </span>
        </span>
      </span>
      <span className="print-lift__instruction">{lifted ? 'Lay the print down' : 'Lift the print'}</span>
    </button>
  </div>;
}
