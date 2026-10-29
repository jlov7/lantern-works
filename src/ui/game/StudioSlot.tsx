import { useMemo, useState } from 'react';
import type { CreativeIntention, DesignSpec } from '../../engine/design';
import { fits } from '../../engine/selectors';
import type { CompanyState, Request } from '../../engine/types';
import { RULES } from '../../engine/rules';
import { credits, dayLabel } from '../format';
import { studioSlot } from './commissionFacts';

export function StudioSlot({ state, request, disabled, design, intention, onReserve }: { state: CompanyState; request: Request; disabled: boolean; design?: DesignSpec; intention?: CreativeIntention; onReserve: (id: string, startsInDays: 1 | 2) => void }) {
  const [selected, setSelected] = useState<1 | 2>(1);
  const [confirming, setConfirming] = useState(false);
  const [revision, setRevision] = useState(state.revision);
  if (revision !== state.revision) { setRevision(state.revision); if (confirming) setConfirming(false); }
  const options = useMemo(() => ([1, 2] as const).map(days => studioSlot(state, request.id, days, design, intention)), [state, request.id, design, intention]);
  const option = options.find(choice => choice.startsInDays === selected)!;
  const risky = !!option.estimate && !fits(option.estimate);
  return <details className="studio-slot"><summary>Reserve future studio capacity</summary>
    <p>This is a studio slot, with payment now. It does not reserve Ada, Tomas or any other named maker.</p>
    <fieldset disabled={disabled}><legend>Work starts</legend><div className="slot-dates">{options.map(choice => <label key={choice.startsInDays}><input type="radio" name={`slot-${request.id}`} checked={selected === choice.startsInDays} onChange={() => { setSelected(choice.startsInDays); setConfirming(false); }} />{dayLabel(state.day + choice.startsInDays)}{choice.startsInDays === 1 ? ' (tomorrow)' : ' (in two days)'}</label>)}</div></fieldset>
    {option.blocked ? <p className="risk risk-warn">{option.blocked}</p> : option.quote && <>
      <p><strong>{option.quote.offer.name}, {credits(option.quote.price)} paid now.</strong> The price and dates stay fixed after booking.</p>
      <ul className="quote-dates">{option.jobs!.map((job, index) => <li key={job.id}>Launch {index + 1}: starts {dayLabel(job.releaseDay)}, due {dayLabel(job.dueAt / RULES.minutesPerDay - 1)}.</li>)}</ul>
      <p className={`risk risk-${option.risk!.tone === 'ok' ? 'ok' : 'warn'}`}>{option.risk!.chip} {option.risk!.detail}</p>
      <p className="small">{option.others} other waiting buyers still fit in queue order. Forecast excludes redos, later orders and changes to the studio.</p>
      {confirming && <p className="risk risk-bad" role="status">The forecast failure remains. Confirm only if you intend to carry that risk.</p>}
      <button type="button" className="btn btn-take" disabled={disabled} onClick={() => risky && !confirming ? setConfirming(true) : onReserve(request.id, selected)}>{risky ? confirming ? `Yes, reserve ${dayLabel(state.day + selected)} anyway` : `Reserve ${dayLabel(state.day + selected)} despite the forecast` : `Reserve studio capacity for ${dayLabel(state.day + selected)}`}</button>
    </>}
  </details>;
}
