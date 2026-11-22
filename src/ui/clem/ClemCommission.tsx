import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PALETTES, type DesignPiece } from '../../engine/design';
import { APPROACHES } from '../../engine/projects';
import { RULES } from '../../engine/rules';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { credits, dayLabel } from '../format';
import { artifactLabel } from '../game/portfolio';
import { PrintLift } from '../portfolio/PrintLift';
import { useReducedMotion } from '../useReducedMotion';
import clemPortrait from '../atelier/assets/clem.webp';
import pressBench from './assets/press-bench.webp';
import { JazzStorefront } from './JazzStorefront';
import { bookClem, clemBrief, clemQuote, CLEM_APPROACHES, freshClem, loadClem, printClem, saveClem, type ClemApproach, type ClemSession } from './commission';
import '../../styles/clem-commission.css';

const directions: Record<ClemApproach, { title: string; note: string }> = {
  'first-night': { title: 'The first night', note: 'Restore the photograph that started it.' },
  'new-band': { title: 'The new band', note: 'Give this year’s players their own poster.' },
};
const headings = {
  brief: 'Ten years of Clem',
  review: 'Make your promise',
  press: 'At the press',
  lift: 'Fresh off the press',
  window: 'In Clem’s window',
};
const palettes = ['linen', 'midnight', 'poppy'] as const;
const benchStyle = { '--clem-backplate': `url(${pressBench})` } as CSSProperties;

