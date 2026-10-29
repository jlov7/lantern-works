import { useId, type JSX } from 'react';

interface Props<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabledValues?: T[];
  /** The idea didn't say; the compiler picked this. */
  assumed?: boolean;
}

export function Segmented<T extends string | number>({ label, value, options, onChange, disabledValues = [], assumed = false }: Props<T>): JSX.Element {
  const name = useId();
  return (
    <fieldset className={`seg${assumed ? ' is-assumed' : ''}`}>
      <legend>
        {label}
        {assumed && <span className="tag tag-assumed">assumed</span>}
      </legend>
      <div className="seg-row">
        {options.map((o) => (
          <label key={String(o.value)} className={`seg-opt${value === o.value ? ' is-on' : ''}${disabledValues.includes(o.value) ? ' is-off' : ''}`}>
            <input type="radio" name={name} checked={value === o.value} disabled={disabledValues.includes(o.value)} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
