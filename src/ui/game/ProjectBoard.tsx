import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { approachFor, nightCalendar, ordinaryOrdersDelivered, PROJECT_IDS, projectFor, projectBlocked, projectBrief, projectRecords, lendingSources } from '../../engine/projects';
import { careerStage } from '../../engine/career';
import { validateDesign, type DesignSpec } from '../../engine/design';
import { hasAuthorshipRules } from '../../engine/versions';
import { compatiblePatterns } from '../../engine/patterns';
import { RULES } from '../../engine/rules';
import { makerBusyWith, routedToAi, workingOn } from '../../engine/sim';
import { fits } from '../../engine/selectors';
import type { CompanyState, ProjectApproach, ProjectId } from '../../engine/types';
import { castName, credits, dayLabel } from '../format';
import { BriefPreview } from './BriefPreview';
import { commissionQuote, projectCompletionLine } from './commissionFacts';
import { useClock, type Playback } from './clock';
import { promiseLabel } from './promiseLabel';
import { nightContributions } from './nightContributions';
import { DesignedArtwork, ProofDesk } from '../creative';
import { CommissionConversation } from '../creative/CommissionConversation';
import { commissionInspiration, intentionFor } from './creativeRecognition';

function ProductionFacts({ facts }: { facts: ReturnType<typeof commissionQuote> }) {
  if (!facts.work) return null;
  return <><span className="small project-work">{facts.work.total === null ? 'The forecast does not finish all the work.' : `Human work: ${facts.work.total} min in total.`}</span><span className="project-production small">{facts.production.map(task => <span key={task.jobId}>{facts.production.length > 1 ? `Launch ${task.launch}: ` : ''}{task.name}, {dayLabel(task.day)}: {task.firstTime}% without redo.</span>)}</span></>;
}

export function ProjectNotice({ state, onOpen, sketch }: { state: CompanyState; onOpen: () => void; sketch?: string }) {
  const calendar = nightCalendar(state);
  const ready = PROJECT_IDS.filter(id => projectFor(state, id).approaches.some(approach => projectBlocked(state, id, approach, approachFor(state, approach).requiresSource ? lendingSources(state, id, approach)[0]?.id : undefined) === null)).length;
  return <button type="button" className="project-notice" onClick={onOpen}><strong>{sketch ?? `${calendar.name}, ${dayLabel(calendar.day)}`}</strong><span>{sketch ? 'Return to your sketch' : ready ? `${ready} commission${ready === 1 ? '' : 's'} ready to book` : 'See invitations and future requirements'}</span></button>;
}

export interface ProjectSelection { id: ProjectId; approach: ProjectApproach | null; maker?: string; design?: DesignSpec; sourceId?: string; reviewing?: boolean }

