import type { JSX } from 'react';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { CAST_BY_ID } from '../../engine/rules';
import type { OfferSpec, Request, RunConfig } from '../../engine/types';
import { artifactLabel, briefFor, seriesLabel, type AuthoredBrief, type Subject } from '../game/portfolio';
import { neighbourLook } from '../world/looks';
import '../../styles/portfolio.css';

/** Approved commissions retain their proof; ordinary launches use the street’s authored illustrations. */
export function CampaignArtwork({ brief: b, launch = 1, launches = 1, miniature = false }: { brief: AuthoredBrief; launch?: number; launches?: number; miniature?: boolean }): JSX.Element {
  if (b.proof) return <svg className="campaign-art campaign-authored" viewBox="0 0 100 100" aria-hidden={miniature || undefined} data-approach={b.project?.approach} data-artifact={artifactLabel(b, launch)}><DesignedPrint piece={b.proof.design.pieces[launch - 1]!} copy={b.proof.pieces[launch - 1]!.copy} label={artifactLabel(b, launch)} compact={miniature} /></svg>;
  if (b.project) return <ProjectArtwork brief={b} launch={launch} launches={launches} miniature={miniature} />;
  const cast = CAST_BY_ID[b.castId]!;
  const label = `${b.headline}, ${cast.business}${launches > 1 ? `, launch ${launch} of ${launches}` : ''}`;
  const headline = (x: number, y: number, size = 25, anchor: 'start' | 'middle' = 'start', fill = b.ink) => {
    const limit = Math.floor((anchor === 'middle' ? 208 : 220 - x) / (size * .56));
    const lines: string[] = [];
    for (const word of b.headline.split(' ')) {
      if (lines.length && `${lines.at(-1)} ${word}`.length <= limit) lines[lines.length - 1] += ` ${word}`;
      else lines.push(word);
    }
    return <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill} fontFamily="var(--font-sign, Georgia, serif)">{lines.map((line, i) => <tspan key={i} x={x} dy={i ? size * 1.08 : 0}>{line}</tspan>)}</text>;
  };
  const type = (text: string, x: number, y: number, size = 9, fill = b.ink, anchor: 'start' | 'middle' = 'start') => <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontFamily="var(--font-body, sans-serif)" letterSpacing={1.3}>{text.toUpperCase()}</text>;
  const subject = (x: number, y: number, scale = 1, ink = b.ink, accent = b.accent) => <g transform={`translate(${x} ${y}) scale(${scale})`}><SubjectArt subject={b.subject} ink={ink} accent={accent} paper={b.family === 'sleeve' ? b.ink : b.paper} /></g>;
  const edition = launches > 1 ? `${String(launch).padStart(2, '0')} / ${String(launches).padStart(2, '0')}` : 'LANTERN WORKS';
  return <svg className={`campaign-art campaign-${b.family}`} viewBox="0 0 240 320" role={miniature ? undefined : 'img'} aria-label={miniature ? undefined : label} aria-hidden={miniature || undefined} focusable="false" stroke="none" data-subject={b.subject} data-family={b.family}>
    <rect width={240} height={320} fill={b.paper} />
    {b.family === 'bakery' && <>
      <path d="M0 0H240V22Q120 50 0 22Z" fill={b.accent} />
      {type(cast.business, 120, 52, 10, b.ink, 'middle')}
      {headline(120, 83, 26, 'middle')}
      <circle cx={120} cy={204} r={76} fill={b.accent} />
      <path d="M38 222Q120 252 202 222" fill="none" stroke={b.ink} strokeWidth={1.5} />
      {subject(120, 210, 1.05)}
      {type(launches > 1 ? seriesLabel(b.castId, launch, launches) : 'Fresh from the neighbourhood', 120, 301, 7.5, b.ink, 'middle')}
    </>}
    {b.family === 'jazz' && <>
      <rect width={240} height={320} fill={b.paper} />
      {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${26 + i * 18} 320Q${235 - i * 10} ${130 + i * 16} ${192 - i * 23} 55`} fill="none" stroke={b.accent} strokeWidth={i === 2 ? 14 : 2} opacity={i === 2 ? .95 : .45} />)}
      {type('CLEM JAZZ BAR', 20, 29, 11)}
      {headline(20, 67, 31)}
      {subject(153, 220, 1.15)}
      <rect x={14} y={281} width={212} height={24} fill={b.ink} />
      {type(b.story === 'clem' || b.headline === 'Ten years of Clem' ? 'EST. TEN YEARS AGO · LIVE TONIGHT' : 'ONE ROOM · LIVE MUSIC · CLEM’S', 120, 296, 7, b.paper, 'middle')}
      {launches > 1 && type(edition, 210, 267, 8, b.ink, 'middle')}
    </>}
    {b.family === 'theatre' && <>
      <path d="M0 0H240V320H0Z" fill={b.paper} />
      <path d="M0 0H59Q45 91 12 214H0ZM240 0H181Q195 91 228 214H240Z" fill={b.ink} opacity={.2} />
      <path d="M0 0Q120 73 240 0" fill={b.accent} />
      <path d="M120 103L41 267H199Z" fill={b.accent} opacity={.3} />
      {type(cast.business, 120, 48, 9, b.ink, 'middle')}
      {headline(120, 88, 27, 'middle')}
      {subject(120, 219, 1.05)}
      <path d="M22 278H218M30 284H210" stroke={b.ink} strokeWidth={2} />
      {type(b.story === 'eli' ? 'THE RUN CONTINUES' : 'THE LIGHTS COME UP', 120, 305, 8, b.ink, 'middle')}
    </>}
    {b.family === 'artisan' && <>
      <rect x={13} y={13} width={214} height={294} fill="none" stroke={b.ink} strokeWidth={.8} />
      {type(cast.business, 120, 41, 8, b.ink, 'middle')}
      <path d="M93 59H147" stroke={b.accent} strokeWidth={2} />
      {subject(120, 145, .94)}
      {headline(120, 238, 24, 'middle')}
      {type(b.story === 'hugo' ? 'FORTY YEARS · THE NEXT CHAPTER' : 'MADE WITH TIME AND CARE', 120, 290, 6.8, b.ink, 'middle')}
    </>}
    {b.family === 'taproom' && <>
      <path d="M15 305V112A105 105 0 0 1 225 112V305Z" fill={b.ink} />
      {type('OSCAR BREWING', 120, 29, 8, b.accent, 'middle')}
      {headline(120, 75, 26, 'middle', b.accent)}
      {subject(120, 202, 1, b.paper, b.accent)}
      <path d="M31 270H209" stroke={b.paper} strokeWidth={1} />
      {type(b.story === 'oscar' ? 'THE NIGHT IS BACK ON' : 'GOOD BEER. GOOD COMPANY.', 120, 290, 8, b.accent, 'middle')}
    </>}
    {b.family === 'sleeve' && <>
      <rect x={12} y={12} width={216} height={230} fill={b.accent} />
      <path d="M12 12L228 242M228 12L12 242" stroke={b.paper} strokeWidth={1} opacity={.3} />
      {subject(120, 130, 1.32, b.paper, b.ink)}
      <path d="M12 200L159 12H206L32 242H12Z" fill={b.ink} />
      {type('WREN RECORDS', 23, 34, 9, b.paper)}
      {headline(15, 271, 25)}
      {type(edition, 163, 310, 6.8)}
    </>}
    {b.family === 'botanical' && <>
      <path d="M8 320V99A112 112 0 0 1 232 99V320" fill="none" stroke={b.ink} strokeWidth={2} />
      <path d="M18 320V103A102 102 0 0 1 222 103V320" fill="none" stroke={b.accent} strokeWidth={1} />
      {subject(120, 141, 1.12)}
      <rect x={27} y={216} width={186} height={75} fill={b.paper} />
      {headline(120, 239, 23, 'middle')}
      {type(cast.business, 120, 303, 6.5, b.ink, 'middle')}
    </>}
    {b.family === 'market' && <>
      <path d="M0 0H240V320H0Z" fill={b.paper} />
      {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${i * 34 - 17} 0L${i * 34 + 2} 31L${i * 34 + 17} 0Z`} fill={i % 2 ? b.accent : b.ink} />)}
      {headline(18, 66, 29)}
      <path d="M0 155L240 120V275L0 299Z" fill={b.accent} />
      {subject(120, 211, 1.05)}
      {type(cast.business, 15, 309, 7.5)}
      {launches > 1 && type(edition, 190, 294, 7)}
    </>}
    {b.family === 'editorial' && <>
      <path d="M18 17H222V303H18Z" fill="none" stroke={b.ink} strokeWidth={1.5} />
      {type(cast.business, 30, 39, 7.5)}
      <path d="M30 51H210" stroke={b.ink} />
      {headline(30, 80, 26)}
      <rect x={30} y={159} width={180} height={112} fill={b.accent} />
      {subject(120, 214, .82)}
      {type('A NOTE FROM THE NEIGHBOURHOOD', 120, 290, 6, b.ink, 'middle')}
    </>}
    {b.family === 'sport' && <>
      <path d="M0 0H240V320H0Z" fill={b.paper} />
      <path d="M0 265L182 0H240V95L65 320H0Z" fill={b.accent} />
      <path d="M0 275L197 0M45 320L240 40" stroke={b.ink} strokeWidth={2} />
      {type(cast.business, 17, 30, 8)}
      {headline(17, 67, 28)}
      {subject(123, 216, 1.08)}
      {type('MEET HERE. GO FURTHER.', 18, 304, 8)}
    </>}
    {b.family === 'cinema' && <>
      <rect x={17} y={18} width={206} height={285} rx={93} fill={b.ink} />
      <path d="M120 164L29 244H211Z" fill={b.accent} opacity={.7} />
      {type('THE LITTLE CINEMA', 120, 42, 8, b.paper, 'middle')}
      {headline(120, 81, 24, 'middle', b.paper)}
      {subject(120, 204, .92, b.paper, b.accent)}
      {type('ONE SCREEN. A WHOLE WORLD.', 120, 283, 6.4, b.paper, 'middle')}
    </>}
    {b.family === 'table' && <>
      <path d="M0 0H240V320H0Z" fill={b.paper} />
      <path d="M0 155Q120 113 240 155V320H0Z" fill={b.accent} />
      {type(cast.business, 120, 31, 8, b.ink, 'middle')}
      {headline(120, 70, 26, 'middle')}
      <ellipse cx={120} cy={246} rx={94} ry={23} fill={b.paper} />
      <ellipse cx={120} cy={245} rx={77} ry={17} fill="none" stroke={b.ink} strokeWidth={1} />
      {subject(120, 207, .96)}
      {type('A PLACE AT THE TABLE', 120, 298, 8, b.ink, 'middle')}
    </>}
  </svg>;
}

