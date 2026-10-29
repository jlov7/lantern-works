// The medal as an object: a ribboned rosette per tier with one slow shine, or an unlit lantern when there is no medal.
import { useId, type JSX } from 'react';
import type { Medal as Tier } from '../../engine/selectors';

const TONES: Record<Exclude<Tier, null>, { face: string; rim: string; ribbon: string }> = {
  gold: { face: 'var(--lamp)', rim: 'var(--lamp-soft)', ribbon: 'var(--brick)' },
  silver: { face: 'var(--dusk-200)', rim: 'var(--paper)', ribbon: 'var(--dusk-600)' },
  bronze: { face: 'var(--timber)', rim: 'var(--lamp-soft)', ribbon: 'var(--moss)' },
};

/** A scalloped rosette edge: `n` bumps around a circle. */
function scallop(cx: number, cy: number, r: number, bump: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r + bump : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function MedalObject({ tier, size = 148 }: { tier: Tier; size?: number }): JSX.Element {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!tier) return <UnlitLantern size={size} />;
  const t = TONES[tier];
  return (
    <svg className={`medal-object medal-object-${tier}`} viewBox="0 0 120 150" width={size} height={(size * 150) / 120} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-face`}>
          <circle cx="60" cy="58" r="40" />
        </clipPath>
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--paper)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--paper)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--paper)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M44 84 L30 142 L44 132 L54 146 L62 92 Z" fill={t.ribbon} />
        <path d="M76 84 L90 142 L76 132 L66 146 L58 92 Z" fill={t.ribbon} />
        <path d={scallop(60, 58, 46, 6, 18)} fill={t.rim} />
        <circle cx="60" cy="58" r="40" fill={t.face} />
        <circle cx="60" cy="58" r="33" fill="none" strokeDasharray="1.5 3" opacity="0.7" />
        {/* The lantern emblem at the centre of every medal. */}
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          <path d="M53 42h14M60 36v6M51 46h18l2 22H49zM48 68h24M55 74h10" />
          <rect x="56" y="51" width="8" height="10" rx="1" fill="var(--paper)" />
        </g>
      </g>
      <g clipPath={`url(#${id}-face)`}>
        <rect className="medal-shine" x="-40" y="10" width="34" height="100" fill={`url(#${id}-shine)`} transform="skewX(-18)" />
      </g>
    </svg>
  );
}

function UnlitLantern({ size }: { size: number }): JSX.Element {
  return (
    <svg className="medal-object medal-object-none" viewBox="0 0 120 150" width={size} height={(size * 150) / 120} aria-hidden="true" focusable="false">
      <g stroke="var(--dusk-400)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M60 14v14M48 28h24" />
        <path d="M40 40h40l-4 8H44z" fill="var(--dusk-800)" />
        <path d="M44 48h32l4 60H40z" fill="var(--dusk-900)" />
        <path d="M60 48v60M42 78h36" opacity="0.6" />
        <path d="M36 108h48l-6 10H42z" fill="var(--dusk-800)" />
        <path d="M54 92c0-6 6-8 6-12 0 4 6 6 6 12a6 6 0 0 1-12 0z" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}
