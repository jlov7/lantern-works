// The queue at the window: buyers first as tickets, everyone who won't buy folded into one row, answered tickets last.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { objection } from '../../engine/demand';
import { GOALS } from '../../engine/goals';
import { CAST_BY_ID, RULES, SEGMENTS } from '../../engine/rules';
import { getScenario, isRegular, paceOn, workingOn } from '../../engine/sim';
import { hasAuthorshipRules, hasCreativePromiseRules } from '../../engine/versions';
import { counterFor, dailyCosts, fits, medalParFor, reactionTo, summarize, type Forecast } from '../../engine/selectors';
import { profitHeading } from './eveningFacts';
import { wouldPayMore } from './sameOrders';
import type { Command, CompanyState, Pace, Request } from '../../engine/types';
import type { CreativeIntention, DesignSpec } from '../../engine/design';
import type { OrdinaryDraft } from './ordinaryComposition';
import { Ticket } from '../Ticket';
import { makersContested } from './makers';
import { castName, credits, dayLabel, hours, oneIn } from '../format';
import { leverOptions, leverResult } from './studioHint';
import { launchMinutes, priceTarget } from './workshopMath';
import { quickOffer } from './quickOffer';
import { Coach } from './Guide';
import { DayPlan } from './DayPlan';
import { lateNames } from './forecastRisk';
import { nextCustomer } from './workspace';
import { hydrateQueue, hydrateSame, type MorningPlan } from './morningPlan';
import { promiseLabel } from './promiseLabel';
import { ReplyReview } from './ReplyReview';
import { routineReplies, returnAfterReply } from './morningReplies';
import { planFree } from './planFree';

interface Props {
  plan: MorningPlan;
  pending?: ReactNode;
  updatingProof?: boolean;
  onReserve: (id: string, startsInDays: 1 | 2, design?: DesignSpec, intention?: CreativeIntention) => void;
  scene?: ReactNode;
  onUndo: () => void;
  canUndo: boolean;
  state: CompanyState;
  forecasts: Map<string, Forecast>;
  selected: string | null;
  disabled: boolean;
  locked: boolean;
  onAccept: (id: string, counter?: boolean, maker?: string, design?: DesignSpec, intention?: CreativeIntention) => void;
  ordinaryDrafts: Record<string, OrdinaryDraft>;
  onDraft: (id: string, draft: OrdinaryDraft) => void;
  onDecline: (id: string) => void;
  onSelect: (id: string) => void;
  onTakeAll: () => void;
  /** Take these buyers in order, each only if they still fit. */
  onTakeSome: (ids: string[]) => void;
  /** Take this set of buyers, in this order. */
  onDeclineAll: (ids: string[]) => void;
  onDesign: () => void;
  onQuickOffer: () => void;
  onReprice: (offerIndex: number, price: number) => void;
  onPace: (pace: Pace) => void;
  outlook: { delivered: number; earned: number; missed: number; running: number } | null;
  /** First season: the pace control waits until it opens. */
  paceOpen: boolean;
  /** First season: the AI desk waits until it opens. */
  aiOpen: boolean;
  /** Flyers are open (a first season opens them on the third morning). */
  flyersOpen: boolean;
  /** Book a way to more hours today (overtime, a temp, a push, an AI desk). */
  onLevers: (commands: Command[]) => void;
  /** The other studios on this street, served by last night, or null while they are worked out. */
  rivals: { label: string; served: number }[] | null;
}

const WHY: Record<string, [one: string, many: string]> = {
  price: ['finds the price too high', 'find the price too high'],
  slow: ['needs it sooner', 'need it sooner'],
  scope: ['has a brief the offers do not cover', 'have briefs the offers do not cover'],
  care: ['wants it made to order', 'want it made to order'],
  lost: ['is still upset about last time', 'are still upset about last time'],
  empty: ['finds nothing on the window', 'find nothing on the window'],
};

/** "3 find the price too high (they would pay about 290 to 310 for Launchlet); 2 need it sooner." */
function whyTheyWalk(state: CompanyState, rs: Request[]): string {
  const groups = new Map<string, Request[]>();
  for (const r of rs) {
    const x = reactionTo(state, r);
    const why = x.kind === 'walk' ? x.reason : 'price';
    groups.set(why, [...(groups.get(why) ?? []), r]);
  }
  return [...groups]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([why, g]) => {
      const words = WHY[why] ?? [why, why];
      let extra = '';
      const t = why === 'price' ? priceTarget(state, g) : null;
      if (t) {
        const lo = Math.min(...t.prices);
        const hi = Math.max(...t.prices);
        extra = ` (${g.length === 1 ? 'would' : 'they would'} pay about ${lo === hi ? credits(lo) : `${lo} to ${credits(hi)}`} for ${state.menu[t.offerIndex]!.name})`;
      }
      return `${g.length} ${g.length === 1 ? words[0] : words[1]}${extra}`;
    })
    .join('; ');
}

