import { useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react';
import { summarize } from '../engine/selectors';
import type { CompanyState } from '../engine/types';
import { aiLabel, CALL_LIMIT, hasApiKey, MODEL_ID, setApiKey } from './advisor';
import { credits, dayLabel, signed } from './format';
import { keyProblem } from './screens/key';

/**
 * A modal dialog. Focus starts on `initialFocus` (or the heading), and goes back to whatever opened the dialog when it
 * closes, by Escape, the Close button or the parent unmounting it.
 */
export function Modal({ title, onClose, children, wide, initialFocus }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; initialFocus?: RefObject<HTMLElement | null> }): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useLayoutEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    (initialFocus?.current ?? heading.current)?.focus();
    return () => {
      // Back to the invoker, unless the dialog's own action moved focus somewhere new on purpose.
      const now = document.activeElement;
      const inside = !now || now === document.body || d?.contains(now);
      // A modal dialog makes the page inert, so it has to close before the invoker can take focus.
      if (d?.open) d.close();
      if (invoker?.isConnected && inside) invoker.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // StrictMode can reopen the dialog before the close event from its effect cleanup arrives.
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} aria-labelledby={headingId} onClose={event => { event.stopPropagation(); if (!event.currentTarget.open) onClose(); }} onCancel={event => { event.stopPropagation(); onClose(); }}>
      <div className="modal-inner">
        <header className="modal-head">
          <h2 id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function BooksDialog({ state, onClose }: { state: CompanyState; onClose: () => void }): JSX.Element {
  const sum = summarize(state);
  const byDay = new Map<number, typeof state.journal>();
  for (const e of state.journal) {
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  }
  return (
    <Modal title="The books" onClose={onClose} wide>
      <div className="books-totals">
        <div>
          <span>Cash</span>
          <strong className={sum.cash < 0 ? 'neg' : ''}>{credits(sum.cash)}</strong>
        </div>
        <div>
          <span>Owed in launches</span>
          <strong>{credits(sum.unearned)}</strong>
        </div>
        <div>
          <span>Earned</span>
          <strong>{credits(sum.revenue)}</strong>
        </div>
        <div>
          <span>Operating result</span>
          <strong className={sum.operatingResult < 0 ? 'neg' : ''}>{credits(sum.operatingResult)}</strong>
        </div>
      </div>
      <p className="muted small">
        Payment arrives up front but is only earned when a launch ships. Until then it is owed: a refund if the promise is missed or the season ends first.
      </p>
      <div className="books-days">
        {[...byDay.entries()].reverse().map(([d, entries]) => (
          <section key={d}>
            <h3>{dayLabel(d)}</h3>
            <table>
              <thead>
                <tr>
                  <th scope="col">Entry</th>
                  <th scope="col">Cash</th>
                  <th scope="col">Owed</th>
                  <th scope="col">Earned</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td>{e.note}</td>
                    <td className={e.cash < 0 ? 'neg' : ''}>{e.cash ? signed(e.cash) : ''}</td>
                    <td>{e.unearned ? signed(e.unearned) : ''}</td>
                    <td>{e.revenue ? signed(e.revenue) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {byDay.size === 0 && <p className="muted">Nothing on the books yet.</p>}
      </div>
    </Modal>
  );
}


export function KeyDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [value, setValue] = useState('');
  const [on, setOn] = useState(hasApiKey());
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const errId = useId();
  return (
    <Modal title="Use Claude in the studio" onClose={onClose} initialFocus={on ? undefined : input}>
      <p>
        With your own Anthropic API key, Claude can draft offers from your words and write your end-of-season debrief. Without one, the game is complete: both features have offline versions, clearly labelled.
      </p>
      <ul className="small">
        <li>
          Get a key from the{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer noopener">
            Anthropic console
          </a>{' '}
          (opens in a new tab). Calls are billed to that key.
        </li>
        <li>The key stays in this tab's memory. It is never saved, exported or put in share links. Reloading forgets it.</li>
        <li>
          Calls go straight from your browser to api.anthropic.com using {MODEL_ID}, at most {CALL_LIMIT} per session. Each call is roughly 2,000 to 5,000 tokens, input and output together.
        </li>
        <li>Claude only proposes. The game's rules decide who buys and what happens.</li>
        {!hasApiKey() && aiLabel() !== 'offline' && <li>Right now AI requests go to {aiLabel()}.</li>}
      </ul>
      {on ? (
        <div className="row wrap">
          <p role="status">Claude is on for this session.</p>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setApiKey(null);
              setOn(false);
            }}
          >
            Forget the key
          </button>
        </div>
      ) : (
        <form
          className="key-form"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            const problem = keyProblem(value);
            setError(problem);
            if (problem) {
              input.current?.focus();
              return;
            }
            setApiKey(value.trim());
            setValue('');
            setOn(hasApiKey());
          }}
        >
          <label className="field grow">
            <span>Anthropic API key</span>
            <input
              ref={input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="sk-ant-..."
            />
          </label>
          {error && (
            <p id={errId} className="field-error">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            Use this key
          </button>
        </form>
      )}
    </Modal>
  );
}
