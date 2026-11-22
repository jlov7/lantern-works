import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PALETTES, type DesignPiece } from '../../engine/design';
import type { CompanyState } from '../../engine/types';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { credits, dayLabel } from '../format';
import { bookFirstOrder, clearFirstOrder, deliverFirstOrder, firstOrderBrief, firstOrderBuyers, firstOrderEditions, firstOrderOffer, loadFirstOrder, saveFirstOrder, selectFirstEdition, type FirstOrder as Draft } from '../game/firstOrder';
import { newRunId, saveRun } from '../persist';
import { PrintLift } from '../portfolio/PrintLift';
import type { RunInitial } from '../useRun';
import { useReducedMotion } from '../useReducedMotion';
import jazzWindow from '../neighbourhood/assets/jazz.webp';
import bench from './assets/press-bench.webp';
import { JazzStorefront } from './JazzStorefront';
import '../../styles/clem-commission.css';
import '../../styles/first-order.css';

const titles = { street: 'Main Street', design: 'The late set', press: 'Ready for the press', lift: 'Fresh off the press', window: 'In Clem’s window' };
const paletteIds = ['linen', 'midnight', 'poppy'] as const;
const benchStyle = { '--clem-backplate': `url(${bench})` } as CSSProperties;
const list = new Intl.ListFormat('en');