const names = (rs: Request[]) => {
  const n = rs.map((r) => castName(r.castId));
  return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
};

const PACE: Record<Pace, { label: string; says: string }> = {
  steady: { label: 'Steady', says: 'Work at the usual speed.' },
  push: { label: 'Push', says: `People's work started today goes about ${100 - RULES.pace.push.effortPercent}% quicker, so more may fit; redos are ${RULES.pace.push.reworkPercent / 100} times as likely, the AI desk's too. Not two days running.` },
  careful: { label: 'Careful', says: `People's work started today takes about ${RULES.pace.careful.effortPercent - 100}% longer; what people make needs redoing a third as often.` },
};

/** Today's pace: a choice every morning that changes what fits and how often work needs redoing. */
export function PaceControl({ pace, disabled, onPace }: { pace: Pace; disabled: boolean; onPace: (p: Pace) => void }): JSX.Element {
  return (
    <fieldset className="pace" disabled={disabled}>
      <legend className="small">Today's pace</legend>
      <div className="pace-options">
        {(Object.keys(PACE) as Pace[]).map((p) => (
          <label key={p} className={p === pace ? 'is-on' : ''}>
            <input type="radio" name="pace" value={p} checked={p === pace} onChange={() => onPace(p)} />
            {PACE[p].label}
          </label>
        ))}
      </div>
      {pace !== 'steady' && <p className="small muted">{PACE[pace].says}</p>}
    </fieldset>
  );
}