export default function ClemCommission() {
  const [session, setSession] = useState(loadClem);
  const [error, setError] = useState<string | null>(null);
  const { step, approach, design } = session;
  const print = design.pieces[0]!;
  const brief = useMemo(() => clemBrief(approach), [approach]);
  const approved = step === 'lift' || step === 'window';
  const delivery = useMemo(() => approved ? printClem(approach, design) : null, [approved, approach, design]);
  const quote = useMemo(() => step === 'review' ? clemQuote(approach, design) : null, [step, approach, design]);
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const before = useRef(step);

  useLayoutEffect(() => {
    document.title = `${headings[step]} · Lantern Works`;
    if (before.current === step) return;
    before.current = step;
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => saveClem(session), [session]);

  const go = (next: ClemSession['step']) => {
    setError(null);
    setSession(current => ({ ...current, step: next }));
  };
  const change = (settings: Partial<DesignPiece>) => {
    setSession(current => ({ ...current, design: { ...current.design, pieces: [{ ...current.design.pieces[0]!, ...settings }] } }));
  };
  const choose = (next: ClemApproach) => {
    const design = clemBrief(next).defaultDesign;
    setSession(current => ({
      ...current,
      approach: next,
      design: { ...design, pieces: [{ ...design.pieces[0]!, palette: print.palette, headline: print.headline }] },
    }));
  };
  const booked = () => {
    const result = bookClem(approach, design);
    if (result.error) return setError(result.error);
    go('press');
  };
  const run = () => {
    if (!printClem(approach, design)) return setError('The print could not be delivered in this run. Start a fresh commission to try again.');
    go('lift');
  };
  const again = () => {
    setError(null);
    setSession(freshClem());
  };

  const item = delivery?.piece;
  const proof = item?.brief.proof;
  const finishedPrint = item && proof ? <DesignedPrint piece={proof.design.pieces[item.launch - 1]!} copy={proof.pieces[item.launch - 1]!.copy} label={artifactLabel(item.brief, item.launch)} /> : null;
  return (
    <main className="clem-commission" id="main" data-step={step}>
      <header className="clem-top">
        <a href="./">Lantern Works</a>
        <ol aria-label="Commission progress">
          <li aria-current={step === 'brief' || step === 'review' ? 'step' : undefined}>Proof</li>
          <li aria-current={step === 'press' || step === 'lift' ? 'step' : undefined}>Press</li>
          <li aria-current={step === 'window' ? 'step' : undefined}>Window</li>
        </ol>
      </header>
      <section className="clem-story" aria-labelledby="clem-heading">
        <div className="clem-intro">
          <p>{step === 'brief' || step === 'review' ? 'Clem Jazz Bar · Anniversary commission' : step === 'window' ? 'Clem Jazz Bar · After dark' : 'Lantern Works · The printshop'}</p>
          <h1 id="clem-heading" ref={heading} tabIndex={-1}>{headings[step]}</h1>
        </div>
        {(step === 'press' || approved) && <JazzStorefront visible={step === 'window' && !!finishedPrint}>
          <div className="clem-window-print" data-delivered-piece={item?.jobId}>{finishedPrint}</div>
        </JazzStorefront>}
        {!(step === 'window' && finishedPrint) && <figure className="clem-bench" style={benchStyle} aria-label={approved ? 'The finished sheet on the printshop bench' : 'A proof on the printshop bench'}>
          {step === 'lift' && item ? <PrintLift piece={item} reducedMotion={reducedMotion} /> :
            <div className="clem-proof"><DesignedPrint piece={print} copy={brief.pieces[0]!.copy} label={brief.pieces[0]!.title} /></div>}
        </figure>}
        <div className="clem-panel">
          {step === 'brief' && <>
            <div className="clem-customer">
              <img src={clemPortrait} alt="" width="64" height="64" />
              <blockquote>“Ten years in the same room. What do you think belongs in the window?”</blockquote>
            </div>
            <fieldset className="clem-directions">
              <legend>Choose a direction</legend>
              {CLEM_APPROACHES.map(option => <label key={option}>
                <input type="radio" name="direction" checked={option === approach} onChange={() => choose(option)} />
                <span><strong>{directions[option].title}</strong><small>{directions[option].note}</small></span>
              </label>)}
            </fieldset>
            <fieldset className="clem-ink">
              <legend>Paper and ink</legend>
              <div>{palettes.map(palette => <button key={palette} type="button" aria-pressed={print.palette === palette}
                style={{ '--paper': PALETTES[palette].paper, '--ink': PALETTES[palette].ink } as CSSProperties}
                onClick={() => change({ palette })}><span aria-hidden="true" />{PALETTES[palette].name}</button>)}</div>
            </fieldset>
            <label className="clem-headline">A line of your own <small>Optional</small>
              <input type="text" value={print.headline ?? ''} maxLength={64} onChange={event => change({ headline: event.target.value || undefined })} />
            </label>
            <button type="button" className="clem-primary" onClick={() => go('review')}>Review the promise</button>
          </>}
          {step === 'review' && quote && <>
            <h2>{APPROACHES[approach].artifact}</h2>
            <p>{APPROACHES[approach].detail}</p>
            <dl className="clem-terms">
              <div><dt>Commission fee</dt><dd>{credits(quote.offer.price)}</dd></div>
              <div><dt>Materials</dt><dd>{credits(quote.project.materials)}</dd></div>
              <div><dt>Finishing</dt><dd>{quote.profiles[0]?.finish ?? RULES.effort.finish} min</dd></div>
              <div><dt>Due</dt><dd>{dayLabel(quote.jobs[0]!.dueAt / RULES.minutesPerDay - 1)}</dd></div>
            </dl>
            <div className="clem-actions">
              <button type="button" className="clem-primary" onClick={booked}>Book the commission</button>
              <button type="button" className="clem-quiet" onClick={() => go('brief')}>Back to the proof</button>
            </div>
          </>}
          {step === 'press' && <>
            <h2>The proof is approved</h2>
            <p>Clem has booked your design. Run the next working days to finish the print.</p>
            <button type="button" className="clem-primary" onClick={run}>Run the press</button>
          </>}
          {step === 'lift' && item && <>
            <h2>{artifactLabel(item.brief, item.launch)}</h2>
            <p>Finished on {dayLabel(item.day!)}. Lift the sheet to see the ink catch the light.</p>
            <button type="button" className="clem-primary" onClick={() => go('window')}>Hang it in Clem’s window</button>
          </>}
          {step === 'window' && item && <>
            <div className="clem-customer">
              <img src={clemPortrait} alt="" width="64" height="64" />
              <blockquote>{approach === 'new-band' ? '“Their name on the wall. That’s where we start.”' : '“That’s the room on the first night. It still looks like us.”'}</blockquote>
            </div>
            <p>{artifactLabel(item.brief, item.launch)} · delivered {dayLabel(item.day!)}</p>
            <details className="clem-close-look"><summary>Look closely at the print</summary>{finishedPrint}</details>
            <button type="button" className="clem-quiet" onClick={again}>Make another version</button>
          </>}
          {(error || (step === 'review' && !quote) || (approved && !item)) && <div role="alert" className="clem-error">
            <p>{error ?? 'This saved proof could not be opened.'}</p>
            <button type="button" className="clem-quiet" onClick={again}>Start a fresh commission</button>
          </div>}
        </div>
      </section>
    </main>
  );
}