export function ProjectBoard({ selection, onSelection, state, disabled, onAccept, onReturn, customer, onUndo, canUndo }: { selection: ProjectSelection; onSelection: (selection: ProjectSelection) => void; state: CompanyState; disabled: boolean; onAccept: (id: ProjectId, approach: ProjectApproach, maker?: string, design?: DesignSpec, sourceId?: string) => void; onReturn: () => void; customer?: string; onUndo: () => void; canUndo: boolean }) {
  const { id: selected, approach, maker, sourceId } = selection;
  const [confirming, setConfirming] = useState(false);
  const authored = hasAuthorshipRules(state.rulesVersion);
  const reviewing = selection.reviewing ?? false;
  const brief = useMemo(() => approach ? projectBrief(state, selected, approach, sourceId) : null, [state, selected, approach, sourceId]);
  const design = selection.design ?? brief?.defaultDesign;
  const patterns = useMemo(() => brief ? compatiblePatterns(state, brief) : [], [state, brief]);
  const sources = approach ? lendingSources(state, selected, approach) : [];
  const source = sources.find(source => source.id === sourceId);
  const [revision, setRevision] = useState(state.revision);
  if (revision !== state.revision) { setRevision(state.revision); if (confirming) setConfirming(false); }
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches);
  useEffect(() => { const media = matchMedia('(min-width: 900px)'); const update = () => setWide(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const receipt = useRef<HTMLElement>(null);
  const quoteHeading = useRef<HTMLHeadingElement>(null);
  const productionHeading = useRef<HTMLHeadingElement>(null);
  const bookingWarning = useRef<HTMLParagraphElement>(null);
  const nameHeading = useRef<HTMLHeadingElement>(null);
  const deskChrome = useRef<HTMLDivElement>(null);
  const definition = projectFor(state, selected);
  const inspiration = commissionInspiration(state, selected);
  const proposal = inspiration ? intentionFor(inspiration)?.approach : undefined;
  const bookingBlocked = approach ? projectBlocked(state, selected, approach, sourceId) : null;
  const calendar = nightCalendar(state);
  const records = projectRecords(state);
  const booked = records.find(record => record.id === selected);
  const composing = authored && !!approach && !booked;
  useLayoutEffect(() => {
    const chrome = deskChrome.current;
    if (!composing || !chrome) return;
    const form = chrome.closest('form')!;
    const pieces = form.querySelector<HTMLElement>('.proof-desk__pieces');
    const measure = () => form.style.setProperty('--proof-workspace-height', `calc(100svh - var(--topbar-h, 4rem) - var(--actionbar-h, 5rem) - ${Math.ceil(chrome.getBoundingClientRect().height + (pieces?.getBoundingClientRect().height ?? 0))}px - 2.5rem)`);
    const observer = new ResizeObserver(measure);
    observer.observe(chrome);
    if (pieces) observer.observe(pieces);
    measure();
    return () => { observer.disconnect(); form.style.removeProperty('--proof-workspace-height'); };
  }, [composing]);
  const routes = useMemo(() => {
    if (!approach || (authored && !reviewing)) return [];
    const base = commissionQuote(state, selected, approach, undefined, design, sourceId);
    const people = workingOn(state, state.day);
    const named = base.quote?.request.need === 'nuanced' && !routedToAi(state.staffing, base.quote.request) && base.quote.jobs.every(job => job.releaseDay === state.day) ? Object.keys(RULES.makers).filter(id => people.some(person => person.id === id)) : [];
    return [undefined, ...named].map(id => { const busy = id ? makerBusyWith(state, id) : null; return { id, name: id ? state.resources.find(resource => resource.id === id)!.name : 'Studio plan', facts: id ? commissionQuote(state, selected, approach, id, design, sourceId) : base, busy: busy ? `Busy with ${promiseLabel(state, busy.id, 'customer')}. It has to go out first.` : null }; });
  }, [state, selected, approach, authored, reviewing, design, sourceId]);
  const routeMaker = maker && routes.some(route => route.id === maker) ? maker : undefined;
  const quote = routes.find(route => route.id === routeMaker)?.facts ?? null;
  const contributions = quote?.quote ? nightContributions(quote.quote.project, records, state) : [];
  useLayoutEffect(() => { const target = quoteHeading.current ?? receipt.current ?? heading.current; target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, []);
  useEffect(() => { if (booked) receipt.current?.focus(); else quoteHeading.current?.focus(); }, [booked?.contract.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id: ProjectId) => { flushSync(() => onSelection({ id, approach: null })); setConfirming(false); nameHeading.current?.focus(); };
  const reviewProof = () => {
    if (disabled || !brief || !design || validateDesign(brief, design).length) return;
    flushSync(() => onSelection({ ...selection, reviewing: true }));
    productionHeading.current?.focus({ preventScroll: true });
    productionHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  const book = () => {
    if (disabled || !approach || !quote?.quote || !quote.estimate) return;
    if (!fits(quote.estimate) && !confirming) {
      flushSync(() => setConfirming(true));
      bookingWarning.current?.focus({ preventScroll: true });
      bookingWarning.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
      return;
    }
    onAccept(selected, approach, routeMaker, authored ? design : undefined, sourceId);
  };
  const last = state.commands.at(-1);
  const context = <><h3 ref={nameHeading} tabIndex={-1}>{selected === 'lantern-night' ? calendar.name : definition.name}</h3><p>{definition.invitation}</p>
    {authored && !booked && <CommissionConversation key={selected} state={state} projectId={selected} />}
    {selected !== 'lantern-night' ? <p className="project-prerequisite">Ordinary orders delivered for {castName(definition.castId)}: {ordinaryOrdersDelivered(state, definition.castId)}/{definition.required}. Invitation runs from {dayLabel(definition.opens)} to {dayLabel(definition.closes)}.</p> : <p className="project-prerequisite">A courtyard needs one completed milestone. A trail needs two completed hosts. {!careerStage(state) || careerStage(state) === 'opening' ? "Hugo's quiet sendoff contributes a keepsake, rather than an open workshop. " : ''}You have {records.filter(record => record.earned && record.id !== 'lantern-night').length} completed milestones, including {records.filter(record => record.earned && record.host).length} hosts.</p>}</>;
  const compare = () => { flushSync(() => onSelection({ id: selected, approach: null })); setConfirming(false); nameHeading.current?.focus(); };
  return <section className={`project-board${composing ? ' project-board--editing' : ''}`} aria-labelledby={composing ? 'project-quote-h' : 'project-board-h'}>
    {!composing && <>
    <header className="project-board-head"><div><p className="small">Commission board</p><h2 id="project-board-h" ref={heading} tabIndex={-1}>{calendar.name}, {dayLabel(calendar.day)}</h2></div><button type="button" className="btn" onClick={onReturn}>Return to {customer ?? 'customers'}</button></header>
    <p className="project-calendar">Choose the gathering on Days {calendar.opens + 1}–{calendar.closes + 1}. Production starts {dayLabel(calendar.release)}; every promised piece is due {dayLabel(calendar.day)}.</p>
    <details className="project-roster" open={wide || (!approach && !booked)}><summary>Choose a commission ({records.length} booked)</summary><ul>{PROJECT_IDS.map(id => { const def = projectFor(state, id); const record = records.find(item => item.id === id); return <li key={id}><button type="button" className="project-row" aria-current={id === selected ? 'true' : undefined} onClick={() => choose(id)}><strong>{id === 'lantern-night' ? calendar.name : castName(def.castId)}</strong><span>{id === 'lantern-night' ? calendar.name : def.name}</span><span className="small">{record ? `${record.delivered}/${record.promised} delivered · ${record.status}` : projectBlocked(state, id, def.approaches[0]!) ?? 'Ready to book'}</span></button></li>; })}</ul></details>
    {context}
    </>}
    {booked ? <section className="project-receipt reply-receipt" ref={receipt} tabIndex={-1}><h3>Booked: {approachFor(state, booked.approach).name}</h3><p>{credits(booked.contract.price)} paid up front. {booked.contract.project!.materials ? `${credits(booked.contract.project!.materials)} in materials paid.` : 'No materials bill.'}</p><p>{booked.delivered} of {booked.promised} launches delivered. {projectCompletionLine(booked)}</p>{booked.contract.project?.proof && <div className="project-approved-pieces">{booked.contract.project.proof.design.pieces.map((piece, index) => <DesignedArtwork key={index} piece={piece} copy={booked.contract.project!.proof!.pieces[index]!.copy} label={booked.contract.project!.proof!.pieces[index]!.title} />)}</div>}<button type="button" className="btn" disabled={!canUndo || last?.type !== 'acceptProject' || last.projectId !== selected} onClick={onUndo}>Undo commission</button></section> : !approach ? <div className="project-approaches" role="group" aria-label={`Approaches to ${definition.name}`}>{definition.approaches.map(option => <button type="button" className="project-approach" key={option} onClick={() => { flushSync(() => onSelection({ id: selected, approach: option })); setConfirming(false); quoteHeading.current?.focus({ preventScroll: true }); quoteHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}><strong>{approachFor(state, option).name}</strong>{proposal === option && <span className="project-proposal">Following your earlier print</span>}<span>{approachFor(state, option).detail}</span><span className="small">{approachFor(state, option).benefit}</span><span className="project-review">Review this approach</span></button>)}</div> : <form id="project-proof-decision" className="project-quote" aria-labelledby="project-quote-h" onSubmit={event => { event.preventDefault(); if (!reviewing) reviewProof(); else book(); }}>
      <div ref={deskChrome} className={composing ? 'project-desk-chrome' : undefined}>
      {composing ? <><header className="project-desk-head"><h2 id="project-quote-h" ref={quoteHeading} tabIndex={-1}>{brief!.title}</h2><button type="button" className="btn btn-small" onClick={onReturn}>Back to the window</button></header><div className="project-desk-context"><button type="button" className="btn btn-small" onClick={compare}>Compare approaches</button><details><summary>Brief with {castName(definition.castId)}</summary>{context}<p>{approachFor(state, approach).detail}</p></details></div></> : <><button type="button" className="btn btn-small" onClick={compare}>Compare approaches</button><h3 id="project-quote-h" ref={quoteHeading} tabIndex={-1}>{approachFor(state, approach).name}</h3><p>{approachFor(state, approach).detail}</p></>}
      {approachFor(state, approach).requiresSource && <fieldset className="project-lending" disabled={disabled}><legend>Lend a retained piece</legend><label>Retained piece for the archive<select value={sourceId ?? ''} onChange={event => { onSelection({ ...selection, sourceId: event.target.value || undefined, reviewing: false }); setConfirming(false); }}><option value="">Choose a retained piece</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title} · Season {source.sourceSeason}</option>)}</select></label>{source && <><DesignedArtwork piece={source.design} copy={source.copy} label={source.title} /><p>The archive borrows this exact print. Make its new caption and invitation below.</p></>}</fieldset>}
      {bookingBlocked && <p className="project-sketch-notice"><strong>{bookingBlocked}</strong> You can work on a sketch while you wait. No booking has been made.</p>}
      </div>
      {authored && brief && design && <ProofDesk focused key={`${selected}:${approach}`} brief={brief} design={design} patterns={patterns} disabled={disabled} onChange={next => { onSelection({ ...selection, design: next, reviewing: false }); setConfirming(false); }} onReview={reviewProof} />}
      {authored && reviewing && <h3 ref={productionHeading} tabIndex={-1}>Approve the proof and the promise</h3>}
      {quote?.blocked ? <p className="risk risk-warn">{quote.blocked}</p> : quote?.quote && <>
        <p className="project-payment"><strong>{credits(quote.quote.offer.price)} paid now.</strong> {credits(quote.quote.project.materials)} materials paid now. The advance stays owed until the work ships.</p>
        <p className="small">{quote.quote.offer.style === 'templated' ? 'From the template kit' : 'Made to order'}; {quote.quote.offer.scope === 'any' ? 'any brief' : 'simple briefs'}.</p>
        <ul className="quote-dates">{quote.quote.jobs.map((job, index) => <li key={index}>Launch {index + 1}: starts {dayLabel(job.releaseDay)}, due {dayLabel(job.dueAt / RULES.minutesPerDay - 1)}.</li>)}</ul>
        {contributions.length > 0 && <details className="project-contributions"><summary>From earlier commissions: {contributions.map(item => item.name).join(', ')}</summary><ul>{contributions.map(item => <li key={item.name}>{item.detail}</li>)}</ul></details>}
        {routes.length > 1 && <fieldset className="project-makers" disabled={disabled}><legend>Production route</legend>{routes.map(route => <label key={route.id ?? 'studio'}><span className="project-route-name"><input type="radio" name="project-maker" aria-label={route.name} aria-describedby={`project-route-${route.id ?? 'studio'}`} checked={routeMaker === route.id} disabled={!!route.facts.blocked} onChange={() => { onSelection({ ...selection, maker: route.id }); setConfirming(false); }} /><strong>{route.name}</strong></span><span className="project-route-facts" id={`project-route-${route.id ?? 'studio'}`}><ProductionFacts facts={route.facts} /><span className="small">{route.busy ?? route.facts.blocked ?? route.facts.risk?.chip} {route.facts.others !== undefined ? `${route.facts.others} other buyers fit.` : ''}</span></span></label>)}</fieldset>}
        {routes.length === 1 && <div className="project-studio-production"><p className="small">Production follows the studio plan. {quote.others} other waiting buyers still fit in queue order. No named maker is reserved.</p><ProductionFacts facts={quote} /></div>}
        <p className="small">Projected with the current plan. Each percentage is one launch's chance without redo, for the maker and day shown. Later orders or pace changes can change the plan.</p>
        <p className={`risk risk-${quote.risk!.tone === 'ok' ? 'ok' : 'warn'}`}>{quote.risk!.chip} {quote.risk!.detail}</p><p className="small">Forecast excludes redos, later orders and studio changes.</p>
        <p className="project-benefit">On completion: {approachFor(state, approach).benefit}</p>
        {confirming && <p ref={bookingWarning} tabIndex={-1} className="risk risk-bad" role="status">The forecast failure remains. This acceptance is a promise even if the plan misses it.</p>}
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={book}>{!fits(quote.estimate!) ? confirming ? 'Yes, book this commission anyway' : 'Book despite the forecast' : authored ? 'Approve proof & book' : 'Book this commission'}</button>
        {!authored && <BriefPreview request={quote.quote.request} offer={quote.quote.offer} config={state.config} />}
      </>}
    </form>}
  </section>;
}

export function ProjectProgress({ state, play, onOpen }: { state: CompanyState; play: Playback | null; onOpen: () => void }) {
  const minute = useClock(play?.clock ?? null, clock => play && !clock.done ? Math.floor(clock.t) : state.minute);
  const displayed = play && !play.clock.get().done ? play.after : state;
  const records = useMemo(() => projectRecords(displayed, minute), [displayed, minute]);
  const calendar = nightCalendar(state);
  return <section className="project-progress" aria-labelledby="project-progress-h"><header><h2 id="project-progress-h">Commissions and {calendar.name}</h2><button type="button" className="btn" disabled={!!play && !play.clock.get().done} onClick={onOpen}>{play && !play.clock.get().done ? 'The board reopens in the morning' : 'Open commission board'}</button></header><p>{calendar.name} is on {dayLabel(calendar.day)}. Booking opens {dayLabel(calendar.opens)} and closes {dayLabel(calendar.closes)}.</p>{!records.length ? <p>No commission is booked. The board shows ordinary work and future requirements.</p> : <ul>{records.map(record => <li key={record.contract.id}><strong>{approachFor(state, record.approach).name}</strong><span>{record.delivered}/{record.promised} launches delivered · {record.status}</span><span>{record.earned ? 'Contribution earned' : 'Contribution not yet earned'}</span></li>)}</ul>}</section>;
}
