import { memo, useEffect, useRef, useState, type JSX } from 'react';

const ROLL_MS = 420;
const CHIP_MS = 1400;

/**
 * A number that rolls to its new value and floats a +N / -N chip. One copy of the number, so the page text never
 * repeats it; the roll lasts under half a second and the chip is hidden from screen readers.
 */
export const Rolling = memo(function Rolling({ value, format, reduced, chip = true }: { value: number; format: (n: number) => string; reduced: boolean; chip?: boolean }): JSX.Element {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) {
      setShown(value);
      return;
    }
    from.current = value;
    if (chip) setDelta({ n: value - start, key: performance.now() });
    if (reduced) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      // A frame's timestamp can precede this effect when rendering takes most of the frame.
      const k = Math.max(0, Math.min(1, (now - t0) / ROLL_MS));
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduced, chip]);

  useEffect(() => {
    if (!delta) return;
    const id = setTimeout(() => setDelta(null), CHIP_MS);
    return () => clearTimeout(id);
  }, [delta]);

  return (
    <span className="rolling">
      <span>{format(shown)}</span>
      {delta && delta.n !== 0 && (
        <span key={delta.key} className={`roll-chip ${delta.n > 0 ? 'up' : 'down'}`} aria-hidden="true">
          {delta.n > 0 ? '+' : '-'}
          {format(Math.abs(delta.n))}
        </span>
      )}
    </span>
  );
});
