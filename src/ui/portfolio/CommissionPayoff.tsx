import { useId, useState } from 'react';
import { useReducedMotion } from '../useReducedMotion';
import type { CommissionPayoff as Payoff } from '../game/commissionPayoff';
import type { WorkPiece } from '../game/portfolio';
import type { ProjectId } from '../../engine/types';
import { CustomerPortrait } from '../atelier/AtelierWindow';
import { artifactLabel } from '../game/portfolio';
import { CampaignArtwork } from './Artwork';
import '../../styles/commission-payoff.css';
import '../../styles/commission-response.css';
import '../../styles/neighbourhood.css';

const cream = '#f4e6c9', green = '#35534b', dark = '#203b36', amber = '#e8af52', timber = '#a9784c';

export function CommissionPayoff({ payoff: p, variant = 'evening', onInvitation }: { payoff: Payoff; variant?: 'evening' | 'hero'; onInvitation?: (id: ProjectId) => void }) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [motionSkipped, setMotionSkipped] = useState(false);
  const Heading = variant === 'hero' ? 'h2' : 'h3';
  const milestone = p.kind === 'milestone';
  const delivery = milestone || p.kind === 'ordinary';
  const featured = p.featuredPiece ?? p.pieces[0];
  const hasPlacement = delivery ? !!featured : p.kind === 'night' && p.pieces.length > 0;
  const animate = !reducedMotion && !motionSkipped && hasPlacement;
  const contributorOrders = [...new Map(p.contributors.map(piece => [piece.contractId, piece])).values()];
  return <section className={`commission-payoff payoff-${p.kind} payoff-${p.phase} payoff-${variant}${delivery ? ' payoff-delivery' : ''}`} aria-labelledby={`${id}-title`} data-payoff-kind={p.kind} data-payoff-phase={p.phase} data-scene-motion={animate || undefined}>
    <div className="payoff-heading">{!delivery && <p className="payoff-eyebrow">{p.kind === 'window' ? 'Lantern Works · this season' : `${p.calendar.name} · Day ${p.calendar.day + 1}`}</p>}<Heading id={`${id}-title`}>{p.title}</Heading></div>
    <div className="payoff-body">
      {delivery ? <div className="payoff-milestone-art" data-payoff-piece={featured?.jobId} onAnimationEnd={() => setMotionSkipped(true)}>{featured ? <CampaignArtwork brief={featured.brief} launch={featured.launch} launches={featured.launches} /> : <div className="payoff-empty">Not delivered</div>}</div> : <EventVignette payoff={p} onPlacementEnd={() => setMotionSkipped(true)} />}
      <div className="payoff-words">{delivery && featured && p.response && <div className="payoff-customer" aria-hidden="true"><CustomerPortrait castId={featured.castId} mood={p.phase === 'delivered' ? 'pleased' : p.phase === 'partial' || p.phase === 'failed' ? 'concerned' : 'listening'} /></div>}{p.response && <p className="payoff-response">{p.response}</p>}<p className="payoff-line">{p.line}</p>{p.consequence && <p className="payoff-consequence">{p.consequence}</p>}
        {p.invitation && onInvitation && <button type="button" className="btn payoff-invitation" onClick={() => onInvitation(p.invitation!.projectId)}>{p.invitation.label}</button>}
        {p.kind === 'night' && p.promised > 1 && <ul className="payoff-parts" aria-label="Promised work">{p.slots.map(slot => <li key={slot.label} className={slot.piece ? 'is-delivered' : 'is-missing'}><span aria-hidden="true">{slot.piece ? '●' : '○'}</span><span>{slot.label}: {slot.piece ? 'delivered' : p.phase === 'preparing' || p.phase === 'ready' ? 'still in the works' : 'not delivered'}</span></li>)}</ul>}
        {contributorOrders.length > 0 && <p className="payoff-contributors"><strong>From the completed commissions:</strong> {contributorOrders.map(piece => artifactLabel(piece.brief, piece.launch)).join('; ')}.</p>}
      </div>
    </div>
    {hasPlacement && !reducedMotion && <button type="button" className="scene-skip" onClick={() => setMotionSkipped(!motionSkipped)}>{motionSkipped ? 'Replay placement' : 'Skip placement'}</button>}
  </section>;
}

