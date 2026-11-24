import { useRef, useState } from 'react';
import { firstOrderPromises } from '../game/firstOrder';
import { promiseLineLimit, suggestFirstPromise, type FirstPromise } from '../game/firstPromise';

export function PromiseChoice({ confirmed, onConfirm }: {
  confirmed: FirstPromise | undefined;
  onConfirm: (promise: FirstPromise | undefined) => void;
}) {
  const [line, setLine] = useState('');
  const [preview, setPreview] = useState<FirstPromise | 'clarify'>();
  const choices = useRef<HTMLFieldSetElement>(null);
  const ownWords = useRef<HTMLDetailsElement>(null);

  const confirm = (promise: FirstPromise) => {
    setLine('');
    setPreview(undefined);
    onConfirm(promise);
    if (ownWords.current) ownWords.current.open = false;
  };

  return <fieldset ref={choices} className="first-order-editions first-order-promise" aria-describedby="first-order-promise-stakes">
    <legend>What will you promise?</legend>
    {(['clem', 'yara'] as const).map(promise => <label key={promise}>
      <input type="radio" name="promise" value={promise} checked={confirmed === promise} onChange={() => confirm(promise)} />
      <strong>{firstOrderPromises[promise]}</strong>
    </label>)}
    <details ref={ownWords} className="first-order-own-promise">
      <summary>Say it in your own words</summary>
      <label htmlFor="first-order-promise-line">What would you say?</label>
      <textarea id="first-order-promise-line" rows={2} maxLength={promiseLineLimit} value={line} onChange={event => {
        const next = event.target.value;
        setLine(next);
        setPreview(undefined);
        if (confirmed && next.trim()) onConfirm(undefined);
      }} />
      <button className="clem-quiet" type="button" disabled={!line.trim()} onClick={() => setPreview(suggestFirstPromise(line) ?? 'clarify')}>Read my promise</button>
      <p role="status" className="first-order-promise-preview">
        {preview === 'clarify' ? 'I couldn’t pick out one clear promise. Try again or choose a line above.'
          : preview ? <>Do you mean <q>{firstOrderPromises[preview]}</q></> : null}
      </p>
      {preview && preview !== 'clarify' && <button className="clem-primary" type="button" onClick={() => {
        confirm(preview);
        choices.current?.querySelector<HTMLInputElement>(`input[value="${preview}"]`)?.focus();
      }}>Confirm this promise</button>}
    </details>
  </fieldset>;
}