export const WindowQueue = memo(function WindowQueue({ state, plan, pending, updatingProof = false, forecasts, selected, disabled, locked, onAccept, ordinaryDrafts, onDraft, onDecline, onSelect, onTakeAll, onTakeSome, onDeclineAll, onDesign, onQuickOffer, onReprice, onPace, outlook, paceOpen, aiOpen, flyersOpen, onLevers, rivals, onUndo, canUndo, scene, onReserve }: Props): JSX.Element {
  const [comparing, setComparing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [leversOpen, setLeversOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(() => matchMedia('(min-width: 900px)').matches);
  useEffect(() => { const media = matchMedia('(min-width: 900px)'); const update = () => setRosterOpen(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const comparison = useRef<HTMLDialogElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const planning = useRef<HTMLDivElement>(null);
  const decision = useRef<HTMLDivElement>(null);
  const { all, waiting, makers, baseline, tooLate, buyers, hagglers, walkers, answered, fitting, namedOnly, conflicts, together } = useMemo(() => hydrateQueue(state, plan.queue), [state, plan]);
  const focused = all.find(r => r.id === selected) ?? waiting[0] ?? all.at(-1);
  const routine = routineReplies(state);
  const due = state.jobs.filter(job => (job.status === 'active' || job.status === 'scheduled') && job.dueAt <= (state.day + 1) * RULES.minutesPerDay);
  const accepted = focused?.status === 'accepted' ? state.contracts.find(contract => contract.id === focused.contractId) : null;
  const focusKey = focused ? `${focused.id}-${focused.status}` : 'empty';
  const isPending = !!pending && !updatingProof;
  const previous = useRef(focusKey);
  useEffect(() => {
    if (previous.current !== focusKey) {
      const target = decision.current?.querySelector<HTMLElement>('[data-customer-heading], .reply-receipt');
      if (document.activeElement === document.body || decision.current?.contains(document.activeElement)) {
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    }
    previous.current = focusKey;
  }, [focusKey]);
  useEffect(() => { if (comparing && !comparison.current?.open) comparison.current?.showModal(); }, [comparing]);
  useLayoutEffect(() => { if (isPending && comparing) comparison.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }, [isPending, comparing]);
  const closeCompare = () => { flushSync(() => { setComparing(false); setOptionsOpen(false); }); (compareButton.current ?? planning.current)?.focus(); };
  const select = (id: string) => { setComparing(false); setOptionsOpen(false); onSelect(id); requestAnimationFrame(() => { const heading = decision.current?.querySelector<HTMLElement>('[data-customer-heading], .reply-receipt'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }); };
  const rosterRow = (r: Request) => {
    const x = reactionTo(state, r); const ask = counterFor(state, r); const w = plan.queue.work.get(r.id);
    const f = forecasts.get(r.id); const named = makers.get(r.id)?.filter(m => m.fits);
    return <li key={r.id}><button type="button" data-request-id={r.id} className={`roster-row${focused?.id === r.id ? ' is-current' : ''}`} onClick={() => select(r.id)} aria-current={focused?.id === r.id ? 'true' : undefined}>
      <span><strong>{castName(r.castId)}</strong> <span className="small">{CAST_BY_ID[r.castId]?.business}</span></span>
      <span className="small">{isRegular(state, r.castId) ? 'Regular · ' : ''}{r.status !== 'waiting' ? r.status === 'accepted' ? 'Taken' : 'Turned away' : x.kind === 'buy' ? `${x.offer.name} · ${credits(x.price)} · due ${w?.firstDue === state.day ? 'tonight' : w ? dayLabel(w.firstDue) : 'later'}` : ask ? `Offers ${credits(ask.price)}` : `Will not buy: ${x.reason}`}</span>
      {r.status === 'waiting' && (x.kind === 'buy' || ask) && <span className="small roster-fit">{f && fits(f) ? 'Fits on its own' : named?.length ? `Fits with ${named.map(m => m.name).join(' or ')}` : 'Does not fit'}{together.includes(r.id) ? ' · in queue order' : ''}</span>}
    </button></li>;
  };
  const offer = useMemo(() => disabled ? null : quickOffer(state), [state, disabled]);
  const reprice = (() => {
    const t = priceTarget(state, walkers);
    return t && t.price < state.menu[t.offerIndex]!.price ? t : null;
  })();
  // Compare the suggested price's hourly earnings with the studio's average hourly running cost.
  const rates = (() => {
    if (!reprice) return null;
    const o = state.menu[reprice.offerIndex]!;
    const mins = launchMinutes(state, o);
    const have = workingOn(state, state.day).reduce((a, r) => a + Math.floor((RULES.humanShift * 100) / r.speedPercent), 0);
    if (!mins || !have) return null;
    return { earns: Math.round(reprice.price / o.launches / (mins / 60) / 5) * 5, costs: Math.round(dailyCosts(state).total / (have / 60) / 5) * 5 };
  })();
  const capacityPressure = together.length < buyers.length + tooLate.length;
  const showLevers = (focused?.status === 'waiting' && leversOpen) || (comparing && optionsOpen);
  const levers = useMemo(() => showLevers && capacityPressure ? leverOptions(state, { ai: aiOpen, pace: paceOpen }) : [], [state, aiOpen, paceOpen, showLevers, capacityPressure]);
  const takeable = together.length;
  // When everyone who fits can be taken, what is left of today's hours: the choice on an easy morning is how to use it.
  const allFit = fitting.length > 0 && takeable === fitting.length;
  const spare = plan.spare;
  const uses = [
    paceOpen && paceOn(state, state.day) === 'steady' ? `a careful pace makes redos ${Math.round(100 / RULES.pace.careful.reworkPercent)} times rarer` : null,
    hagglers.length ? 'a price offer below would use them' : null,
    flyersOpen ? 'flyers (Studio tab) bring neighbours tomorrow' : null,
  ].filter((u) => u !== null);
  // Regulars among those who fit: who gets the hours is the player's to work out, but what leaving one out costs is said.
  const regularsHere = fitting.filter((r) => isRegular(state, r.castId));
  // Hours already spoken for: more buyers through a lower price would not fit, so the price stays.
  const full = fitting.length < buyers.length || takeable < fitting.length;
  // The first morning teaches one take by hand before offering the shortcut.
  const handTaught = state.day > 0 || answered.some((r) => r.status === 'accepted');
  const [unfolded, setUnfolded] = useState<string[]>([]);
  const same = useMemo(() => hydrateSame(state, plan.same), [state, plan]);
  const groups = new Map([...same].filter(([k]) => !unfolded.includes(k)));
  const groupOf = (r: Request) => [...groups].find(([, rs]) => rs.includes(r));
  const walkersRef = useRef<HTMLDetailsElement>(null);
  const foldLate = conflicts.length >= 2;
  const lateRef = useRef<HTMLDetailsElement>(null);
  const selectedLate = foldLate && conflicts.some((r) => r.id === selected);
  useEffect(() => {
    if (selectedLate && lateRef.current) lateRef.current.open = true;
  }, [selectedLate]);
  const selectedWalker = walkers.some((r) => r.id === selected);
  useEffect(() => {
    if (selectedWalker && walkersRef.current) walkersRef.current.open = true;
  }, [selectedWalker]);

  let status: string;
  if (waiting.length) status = `${waiting.length} waiting; anyone unanswered leaves when you open.`;
  else if (all.length) status = "Everyone has an answer. Open the shop when you're ready.";
  else if (state.day === 0) status = 'Nobody at the window yet.';
  else status = 'A quiet morning: nobody came to the window. Flyers from the studio bring neighbours tomorrow.';

  // How many of the buyers today's hours take, live as buyers are taken; the plan below shows where the hours are.
  // The last days are a sprint: how far the next medal is, against what is already on its way.
  const sprint = (() => {
    const par = medalParFor(state);
    const left = RULES.days - state.day;
    if (!par || state.finished || left > 4) return null;
    const served = summarize(state).served;
    const next = (['bronze', 'silver', 'gold'] as const).find((m) => served < par[m]);
    if (!next) return null;
    // Orders still open whose every launch is due before the season closes.
    const jobsOf = (c: (typeof state.contracts)[number]) => c.jobIds.map((id) => state.jobs.find((j) => j.id === id)!);
    const coming = state.contracts.filter((c) => {
      const js = jobsOf(c);
      return js.some((j) => j.status !== 'delivered') && js.every((j) => j.status === 'delivered' || ((j.status === 'active' || j.status === 'scheduled') && j.dueAt <= RULES.days * RULES.minutesPerDay));
    }).length;
    const need = par[next] - served;
    // Silver and gold also need a profit: a sprint for them while heading for a loss says so, rather than contradict the bar.
    const heading = profitHeading(state);
    const loss = next !== 'bronze' && heading !== null && heading < 0 ? ` ${next.charAt(0).toUpperCase()}${next.slice(1)} also needs a profit, and the season is heading for a loss.` : '';
    return `${left === 1 ? 'Last day' : `${left} days left`}: ${next} needs ${need} more served${coming ? `, and ${coming} ${coming === 1 ? 'is' : 'are'} in the works` : ''}.${need > coming ? ` ${need - coming} more must come from the window${left === 1 ? ' today' : ''}.` : ''}${loss}`;
  })();
  // The street race, every morning: the studio just ahead and the one just behind, so there is always a near target.
  const race = (() => {
    if (state.day === 0 || state.finished || state.config.continuation) return null;
    // Said at once while the other studios are worked out, so nothing below jumps when they arrive.
    if (!rivals) return 'Street race: working out the other studios...';
    const you = summarize(state).served;
    const ahead = rivals.filter((r) => r.served > you).sort((a, b) => a.served - b.served)[0];
    const behind = rivals.filter((r) => r.served <= you).sort((a, b) => b.served - a.served)[0];
    const parts = [
      ahead ? `${ahead.label} is ${ahead.served - you} ahead of you` : 'you lead the street',
      behind ? (behind.served === you ? `${behind.label} is level` : `${behind.label} ${you - behind.served} behind`) : null,
    ].filter(Boolean);
    return `Street race: ${parts.join('; ')}.`;
  })();
  // The landlord's rent review, announced three mornings ahead and settled on its morning.
  const reviewLine = (() => {
    const r = getScenario(state.config.scenarioId).review;
    const served = summarize(state).served;
    if (state.finished || state.day < r.day - 3 || state.day > r.day) return null;
    const carriedRent = state.config.continuation?.rentExtra ?? 0;
    const rent = `${RULES.shopDailyCost + carriedRent} cr a day`;
    const risen = `${RULES.shopDailyCost + carriedRent + RULES.rentRise} cr`;
    if (state.day === r.day) return state.events.some((e) => e.type === 'review') || served >= r.served ? `Rent review today: ${served} served, so the rent stays at ${rent}.` : `Rent review today: ${served} served, under ${r.served}, so rent and supplies now cost ${risen} a day.`;
    if (served >= r.served) return `Rent review on ${dayLabel(r.day)}: you have ${served} served, past the ${r.served} that keeps the rent at ${rent}.`;
    return `Rent review on ${dayLabel(r.day)}: ${r.served} served by then keeps the rent at ${rent}; under it, ${risen}. You have ${served}.`;
  })();
  // A review already won is a note, not the morning's headline.
  const reviewOpen = reviewLine !== null && summarize(state).served < getScenario(state.config.scenarioId).review.served;
  // The risk already carried: promises due by tomorrow that one redo would make late, with its odds.
  const exposed = plan.exposed;
  const exposure = exposed.length
    ? `Riding on no redo: ${exposed
        .slice(0, 3)
        .map((x) => {
          const j = state.jobs.find((y) => y.id === x.jobId)!;
          return `${promiseLabel(state, j.id, 'customer')} ${j.dueAt <= (state.day + 1) * RULES.minutesPerDay ? 'tonight' : 'tomorrow'} (${oneIn(x.bp).replace('about ', '')})`;
        })
        .join(', ')}${exposed.length > 3 ? ` and ${exposed.length - 3} more` : ''}.${
        // The odds that at least one of them misses: what taking all of these risks, said as one number.
        exposed.length > 1 ? ` Together, ${oneIn(10_000 - exposed.reduce((p, x) => (p * (10_000 - x.bp)) / 10_000, 10_000))} that one misses.` : ''
      }`
    : null;
  // Buyers choosing a cheaper offer who would have paid for a dearer one: the cost of a second offer, said once.
  const dearer = buyers.map((r) => wouldPayMore(state, r)).filter((o) => o !== null);
  const cannibal = dearer.length ? `${dearer.length === 1 ? '1 buyer' : `${dearer.length} buyers`} would have paid ${credits(dearer[0]!.price)} for ${dearer[0]!.name} but ${dearer.length === 1 ? 'takes' : 'take'} the cheaper offer.` : null;
  const budget = buyers.length && !state.finished ? `Today's hours take ${takeable === buyers.length ? (buyers.length === 1 ? 'the 1 buyer' : `all ${buyers.length} buyers`) : `${takeable} of the ${buyers.length} buyers`}${namedOnly.length ? ` in queue order. ${names(namedOnly)} ${namedOnly.length === 1 ? 'fits' : 'each fit'} with a maker choice below` : ''}.` : null;
  const makerBrief = (() => {
    for (const r of buyers) {
      const m = makers.get(r.id);
      if (m?.some((c) => c.fits)) return m;
    }
    return null;
  })();

  const notes = [
    race && (sprint || reviewOpen) && (
      <p key="race" className="small race-line">
        {race}
      </p>
    ),
    reviewLine && (sprint || !reviewOpen) && (
      <p key="review" className="small review-line">
        {reviewLine}
      </p>
    ),
    state.overtimeDays.includes(state.day - 1) && !state.finished && (
      <p key="tired" className="small exposure">
        Tired after yesterday's overtime: people's work takes {RULES.staff.tiredPercent - 100}% longer today.
      </p>
    ),
    budget && (
      <p key="budget" className="small hours-budget">
        {budget}
      </p>
    ),
    (buyers.length > 0 || hagglers.length > 0) && <p key="work" className="small work-assumption">Work hours follow the plan, without redos or later orders. Kit setup is separate.</p>,
    cannibal && (
      <p key="cannibal" className="small cannibal-sum">
        {cannibal}
      </p>
    ),
  ].filter(Boolean);

  return (
    <section className="queue workspace-queue" aria-label={isPending ? 'Morning plan' : undefined} aria-labelledby={isPending ? undefined : 'window-h'} aria-busy={!!pending}>
      {isPending ? <><div className="window-scene">{scene}</div><div ref={planning} tabIndex={-1}>{pending}</div></> : <>
      <div className="window-status"><h2 id="window-h" tabIndex={-1}>At the window</h2><p className="small">{waiting.length} waiting · {takeable} fit together in queue order</p>{exposure && <p className="small exposure">{exposure}</p>}</div>
      <div className="morning-overview"><p><strong>Promised today:</strong> {due.length ? due.map(job => promiseLabel(state, job.id)).join('; ') : 'No deliveries due yet.'}</p><p className="small"><strong>Free in the current plan:</strong> {plan.calendar.baseline ? planFree(plan.calendar.baseline).join(', ') : 'No working hours available'}. Forecast assumes no redos or later changes.</p>{baseline.atRisk.length > 0 && <p className="small exposure">Already at risk: {lateNames(state, baseline.atRisk)}.</p>}</div>
      <div className="roster-controls"><span className="small">{focused ? `${all.indexOf(focused) + 1} of ${all.length} neighbours` : 'A quiet morning'}</span><button ref={compareButton} type="button" className="btn btn-small" onClick={() => setComparing(true)}>Compare / All neighbours ({all.length})</button>{routine.length > 1 && <button type="button" className="btn btn-small" disabled={disabled} onClick={event => { event.currentTarget.focus(); setReplying(true); }}>Reply to remaining ({routine.length})</button>}</div>
      <div className="window-neighbours"><div className="window-scene">{scene}</div><details className="roster-peek" open={rosterOpen} onToggle={event => setRosterOpen(event.currentTarget.open)}><summary>Choose a neighbour ({waiting.length} waiting)</summary><ul aria-label="Customer roster">{all.map(rosterRow)}</ul></details></div>
      <Coach step={0} manual text={hasCreativePromiseRules(state.rulesVersion) ? undefined : 'Meet your first neighbour and look at the piece they need. Choose Next when you are ready to make the promise.'} />
      <div ref={decision} className="focused-decision">
        {updatingProof && <p role="status">Updating the quote for this proof. Keep editing; approval will be available when it is ready.</p>}
        {focused?.status === 'waiting' ? <ul className="tickets" aria-label="Focused customer"><Ticket plan={plan.selectedTicket!} calendar={plan.calendar} key={focused.id} state={state} request={focused} forecast={forecasts.get(focused.id) ?? null} baseline={baseline} selected disabled={disabled} proofDisabled={disabled && !updatingProof} onReserve={onReserve} onAccept={onAccept} draft={ordinaryDrafts[focused.id]} onDraft={onDraft} onDecline={onDecline} onSelect={onSelect} /></ul> : focused ? <section className="reply-receipt" tabIndex={-1} aria-label="Customer reply"><h3>{castName(focused.castId)} has your answer</h3><p>{accepted ? `Sold: ${accepted.offer.name}, ${credits(accepted.price)}${accepted.price > 0 ? ' paid up front' : ''}.` : 'You turned this one away.'}</p><p className="small">{accepted ? accepted.reserved ? `Studio capacity reserved from ${dayLabel(accepted.acceptedDay + (accepted.offer.startsInDays ?? 0))}. The agreed price and dates are now a promise.` : 'The agreed price and deadline are now a promise.' : hasAuthorshipRules(state.rulesVersion) && isRegular(state, focused.castId) && !state.lostCast.includes(focused.castId) ? `No promise was made. ${returnAfterReply(state, focused.castId, true)}` : 'Their hours remain available.'}</p><div className="ticket-actions"><button type="button" className="btn" disabled={!canUndo} onClick={onUndo}>Undo reply</button><button type="button" className="btn btn-primary" disabled={!waiting.length} onClick={() => { const id = nextCustomer(all, focused.id); if (id) onSelect(id); }}>Next customer{waiting.length ? ` (${waiting.length})` : ''}</button></div></section> : <p>Everyone has an answer. Open when you are ready.</p>}
      </div>
      {focused?.status === 'waiting' && (capacityPressure || leversOpen) && <details className="decision-levers" open={leversOpen} onToggle={event => setLeversOpen(event.currentTarget.open)}><summary>Make room for more work</summary>{levers.length ? <ul className="levers">{levers.map(l => <li key={l.id}><button type="button" className="btn btn-small" disabled={disabled} onClick={() => onLevers(l.commands)}>{l.label}{l.cost ? ` (${credits(l.cost)})` : ''}</button><span className="small">{leverResult(state, l)}</span></li>)}</ul> : leversOpen && <p className="small">{capacityPressure ? 'None of these changes makes room for a different buyer in queue order.' : 'The current plan already fits every buyer in queue order.'}</p>}</details>}
      </>}
      {replying && <ReplyReview state={state} disabled={disabled} onClose={() => setReplying(false)} onReply={onDeclineAll} />}
      {comparing && <dialog ref={comparison} className="queue-comparison" aria-labelledby="compare-h" onCancel={closeCompare} onClose={closeCompare}><header><h2 id="compare-h" tabIndex={-1}>Compare all neighbours</h2><button type="button" className="btn" data-compare-return onClick={closeCompare}>Return to {focused ? castName(focused.castId) : 'window'}</button></header>{pending ?? <><p>{takeable} fit together, in queue order. Taking one changes the hours left for everyone else.</p>
      {handTaught && takeable > 0 && <button type="button" className="btn compare-bulk" onClick={() => { closeCompare(); onTakeAll(); }} disabled={disabled}>Take everyone who fits ({takeable})</button>}
      {buyers.length > 0 && <h3>Buyers ({buyers.length})</h3>}
      <ul className="tickets" aria-label="Neighbours who would buy">
        {(foldLate ? buyers.filter((r) => !conflicts.includes(r)) : buyers).map((r) => {
          const g = groupOf(r);
          if (!g) return rosterRow(r);
          const [key, rs] = g;
          if (rs[0] !== r) return null;
          const x = reactionTo(state, r);
          const w = plan.queue.work.get(r.id)!;
          const take = plan.sameTakeable.get(key)!;
          const goal = (GOALS[state.config.scenarioId] ?? []).find((q) => q.counts?.(r) && !q.met(state));
          const ids = rs.map((q) => q.id);
          return (
            <li key={key} className="ticket ticket-waiting ticket-row ticket-group" style={{ '--hue': CAST_BY_ID[r.castId]!.hue } as CSSProperties} aria-labelledby={`tg-${r.id}`}>
              <div className="ticket-head">
                <span className="ticket-dot" aria-hidden="true" />
                <span className="ticket-name" id={`tg-${r.id}`}>
                  {rs.length} want the same
                </span>
                {goal && (
                  <span className="tag tag-goal" title={goal.label}>
                    side goal ({goal.progress(state)})
                  </span>
                )}
                <span className="ticket-biz">{names(rs.length > 4 ? rs.slice(0, 3) : rs)}{rs.length > 4 ? ` and ${rs.length - 3} more` : ''}</span>
              </div>
              {x.kind === 'buy' && (
                <p className="verdict verdict-buy">
                  <strong>{x.offer.name}</strong>, {credits(x.offer.price)} each, due {w.firstDue === state.day ? 'tonight' : dayLabel(w.firstDue)}.
                  <span className={`fit ${take === rs.length ? 'fit-ok' : 'fit-warn'}`}> {take === rs.length ? 'All fit.' : take ? `${take} fit together.` : 'None fit together.'}</span>
                </p>
              )}
              <ul className="comparison-group-roster">{rs.map(rosterRow)}</ul>
              <div className="ticket-actions">
                {take > 0 && (
                  <button type="button" className="btn btn-take" onClick={() => { closeCompare(); onTakeSome(ids); }} disabled={disabled}>
                    {take === rs.length ? `Take all ${take}` : `Take ${take}`}
                  </button>
                )}
                <button type="button" className="btn btn-quiet" onClick={() => { closeCompare(); onDeclineAll(ids); }} disabled={disabled}>
                  Turn them away
                </button>
                <button type="button" className="btn btn-small btn-quiet ticket-find" onClick={() => { setUnfolded((u) => [...u, key]); select(rs[0]!.id); }}>
                  One by one
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {/* Buyers who do not fit fold into one row: they need more hours or a hard choice, and a stack of
          their cards buried the ones that fit. */}
      {foldLate && (
        <details className="late-fold" ref={lateRef} open>
          <summary>
            <span className="walkers-count">
              {conflicts.length} do not fit as things stand
            </span>
            <span className="walkers-who muted small">
              {names(conflicts)}{levers.length ? '. More hours above would fit some.' : '.'}
            </span>
          </summary>
          <ul className="tickets" aria-label="Neighbours who do not fit as things stand">
            {conflicts.map((r) => rosterRow(r))}
          </ul>
        </details>
      )}
      {tooLate.length > 0 && (
        <div className="too-late"><ul className="tickets" aria-label="Too late for this season">{tooLate.map(rosterRow)}</ul>
          <p className="small">
            {names(tooLate)} would buy, but the season ends before {tooLate.length === 1 ? 'their launch' : 'their launches'} could be made.
          </p>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => { closeCompare(); onDeclineAll(tooLate.map((r) => r.id)); }} disabled={disabled}>
            Turn {tooLate.length === 1 ? 'them' : 'them all'} away
          </button>
        </div>
      )}
      {hagglers.length > 0 && (
        <div className="hagglers">
          <p className="small hagglers-head" tabIndex={-1}>
            <strong>
              {hagglers.length === 1 ? '1 would buy' : `${hagglers.length} would buy`} at their own price.
            </strong>{' '}
            Taking one lowers what {[...new Set(hagglers.map((r) => `"${SEGMENTS[r.segment].label}"`))].join(' and ')} customers expect by {RULES.counter.wtpDropPercent}% for {RULES.counter.days} days.
          </p>
          {hagglers.length > 1 && (
            <button type="button" className="btn btn-small btn-quiet" onClick={() => { closeCompare(); onDeclineAll(hagglers.map((r) => r.id)); }} disabled={disabled}>
              Turn them all down
            </button>
          )}
          <ul className="tickets" aria-label="Neighbours who name their own price">
            {hagglers.map((r) => rosterRow(r))}
          </ul>
        </div>
      )}
      {walkers.length > 0 && (
        <div className="walkers">
          <details ref={walkersRef} open>
            <summary>
              <span className="walkers-count">
                {walkers.length} won't buy what's on the window
              </span>
              <span className="walkers-who muted small">
                {names(walkers)}: {whyTheyWalk(state, walkers)}.
              </span>
            </summary>
            <ul className="walker-list">
              {walkers.map((r) => {
                const x = reactionTo(state, r);
                const cast = CAST_BY_ID[r.castId]!;
                return (
                  <li key={r.id} className={selected === r.id ? 'is-selected' : ''}>
                    <button type="button" className="btn btn-small" onClick={() => select(r.id)}>{cast.name}</button> <span className="muted small">{cast.business}</span>
                    <span className="walker-quote">&ldquo;{objection(x.kind === 'walk' ? x.reason : 'price', r.segment)}&rdquo;</span>
                  </li>
                );
              })}
            </ul>
          </details>
          {!locked && reprice && full && (
            <p className="muted small">
              {credits(reprice.price)} for {state.menu[reprice.offerIndex]!.name} would win them, but today's hours are already spoken for: a lower price would only earn less for the same work.
            </p>
          )}
          {!locked && reprice && !full && (
            <button type="button" className="btn btn-small btn-paper" onClick={() => onReprice(reprice.offerIndex, reprice.price)} disabled={disabled}>
              Price {state.menu[reprice.offerIndex]!.name} at {credits(reprice.price)}
            </button>
          )}
          {!locked && reprice && !full && (
            <p className="muted small">
              The {reprice.prices.length === 1 ? 'one' : reprice.prices.length} put off by price would buy it then; everyone else who buys it pays {credits(reprice.price)} too, instead of {credits(state.menu[reprice.offerIndex]!.price)}.
              {rates &&
                (rates.earns < rates.costs
                  ? ` At that price a launch earns about ${credits(rates.earns)} per hour of people's time, below the average hourly running cost of ${credits(rates.costs)}.`
                  : ` At that price a launch earns about ${credits(rates.earns)} per hour of people's time, against ${credits(rates.costs)} an hour to run the studio.`)}
            </p>
          )}
          {locked ? (
            <p className="muted small">
              The sign is up for today.{reprice ? ` Tomorrow morning, before taking anyone, price ${state.menu[reprice.offerIndex]!.name} at ${credits(reprice.price)} to win buyers like these.` : ' Redesign tomorrow morning, or undo.'}
            </p>
          ) : (
            <button type="button" className="btn btn-small btn-design" onClick={onDesign} disabled={disabled}>
              Design an offer for them
            </button>
          )}
        </div>
      )}
      {answered.length > 0 && (
        <ul className="tickets tickets-answered" aria-label="Answered today">
          {answered.map((r) => rosterRow(r))}
        </ul>
      )}
      <details className="compare-options" open={optionsOpen} onToggle={event => setOptionsOpen(event.currentTarget.open)}><summary>Capacity, offers and morning notes</summary>      <div className="queue-head">
        <h3>Today’s choices</h3>
        {offer && (
          <div className="quick-offer">
              <p><strong>Launchlet: {credits(offer.command.offers.at(-1)!.price)}, simple briefs, ready today.</strong> {offer.today.buyers} would buy; {offer.today.fit} fit today in queue order if no redos.</p>
              <p className="small muted">
                Hand-made templates.
                {offer.kitMinutes > 0 && ` ${state.kit.status === 'none' ? 'First kit' : 'Kit still needs'}: ${hours(offer.kitMinutes)} once.`}
                {` After kit: about ${hours(offer.minutesAfterKit)}/launch`}{offer.economicsAfterKit ? `, ${credits(offer.economicsAfterKit.earns)}/hour against ${credits(offer.economicsAfterKit.costs)}/hour to run` : ''}. AI is a separate desk choice.
                {offer.reach.switched > 0 && ` ${offer.reach.switched} swap from ${state.menu[0]!.name} (${credits(state.menu[0]!.price)}); ${offer.newBuyers} new.`}
              </p>
            <div className="quick-offer-actions">
              <button type="button" className="btn btn-small btn-paper" onClick={() => { closeCompare(); onQuickOffer(); }} disabled={disabled || locked}>Put Launchlet on the window</button>
              <button type="button" className="btn btn-small btn-quiet" onClick={onDesign} disabled={disabled || locked}>Customise an offer</button>
            </div>
          </div>
        )}
        {/* One headline, the most pressing target, and the risk already carried; the rest folds into today's notes.
            The harsh panel read eight header lines as a wall before the first buyer. */}
        {sprint ? <p className="sprint">{sprint}</p> : reviewOpen ? <p className="sprint review-line">{reviewLine}</p> : race && <p className="sprint race-line">{race}</p>}
        {exposure && <p className="small exposure">{exposure}</p>}
        {baseline.atRisk.length > 0 && <p className="small exposure">Already late without taking anyone else, even without redos or changes: {lateNames(state, baseline.atRisk)}.</p>}
        {baseline.existingAfterSeason.length > 0 && <p className="small exposure">Already unfinished at closing without taking anyone else, even without redos or changes: {lateNames(state, baseline.existingAfterSeason)}. That work would be refunded.</p>}
        {outlook && <p className="small morning-money" id="outlook"><strong>Tonight, if no redos or changes:</strong> {outlook.delivered} launch{outlook.delivered === 1 ? '' : 'es'} out, {credits(outlook.earned)} earned, against {credits(outlook.running)} to run the day.{outlook.missed > 0 ? ` ${outlook.missed} miss even then.` : ''}</p>}
        {makerBrief && <p className="small maker-brief">{makersContested(state, makerBrief) ?? 'Ada is careful; Tomas is quicker. Pick who makes each tricky brief below.'}</p>}
        {notes.length ? (
          <details className="queue-notes">
            <summary className="small">
              <strong>Today's notes ({notes.length}):</strong> {status}
            </summary>
            {notes}
          </details>
        ) : (
          <p className="muted small">{status}</p>
        )}
        {paceOpen && !state.finished && <PaceControl pace={paceOn(state, state.day)} disabled={disabled} onPace={onPace} />}
        {!state.finished && <DayPlan state={state} considering={null} calendar={plan.calendar} folded />}
        {handTaught && (fitting.length > 0 || levers.length > 0) && (
          <div className="take-all">
            {conflicts.length > 0 && (
              <p className="small take-all-conflict">
                {names(conflicts)} {conflicts.length === 1 ? "doesn't" : "don't"} fit.{levers.length > 0 && ' More hours today:'}
              </p>
            )}
            {levers.length > 0 && (
              <ul className="levers">
                {levers.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="btn btn-small btn-paper" onClick={() => onLevers(l.commands)} disabled={disabled}>
                      {l.label}
                      {l.cost ? ` (${credits(l.cost)})` : ''}
                    </button>
                    <span className="small">
                      {leverResult(state, l)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {fitting.length > 0 && takeable < fitting.length && (
              <p className="small take-all-choose">
                {namedOnly.length > 0 && 'Without choosing makers, '}{fitting.length} fit on their own, but only {takeable} together. Choose who gets the hours: the rest update as you take them.
                {regularsHere.length > 0 && (
                  <strong>
                    {' '}
                    {names(regularsHere)} {regularsHere.length === 1 ? 'is a regular' : 'are regulars'}: {hasAuthorshipRules(state.rulesVersion) ? 'decline clearly, or book a later slot. Left unanswered, they will not return.' : "left out, they won't be back."}
                  </strong>
                )}
                {levers.length && !conflicts.length ? ' Or add hours above.' : ''}
              </p>
            )}
            {allFit && spare >= 120 && uses.length > 0 && (
              <p className="small spare">
                After them, about {hours(spare)} sit free today: {uses.join('; ')}.
              </p>
            )}
          </div>
        )}
      </div>

</details>
      </>}
      </dialog>}
    </section>
  );
});