export default function FirstOrder({ onContinue }: { onContinue: (run: RunInitial) => void }) {
  const [draft, setDraft] = useState(loadFirstOrder);
  const [compare, setCompare] = useState(false);
  const [error, setError] = useState<string>();
  const { step } = draft;
  const paper = draft.design.pieces[0]!;
  const copy = firstOrderBrief.pieces[0]!.copy;
  const visiblePrint = step === 'lift' || step === 'window';
  const delivery = useMemo(() => visiblePrint ? deliverFirstOrder(draft) : null, [draft, visiblePrint]);
  const other = draft.edition === 'room' ? 'band' : 'room';
  const alternative = useMemo(() => compare ? deliverFirstOrder(selectFirstEdition(draft, other)) : null, [compare, draft, other]);
  const leftBothWays = delivery && alternative ? delivery.turnedAway.filter(name => alternative.turnedAway.includes(name)) : [];
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  const continuing = useRef(false);

  useEffect(() => saveFirstOrder(draft), [draft]);
  useLayoutEffect(() => {
    if (compare) comparisonHeading.current?.focus();
  }, [compare]);
  useLayoutEffect(() => {
    document.title = `${titles[step]} · Lantern Works`;
    if (previous.current === step) return;
    previous.current = step;
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const go = (step: Draft['step']) => {
    setError(undefined);
    setDraft(current => ({ ...current, step }));
  };
  const changePaper = (settings: Partial<DesignPiece>) => {
    setDraft(current => ({ ...current, design: { ...current.design, pieces: [{ ...current.design.pieces[0]!, ...settings }] } }));
  };
  const book = () => {
    const result = bookFirstOrder(draft);
    if (result.error) setError(result.error);
    else go('press');
  };
  const continueSeason = (state: CompanyState) => {
    if (continuing.current) return;
    continuing.current = true;
    const meta = { id: newRunId(), label: 'First order: Main Street' };
    if (saveRun({ v: 1, rules: state.rulesVersion, ...meta, savedAt: new Date().toISOString(), config: state.config, commands: state.commands })) clearFirstOrder();
    onContinue({ state, meta });
  };
  const plan = () => {
    const result = bookFirstOrder(draft);
    if (result.error) setError(result.error);
    else continueSeason(result.state);
  };
  const run = () => {
    if (!deliverFirstOrder(draft)) setError('The print could not be delivered. You can still plan the rest of the morning.');
    else go('lift');
  };
  const renderProof = (result: NonNullable<typeof delivery>) => {
    const proof = result.piece.brief.proof!;
    return <DesignedPrint piece={proof.design.pieces[0]!} copy={proof.pieces[0]!.copy} label={firstOrderBrief.title} />;
  };
  const closeComparison = () => {
    setCompare(false);
    heading.current?.focus();
  };

  return (
    <main id="main" className="clem-commission first-order" data-step={step}>
      <header className="clem-top">
        <a href="./">Lantern Works</a>
        <span>First morning</span>
      </header>
      <section className="clem-story" aria-labelledby="first-order-heading">
        <div className="clem-intro">
          <h1 ref={heading} tabIndex={-1} id="first-order-heading" data-screen-heading>{titles[step]}</h1>
        </div>
        {step === 'street' ? (
          <figure className="first-order-street">
            <img src={jazzWindow} alt="" width={1440} height={811} />
            <figcaption><button className="clem-primary" type="button" onClick={() => go('design')}>Meet Clem at the jazz bar</button></figcaption>
          </figure>
        ) : <>
          {(step === 'press' || visiblePrint) && <JazzStorefront visible={step === 'window' && !!delivery}>
            {delivery && <div className="clem-window-print" data-delivered-piece={delivery.piece.jobId}>{renderProof(delivery)}</div>}
          </JazzStorefront>}
          {step !== 'window' && <figure className="clem-bench" style={benchStyle} aria-label="The print on the bench">
            {step === 'lift' && delivery ? <PrintLift piece={delivery.piece} reducedMotion={reducedMotion} />
              : <div className="clem-proof"><DesignedPrint piece={paper} copy={copy} label={firstOrderBrief.title} /></div>}
          </figure>}
          <div className="clem-panel">
            {step === 'design' && <>
              <p className="first-order-line">“One trio, after the doors open.” <span>Clem</span></p>
              <fieldset className="first-order-editions">
                <legend>What goes on the poster?</legend>
                {firstOrderEditions.map(edition => <label key={edition.id}>
                  <input type="radio" name="edition" checked={draft.edition === edition.id} onChange={() => setDraft(selectFirstEdition(draft, edition.id))} />
                  <strong>{edition.title}</strong>
                  <span>{edition.makerName} · {edition.minutes} min to print</span>
                </label>)}
              </fieldset>
              <fieldset className="clem-ink">
                <legend>Paper and ink</legend>
                <div>{paletteIds.map(palette => <button key={palette} type="button" aria-pressed={paper.palette === palette}
                  style={{ '--paper': PALETTES[palette].paper, '--ink': PALETTES[palette].ink } as CSSProperties}
                  onClick={() => changePaper({ palette })}><span aria-hidden="true" />{PALETTES[palette].name}</button>)}</div>
              </fieldset>
              <details className="first-order-headline">
                <summary>Add a headline</summary>
                <label className="clem-headline">A line of your own
                  <input type="text" value={paper.headline ?? ''} maxLength={64} onChange={event => changePaper({ headline: event.target.value || undefined })} />
                </label>
              </details>
              <button className="clem-primary" type="button" onClick={book}>Book for {credits(firstOrderOffer.price)}</button>
              <p className="first-order-due">Promised by {dayLabel(firstOrderOffer.turnaroundDays - 1)}</p>
            </>}
            {step === 'press' && <>
              <h2>Clem has booked your proof</h2>
              <p>{firstOrderBuyers} other buyers are waiting. Opening the shop now lets their orders go.</p>
              <button className="clem-primary" type="button" onClick={run}>Run the press</button>
              <button className="clem-quiet" type="button" onClick={plan}>Plan the rest of the morning</button>
              <button className="clem-quiet" type="button" onClick={() => go('design')}>Change the proof</button>
            </>}
            {step === 'lift' && delivery && <>
              <h2>{firstOrderBrief.title}</h2>
              <p>Lift the sheet to see the ink catch the light.</p>
              <button className="clem-primary" type="button" onClick={() => go('window')}>Hang it in Clem’s window</button>
            </>}
            {step === 'window' && delivery && <>
              <p className="first-order-line">“{delivery.response}” <span>Clem</span></p>
              <p>{credits(delivery.state.revenue)} earned · {credits(delivery.state.cash)} in the till</p>
              <button className="clem-primary" type="button" onClick={() => continueSeason(delivery.state)}>Open the next morning</button>
              <button className="clem-quiet" type="button" aria-expanded={compare} aria-controls={compare ? 'first-order-comparison' : undefined} onClick={() => compare ? closeComparison() : setCompare(true)}>
                {compare ? 'Close the comparison' : 'Compare the other edition'}
              </button>
            </>}
            {(error || (visiblePrint && !delivery)) && <p className="clem-error" role="alert">{error ?? 'This proof needs to go back to the bench.'} {visiblePrint && !delivery && <button type="button" onClick={() => go('design')}>Back to the proof</button>}</p>}
          </div>
          {compare && delivery && alternative && step === 'window' && <section className="first-order-comparison" id="first-order-comparison" aria-labelledby="first-order-comparison-heading">
            <h2 ref={comparisonHeading} tabIndex={-1} id="first-order-comparison-heading">One morning, two editions</h2>
            <div className="first-order-versions">
              {([draft.edition, other] as const).map((edition, index) => {
                const outcome = index === 0 ? delivery : alternative;
                const option = firstOrderEditions.find(item => item.id === edition)!;
                return <figure key={edition}>
                  {renderProof(outcome)}
                  <figcaption>
                    <strong>{option.title}</strong>
                    <span>Delivered {outcome.piece.deliveredAt} minutes into the day</span>
                    <span>{credits(outcome.state.cash)} in the till</span>
                  </figcaption>
                </figure>;
              })}
            </div>
            {leftBothWays.length > 0 && <p>{list.format(leftBothWays)} left without booking either way.</p>}
            <div className="first-order-compare-actions">
              <button className="clem-primary" type="button" onClick={() => {
                setDraft(current => selectFirstEdition(current, other));
                closeComparison();
              }}>Hang the other edition</button>
              <button className="clem-quiet" type="button" onClick={closeComparison}>Keep this edition</button>
            </div>
          </section>}
        </>}
      </section>
    </main>
  );
}
