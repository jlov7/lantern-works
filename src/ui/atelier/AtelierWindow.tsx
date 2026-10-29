import type { ReactNode } from 'react';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState, Request } from '../../engine/types';
import clemImage from './assets/clem.webp';
import maraImage from './assets/mara.webp';
import hugoImage from './assets/hugo.webp';
import ivoImage from './assets/ivo.webp';
import windowImage from './assets/window.webp';
import '../../styles/atelier.css';

type Mood = 'listening' | 'pleased' | 'concerned';

const paintedPortraits: Record<string, string> = {
  clem: clemImage,
  mara: maraImage,
  hugo: hugoImage,
  ivo: ivoImage,
};

/** A stable illustrated likeness for every neighbour, including those without a painted portrait. */
export function CustomerPortrait({ castId, mood = 'listening' }: { castId: string; mood?: Mood }) {
  const portrait = paintedPortraits[castId];
  if (portrait) return <img className="atelier-portrait-image" src={portrait} alt="" />;
  let hash = 0;
  for (const char of castId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const skin = ['#b87950', '#d4a078', '#8b583f', '#e1b28e'][hash % 4];
  const hair = ['#302b27', '#564039', '#7a6a59', '#292e2b'][(hash >>> 3) % 4];
  const coat = `hsl(${CAST_BY_ID[castId]?.hue ?? 30} 29% 34%)`;
  const longHair = (hash & 4) !== 0;
  return <svg className="atelier-portrait-image atelier-portrait-vector" viewBox="0 0 240 260" aria-hidden="true">
    <path d="M24 260 Q27 194 78 185 L162 185 Q213 194 216 260Z" fill={coat} stroke="#302b23" strokeWidth="4" />
    <path d="M83 192 L120 232 L157 192 L145 180 H95Z" fill="#dfc9a6" />
    {longHair && <path d="M70 101 Q55 53 85 29 Q114 3 150 27 Q185 43 171 126 L183 177 Q158 193 75 173Z" fill={hair} />}
    <path d="M96 145 H144 V194 Q120 209 96 194Z" fill={skin} stroke="#664632" strokeWidth="3" />
    <path d="M72 83 Q72 29 120 28 Q169 29 169 83 L163 127 Q153 164 120 169 Q87 164 77 127Z" fill={skin} stroke="#664632" strokeWidth="3" />
    <path d="M72 84 Q64 34 102 23 Q155 6 169 58 L166 78 Q145 64 133 48 Q111 72 72 84Z" fill={hair} />
    <path d="M91 100 Q99 95 106 100 M134 100 Q142 95 149 100" fill="none" stroke="#392d28" strokeWidth="3" strokeLinecap="round" />
    <circle cx="100" cy="104" r="2.5" fill="#302b27" /><circle cx="140" cy="104" r="2.5" fill="#302b27" />
    <path d={mood === 'pleased' ? 'M105 136 Q120 148 135 136' : mood === 'concerned' ? 'M107 140 Q120 133 133 140' : 'M108 137 Q120 141 132 137'} fill="none" stroke="#633d32" strokeWidth="3" strokeLinecap="round" />
    {(hash & 8) !== 0 && <g fill="none" stroke="#3e3933" strokeWidth="2"><circle cx="100" cy="104" r="13" /><circle cx="140" cy="104" r="13" /><path d="M113 103 H127" /></g>}
    <path d="M29 257 Q45 218 72 211 M211 257 Q194 218 168 211" fill="none" stroke="#ead6ad" strokeOpacity=".24" strokeWidth="3" />
  </svg>;
}

export function AtelierWindow({ state, request, artwork, onInspect, reducedMotion = false }: {
  state: CompanyState;
  request: Request | null;
  artwork?: ReactNode;
  onInspect?: () => void;
  reducedMotion?: boolean;
}) {
  const cast = request ? CAST_BY_ID[request.castId] : undefined;
  return <section className="atelier-window" style={{ backgroundImage: `url(${windowImage})` }} data-day={state.day} data-reduced-motion={reducedMotion || undefined} aria-label={cast ? `${cast.name} at the studio window` : 'The studio window'}>
    <div className="atelier-window-light" aria-hidden="true" />
    {cast && request && <div key={request.id} className="atelier-customer" aria-hidden="true"><CustomerPortrait castId={request.castId} /></div>}
    {artwork && <div className="atelier-artwork">{artwork}</div>}
    {cast && <div className="atelier-caption"><strong>{cast.name}</strong><span>{cast.business}</span></div>}
    {cast && onInspect && <button className="atelier-inspect" type="button" onClick={onInspect}>Meet {cast.name}<span aria-hidden="true"> ↗</span></button>}
  </section>;
}
