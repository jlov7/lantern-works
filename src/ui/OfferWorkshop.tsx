import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { react, validateOffer } from '../engine/demand';
import { PRESETS, RULES } from '../engine/rules';
import { windowRequests } from '../engine/selectors';
import type { CompanyState, OfferSpec } from '../engine/types';
import type { OfferField } from '../ai/fields';
import { compileOfferOffline } from '../ai/offer';
import { aiAvailable, aiLabel, callsLeft, compileOfferClaude } from './advisor';
import { credits, hours, offerTerms } from './format';
import { Segmented } from './game/Segmented';
import { SegmentList } from './game/WorkshopPreview';
import { fitsToday, offerEconomics, reachOf, workNote } from './game/workshopMath';

interface Props {
  state: CompanyState;
  slot: number;
  /** Returns why the window refused it, or null once it is up. */
  onSave: (offer: OfferSpec, slot: number) => string | null;
  onClose: () => void;
  onOpenKey: () => void;
}

/** The workshop's example idea. advisor tests check it compiles to an offer small shops buy; keep them in step. */
export const IDEA_PLACEHOLDER = 'Something weekly for the little cafes, about 300 a go';

export function OfferWorkshop({ state, slot: initialSlot, onSave, onClose, onOpenKey }: Props): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  // A full window opened from the hint asks which offer to replace, starting with the one fewest people at the window would buy.
  const choosing = initialSlot < 0;
  const [slot, setSlot] = useState(() => {
    if (!choosing) return initialSlot;
    const waiting = windowRequests(state).filter((r) => r.status === 'waiting');
    const wants = state.menu.map((_, i) => waiting.filter((r) => {
      const x = react(r, state.menu, state.lostCast);
      return x.kind === 'buy' && x.offerIndex === i;
    }).length);
    return wants.indexOf(Math.min(...wants));
  });
  const [draft, setDraft] = useState<OfferSpec>(() => (choosing ? { ...PRESETS.launchlet } : { ...(state.menu[initialSlot] ?? PRESETS.launchlet) }));
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; source: string; adjustments: string[] } | null>(null);
  const [assumed, setAssumed] = useState<OfferField[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const set = <K extends keyof OfferSpec>(k: K, v: OfferSpec[K]) => {
    setAssumed((a) => a.filter((f) => f !== k));
    setDraft((d) => {
      const next = { ...d, [k]: v };
      if (next.style === 'templated') next.scope = 'simple';
      return next;
    });
  };

  const others = state.menu.filter((_, i) => i !== slot);
  const invalid = validateOffer(draft) ?? (others.some((o) => o.name.trim().toLowerCase() === draft.name.trim().toLowerCase()) ? 'Another offer on the window already has this name.' : null);
  const priceErr = invalid?.startsWith('Price') ? invalid : null;
  const nameErr = invalid && (invalid.startsWith('Name') || invalid.startsWith('Another')) ? invalid : null;
  // While a field is wrong, keep showing the last offer that worked, dimmed, instead of a blank preview.
  const [lastValid, setLastValid] = useState(draft);
  if (!invalid && lastValid !== draft) setLastValid(draft);
  const shown = invalid ? lastValid : draft;
  const reach = useMemo(() => reachOf(state, shown, slot), [state, shown, slot]);
  const today = useMemo(() => fitsToday(state, shown, slot), [state, shown, slot]);
  const money = useMemo(() => offerEconomics(state, shown), [state, shown]);

  const daysLeft = RULES.days - state.day;
  const fit = draft.launches > 1 ? Array.from({ length: draft.launches }, (_, k) => k * draft.spacingDays).filter((o) => o < daysLeft).length : 1;

  async function draftIt() {
    if (!idea.trim()) return;
    setErr(null);
    if (!aiAvailable()) {
      const r = compileOfferOffline(idea, state.day);
      setDraft(r.offer);
      setAssumed(r.assumed);
      setNote({ text: r.pitch, source: 'Read by the offline parser (no AI). Add a key to have Claude read it instead.', adjustments: r.adjustments });
      return;
    }
    setBusy(true);
    const r = await compileOfferClaude(idea, state.menu, state.day);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDraft(r.value.offer);
    setAssumed(r.value.assumed);
    setNote({ text: r.value.pitch, source: `Drafted by ${aiLabel()}. The game, not the model, decides who buys it.`, adjustments: r.value.adjustments });
  }

  function save() {
    const offer = { ...draft, name: draft.name.trim() };
    // Nothing changed: nothing to put up, so the workshop just closes.
    if (!choosing && JSON.stringify(offer) === JSON.stringify(state.menu[slot])) return onClose();
    setSaveErr(onSave(offer, slot));
  }

  const mini = invalid ? 'Fix the highlighted field to see who buys.' : `Buys: ${reach.kinds} of 4 kinds${reach.waiting ? `, ${reach.buyThis} of ${reach.waiting} at the window; ${today.fit} fit today in queue order` : ''}.`;

  return (
    <dialog ref={dialog} className="workshop" aria-labelledby="ws-title" onClose={onClose} onCancel={onClose}>
      <form method="dialog" className="workshop-inner" onSubmit={(ev) => ev.preventDefault()}>
        <header className="workshop-head">
          <h2 id="ws-title">Offer workshop</h2>
          <p className="muted">Design what goes on the window. New sales only; promises already made keep their price and dates.</p>
        </header>
        <p className="ws-mini">
          {mini}
        </p>

        <div className="workshop-grid">
          <section className="workshop-form" aria-label="Offer design">
            {choosing && <Segmented label="Replaces" value={slot} options={state.menu.map((o, i) => ({ value: i, label: o.name }))} onChange={setSlot} />}
            <div className="presets" role="group" aria-label="Start from">
              <span className="muted">Start from</span>
              {Object.values(PRESETS).map((p) => (
                <button type="button" key={p.name} className="chip" onClick={() => (setDraft({ ...p }), setAssumed([]))}>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="idea">
              <label htmlFor="idea">Or describe it in your own words</label>
              <div className="idea-row">
                <input id="idea" type="text" maxLength={300} placeholder={IDEA_PLACEHOLDER} value={idea} onChange={(ev) => setIdea(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), void draftIt())} />
                <button type="button" className="btn" onClick={() => void draftIt()} disabled={busy || !idea.trim()}>
                  {busy ? 'Drafting...' : 'Draft it'}
                </button>
              </div>
              <p className="muted small">
                {aiAvailable() ? `${aiLabel()} reads your idea (${callsLeft()} calls left this session).` : 'Offline parser. '}
                {!aiAvailable() && (
                  <button type="button" className="linklike" onClick={onOpenKey}>
                    Use Claude instead
                  </button>
                )}
              </p>
              {err && (
                <p className="error" role="alert">
                  {err}
                </p>
              )}
              {note && (
                <div className="note" role="status">
                  <p>&ldquo;{note.text}&rdquo;</p>
                  <p className="muted small">{note.source}</p>
                  {note.adjustments.map((a) => (
                    <p key={a} className="muted small">
                      Adjusted: {a}
                    </p>
                  ))}
                  {assumed.length > 0 && <p className="muted small">Fields marked assumed weren't in your idea. Check them.</p>}
                </div>
              )}
            </div>

            <label className={`field${assumed.includes('name') ? ' is-assumed' : ''}`}>
              <span>Name on the window</span>
              <input type="text" maxLength={RULES.limits.nameLength} value={draft.name} onChange={(ev) => set('name', ev.target.value)} aria-invalid={nameErr ? true : undefined} aria-describedby={nameErr ? 'name-err' : undefined} />
              {nameErr && (
                <span id="name-err" className="ws-field-error">
                  {nameErr}
                </span>
              )}
            </label>
            <Segmented label="Launches" assumed={assumed.includes('launches')} value={draft.launches} options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => set('launches', v)} />
            {draft.launches > 1 && <Segmented label="One every" assumed={assumed.includes('spacingDays')} value={draft.spacingDays} options={[2, 3, 4, 5, 6].map((v) => ({ value: v, label: `${v} days` }))} onChange={(v) => set('spacingDays', v)} />}
            <Segmented label="Each ready" assumed={assumed.includes('turnaroundDays')} value={draft.turnaroundDays} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: v === 1 ? 'same day' : `in ${v} days` }))} onChange={(v) => set('turnaroundDays', v)} />
            <Segmented label="Made" assumed={assumed.includes('style')} value={draft.style} options={[{ value: 'custom', label: 'To order' }, { value: 'templated', label: 'From templates' }]} onChange={(v) => set('style', v)} />
            <Segmented label="Takes" assumed={assumed.includes('scope')} value={draft.scope} options={[{ value: 'any', label: 'Any brief' }, { value: 'simple', label: 'Simple briefs only' }]} disabledValues={draft.style === 'templated' ? ['any'] : []} onChange={(v) => set('scope', v)} />
            <div className={`field price${assumed.includes('price') ? ' is-assumed' : ''}`}>
              <label htmlFor="price">Price for the whole offer{assumed.includes('price') && <span className="tag tag-assumed">assumed</span>}</label>
              <div className="price-row">
                <button type="button" className="btn btn-step" aria-label="Lower price by 10" onClick={() => set('price', Math.max(RULES.limits.price[0], draft.price - 10))}>
                  -
                </button>
                <input id="price" type="number" inputMode="numeric" step={10} min={RULES.limits.price[0]} max={RULES.limits.price[1]} value={draft.price} onChange={(ev) => set('price', Number(ev.target.value))} aria-invalid={priceErr ? true : undefined} aria-describedby={priceErr ? 'price-err' : undefined} />
                <span className="unit">cr</span>
                <button type="button" className="btn btn-step" aria-label="Raise price by 10" onClick={() => set('price', Math.min(RULES.limits.price[1], draft.price + 10))}>
                  +
                </button>
              </div>
              {priceErr && (
                <p id="price-err" className="ws-field-error">
                  {priceErr}
                </p>
              )}
              {money && (
                <p className={`offer-money small${money.under ? ' warn' : ''}`}>
                  A simple launch takes about {hours(money.minutes)}: about {credits(money.earns)} earned per hour, against {credits(money.costs)} to run the studio.
                  {money.under ? ' Below the break-even rate for simple work.' : ` About ${money.cover} delivered launch${money.cover === 1 ? '' : 'es'} at this price cover a day's running costs.`}
                  {' '}Redos and empty hours cost extra.
                </p>
              )}
            </div>
          </section>

          <section className="workshop-preview" aria-label="Who would buy this">
            <div className="sign-preview" aria-hidden="true">
              <span className="sign-name">{draft.name || 'Unnamed'}</span>
              <span className="sign-price">{draft.price.toLocaleString('en-GB')}&nbsp;cr</span>
            </div>
            <p className="terms">{offerTerms(draft)}</p>
            {invalid && !priceErr && !nameErr && (
              <p className="error" role="alert">
                {invalid}
              </p>
            )}
            <h3>Who on the street would buy it</h3>
            {invalid && <p className="muted small">Showing the last version that worked.</p>}
            <SegmentList draft={shown} stale={!!invalid} />
            <p className="muted small">Each neighbour varies by about 15% either way.</p>
            {reach.waiting > 0 && (
              <p className="today">
                At the window right now: {reach.buyThis} of {reach.waiting} would pick this{reach.switched > 0 ? `, ${reach.switched} of them instead of ${others[0]?.name}` : ''}.
              </p>
            )}
            {today.buyers > 0 && (
              <p className={today.fit < today.buyers ? 'warn small' : 'muted small'}>
                {today.fit === today.buyers
                  ? `Today's hours fit ${today.buyers === 1 ? 'them' : `all ${today.buyers}`} without putting a promise at risk.`
                  : `Today's hours fit ${today.fit} of them without putting a promise at risk.${today.afterSeason ? ` For ${today.afterSeason}, some launches would fall after the season ends and be refunded.` : ''}${today.buyers - today.fit - today.afterSeason > 0 ? " Take more and someone's launch runs late, unless you add hands first." : ''}`}
              </p>
            )}
            <p className="muted small">{workNote(state, shown)}</p>
            {draft.launches > 1 && fit < draft.launches && (
              <p className="warn small">
                Sold today, only {fit} of {draft.launches} launches fit before the season ends. The rest would be refunded, unearned.
              </p>
            )}
          </section>
        </div>

        <footer className="workshop-foot">
          {saveErr && (
            <p className="error small" role="alert">
              {saveErr}
            </p>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!!invalid} onClick={save}>
            Put on the window
          </button>
        </footer>
      </form>
    </dialog>
  );
}
