// Small line drawings for the stamp book, inked in currentColor inside a postmark ring.
import type { JSX } from 'react';
import type { Glyph } from '../stamps';

const PATHS: Record<Glyph, JSX.Element> = {
  door: <path d="M11 24V9h10v15M18 17h.5M8 24h16" />,
  knot: <path d="M10 20c0-6 12-6 12 0s-12 6-12-2 7-8 9-4M16 22v3" />,
  loop: <path d="M22 13a7 7 0 1 0 1 6M22 8v5h-5" />,
  bulb: <path d="M12.5 19a6 6 0 1 1 7 0v2h-7zM13 24h6" />,
  doors: <path d="M7 24V11h7v13M18 24V11h7v13M12 18h.5M20 18h.5M5 24h22" />,
  hand: <path d="M11 24v-8M11 16V9.5a1.5 1.5 0 0 1 3 0V15M14 15V8a1.5 1.5 0 0 1 3 0v7M17 15V9.5a1.5 1.5 0 0 1 3 0V17c0 4-2 7-6 7h-3l-3-5" />,
  star: <path d="M16 7l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L16 20.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />,
  flag: <path d="M10 25V7M10 8c4-2 6 2 12 0v8c-6 2-8-2-12 0" />,
  feather: <path d="M9 24l9-9M18 8c4 0 6 2 6 2s0 7-8 9l-5 1 1-5c1-5 3-7 6-7zM13 17h5" />,
  house: <path d="M7 15l9-8 9 8M10 13v11h12V13M14 24v-5h4v5" />,
  person: <path d="M16 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM9 25c0-4 3-7 7-7s7 3 7 7" />,
  coin: <path d="M16 25a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM18.5 12.5c-1-1-4.5-1.2-4.5 1s5 1.4 5 3.7-3.6 2.2-5 .8M16 10.5v11" />,
  moon: <path d="M21 21a8 8 0 0 1-9-12 8 8 0 1 0 9 12zM22 8v3M20.5 9.5h3" />,
  heart: <path d="M16 24s-8-5-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5-8 10-8 10z" />,
  lantern: <path d="M13 9h6M16 6v3M12 11h8l1 10h-10zM11 21h10M14 24h4M14.5 14h3v4h-3z" />,
  pair: <path d="M7 16l3 3 5-6M17 16l3 3 5-6M7 24h18" />,
};

export function StampGlyph({ glyph, size = 44 }: { glyph: Glyph; size?: number }): JSX.Element {
  return (
    <svg className="stamp-glyph" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="14.5" strokeDasharray="2 1.6" strokeWidth={1.2} />
      <circle cx="16" cy="16" r="12.5" strokeWidth={0.8} />
      {PATHS[glyph]}
    </svg>
  );
}