function ProjectArtwork({ brief: b, launch, launches, miniature }: { brief: AuthoredBrief; launch: number; launches: number; miniature: boolean }) {
  const approach = b.project!.approach;
  const cream = '#f4e6c9', indigo = '#262e60', orange = '#dc873c', green = '#35534b', sepia = '#715a42';
  const hugo = neighbourLook('hugo', CAST_BY_ID.hugo!.hue);
  const text = (words: string, x: number, y: number, size = 10, fill = b.ink, anchor: 'start' | 'middle' = 'middle') => <text x={x} y={y} fill={fill} fontSize={size} textAnchor={anchor} fontFamily="var(--font-body)" letterSpacing={size < 12 ? 1 : 0}>{words}</text>;
  const title = (lines: string[], y: number, fill: string, size = 27) => <text x={120} y={y} fill={fill} textAnchor="middle" fontSize={size} fontFamily="var(--font-sign)">{lines.map((line, i) => <tspan key={line} x={120} dy={i ? size * 1.1 : 0}>{line}</tspan>)}</text>;
  const illustration = (subject: Subject, x: number, y: number, scale: number, ink = b.ink, accent = b.accent) => <g transform={`translate(${x} ${y}) scale(${scale})`}><SubjectArt subject={subject} ink={ink} accent={accent} paper={b.paper} /></g>;
  const eventLines = b.event?.careful ? ['Open', 'studios'] : b.event?.festival ? ['The lantern', 'walk'] : ['Lantern', 'Night'];
  const calendar = b.event ? `DAY ${b.event.day + 1} · ${b.event.festival ? 'FESTIVAL WEEK' : b.event.careful ? 'CAREFUL SEASON' : 'MAIN STREET'}` : 'THE STREET’S GATHERING';
  return <svg className={`campaign-art campaign-project project-${approach}`} viewBox="0 0 240 320" role={miniature ? undefined : 'img'} aria-label={miniature ? undefined : `${artifactLabel(b, launch)}, ${b.event?.name ?? CAST_BY_ID[b.castId]!.business}, launch ${launch} of ${launches}`} aria-hidden={miniature || undefined} focusable="false" stroke="none" data-subject={b.subject} data-family="project" data-approach={approach} data-artifact={artifactLabel(b, launch)}>
    <rect width={240} height={320} fill={b.paper} />
    {approach === 'first-night' && <>
      <rect width={240} height={320} fill={cream} /><rect x={16} y={18} width={208} height={227} fill={sepia} />
      <rect x={25} y={27} width={190} height={208} fill="#c7b492" />
      <path d="M25 142Q120 65 215 142V235H25Z" fill={indigo} opacity={.8} />
      {[66, 120, 174].map((x, i) => <g key={x} transform={`translate(${x} ${i === 1 ? 116 : 128})`}><circle r={13} fill={sepia} /><path d="M-18 22Q0 6 18 22L25 79H-25Z" fill={sepia} /><path d="M-11-14Q0-21 11-14" stroke={cream} strokeWidth={2} fill="none" /></g>)}
      <path d="M41 206H199M47 215H193" stroke={cream} strokeWidth={2} />
      {text('CLEM’S ARCHIVE', 120, 51, 9, indigo)}{title(['The first night,', 'again'], 270, indigo, 23)}
      <path d="M35 252L204 243" stroke={sepia} strokeWidth={1} /><circle cx={198} cy={218} r={23} fill={cream} />{text('10', 198, 225, 23, sepia)}
    </>}
    {approach === 'new-band' && <>
      <rect width={240} height={320} fill={indigo} /><path d="M0 83L240 14V129L0 198Z" fill={orange} />
      {text('CLEM · THE ANNIVERSARY', 120, 26, 9, cream)}{title(['The next', 'ten years'], 73, cream, 32)}
      <path d="M0 265L240 199V320H0Z" fill={orange} opacity={.7} />
      {illustration('saxophone', 63, 218, .68, cream, orange)}
      <g transform="translate(167 218) rotate(12)"><path d="M0-63V51M-7-65H7M-12-20Q-43-11-24 9Q-47 35-10 58H10Q47 35 24 9Q43-11 12-20Z" fill={cream} stroke={indigo} strokeWidth={3} /><path d="M0-55V54" stroke={indigo} strokeWidth={2} /></g>
      {text('GIVE THE NEW BAND THE WALL', 120, 303, 7.5, cream)}
    </>}
    {approach === 'weekly-rhythm' && <>
      <rect width={240} height={320} fill={cream} /><path d="M0 0H240V56H0Z" fill={orange} />
      {text('MOONRISE BAKERY', 120, 33, 11, b.ink)}{title(b.festivalSet ? ['Bread for', 'festival week'] : ['A place', 'in the week'], 89, b.ink, b.festivalSet ? 26 : 29)}
      <path d="M18 150H222V272H18Z" fill={orange} opacity={.25} />
      {illustration((['bun', 'loaf', 'pie'] as const)[(launch - 1) % 3]!, 120, 209, .79)}
      {[0, 1, 2].map(i => <circle key={i} cx={99 + i * 21} cy={285} r={4} fill={i === launch - 1 ? b.ink : orange} />)}
      {text(`BAKERY CARD ${String(launch).padStart(2, '0')} / ${String(launches).padStart(2, '0')}`, 120, 309, 8, b.ink)}
    </>}
    {approach === 'market-debut' && <>
      <rect width={240} height={320} fill={orange} /><path d="M0 0H240V51H0Z" fill={cream} />{text('MARA’S MARKET DEBUT', 120, 31, 9, b.ink)}
      <path d="M0 78H240V171H0L18 125Z" fill={cream} /><path d="M0 171L18 182V171M240 78L224 66V78" fill={b.ink} />
      {title(['Moonrise', 'at the market'], 111, b.ink, 28)}
      <path d="M33 237H207V281H33Z" fill={b.ink} /><path d="M42 251H198M42 267H198" stroke={cream} strokeWidth={2} />
      {illustration('loaf', 83, 223, .53)}{illustration('pie', 163, 230, .48)}
      {text('A NEW STALL. THE SAME OVENS.', 120, 307, 7.5, b.ink)}
    </>}
    {approach === 'quiet-sendoff' && <>
      <rect width={240} height={320} fill={cream} /><rect x={20} y={21} width={200} height={224} fill={sepia} /><rect x={27} y={28} width={186} height={210} fill="#d7c8a9" />
      <path d="M27 75H213M40 34V115M199 34V115" stroke={sepia} strokeWidth={2} />
      <circle cx={110} cy={104} r={25} fill={hugo.skin} /><path d="M85 101Q82 68 108 73Q137 67 136 103L130 124L126 91Q109 102 89 91L88 124Z" fill={hugo.hair} />
      <path d="M70 146Q110 117 150 146L164 217H56Z" fill={hugo.body} /><path d="M88 141H130L140 210H78Z" fill={cream} /><path d="M53 203H190V223H53Z" fill={sepia} />
      <circle cx={163} cy={187} r={17} fill={cream} stroke={sepia} strokeWidth={2} /><path d="M163 175V187L172 192" stroke={sepia} fill="none" strokeWidth={2} />
      {title(['Hugo,', 'at the bench'], 271, sepia, 22)}{text('FORTY YEARS OF CARE', 120, 314, 7, sepia)}
    </>}
    {approach === 'open-bench' && <>
      <rect width={240} height={320} fill={green} /><path d="M15 15H225V305H15Z" fill="none" stroke={cream} strokeWidth={1} />
      {text('HUGO WATCH REPAIR', 120, 40, 9, cream)}{title(['The bench', 'is open'], 83, cream, 30)}
      <path d="M34 184H206V198H34ZM47 198V258M193 198V258M52 245H188" fill={orange} stroke={cream} strokeWidth={3} />
      <circle cx={92} cy={165} r={18} fill={cream} /><path d="M92 154V166L102 172M139 157H177M158 137V174" stroke={green} strokeWidth={3} fill="none" />
      <path d="M31 145V269M23 145H39M23 269H39M43 277H199M43 272V283M199 272V283" stroke={cream} strokeWidth={1} />
      {text('THE APPRENTICE’S WORKSHOP', 120, 296, 7.5, cream)}
    </>}
    {approach === 'courtyard' && <>
      <rect width={240} height={320} fill={green} />{text(calendar, 120, 27, 8, cream)}{title(eventLines, 65, cream, 29)}
      <path d="M26 143L120 114L214 143V275H26Z" fill={cream} /><path d="M43 154H197V259H43Z" fill={orange} opacity={.32} />
      <path d="M35 153Q120 203 205 153M35 208Q120 248 205 208" fill="none" stroke={green} strokeWidth={2} />
      {[53, 88, 120, 153, 188].map((x, i) => <circle key={x} cx={x} cy={163 + (2 - Math.abs(i - 2)) * 7} r={4} fill={orange} />)}
      <ellipse cx={120} cy={232} rx={35} ry={18} fill={green} /><rect x={104} y={216} width={32} height={20} fill={cream} transform="rotate(-9 120 226)" />
      {text('ONE INVITATION · ONE COURTYARD', 120, 303, 7.5, cream)}
    </>}
    {approach === 'trail' && <>
      <rect width={240} height={320} fill={b.event?.careful ? cream : indigo} />{text(calendar, 120, 25, 8, b.event?.careful ? green : cream)}{title(b.event?.careful ? ['Invitations', '& catalogue'] : eventLines, 63, b.event?.careful ? green : cream, 28)}
      {b.event?.careful ? launch === 1 ? <g transform="rotate(-7 120 213)"><rect x={31} y={139} width={178} height={144} fill={green} /><rect x={40} y={148} width={160} height={126} fill="none" stroke={cream} /><path d="M60 170H180M60 181H180M60 249H180" stroke={cream} /><path d="M85 231V213A35 35 0 0 1 155 213V231Z" fill={orange} /><circle cx={120} cy={217} r={9} fill={cream} /></g> : <g transform="rotate(6 120 214)"><rect x={48} y={132} width={147} height={157} fill={green} /><path d="M48 132H60V289H48Z" fill={orange} /><path d="M76 151H178M76 165H155M76 268H178" stroke={cream} strokeWidth={2} /><path d="M79 247V189H174V247Z" fill="none" stroke={cream} strokeWidth={2} /><circle cx={108} cy={211} r={11} fill={orange} /><path d="M83 242L124 215L170 242" fill={orange} /></g> : launch === 3 ? <g><path d="M114 138H126V289H114Z" fill={cream} /><path d="M36 158H188L211 180L188 202H36Z" fill={orange} /><path d="M204 219H52L29 241L52 263H204Z" fill={cream} /><path d="M53 180H163M184 241H74" stroke={indigo} strokeWidth={3} /></g> : <><path d="M15 148L86 137L157 151L225 138V279L157 292L86 278L15 290Z" fill={cream} /><path d="M86 138V278M157 151V291" stroke={orange} strokeWidth={1.5} />{launch === 2 ? <><path d="M43 243L117 191L192 243" fill="none" stroke={indigo} strokeWidth={3} strokeDasharray="4 4" />{[43, 117, 192].map((x, i) => <circle key={x} cx={x} cy={i === 1 ? 191 : 243} r={16} fill={orange} />)}</> : <>{[0, 1, 2].map(i => <g key={i}><rect x={29 + i * 71} y={162 + (i % 2) * 9} width={43} height={34} fill={orange} />{[0, 1, 2, 3].map(k => <path key={k} d={`M${29 + i * 71} ${210 + k * 14}H${70 + i * 71}`} stroke={indigo} strokeWidth={2} />)}</g>)}</>}</>}
      {text(`${artifactLabel(b, launch).replace('The ', '').toUpperCase()} · ${launch}/${launches}`, 120, 311, 7, b.event?.careful ? green : cream)}
    </>}
  </svg>;
}

