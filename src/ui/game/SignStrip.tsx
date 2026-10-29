// "On the window": the offers on the sign, compact, at the top of the decision column.
import { memo, type JSX } from 'react';
import { RULES } from '../../engine/rules';
import type { OfferSpec } from '../../engine/types';
import { credits, offerTerms } from '../format';

interface Props {
  menu: OfferSpec[];
  disabled: boolean;
  locked: boolean;
  onEdit: (slot: number) => void;
  onRemove: (slot: number) => void;
  /** After the first morning the terms are known: one short row per offer, terms on hover and in the workshop. */
  compact?: boolean;
  /** Each offer's earnings per hour of people's time, against the studio's running cost per hour. */
  rates?: { costs: number; earns: number[]; under: boolean[] } | null;
}

export const SignStrip = memo(function SignStrip({ menu, disabled, locked, onEdit, onRemove, compact = false, rates = null }: Props): JSX.Element {
  const off = disabled || locked;
  return (
    <section className={`sign-strip${compact ? ' sign-strip-compact' : ''}`} aria-labelledby="sign-h">
      <div className="sign-strip-head">
        <h2 id="sign-h">On the window</h2>
        {locked && <p className="muted small">Up for today. Redesign tomorrow, or undo.</p>}
      </div>
      <ul className={`signs${menu.length === 1 ? ' signs-one' : ''}`}>
        {menu.map((o, i) => (
          <li key={i} className="sign" title={compact ? offerTerms(o) : undefined}>
            <div className="sign-top">
              <span className="sign-title">{o.name}</span>
              <span className="sign-cost">{credits(o.price)}</span>
            </div>
            {!compact && <p className="sign-terms small">{offerTerms(o)}</p>}
            {rates && rates.earns[i] ? (
              <p className={`sign-rate small${rates.under[i] ? ' is-under' : ''}`}>
                Simple work: about {credits(rates.earns[i]!)} earned an hour, {credits(rates.costs)} to run.
                {rates.under[i] ? ' Below break-even.' : ''}
              </p>
            ) : null}
            <div className="sign-actions">
              <button type="button" className="btn btn-small" onClick={() => onEdit(i)} disabled={off} aria-label={`Redesign ${o.name}`}>
                Redesign
              </button>
              {menu.length > 1 && (
                <button type="button" className="btn btn-small btn-quiet" onClick={() => onRemove(i)} disabled={off} aria-label={`Take down ${o.name}`}>
                  Take down
                </button>
              )}
            </div>
          </li>
        ))}
        {menu.length < RULES.maxMenu && (
          <li className="sign sign-empty">
            <button type="button" className="btn btn-small btn-invent" onClick={() => onEdit(menu.length)} disabled={off} title="Room for two. Neighbours pick whichever suits them.">
              Invent a second offer
            </button>
          </li>
        )}
      </ul>
    </section>
  );
});
