import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { PALETTES, type DesignPiece } from '../../engine/design';
import { hash53 } from '../../engine/rng';
import { RULES } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import clemPortrait from '../atelier/assets/clem.webp';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { credits, dayLabel } from '../format';
import { compareOutcomes } from '../game/comparison';
import { fillFraction } from '../game/fill';
import { bookFirstOrder, clearFirstOrder, deliverFirstOrder, firstOrderBrief, firstOrderBuyers, firstOrderEditions, firstOrderOffer, loadFirstOrder, saveFirstOrder, selectFirstEdition, type FirstOrder as Draft } from '../game/firstOrder';
import { loadPrefs, newRunId, PREFS_EVENT, savePrefs, saveRun } from '../persist';
import { PrintLift } from '../portfolio/PrintLift';
import { clockLabel } from '../timeline';
import type { RunInitial } from '../useRun';
import { useReducedMotion } from '../useReducedMotion';
import { useSoundscape } from '../useSoundscape';
import { withViewTransition } from '../viewTransition';
import jazzWindow from '../neighbourhood/assets/jazz.webp';
import bench from './assets/press-bench.webp';
import { COMMIT_MS } from '../game/pressPull';
import { PressPull, type PressPullHandle } from './PressPull';
import type { WorldComparison, WorldPressHandle } from './FirstOrderWorld';
import { sounds } from '../sound';
import { pressAudioFromGesture, playPressSounds } from '../pressSounds';
import { JazzStorefront } from './JazzStorefront';
import { useWindowPush } from './useWindowPush';
import type { PrintSource } from '../miniature/ArtworkTextures';
import '../../styles/clem-commission.css';
import '../../styles/first-order.css';

const FirstOrderWorld = lazy(() => import('./FirstOrderWorld'));
const titles = { street: 'Main Street', design: 'The late set', press: 'Ready for the press', lift: 'Fresh off the press', window: 'In Clem’s window' };
const paletteIds = ['linen', 'midnight', 'poppy'] as const;
const benchStyle = { '--clem-backplate': `url(${bench})` } as CSSProperties;
const list = new Intl.ListFormat('en');
type Delivery = NonNullable<ReturnType<typeof deliverFirstOrder>>;
function printSource(edition: Draft['edition'], delivery: Delivery): PrintSource {
  const proof = delivery.piece.brief.proof!;
  return { key: `delivered:${edition}:${hash53(JSON.stringify(proof)).toString(36)}`,
    design: proof.design.pieces[0]!, copy: proof.pieces[0]!.copy, label: firstOrderBrief.title };
}
function countPressDelivery() {
  if (import.meta.env.DEV) {
    const debug = window as Window & { __lwCalls?: number };
    debug.__lwCalls = (debug.__lwCalls ?? 0) + 1;
  }
}

