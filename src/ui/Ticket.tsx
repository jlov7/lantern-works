import { memo, useState, type CSSProperties, type JSX } from 'react';
import { objection } from '../engine/demand';
import { GOALS } from '../engine/goals';
import { CAST_BY_ID, RULES, SEGMENTS } from '../engine/rules';
import { counterFor, fits, reactionTo, type Forecast } from '../engine/selectors';
import { hasAuthorshipRules, hasCreativePromiseRules, hasStudioRules } from '../engine/versions';
import { ordinaryBrief, ordinaryRequestLine } from '../engine/ordinary';
import { compatiblePatterns } from '../engine/patterns';
import type { CreativeIntention, DesignSpec } from '../engine/design';
import { StudioSlot } from './game/StudioSlot';
import { isRegular, redoBpToday, routedToAi } from '../engine/sim';
import type { CompanyState, Request } from '../engine/types';
import { credits, dayLabel, hours, oneIn, SOURCE_LABEL } from './format';
import { bookingLine } from './game/booking';
import type { MorningPlan, TicketPlan } from './game/morningPlan';
import { wouldPayMore } from './game/sameOrders';
import { forecastRisk } from './game/forecastRisk';
import { capacityCost } from './game/capacityCosts';
import { separateOrderLine } from './game/orderIntake';
import { BriefPreview } from './game/BriefPreview';
import { DayPlan } from './game/DayPlan';
import { rememberedLine } from './game/regulars';
import { FirstProof } from './creative/FirstProof';
import type { OrdinaryDraft } from './game/ordinaryComposition';
import { Coach } from './game/Guide';
import { returnAfterReply } from './game/morningReplies';
import { laterRequestCopy } from './game/careerContinuity';

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

interface Props {
  plan: TicketPlan;
  calendar: MorningPlan['calendar'];
  onReserve: (id: string, startsInDays: 1 | 2, design?: DesignSpec, intention?: CreativeIntention) => void;
  state: CompanyState;
  request: Request;
  forecast: Forecast | null;
  baseline: Forecast;
  selected: boolean;
  disabled: boolean;
  proofDisabled?: boolean;
  onAccept: (id: string, counter?: boolean, maker?: string, design?: DesignSpec, intention?: CreativeIntention) => void;
  draft?: OrdinaryDraft;
  onDraft: (id: string, draft: OrdinaryDraft) => void;
  onDecline: (id: string) => void;
  onSelect: (id: string) => void;
  /** A short row: no quote, no shared caveat, and the fit line only when something is wrong. */
  compact?: boolean;
}

