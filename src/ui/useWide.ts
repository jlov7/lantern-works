import { useEffect, useState } from 'react';

/** The two-column layout (the stage's breakpoint in app.css): the window then sits under the shop, beside the rest. */
const QUERY = '(min-width: 981px)';

export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