export default function FirstOrder({ onContinue }: { onContinue: (run: RunInitial) => void }) {
  const [draft, setDraft] = useState(loadFirstOrder);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [compare, setCompare] = useState(false);
  const [compactStage, setCompactStage] = useState(false);
  const [illustrated, setIllustrated] = useState(false);
  const [compactWindow, setCompactWindow] = useState(() => matchMedia('(max-width: 700px)').matches);
  const [windowExtent, setWindowExtent] = useState<'wide' | 'close'>();
  const [windowInWorld, setWindowInWorld] = useState(false);
  const [backdropDecodedAt, setBackdropDecodedAt] = useState<number | null>(null);
  const backdropReady = useCallback(() => setBackdropDecodedAt(at => at ?? performance.now()), []);
  const status = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  const [domStroke, setDomStroke] = useState(false);
  const [printed, setPrinted] = useState<{ edition: Draft['edition']; design: Draft['design']; result: NonNullable<ReturnType<typeof deliverFirstOrder>> }>();
  const pressing = useRef(false);
  const domDeadline = useRef<number | undefined>(undefined);
  const world = useRef<WorldPressHandle>(null);
  const pressContainment = useRef<HTMLStyleElement | null>(null);
  const handle = useRef<PressPullHandle>(null);
  const [error, setError] = useState<string>();
  const { step } = draft;
  const scene = step === 'design' ? 'design' : step === 'press' || step === 'lift' ? 'work' : 'window';
  const { startFromGesture } = useSoundscape({ enabled: prefs.sound, scene, attention: compare, relationship: false });
  useEffect(() => {
    const update = () => setPrefs(loadPrefs());
    window.addEventListener(PREFS_EVENT, update);
    return () => window.removeEventListener(PREFS_EVENT, update);
  }, []);
  const paper = draft.design.pieces[0]!;
  const previewPaper = useDeferredValue(paper);
  const proofPaper = step === 'design' ? previewPaper : paper;
  const copy = firstOrderBrief.pieces[0]!.copy;
  const visiblePrint = step === 'lift' || step === 'window';
  const delivery = useMemo(() => {
    if (!visiblePrint) return null;
    if (printed?.edition === draft.edition && printed.design === draft.design) return printed.result;
    return deliverFirstOrder(draft);
  }, [draft, printed, visiblePrint]);
  const delivered = useMemo(() => delivery ? printSource(draft.edition, delivery) : null, [delivery, draft.edition]);
  const other = draft.edition === 'room' ? 'band' : 'room';
  const alternative = useMemo(() => step === 'window' ? deliverFirstOrder(selectFirstEdition(draft, other)) : null, [draft, other, step]);
  const otherDelivered = useMemo(() => alternative ? printSource(other, alternative) : null, [alternative, other]);
  const comparison = useMemo(() => {
    if (!compare || !delivery || !alternative || !delivered || !otherDelivered) return null;
    const facts = compareOutcomes(
      { deliveredAt: delivery.piece.deliveredAt!, cash: delivery.state.cash, turnedAway: delivery.turnedAway },
      { deliveredAt: alternative.piece.deliveredAt!, cash: alternative.state.cash, turnedAway: alternative.turnedAway },
    );
    const prints = { [draft.edition]: delivered, [other]: otherDelivered } as WorldComparison['prints'];
    const idFor = (result: Delivery, name: string) => result.turnedAwayIds[result.turnedAway.indexOf(name)]!;
    const onlyAIds = facts.onlyA.map(name => idFor(delivery, name));
    const onlyBIds = facts.onlyB.map(name => idFor(alternative, name));
    const world: WorldComparison = {
      prints,
      departures: {
        turnedAway: [...facts.both, ...facts.onlyA, ...facts.onlyB],
        turnedAwayIds: [...facts.both.map(name => idFor(delivery, name)), ...onlyAIds, ...onlyBIds],
      },
      leaverBays: Object.fromEntries([
        ...onlyAIds.map(id => [id, draft.edition]),
        ...onlyBIds.map(id => [id, other]),
      ]),
    };
    return { ...facts, world };
  }, [alternative, compare, delivered, delivery, draft.edition, other, otherDelivered]);
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  const continuing = useRef(false);

  useEffect(() => {
    const narrow = matchMedia('(max-width: 700px)');
    const update = () => setCompactWindow(narrow.matches);
    narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, []);
  useEffect(() => saveFirstOrder(draft), [draft]);
  useEffect(() => () => clearTimeout(domDeadline.current), []);
  useEffect(() => () => pressContainment.current?.remove(), []);
  useLayoutEffect(() => {
    if (!compare) return;
    comparisonHeading.current?.focus({ preventScroll: windowInWorld });
    if (windowInWorld) world.current?.scrollToStage();
  }, [compare, windowInWorld]);
  useLayoutEffect(() => {
    document.title = `${titles[step]} · Lantern Works`;
    if (previous.current === step && step !== 'window') return;
    previous.current = step;
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const windowCloseup = windowExtent === 'close' || (windowExtent === undefined && (windowInWorld || compactWindow));
  const push = useWindowPush(step === 'window', windowCloseup ? 'read' : 'window', backdropDecodedAt, reducedMotion, compare);

  const go = (next: Draft['step']) => {
    const update = () => {
      setError(undefined);
      if (next !== 'lift' && status.current) status.current.textContent = '';
      setDraft(current => ({ ...current, step: next }));
    };
    const benchEntry = (step === 'street' && next === 'design') || (step === 'design' && next === 'press');
    if (illustrated && benchEntry) withViewTransition(update, reducedMotion);
    else update();
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
    if (pressing.current) return;
    const result = bookFirstOrder(draft);
    if (result.error) setError(result.error);
    else continueSeason(result.state);
  };
  const pressFailed = () => setError('The print could not be delivered. You can still plan the rest of the morning.');
  const run = () => {
    if (!pressing.current) return;
    pressing.current = false;
    clearTimeout(domDeadline.current);
    setBusy(false);
    setDomStroke(false);
    countPressDelivery();
    const result = deliverFirstOrder(draft);
    if (!result) pressFailed();
    else {
      setPrinted({ edition: draft.edition, design: draft.design, result });
      go('lift');
    }
  };
  const claimPress = () => {
    if (pressing.current) return false;
    pressing.current = true;
    setBusy(true);
    return true;
  };
  const springWithoutDelivery = () => {
    pressing.current = false;
    setBusy(false);
    pressFailed();
    return null;
  };
  const preparePress = () => {
    if (!claimPress()) return null;
    countPressDelivery();
    return deliverFirstOrder(draft) ?? springWithoutDelivery();
  };
  const announceDepartures = (names: string[]) => {
    if (names.length && status.current) status.current.textContent = `${list.format(names)} left without booking.`;
  };
  const startDomPress = (trusted: boolean) => {
    const result = preparePress();
    if (!result) return false;
    setDomStroke(true);
    announceDepartures(result.turnedAway);
    playPressSounds(pressAudioFromGesture(trusted));
    domDeadline.current = window.setTimeout(run, reducedMotion ? COMMIT_MS.bite : 700);
    return true;
  };
  const pressFromPanel = (trusted: boolean) => {
    if (pressing.current || world.current?.commitPress(trusted)) return;
    if (handle.current) handle.current.commit(trusted);
    else if (preparePress()) run();
  };
  const preparePressPointer = (event: PointerEvent) => {
    if (!event.isPrimary || event.pointerType !== 'mouse' || pressContainment.current) return;
    // Isolate the moving surfaces once the pointer starts interacting with the sized stage.
    const style = document.createElement('style');
    style.textContent = `
      .first-order[data-step='press'] .clem-bench, .first-order .press-pull,
      .first-order-world__stage, .first-order-world__tag { contain: strict; }
    `;
    document.head.append(style);
    pressContainment.current = style;
  };
  const chooseEdition = (id: Draft['edition']) => {
    setDraft(selectFirstEdition(draft, id));
    if (status.current) status.current.textContent = '';
  };
  const chooseFromWindow = (id: Draft['edition'], trusted: boolean) => {
    if (compare) {
      hangOther();
      return;
    }
    chooseEdition(id);
    const edition = firstOrderEditions.find(option => option.id === id)!;
    if (status.current) status.current.textContent = `Chosen: ${edition.title}, ${edition.minutes} min to print.`;
    if (trusted && loadPrefs().sound) sounds.take();
  };
  const renderStreet = (worldView: boolean) => <figure className="first-order-street" data-world={worldView || undefined}>
    <img src={jazzWindow} alt="" width={1440} height={811} />
    <figcaption><button className="clem-primary" type="button" onClick={() => go('design')}>Meet Clem at the jazz bar</button></figcaption>
  </figure>;
  const renderProof = (result: NonNullable<typeof delivery>) => {
    const proof = result.piece.brief.proof!;
    return <DesignedPrint piece={proof.design.pieces[0]!} copy={proof.pieces[0]!.copy} label={firstOrderBrief.title} />;
  };
  const renderWindow = (worldView: boolean) => (step === 'press' || visiblePrint) && <JazzStorefront
    visible={step === 'window' && !!delivery} world={worldView} framing={push.framing} animate={push.animate}
    hang={push.hang} frozen={compare} onBackdropReady={backdropReady}>
    {delivery && <div className="clem-window-print" data-delivered-piece={delivery.piece.jobId}>{renderProof(delivery)}</div>}
  </JazzStorefront>;
  const closeComparison = () => {
    setCompare(false);
    heading.current?.focus();
  };
  function hangOther() {
    setDraft(current => selectFirstEdition(current, other));
    closeComparison();
  }

  const client = <figure className="first-order-client">
    <img src={clemPortrait} alt="" width={768} height={702} decoding="async" onError={event => { event.currentTarget.hidden = true; }} />
    <figcaption><p className="first-order-line">“One trio, after the doors open.” <span>Clem</span></p></figcaption>
  </figure>;
  const proof = useMemo(() => (
    <div className="clem-proof"><DesignedPrint piece={proofPaper} copy={copy} label={firstOrderBrief.title} /></div>
  ), [copy, proofPaper]);
  const benchFigure = <figure className="clem-bench" style={benchStyle} aria-label="The print on the bench">
    {step === 'lift' && delivery ? <PrintLift piece={delivery.piece} reducedMotion={reducedMotion} />
      : step === 'press' ? <PressPull ref={handle} reducedMotion={reducedMotion} disabled={busy} onStart={startDomPress} onCommit={run}>{proof}</PressPull> : proof}
  </figure>;

  const comparisonPanel = compare && comparison && delivery && alternative && step === 'window' && (
    <section className="first-order-comparison" id="first-order-comparison" aria-labelledby="first-order-comparison-heading">
      <h2 ref={comparisonHeading} tabIndex={-1} id="first-order-comparison-heading">One morning, two editions</h2>
      <div className="first-order-versions">
        {([draft.edition, other] as const).map((edition, index) => {
          const outcome = index === 0 ? delivery : alternative;
          const option = firstOrderEditions.find(item => item.id === edition)!;
          const minutes = `Delivered ${outcome.piece.deliveredAt} minutes into the day`;
          const cash = `${credits(outcome.state.cash)} in the till`;
          return <figure key={edition}>
            {windowInWorld ? renderProof(outcome) : (
              <JazzStorefront visible framing="window">
                <div className="clem-window-print">{renderProof(outcome)}</div>
              </JazzStorefront>
            )}
            <figcaption>
              <strong>{option.title}</strong>
              {comparison.minutesDiff ? <mark className="first-order-diff">{minutes}</mark> : <span>{minutes}</span>}
              {comparison.cashDiff ? <mark className="first-order-diff">{cash}</mark> : <span>{cash}</span>}
              {(index === 0 ? comparison.onlyA : comparison.onlyB).map(name => (
                <span key={name}>{name} left without booking.</span>
              ))}
              {outcome.heldOrders.map(name => <mark key={name} className="first-order-diff">{name} holds her order for the next morning.</mark>)}
            </figcaption>
          </figure>;
        })}
      </div>
      {comparison.cashDiff === 0 && <p>Same takings either way.</p>}
      {comparison.both.length > 0 && <p>{list.format(comparison.both)} left without booking either way.</p>}
      <div className="first-order-compare-actions">
        <button className="clem-primary" type="button" onClick={hangOther}>Hang the other edition</button>
        <button className="clem-quiet" type="button" onClick={closeComparison}>Keep this edition</button>
      </div>
    </section>
  );

  return (
    <main id="main" className="clem-commission first-order" data-step={step} data-compact-stage={compactStage || undefined} data-world-comparison={compare && windowInWorld || undefined}
      onPointerMoveCapture={step === 'press' ? preparePressPointer : undefined}
      onPointerDownCapture={step === 'press' ? preparePressPointer : undefined}>
      <header className="clem-top">
        <a href="./">Lantern Works</a>
        {step === 'design' && compactStage ? <div className="first-order-stage-client">{client}</div> : <span>First morning</span>}
        {step === 'street' && typeof AudioContext !== 'undefined' && <label className="first-order-sound">
          <input type="checkbox" {...{ switch: '' }} checked={prefs.sound} onChange={event => {
            const next = { ...prefs, sound: event.target.checked };
            startFromGesture(next.sound);
            savePrefs(next);
            setPrefs(next);
          }} />Sound
        </label>}
      </header>
      <section className="clem-story" aria-labelledby="first-order-heading">
        <div className="clem-intro">
          <h1 ref={heading} tabIndex={-1} id="first-order-heading" data-screen-heading>{titles[step]}</h1>
        </div>
        <Suspense fallback={step === 'street' ? renderStreet(false) : <>{renderWindow(false)}{step !== 'window' && benchFigure}</>}>
          <FirstOrderWorld ref={world} draft={draft} reducedMotion={reducedMotion} holdIllustration={domStroke || step === 'lift'}
            delivered={delivered} otherDelivered={otherDelivered} compactRead={compactWindow} windowCloseup={windowExtent !== 'wide'} comparison={comparison?.world ?? null}
            renderWindow={renderWindow} renderStreet={renderStreet} onSelectEdition={chooseFromWindow} onIllustrated={setIllustrated}
            onWindowView={setWindowInWorld} onCompactLayout={setCompactStage}
            onPressStart={preparePress} onPressEnd={run} onDepartures={announceDepartures}>{benchFigure}</FirstOrderWorld>
        </Suspense>
        {windowInWorld && comparisonPanel}
        {step !== 'street' && <>
          {step === 'press' && <div className="first-order-press-help">
            <span className="press-help-illustrated"><span className="press-help-compact">Pull the handle down</span><span className="press-help-wide">Drag the handle down, or press Enter</span></span>
            <span className="press-help-world"><span className="press-help-compact">Pull the press down</span><span className="press-help-wide">Drag the press down, or use Run the press</span></span>
          </div>}
          <div className="clem-panel" key={step}>
            {step === 'design' && <>
              <div className="first-order-tools">
                {!compactStage && client}
                <fieldset className="first-order-editions">
                  <legend>What goes on the poster?</legend>
                  {firstOrderEditions.map(edition => <label key={edition.id}>
                    <input type="radio" name="edition" checked={draft.edition === edition.id} onChange={() => chooseEdition(edition.id)}
                    onFocus={event => world.current?.focusEdition(event.currentTarget.matches(':focus-visible') ? edition.id : null)}
                    onBlur={() => world.current?.focusEdition(null)} />
                    <strong>{edition.title}</strong>
                    <span>{edition.makerName}, {edition.minutes} min to print</span>
                    <span className="first-order-time" aria-hidden="true"
                      style={{ '--fill': String(fillFraction(edition.minutes, RULES.minutesPerDay)) } as CSSProperties} />
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
              </div>
              <div className="first-order-book">
                <button className="clem-primary" type="button" onClick={book}>Book for {credits(firstOrderOffer.price)}</button>
                <p className="first-order-due">Promised by {dayLabel(firstOrderOffer.turnaroundDays - 1)}</p>
              </div>
            </>}
            {step === 'press' && <>
              <h2>Clem has booked your proof</h2>
              <p>{firstOrderBuyers} other buyers are waiting. Run the press to make Clem’s print and leave their orders unanswered today.</p>
              <button className="clem-primary" type="button" aria-disabled={busy || undefined} onClick={event => pressFromPanel(event.nativeEvent.isTrusted)}>Run the press</button>
              <button className="clem-quiet" type="button" aria-disabled={busy || undefined} onClick={plan}>Plan the rest of the morning</button>
              <button className="clem-quiet" type="button" aria-disabled={busy || undefined} onClick={() => { if (!pressing.current) go('design'); }}>Change the proof</button>
            </>}
            {step === 'lift' && delivery && <>
              <h2>{firstOrderBrief.title}</h2>
              <p>Lift the sheet to see the ink catch the light.</p>
              <button className="clem-primary" type="button" onClick={() => go('window')}>Hang it in Clem’s window</button>
            </>}
            {step === 'window' && delivery && <>
              <p className="first-order-line">“{delivery.response}” <span>Clem</span></p>
              {!compare && delivery.heldOrders.map(name => <p key={name}>{name} holds her order for the next morning.</p>)}
              <div className="first-order-delivery">
                <p>Hung at {clockLabel(delivery.piece.deliveredAt! % RULES.minutesPerDay)}</p>
                <p>{credits(delivery.state.revenue)} earned</p>
                <p>{credits(delivery.state.cash)} in the till</p>
              </div>
              <button className="clem-primary" type="button" onClick={() => continueSeason(delivery.state)}>Open the next morning</button>
              <button className="clem-quiet" type="button" disabled={compare} onClick={() => setWindowExtent(windowCloseup ? 'wide' : 'close')}>
                {windowCloseup ? 'See the whole window' : 'Look closer'}
              </button>
              <button className="clem-quiet" type="button" aria-expanded={compare} aria-controls={compare ? 'first-order-comparison' : undefined} onClick={() => compare ? closeComparison() : setCompare(true)}>
                {compare ? 'Close the comparison' : 'Compare the other edition'}
              </button>
            </>}
            {(error || (visiblePrint && !delivery)) && <p className="clem-error" role="alert">{error ?? 'This proof needs to go back to the bench.'} {visiblePrint && !delivery && <button type="button" onClick={() => go('design')}>Back to the proof</button>}</p>}
          </div>
          {!windowInWorld && comparisonPanel}

        </>}
        <p ref={status} className="first-order-world-status vh" role="status" />
      </section>
    </main>
  );
}