/** A neighbour at the window who would buy: the decision. Answered tickets fold to one line. */
export const Ticket = memo(function Ticket({ state, plan, calendar, request, forecast, baseline, selected, disabled, proofDisabled = disabled, onAccept, onDecline, onReserve, draft, onDraft, compact = false }: Props): JSX.Element {
  const cast = CAST_BY_ID[request.castId]!;
  const style = { '--hue': cast.hue } as CSSProperties;
  // The sale stamp only animates for a sale made while this ticket was on screen.
  const [fresh] = useState(request.status === 'waiting');
  // A neighbour who named their own price (GD-11): taking it is a counter-offer, judged by the same forecast.
  const ask = request.status === 'waiting' ? counterFor(state, request) : null;
  const isCounter = ask !== null;
  const risky = request.status === 'waiting' && forecast !== null && !fits(forecast);
  const addedRisk = forecast !== null && (forecast.newAtRisk.length > 0 || forecast.newAfterSeason.length > 0 || forecast.atRisk.some((id) => !baseline.atRisk.includes(id)) || forecast.existingAfterSeason.some((id) => !baseline.existingAfterSeason.includes(id)));
  const { fix, work, tight, makers } = plan;
  // A take that puts a promise at risk needs a second click, so a quick run of clicks cannot slip one through.
  const [confirming, setConfirming] = useState(false);
  const [maker, setMaker] = useState<string | null>(null);
  if (confirming && !risky) setConfirming(false);


  if (request.status !== 'waiting') {
    const c = request.status === 'accepted' ? state.contracts.find((x) => x.id === request.contractId) : undefined;
    return (
      <li id={`ticket-${request.id}`} className={`ticket ticket-folded ticket-${request.status}${selected ? ' is-selected' : ''}`} style={style}>
        <span className="ticket-dot" aria-hidden="true" />
        <span className="ticket-name">{cast.name}</span>
        {c ? (
          <span className="verdict verdict-sold">
            Sold: {c.offer.name}, {credits(c.price)}
            {c.price > 0 ? ' paid up front' : ''}.
          </span>
        ) : (
          <span className="verdict verdict-muted">You turned this one away.</span>
        )}
        {c && (
          <span className={`stamp${fresh ? ' stamp-fresh' : ''}`} aria-hidden="true">
            Sold
          </span>
        )}
      </li>
    );
  }

  const reaction = reactionTo(state, request);
  const line = ordinaryRequestLine(request) ?? laterRequestCopy(state, request, request.offer)?.request ?? cast.lines[request.lineIndex] ?? cast.lines[0];
  const memory = rememberedLine(state, request);
  const source = SOURCE_LABEL[request.source];
  const separate = separateOrderLine(state, request);
  const buying = reaction.kind === 'buy';
  const offer = buying ? reaction.offer : null;
  const asked = ask ? state.menu[ask.offerIndex]! : null;
  const other = wouldPayMore(state, request);
  const goal = (GOALS[state.config.scenarioId] ?? []).find((g) => g.counts?.(request) && !g.met(state));
  // A neighbour you have already delivered for: the relationship the end screen celebrates, visible at the window.
  const servedBefore = state.contracts.filter((c) => c.castId === request.castId && c.jobIds.every((id) => state.jobs.find((j) => j.id === id)?.status === 'delivered')).length;
  const workText = work?.first === null ? `The plan does not finish their first launch by ${work.firstDue === state.day ? 'tonight' : dayLabel(work.firstDue)}.` : null;
  const toAi = state.staffing.aiTier !== 'none' && routedToAi(state.staffing, request);
  const bp = redoBpToday(state, toAi ? 'ai' : 'human', request.need);
  const brief = request.need === 'nuanced' ? 'tricky briefs' : 'simple briefs';

  // One row: who, what, how long, and whether it fits. Their words, the tags past the first and the small print open
  // with Show. The harsh panel read a window of full cards as "a wall of text".
  const tags: { key: string; cls: string; text: string; title?: string }[] = [];
  // A regular leads: turned away or left waiting, they do not come back.
  if (servedBefore > 0) tags.push({ key: 'regular', cls: 'tag-regular', text: `back for a ${ORDINAL[Math.min(servedBefore + 1, 5)]} launch`, title: hasAuthorshipRules(state.rulesVersion) ? 'A regular. Decline clearly to leave room for a later visit; leaving them unanswered loses the relationship.' : "A regular: turned away, or left waiting when you open, they won't come back" });
  if (source) tags.push({ key: 'source', cls: `tag-source tag-${request.source}`, text: source });
  if (request.need === 'nuanced') tags.push({ key: 'careful', cls: 'tag-careful', text: 'tricky brief' });
  if (goal) tags.push({ key: 'goal', cls: 'tag-goal', text: `side goal (${goal.progress(state)})`, title: goal.label });
  const open = selected;
  const shown = open ? tags : tags.slice(0, 1);
  const deal = (offer ?? asked)!;
  const quickBrief = deal && hasCreativePromiseRules(state.rulesVersion) ? ordinaryBrief(request, deal) : null;
  const proof = quickBrief ? draft ?? { design: quickBrief.defaultDesign } : undefined;
  const take = (counter = false, maker?: string) => onAccept(request.id, counter, maker, proof?.design, proof?.intention);
  // Medals need 90% of promises kept. In the last days, with no miss to spare even if everything in the works goes
  // out, a bet on this buyer is a bet on the medal. Earlier there is time to make it up, so it is not said.
  const kept = state.jobs.filter((j) => j.status === 'delivered' || j.status === 'active' || j.status === 'scheduled').length;
  const stake = RULES.days - state.day <= 4 && Math.floor(kept / 9) - state.jobs.filter((j) => j.status === 'missed').length <= 0;
  // The choice of maker replaces the one Take button when at least one of them fits.
  const choose = makers?.some((m) => m.fits) ? makers : null;
  const risk = forecast && deal && !choose ? forecastRisk(state, forecast, baseline, deal.launches, tight, stake) : null;
  const when = work ? `${choose || work.first === null ? '' : `${work.launches > 1 ? 'first launch: ' : ''}about ${hours(work.first)}, `}due ${work.firstDue === state.day ? 'tonight' : dayLabel(work.firstDue)}` : null;

  return (
    <li id={`ticket-${request.id}`} tabIndex={-1} className={`ticket ticket-waiting ticket-row${compact ? ' ticket-compact' : ''}${selected ? ' is-selected' : ''}`} style={style} aria-labelledby={`tn-${request.id}`}>
      <div className="ticket-head">
        <span className="ticket-dot" aria-hidden="true" />
        <h3 className="ticket-name" id={`tn-${request.id}`} tabIndex={-1} data-customer-heading>
          {cast.name}
        </h3>
        <span className="ticket-biz">{cast.business}</span>
        {shown.map((t) => (
          <span key={t.key} className={`tag ${t.cls}`} title={t.title}>
            {t.text}
          </span>
        ))}
        {!open && tags.length > 1 && <span className="ticket-more-n small">+{tags.length - 1}</span>}
      </div>
      {open && !compact && (
        <><p className="ticket-line">{line}</p>{memory && <p className="ticket-memory">“{memory}”</p>}{servedBefore > 0 && hasAuthorshipRules(state.rulesVersion) && <p className="small">If you decline before promising, no promise is broken. {returnAfterReply(state, request.castId)} Leaving this request unanswered when you open loses the relationship.</p>}</>
      )}
      <p className="verdict verdict-buy">
        {!buying && !ask && reaction.kind === 'walk' && <span>Will not buy: {objection(reaction.reason, request.segment)}</span>}
        {offer && request.offer && offer.price === 0 ? (
          <>
            Back after last time: <strong>a free launch</strong>, made with care{when ? `, ${when}` : ''}.
          </>
        ) : ask && asked ? (
          <>
            Offers <strong>{credits(ask.price)}</strong> for {asked.name} (you ask {credits(asked.price)}){when ? `, ${when}` : ''}.
          </>
        ) : (
          offer && (
            <>
              {request.offer ? 'Their own order: ' : ''}
              <strong>{offer.name}</strong>, {credits(offer.price)}
              {when ? `, ${when}` : ''}.
            </>
          )
        )}
        {risk && <span className={`fit fit-${risk.tone}`}> {risk.chip}</span>}
      </p>
      {open && !compact && quickBrief && proof && <FirstProof castId={request.castId} briefId={request.briefId} patterns={compatiblePatterns(state, quickBrief)} brief={quickBrief} draft={proof} disabled={proofDisabled} onChange={next => onDraft(request.id, next)} />}
      {request.source === 'booking' && <p className="small booking-line">{choose ? `One neighbour towards your medal count, ${deal.launches} launches starting tomorrow. Each maker's first-launch work is below, before tomorrow's new buyers. If it all goes out on time, big-night neighbours hear about it.` : bookingLine(state, request)}</p>}
      {!compact && !separate && request.source !== 'booking' && !request.offer && (open || servedBefore > 0) && <p className="small ticket-future">{servedBefore > 0 ? hasAuthorshipRules(state.rulesVersion) ? 'A clear reply keeps the door open. Silence loses the relationship.' : 'Keep this regular: left out, they will not return.' : `On time: stronger "${SEGMENTS[request.segment].label}" word of mouth.`}</p>}
      {separate && <p className="small ticket-future">{separate}</p>}
      {choose && (
        <fieldset className="maker-choice"><legend>Who makes it?</legend><div className="maker-actions" role="group" aria-label={`Who makes ${cast.name}'s launch`}>
          {choose.map((m) => (
            <button key={m.id} type="button" className={`btn btn-maker${maker === m.id ? ' is-chosen' : ''}`} aria-pressed={maker === m.id} aria-label={`${m.name} makes it`} aria-describedby={`maker-${request.id}-${m.id}${m.fits ? ` maker-after-${request.id}-${m.id}` : ''}`} onClick={() => setMaker(m.id)} disabled={disabled || !m.fits}>
              <span><span className="maker-radio" aria-hidden="true">{maker === m.id ? '●' : '○'}</span> <strong>{m.name}</strong></span>
              <span className="small" id={`maker-${request.id}-${m.id}`}>{m.busyWith ? `Busy with ${m.busyWith}` : !m.fits ? 'Does not fit' : `about ${hours(m.mins)} work, ${m.firstTime}% without redo`}</span>
              {m.fits && <span className="small" id={`maker-after-${request.id}-${m.id}`}>{m.others} other buyer{m.others === 1 ? '' : 's'} still fit</span>}
            </button>
          ))}
        </div></fieldset>
      )}
      {open && (
        <div className="ticket-small">
          {!choose && addedRisk && workText && <p className="small">{workText}</p>}
          {ask && !compact && (
            <p className="cannibal small">
              Take it and &ldquo;{SEGMENTS[request.segment].label}&rdquo; customers expect {RULES.counter.wtpDropPercent}% less for {RULES.counter.days} days.
            </p>
          )}
          {other && <p className="cannibal small">Would have paid {credits(other.price)} for {other.name}.</p>}
          {risk?.detail && <p className={`risk risk-${risk.tone === 'bad' ? 'bad' : 'warn'}`}>{risk.detail}</p>}
          {!choose && (buying || isCounter) && bp >= 1000 && (
            <p className="risk risk-warn">
              {oneIn(bp).replace(/^a/, 'A')} {toAi ? 'AI-drafted' : 'hand-made'} {brief} need rework.
            </p>
          )}
        </div>
      )}
      {!choose && fix && (
        <p className="risk risk-fix">
          {fix === 'overtime'
            ? `Fits with overtime (${credits(capacityCost(state, 'overtime').total)} at opening, in The studio).`
            : `Fits with a temp (${credits(capacityCost(state, 'temp').total)} total${state.overtimeDays.includes(state.day) ? ', including extra overtime at opening' : ', paid now'}, in The studio).`}
        </p>
      )}
      {!choose && confirming && (
        <p className="risk risk-bad" id={`confirm-${request.id}`} role="status">
          {risk?.chip ?? 'A forecast failure remains.'} Click again to take them anyway; Undo works until you open.
        </p>
      )}
      <Coach step={1} manual={!buying && !isCounter} />
      <div className="ticket-actions">
        {choose && <button type="button" className="btn btn-take" disabled={disabled || !choose.some(m => m.id === maker && m.fits)} onClick={() => maker && take(false, maker)}>{maker ? `Take with ${choose.find(m => m.id === maker)?.name}` : 'Choose a maker'}</button>}
        {(buying || isCounter) && !choose && (
          <button
            type="button"
            className={`btn btn-take${risky ? ' btn-take-risky' : ''}`}
            onClick={() => (risky && !confirming ? setConfirming(true) : take(isCounter))}
            disabled={disabled}
            aria-describedby={confirming ? `confirm-${request.id}` : undefined}
          >
            {(() => {
              const take = ask ? `Take at ${credits(ask.price)}` : 'Take it';
              return risky ? (confirming ? `Yes, ${take.charAt(0).toLowerCase()}${take.slice(1)} anyway` : `${take} anyway`) : take;
            })()}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => onDecline(request.id)} disabled={disabled}>
          {hasAuthorshipRules(state.rulesVersion) ? 'Decline this request' : buying ? (servedBefore > 0 ? 'Turn away for good' : 'Turn away') : isCounter ? 'Turn down' : 'Let them go'}
        </button>

      </div>
      {open && buying && !choose && <details className="decision-plan"><summary>See the work plan</summary><DayPlan state={state} considering={request.id} calendar={calendar} /></details>}
      {hasStudioRules(state.rulesVersion) && !request.offer && ['walkin', 'word', 'flyer', 'news'].includes(request.source) && isRegular(state, request.castId) && <StudioSlot state={state} request={request} design={proof?.design} intention={proof?.intention} disabled={disabled} onReserve={(id, startsInDays) => onReserve(id, startsInDays, proof?.design, proof?.intention)} />}
      {!quickBrief && <BriefPreview request={request} offer={deal ?? undefined} config={state.config} rulesVersion={state.rulesVersion} />}
    </li>
  );
});