function PrintedPiece({ piece, x, y, width, rotate = 0 }: { piece: WorkPiece; x: number; y: number; width: number; rotate?: number }) {
  const height = width * 4 / 3;
  return <g className="payoff-printed-piece" transform={`translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})`} data-payoff-piece={piece.jobId}><rect x={-5} y={-5} width={width + 10} height={height + 10} fill={timber} /><rect x={-1} y={-1} width={width + 2} height={height + 2} fill={cream} /><svg width={width} height={height} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg></g>;
}

function EmptyPiece({ x, y, width, label }: { x: number; y: number; width: number; label: string }) {
  return <g transform={`translate(${x} ${y})`}><rect width={width} height={width * 4 / 3} fill="#d7c7a9" stroke={timber} strokeWidth={2} strokeDasharray="5 4" /><path d={`M12 15L${width - 12} ${width * 4 / 3 - 15}M${width - 12} 15L12 ${width * 4 / 3 - 15}`} stroke={timber} opacity={.4} /><text x={width / 2} y={width * 2 / 3} textAnchor="middle" fontSize={11} fill={dark}>{label}</text></g>;
}

function EventVignette({ payoff: p, onPlacementEnd }: { payoff: Payoff; onPlacementEnd: () => void }) {
  const complete = p.phase === 'delivered' || p.phase === 'compromised';
  const waiting = p.phase === 'ready' || p.phase === 'preparing';
  const courtyard = p.approach === 'courtyard';
  const folios = p.approach === 'trail' && p.calendar.careful;
  const window = p.kind === 'window';
  const contributors = [...new Map(p.contributors.map(piece => [piece.contractId, piece])).values()];
  const catering = p.catering ?? p.contributors.some(piece => piece.brief.project?.approach === 'weekly-rhythm');
  const label = window ? 'The studio window, with the launches actually delivered' : `${p.calendar.name}, ${courtyard ? 'the courtyard invitation and contributed work' : folios ? 'the open-studios invitation and shared catalogue' : 'programme, street map and wayfinding signs'}. ${waiting ? `Preparation for Day ${p.calendar.day + 1}.` : p.line}`;
  return <svg className="payoff-vignette" onAnimationEnd={onPlacementEnd} viewBox="0 0 960 660" role="img" aria-label={label} data-payoff-scene={window ? 'window' : courtyard ? 'courtyard' : folios ? 'open-studios' : 'trail'} strokeLinejoin="round" fontFamily="var(--font-body)"><g transform="scale(2)">
    <rect width={480} height={330} rx={8} fill={window || waiting || folios ? '#e7d8bd' : dark} />
    {courtyard && <>
      <path d="M23 287V126Q23 28 120 28H360Q457 28 457 126V287" fill={waiting ? '#d1bea0' : green} stroke={timber} strokeWidth={10} />
      <path d="M32 294H448M55 306H425" stroke={timber} opacity={.5} strokeWidth={3} />
      <path d="M34 63Q240 151 446 63" fill="none" stroke={complete ? amber : timber} strokeWidth={2} />
      {[55, 116, 178, 240, 302, 364, 425].map((x, i) => <g key={x}><path d={`M${x} ${77 + (3 - Math.abs(i - 3)) * 9}v12`} stroke={timber} /><circle cx={x} cy={94 + (3 - Math.abs(i - 3)) * 9} r={5} fill={complete ? amber : cream} stroke={timber} /></g>)}
      <path d="M125 278H360V292H125ZM142 292V324M343 292V324" fill={timber} />
      {contributors[0] && <PrintedPiece piece={contributors[0]} x={44} y={119} width={81} rotate={-4} />}
      {p.pieces[0] ? <PrintedPiece piece={p.pieces[0]} x={184} y={117} width={112} /> : <EmptyPiece x={184} y={117} width={112} label={waiting ? 'In the works' : 'Not delivered'} />}
      {contributors[1] ? <PrintedPiece piece={contributors[1]} x={348} y={126} width={78} rotate={4} /> : <g><path d="M366 280V223M366 251Q330 233 343 214Q367 223 366 251M366 238Q401 216 397 198Q374 203 366 238" fill={green} stroke={timber} strokeWidth={3} /><path d="M346 269H387L381 298H352Z" fill={timber} /></g>}
      {catering && <g data-payoff-catering="bread"><ellipse cx={325} cy={275} rx={30} ry={10} fill={cream} /><path d="M300 274Q296 247 316 248Q342 249 345 274Z" fill={amber} stroke={timber} strokeWidth={2} /><path d="M308 255L312 266M321 253L325 266M334 258L336 268" stroke={timber} strokeWidth={2} /></g>}
    </>}
    {folios && <>
      <path d="M0 40H480M0 299H480" stroke={timber} strokeWidth={7} /><path d="M19 40V299M461 40V299" stroke={timber} strokeWidth={5} />
      <text x={240} y={25} textAnchor="middle" fill={green} fontSize={14} letterSpacing={3}>OPEN STUDIOS</text>
      {p.slots.map((slot, i) => slot.piece ? <PrintedPiece key={slot.label} piece={slot.piece} x={58 + i * 221} y={67} width={142} rotate={i ? 3 : -3} /> : <EmptyPiece key={slot.label} x={58 + i * 221} y={67} width={142} label={waiting ? 'In the works' : 'Not delivered'} />)}
      <path d="M39 316H441" stroke={green} strokeWidth={2} />
    </>}
    {!courtyard && !folios && !window && <>
      <path d="M0 97L58 61L128 82L207 40L286 72L365 44L480 87V330H0Z" fill={waiting ? '#c7b796' : green} />
      <path d="M0 290H480M0 312H480" stroke={timber} strokeWidth={2} />
      <path d="M75 282L235 253L405 282" stroke={complete ? amber : '#9e9b87'} strokeWidth={5} strokeDasharray={complete ? undefined : '5 8'} fill="none" />
      {p.slots.map((slot, i) => { const x = 29 + i * 160; return <g key={slot.label}><path d={`M${x - 6} 105H${x + 105}V265H${x - 6}ZM${x + 3} 266V295M${x + 96} 266V295`} fill={timber} stroke={timber} strokeWidth={4} />{slot.piece ? <PrintedPiece piece={slot.piece} x={x} y={112} width={98} /> : <EmptyPiece x={x} y={112} width={98} label={waiting ? 'In the works' : 'Not delivered'} />}<circle cx={x + 49} cy={274} r={5} fill={slot.piece && !waiting ? amber : '#9e9b87'} /></g>; })}
      <text x={240} y={27} textAnchor="middle" fill={waiting ? dark : cream} fontSize={15} letterSpacing={2}>{p.calendar.name.toUpperCase()}</text>
    </>}
    {window && <>
      <rect x={20} y={24} width={440} height={281} rx={7} fill={timber} /><rect x={31} y={36} width={418} height={257} fill={green} />
      <path d="M20 54H460" stroke={timber} strokeWidth={9} /><text x={240} y={47} textAnchor="middle" fill={cream} fontSize={14} fontFamily="var(--font-sign)">Lantern Works</text>
      {p.pieces.slice(0, 6).map((piece, i) => <PrintedPiece key={piece.jobId} piece={piece} x={48 + (i % 3) * 145} y={i < 3 ? 73 : 187} width={70} rotate={i % 2 ? 3 : -3} />)}
      <path d="M13 308H467" stroke={timber} strokeWidth={12} />
    </>}
  </g></svg>;
}