function SubjectArt({ subject: s, ink, accent, paper }: { subject: Subject; ink: string; accent: string; paper: string }) {
  const line = { fill: 'none', stroke: ink, strokeWidth: 3.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (s === 'saxophone') return <g transform="rotate(-17)"><path d="M-3-63H23L12-44V25Q12 69-29 56Q-62 45-50 16L-30 0Q-43 41-24 39Q-7 41-8 17V-39Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-30 0L-61-16L-67 4L-50 16ZM-4-57H24" fill={ink} /><path d="M3-33V17M-6-23H14M-6-7H14M-6 9H14" {...line} /><circle cx={-51} cy={-3} r={13} fill={paper} stroke={ink} strokeWidth={3} /><path d="M35-38l8-5v17M43-43l10-5v17" {...line} /><ellipse cx={38} cy={-26} rx={5} ry={3} fill={ink} /><ellipse cx={48} cy={-31} rx={5} ry={3} fill={ink} /></g>;
  if (s === 'loaf' || s === 'bun' || s === 'pie' || s === 'cake') return <g>
    {s === 'cake' ? <><path d="M-59-5Q0-26 59-5V41Q0 62-59 41Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M-59 0Q-49 24-36 9Q-22 32-7 12Q8 31 25 10Q43 29 59 0M-59 29Q0 49 59 29" {...line} /><path d="M-20-29V-8M3-39V-13M25-29V-8" {...line} /><path d="M-20-40q-8 9 0 11q8-2 0-11M3-50q-8 9 0 11q8-2 0-11M25-40q-8 9 0 11q8-2 0-11" fill={accent} stroke={ink} /></> : s === 'pie' ? <><path d="M-63-5L-48 41Q0 57 48 41L63-5Z" fill={paper} stroke={ink} strokeWidth={3} /><ellipse cy={-7} rx={64} ry={25} fill={paper} stroke={ink} strokeWidth={3} /><path d="M-47-18L32 13M-19-29L52 0M-45 3L22-26M-17 16L49-15M-36 19L-28 41M0 22V47M35 19L28 41" {...line} /></> : s === 'bun' ? <><path d="M-58 25Q-69-30-23-45Q29-63 56-13Q75 29 37 47Q-7 65-47 43Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M-43 19Q-50-22-15-31Q22-42 39-13Q56 17 30 32Q-4 49-24 23Q-43-1-17-14Q9-28 20-5Q31 16 10 21Q-7 27-9 10" {...line} /></> : <><path d="M-68 22Q-73-18-41-39Q-1-66 43-36Q72-15 68 22Q5 47-68 22Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M-68 22Q0 52 68 22M-38-27L-49-6M-9-39L-21-11M23-34L10-7M49-19L37 3" {...line} /></>}
    <path d="M-24-61q-9-11 0-20M6-66q-9-11 0-20M34-57q-9-11 0-20" stroke={ink} strokeWidth={2} fill="none" opacity={.55} />
  </g>;
  if (s === 'watch') return <g><path d="M-15-74H15L19-42H-19ZM-19 42H19L15 74H-15Z" fill={accent} stroke={ink} strokeWidth={2} /><circle r={47} fill={paper} stroke={ink} strokeWidth={3} /><circle r={40} fill="none" stroke={accent} strokeWidth={1.5} />{Array.from({ length: 12 }, (_, i) => <path key={i} d="M0-32V-37" transform={`rotate(${i * 30})`} stroke={ink} strokeWidth={i % 3 === 0 ? 3 : 1} />)}<path d="M0-23V0L21 12" {...line} /><circle r={3.5} fill={ink} /><path d="M47-5H54V6H47" fill={accent} stroke={ink} /></g>;
  if (s === 'mango') return <g><path d="M-21-51Q-60-55-62-6Q-65 37-19 57Q27 77 56 25Q77-22 40-47Q13-66-21-51Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-35-27Q-54 10-16 35M8-54Q3-81 32-77Q54-57 8-54" {...line} /></g>;
  if (s === 'cherries') return <g><path d="M-34 11Q-21-47 27-72Q17-11 35 12" {...line} /><path d="M25-69Q-9-83-18-58Q8-45 25-69" fill={ink} /><circle cx={-36} cy={33} r={28} fill={accent} stroke={ink} strokeWidth={3} /><circle cx={38} cy={35} r={30} fill={accent} stroke={ink} strokeWidth={3} /><path d="M-50 21q10-10 19-5M24 20q10-10 20-5" stroke={paper} strokeWidth={4} fill="none" /></g>;
  if (s === 'barrow') return <g><path d="M-64-5H62L49 35H-49Z" fill={paper} stroke={ink} strokeWidth={3} /><circle cx={-31} cy={51} r={17} fill={accent} stroke={ink} strokeWidth={3} /><circle cx={38} cy={51} r={17} fill={accent} stroke={ink} strokeWidth={3} /><path d="M58-4L76-21H88M-52 9H52M-46 22H48" {...line} />{[-41, -14, 14, 41].map((x, i) => <circle key={x} cx={x} cy={-15 - (i % 2) * 15} r={18} fill={accent} stroke={ink} strokeWidth={2} />)}</g>;
  if (s === 'dress') return <g><path d="M-25-66L-45-50L-25-11L-62 65Q0 86 62 65L25-11L45-50L25-66Q0-33-25-66Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-25-11H25M-12 3L-31 66M12 3L31 66M-25-66Q0-3 25-66" {...line} /></g>;
  if (s === 'cactus') return <g><path d="M-12 36V-54Q0-74 12-54V-3H30V-27Q43-40 49-23V4Q47 19 12 18V40Z" fill={ink} /><path d="M-12 2H-34Q-50 1-50-15V-34Q-40-46-31-32V-15H-12Z" fill={ink} /><path d="M-34 36H34L24 75H-24Z" fill={accent} stroke={ink} strokeWidth={2} /><path d="M-3-51V32M-42-25V-8M38-19V9" stroke={paper} strokeWidth={1.5} /></g>;
  if (s === 'tulip' || s === 'rose') return <g><path d="M0 70V-27M0 37Q-47 14-43-4Q-12-7 0 37M0 54Q45 30 43 10Q16 11 0 54" fill={ink} stroke={ink} strokeWidth={3} />{s === 'tulip' ? <path d="M-37-64L-14-50L0-77L14-50L37-64Q45-11 0-12Q-45-11-37-64Z" fill={accent} stroke={ink} strokeWidth={2.5} /> : <><path d="M0-77L24-65L40-44L28-20L0-10L-28-20L-40-44L-24-65Z" fill={accent} stroke={ink} strokeWidth={2.5} /><path d="M-24-58L11-64L27-43L7-23L-18-29L-24-48L-3-54L13-42L1-31L-9-41" {...line} /></>}</g>;
  if (s === 'record') return <g><circle r={70} fill={ink} />{[60, 53, 46, 39].map(r => <circle key={r} r={r} fill="none" stroke={paper} strokeWidth={.8} opacity={.55} />)}<circle r={24} fill={accent} /><circle r={4} fill={paper} /><path d="M-51-31A60 60 0 0 1-24-54M33 47A58 58 0 0 1 15 56" stroke={paper} strokeWidth={3} fill="none" opacity={.8} /></g>;
  if (s === 'curtain') return <g><path d="M-70-58H70V60H-70Z" fill={ink} /><path d="M-68-56H0Q-12-3-54 37L-68 55ZM68-56H0Q12-3 54 37L68 55Z" fill={accent} /><path d="M-49-56Q-35-16-62 17M49-56Q35-16 62 17" {...line} /><path d="M-74 60H74M-80 68H80" {...line} /><path d="M0-20L-28 52H28Z" fill={paper} opacity={.75} /></g>;
  if (s === 'glass') return <g><path d="M-34-54H34L26 62H-26Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-32-30H32L26 59H-26Z" fill={paper} /><path d="M-31-36Q-42-51-24-55Q-15-70-2-57Q15-68 23-56Q43-59 35-39Z" fill={accent} stroke={ink} strokeWidth={2.5} /><path d="M-15-11L-11 39M4-15V42M19-8L15 36" stroke={ink} opacity={.45} strokeWidth={2} /><path d="M-53 63H53" {...line} /></g>;
  if (s === 'flower' || s === 'sunflower' || s === 'wreath' || s === 'plant') return <g>
    {s === 'wreath' ? <>{Array.from({ length: 12 }, (_, i) => <g key={i} transform={`rotate(${i * 30})`}><ellipse cx={0} cy={-47} rx={12} ry={24} fill={i % 3 ? ink : accent} transform="rotate(22 0 -47)" /></g>)}<path d="M-10 51L-27 79L1 64L24 80L15 49Z" fill={accent} /></> : <><path d="M0 64V-43M0 21Q-55 2-41-16Q-10-19 0 21M0 38Q45 16 49-9Q14-7 0 38" fill={ink} stroke={ink} strokeWidth={3} />{s === 'plant' ? <><path d="M-33 40H33L22 76H-22Z" fill={accent} stroke={ink} strokeWidth={2} /><path d="M-1-24Q-46-40-23-70Q2-60-1-24M2-34Q38-49 23-73Q2-67 2-34" fill={ink} /></> : <g transform="translate(0 -42)">{Array.from({ length: s === 'sunflower' ? 12 : 7 }, (_, i) => <ellipse key={i} cy={-22} rx={s === 'sunflower' ? 8 : 15} ry={28} fill={accent} stroke={ink} strokeWidth={1.2} transform={`rotate(${i * (s === 'sunflower' ? 30 : 360 / 7)})`} />)}<circle r={s === 'sunflower' ? 19 : 12} fill={ink} /><circle cx={-4} cy={-4} r={3} fill={paper} /></g>}</>}
  </g>;
  if (s === 'book' || s === 'print' || s === 'frame') return <g>{s === 'book' ? <><path d="M-62-47Q-27-66 0-45Q27-66 62-47V51Q23 39 0 59Q-24 39-62 51Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M0-45V58M-49-28Q-25-40-12-28M-49-11Q-25-23-12-11M-49 6Q-25-6-12 6M13-28Q32-40 50-29M13-10Q32-22 50-11M13 7Q32-5 50 6" {...line} /></> : <><path d="M-59-68H59V68H-59Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-47-55H47V55H-47Z" fill={paper} stroke={ink} strokeWidth={2} /><circle cx={15} cy={-23} r={16} fill={accent} /><path d="M-43 48V10L-14-14L43 48Z" fill={ink} /><path d="M-43 48L18 3L43 17V48Z" fill={accent} /></>}</g>;
  if (s === 'bicycle') return <g><circle cx={-44} cy={29} r={30} fill={paper} stroke={ink} strokeWidth={3} /><circle cx={45} cy={29} r={30} fill={paper} stroke={ink} strokeWidth={3} /><path d="M-44 29L-16-19L13 29H-44L-3-5H32L45 29M32-5L21-36H40M-25-22H-7" {...line} /><circle cx={13} cy={29} r={6} fill={accent} /></g>;
  if (s === 'cup' || s === 'teapot') return <g>{s === 'teapot' ? <><ellipse cy={9} rx={45} ry={39} fill={paper} stroke={ink} strokeWidth={3} /><path d="M-40-7L-70-38L-61 9L-37 24M39-17Q79-33 69 7Q65 31 43 29M-30-25H30L21-35H-21Z" {...line} /><circle cy={-39} r={5} fill={ink} /></> : <><path d="M-44-31H39L31 36Q-5 57-37 36Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M40-21Q76-26 66 7Q60 26 35 21" {...line} /><ellipse cx={-2} cy={-31} rx={42} ry={8} fill={ink} /></>}<ellipse cy={53} rx={63} ry={10} fill={accent} stroke={ink} strokeWidth={2} /><path d="M-18-48q-12-16 0-29M12-48q-12-16 0-29" {...line} /></g>;
  if (s === 'lantern' || s === 'party') return <g><path d="M-77-44Q0-9 77-44" {...line} />{[-48, 0, 48].map((x, i) => <g key={x} transform={`translate(${x} ${i === 1 ? 5 : -8})`}><path d="M-18-26H18L23 25L0 40L-23 25Z" fill={i === 1 ? paper : accent} stroke={ink} strokeWidth={2} /><path d="M-18-26L0-36L18-26M0-26V40M-23 8H23M-5 40V53M5 40V53" stroke={ink} fill="none" strokeWidth={2} /></g>)}{s === 'party' && <path d="M-70 66L-40 39L-11 66L20 39L50 66L76 41" stroke={ink} fill="none" strokeWidth={7} />}</g>;
  if (s === 'film') return <g><rect x={-67} y={-43} width={134} height={90} rx={4} fill={ink} />{[-54, -27, 0, 27, 54].map(x => <g key={x}><rect x={x - 5} y={-37} width={10} height={7} fill={paper} /><rect x={x - 5} y={34} width={10} height={7} fill={paper} /></g>)}<rect x={-49} y={-22} width={98} height={48} fill={accent} /><path d="M-13-13L19 3L-13 20Z" fill={paper} /><path d="M-60 62H60" {...line} /></g>;
  if (s === 'mountain') return <g><path d="M-80 53L-14-65L28 5L48-34L85 53Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-14-65L-38-23L-12-33L1-12L11-22Z" fill={paper} /><path d="M-31 53L-4 16L20 33L36 10L64 53" {...line} /><path d="M-14-65V-83H12L-14-73" fill={ink} stroke={ink} strokeWidth={2} /></g>;
  if (s === 'dancer') return <g><circle cx={10} cy={-53} r={13} fill={ink} /><path d="M7-38L-4 8L-36 26L2 37L25 12L16-36Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M9-29L-34-52L-49-39M13-26L50-51L61-74M-3 30L-34 67M18 29L50 62L64 57" {...line} /></g>;
  if (s === 'violin') return <g transform="rotate(25)"><path d="M-7-78H7V-26Q30-38 32-14Q16-9 29 4Q41 29 20 48Q0 63-20 48Q-41 29-29 4Q-16-9-32-14Q-30-38-7-26Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M0-71V43M-5-72V41M5-72V41M-16-6q-9 10 0 16M16-6q9 10 0 16M-10 29H10" {...line} /><path d="M45-66L41 65" stroke={ink} strokeWidth={4} /></g>;
  if (s === 'pot' || s === 'bottle') return <g>{s === 'pot' ? <path d="M-31-58H31V-35Q66-9 52 47Q0 76-52 47Q-66-9-31-35Z" fill={accent} stroke={ink} strokeWidth={3} /> : <><path d="M-16-43H16V-18L43-1V60H-43V-1L-16-18Z" fill={paper} stroke={ink} strokeWidth={3} /><rect x={-18} y={-62} width={36} height={19} fill={ink} /><rect x={-31} y={9} width={62} height={35} fill={accent} /><circle cy={26} r={11} fill="none" stroke={ink} strokeWidth={2} /></>}<path d="M-24-53H24M-40 39Q0 58 40 39" {...line} /></g>;
  if (s === 'scissors' || s === 'needle' || s === 'key') return <g transform="rotate(-28)">{s === 'scissors' ? <><circle cx={-22} cy={37} r={21} fill={paper} stroke={ink} strokeWidth={4} /><circle cx={24} cy={37} r={21} fill={paper} stroke={ink} strokeWidth={4} /><path d="M-12 19L33-65L8 10L-28-64L12 18" fill={accent} stroke={ink} strokeWidth={3} /></> : s === 'key' ? <><circle cy={-35} r={28} fill={accent} stroke={ink} strokeWidth={3} /><circle cy={-35} r={12} fill={paper} /><path d="M-5-7H8V60H29V46H8V29H25V16H8" fill={accent} stroke={ink} strokeWidth={3} /></> : <><path d="M0 73Q-14-51-5-69Q0-82 5-69Q14-51 0 73Z" fill={paper} stroke={ink} strokeWidth={2} /><ellipse cy={-58} rx={3} ry={10} fill={ink} /><path d="M0-59Q-42-86-53-46Q-58-12-27-8Q17-4 39 40" {...line} /></>}</g>;
  if (s === 'yarn') return <g><circle cy={10} r={52} fill={accent} stroke={ink} strokeWidth={3} /><path d="M-39-23Q-11 27 43 37M-21-37Q-4 12 49 18M5-41Q7-5 49-1M-50 7Q-7 19 20 58M-50 28Q-25 33-4 61M-23-75L27 66M-36-67L13 70" {...line} /><path d="M-49 12Q-84 12-69 57Q-65 73-42 66" {...line} /></g>;
  if (s === 'coat') return <g><path d="M-23-61L-59-31L-75 20L-45 31L-33 0L-42 67H40L32 0L44 31L75 20L57-31L23-61L0-44Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-23-61L-8-16L0-35L10-16L23-61M0-35V65M-26 29H-11M13 29H28" {...line} /></g>;
  if (s === 'truck') return <g><path d="M-78-34H23V-12H53L77 20V54H-78Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M-63-20H9V14H-63ZM34-1H48L63 20H34Z" fill={accent} stroke={ink} strokeWidth={2} /><circle cx={-47} cy={53} r={14} fill={ink} /><circle cx={48} cy={53} r={14} fill={ink} /><path d="M-73-43H20L13-59H-66Z" fill={accent} stroke={ink} strokeWidth={2} /><path d="M-26-77q-6-9 0-16M-4-77q-6-9 0-16" {...line} /></g>;
  if (s === 'dumpling' || s === 'sushi' || s === 'cheese' || s === 'popcorn') return <g>{s === 'dumpling' ? <><path d="M-70 20Q-51-60 0-39Q51-60 70 20Q0 76-70 20Z" fill={paper} stroke={ink} strokeWidth={3} /><path d="M-53 5L-41-23L-26 2L-15-32L0-4L15-32L26 2L41-23L53 5M-53 23Q0 54 53 23" {...line} /></> : s === 'sushi' ? <>{[-39, 18].map((x, i) => <g key={x} transform={`translate(${x} ${i * 21 - 15}) rotate(-14)`}><rect x={-31} y={-17} width={62} height={53} rx={17} fill={paper} stroke={ink} strokeWidth={2.5} /><path d="M-37-12Q0-43 37-12L28 9Q0-5-28 9Z" fill={accent} stroke={ink} strokeWidth={2} /><path d="M-13-22L-23 1M4-25L-5-6M22-19L13-2" stroke={paper} strokeWidth={3} /></g>)}</> : s === 'cheese' ? <><path d="M-64 20L28-48L65-1V51L-64 67Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-64 20L65-1M-64 20V67" {...line} /><circle cx={7} cy={34} r={10} fill={paper} /><circle cx={42} cy={18} r={7} fill={paper} /><circle cx={-32} cy={44} r={6} fill={paper} /></> : <><path d="M-44-2H44L30 68H-30Z" fill={paper} stroke={ink} strokeWidth={3} />{[-24, 0, 24].map(x => <path key={x} d={`M${x - 7} 0L${x - 4} 65H${x + 5}L${x + 8} 0Z`} fill={accent} />)}{[-40, -19, 3, 25, 40].map((x, i) => <circle key={x} cx={x} cy={-11 - (i % 2) * 21} r={19} fill={paper} stroke={ink} strokeWidth={2} />)}</>}</g>;
  if (s === 'shoe') return <g><path d="M-66-42H-17L-11-2L34 16L62 23Q84 40 61 57H-68V30L-63-2Z" fill={accent} stroke={ink} strokeWidth={3} /><path d="M-66 44H71M-10-5L-20 9M5 2L-3 17M19 9L10 23" {...line} /></g>;
  return <g><rect x={-14} y={-61} width={28} height={71} rx={14} fill={paper} stroke={ink} strokeWidth={3} /><path d="M-25-22V-1Q0 30 25-1V-22M0 14V63M-29 63H29M-9-48H9M-9-39H9" {...line} /></g>;
}

export function BriefArtwork({ request, offer, config, rulesVersion }: { request: Request; offer?: OfferSpec; config?: RunConfig; rulesVersion?: string }) {
  const brief = briefFor(request, offer, config, undefined, rulesVersion);
  return <figure className="brief-artwork"><CampaignArtwork brief={brief} launches={offer?.launches ?? request.offer?.launches ?? 1} /><figcaption><span className="portfolio-eyebrow">Launch piece</span><strong>{brief.headline}</strong><span>{brief.detail}</span></figcaption></figure>;
}
