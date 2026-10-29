import { memo } from 'react';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import type { WorldFrame } from '../timeline';
import { workFor, type ProjectScene, type WorkPiece } from '../game/portfolio';
import { CampaignArtwork } from '../portfolio/Artwork';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { patternSources } from '../../engine/patterns';
import { AI_DESKS, BRIEF_TABLE, FINISH_BENCH, MAKE_DESKS, TRAY, onFloor, onWallY } from './iso';

const sameDeliveries = (a: { pieces: WorkPiece[] }, b: { pieces: WorkPiece[] }) => a.pieces.length === b.pieces.length && a.pieces.every((p, i) => p.jobId === b.pieces[i]!.jobId && p.complete === b.pieces[i]!.complete);

export const DeliveredWall = memo(function DeliveredWall({ pieces }: { pieces: WorkPiece[] }) {
  return <g className="lw-delivered-wall" aria-hidden="true">{pieces.slice(-6).map((piece, i) => <g key={piece.jobId} transform={onWallY(375 + i * 64, .6, 118)} data-delivered-job={piece.jobId}><rect x={-2} y={-2} width={49} height={65} fill="var(--timber-dark)" strokeWidth={1} /><svg width={45} height={60} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg><circle cx={23} cy={1} r={1.5} fill="var(--ink)" /></g>)}</g>;
}, sameDeliveries);
const workKey = (frame: WorldFrame) => `${frame.folders.map(f => `${f.jobId}:${f.stage}:${f.waiting}`).join(',')}|${frame.workers.map(w => `${w.id}:${w.jobId}:${w.station}:${w.patternId ?? ''}`).join(',')}`;

export const WorkSurfaces = memo(function WorkSurfaces({ state, frame }: { state: CompanyState; frame: WorldFrame }) {
  const work = workFor(state, frame.folders.map(f => f.jobId), frame.minute);
  const shown = new Map<string, number>();
  const finishing = frame.folders.filter(f => !f.waiting && (f.stage === 'finish' || f.stage === 'rework')).length;
  const humans = frame.workers.filter(w => w.kind === 'human');
  const ai = frame.workers.filter(w => w.kind === 'ai');
  return <g aria-hidden="true" className="lw-work-art">{frame.folders.toSorted((a, b) => Number(a.waiting) - Number(b.waiting)).map(folder => {
    const piece = work.find(p => p.jobId === folder.jobId);
    if (!piece) return null;
    const worker = frame.workers.find(w => w.jobId === folder.jobId);
    const stage = folder.stage;
    const desk = stage === 'brief' ? BRIEF_TABLE : stage === 'finish' || stage === 'rework' ? FINISH_BENCH : worker?.kind === 'human' ? MAKE_DESKS[humans.findIndex(w => w.id === worker.id) % MAKE_DESKS.length]! : worker?.kind === 'ai' ? AI_DESKS[ai.findIndex(w => w.id === worker.id)]! : TRAY;
    const key = `${desk.x}:${desk.y}`;
    const slot = shown.get(key) ?? 0;
    const finish = stage === 'finish' || stage === 'rework';
    if (slot >= (finish ? Math.max(1, Math.min(2, finishing)) : 1)) return null;
    shown.set(key, slot + 1);
    return <g key={folder.jobId} data-work-job={folder.jobId} data-work-stage={stage}>
      <g transform={onFloor(desk.x + 7 + slot * 30, desk.y + 8, desk.h + 1.2)}><svg width={31} height={41} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg></g>
      {finish && <g transform={onWallY(desk.x + 5 + slot * 31, desk.y + 5, desk.h + 45)}><path d="M-2 44H29M5 44L9 8M24 44L20 8" stroke="var(--timber-dark)" strokeWidth={2} /><svg width={27} height={36} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg></g>}
    </g>;
  })}{frame.workers.filter(worker => worker.patternId && worker.working).map(worker => {
    const pattern = state.patterns!.find(p => p.id === worker.patternId)!;
    const source = patternSources(state).find(p => p.id === pattern.sourceId)!;
    return <g key={pattern.id} data-work-pattern={pattern.id} transform={onFloor(BRIEF_TABLE.x + 37, BRIEF_TABLE.y + 8, BRIEF_TABLE.h + 1.2)}><svg width={33} height={33} viewBox="0 0 100 100"><DesignedPrint piece={pattern.piece} copy={source.copy} compact /></svg></g>;
  })}</g>;
}, (a, b) => a.state === b.state && workKey(a.frame) === workKey(b.frame));

/** Street display belongs to delivered launches, including partial orders. Story scenery requires a whole kept promise. */
export const StreetWork = memo(function StreetWork({ pieces, scene }: { pieces: WorkPiece[]; scene?: ProjectScene }) {
  const latest = pieces.slice(-4);
  const stories = new Set(pieces.filter(p => p.complete).map(p => p.brief.story));
  return <g className="lw-street-work" aria-hidden="true">
    {!scene && latest.length > 0 && <g transform={onWallY(310, 326, 87)}>
      <path d="M-8 6H260V84H-8Z" fill="var(--timber-dark)" strokeWidth={1.5} />
      <path d="M-3 84V110M255 84V110" stroke="var(--timber-dark)" strokeWidth={5} />
      <text x={126} y={-1} textAnchor="middle" fill="var(--ink)" stroke="none" fontSize={8} fontFamily="var(--font-body)">MADE HERE · OUT ON THE STREET</text>
      {latest.map((piece, i) => <g key={piece.jobId} transform={`translate(${4 + i * 64} 12)`} data-street-job={piece.jobId}><svg width={47} height={63} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg></g>)}
    </g>}
    {stories.has('clem') && <g className="lw-story-clem" transform={onWallY(-115, -34, 118)}>
      <path d="M0 0H125V110H0Z" fill="#242d63" stroke="var(--ink)" />
      <path d="M15 112V57A47 47 0 0 1 109 57V112Z" fill="#e69b51" />
      <path d="M22 110V60A40 40 0 0 1 102 60V110Z" fill="#343a6c" />
      <text x={62} y={21} textAnchor="middle" fill="#f1ddaf" stroke="none" fontFamily="var(--font-sign)" fontSize={15}>Clem’s</text>
      <text x={62} y={37} textAnchor="middle" fill="#f1ddaf" stroke="none" fontSize={7}>TEN YEARS · LIVE</text>
      <svg x={37} y={57} width={43} height={57} viewBox="0 0 240 320"><CampaignArtwork brief={pieces.find(p => p.brief.story === 'clem' && p.complete)!.brief} miniature /></svg>
      <path d="M-4-7H129M-4 115H129" stroke="#e69b51" strokeWidth={4} />
    </g>}
    {stories.has('hugo') && <g className="lw-story-hugo" transform={onWallY(651, 250, 66)}>
      <path d="M0 20H85V28H0ZM8 28V64M76 28V64" fill="var(--timber)" stroke="var(--ink)" strokeWidth={3} />
      <circle cx={29} cy={8} r={10} fill="var(--paper)" stroke="var(--ink)" /><path d="M29 2V8L34 11M51 7H69M60-2V15" fill="none" stroke="var(--ink)" strokeWidth={2} />
      <text x={42} y={-9} textAnchor="middle" stroke="none" fill="var(--ink)" fontSize={7}>THE APPRENTICE’S BENCH</text>
    </g>}
    {stories.has('mara') && <g className="lw-story-mara" transform={onWallY(10, 225, 104)}>
      <rect width={123} height={34} fill="#fff0cc" stroke="#9b3c1d" />
      <path d="M0 34H123L115 44H8Z" fill="#e78331" />
      <text x={61} y={14} textAnchor="middle" fill="#9b3c1d" stroke="none" fontSize={10} fontFamily="var(--font-sign)">Moonrise series</text>
      {pieces.filter(p => p.brief.story === 'mara').slice(-3).map((p, i) => <svg key={p.jobId} x={18 + i * 31} y={20} width={24} height={32} viewBox="0 0 240 320"><CampaignArtwork brief={p.brief} launch={p.launch} launches={p.launches} miniature /></svg>)}
    </g>}
    {stories.has('party') && <>
      <g className="lw-story-party" transform={onWallY(185, 310, 145)}><path d="M0 0Q195 31 390 0L382 32Q195 57 8 32Z" fill="#f8e6ad" stroke="#285556" strokeWidth={2} /><text x={195} y={29} textAnchor="middle" fontSize={17} fontFamily="var(--font-sign)" fill="#285556" stroke="none">Summer on our street</text></g>
    </>}
    {scene && <ProjectStreet scene={scene} />}
  </g>;
}, (a, b) => sameDeliveries(a, b) && sceneKey(a.scene) === sceneKey(b.scene));

const sceneKey = (scene?: ProjectScene) => scene ? `${scene.milestones.map(m => `${m.record.contract.id}:${m.record.status}`).join(',')}|${scene.night.mode}:${scene.night.approach}:${scene.night.pieces.map(p => p.jobId).join(',')}:${scene.night.contributors.map(p => p.jobId).join(',')}` : '';

export const MilestoneWall = memo(function MilestoneWall({ scene }: { scene: ProjectScene }) {
  return <g className="lw-milestone-wall" aria-hidden="true">{scene.milestones.map(({ record, pieces }, i) => <g key={record.id} data-project-complete={record.id} data-project-approach={record.approach} transform={onWallY(15 + i * 77, .8, 73)}><rect x={-2} y={-2} width={60} height={48} fill="var(--timber-dark)" />{pieces.slice(0, 3).map((piece, k) => <svg key={piece.jobId} x={pieces.length > 1 ? k * 17 : 11} y={0} width={pieces.length > 1 ? 24 : 34} height={45} viewBox="0 0 240 320"><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg>)}<text x={28} y={55} textAnchor="middle" fontSize={6} fill="var(--ink)" stroke="none">{CAST_BY_ID[record.contract.castId]!.name}{record.earned ? '' : ' · original brief'}</text></g>)}</g>;
}, (a, b) => sceneKey(a.scene) === sceneKey(b.scene));

function ProjectStreet({ scene }: { scene: ProjectScene }) {
  const n = scene.night;
  const settled = ['delivered', 'compromised', 'partial', 'failed'].includes(n.mode);
  const complete = n.mode === 'delivered' || n.mode === 'compromised';
  const trail = n.approach === 'trail';
  const visible = n.mode === 'window' ? n.pieces : [...n.pieces, ...(complete ? n.contributors : [])];
  const status = n.mode === 'window' ? 'THIS SEASON’S WORK' : n.mode === 'ready' ? `READY FOR DAY ${n.day + 1}` : n.mode === 'preparing' ? `PREPARING FOR DAY ${n.day + 1}` : n.mode === 'partial' ? `${n.pieces.length} / ${n.promised} DELIVERED · UNFINISHED` : n.mode === 'failed' ? 'PROGRAMME NOT DELIVERED' : n.mode === 'compromised' ? 'ORIGINAL BRIEF · CHANGE DECLINED' : `${n.pieces.length} / ${n.promised} PIECES DELIVERED`;
  return <g className={`lw-project-scene lw-project-scene-${n.mode}`} data-night-mode={n.mode} aria-label={n.label}>
    {scene.milestones.map(({ record, pieces }, i) => <g key={record.id} transform={onWallY(8 + i * 89, 286, 93)} data-street-project={record.id} data-project-approach={record.approach}>
      <path d="M-4-4H69V95H-4Z" fill="var(--timber-dark)" /><path d="M1 95V110M64 95V110" stroke="var(--timber-dark)" strokeWidth={4} />
      <svg width={65} height={87} viewBox="0 0 240 320"><CampaignArtwork brief={pieces[0]!.brief} launch={pieces[0]!.launch} launches={pieces[0]!.launches} miniature /></svg>
      <text x={32} y={-10} fill="var(--ink)" stroke="none" textAnchor="middle" fontSize={7}>{CAST_BY_ID[record.contract.castId]!.name}{record.earned ? ' · commission' : ' · original brief'}</text>
    </g>)}
    {visible.length > 0 || n.approach ? <g transform={onWallY(310, 353, complete && !trail ? 131 : 110)}>
      <path d="M-10 8H270V126H-10Z" fill={complete ? '#35534b' : 'var(--timber-dark)'} stroke="var(--ink)" strokeWidth={1.5} />
      {complete && !trail && <><path d="M-15 15Q130-47 275 15M-15 15V139M275 15V139" fill="none" stroke="var(--timber)" strokeWidth={6} /><path d="M-11 16Q130 62 271 16" fill="none" stroke="var(--lamp)" strokeWidth={1.5} />{[14, 58, 103, 148, 192, 237].map((x, i) => <circle key={x} cx={x} cy={24 + (i > 1 && i < 4 ? 13 : 4)} r={3} fill="var(--lamp)" />)}</>}
      <text x={130} y={complete && !trail ? 59 : 1} textAnchor="middle" fill={complete ? 'var(--lamp-soft)' : 'var(--ink)'} stroke="none" fontSize={complete && !trail ? 12 : 10} fontFamily="var(--font-sign)">{n.mode === 'window' ? 'The studio window' : n.name}</text>
      {trail ? <>
        <path d={`M35 77H${n.promised === 2 ? 213 : 225}`} stroke={complete ? 'var(--lamp)' : 'var(--paper-shade)'} strokeDasharray={complete ? undefined : '4 5'} strokeWidth={2} />
        {Array.from({ length: n.promised }, (_, i) => { const piece = n.pieces.find(p => p.launch === i + 1); const x = n.promised === 2 ? 41 + i * 151 : 11 + i * 86; return <g key={i} transform={`translate(${x} 20)`} data-night-slot={i + 1}><rect x={-2} y={-2} width={61} height={81} fill={piece && settled ? 'var(--lamp)' : 'var(--paper-shade)'} opacity={piece ? 1 : .27} />{piece && <svg width={57} height={76} viewBox="0 0 240 320" data-night-piece={piece.jobId}><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg>}{!piece && <><text x={28} y={34} fill="var(--paper)" stroke="none" textAnchor="middle" fontSize={9}>{i + 1}</text><text x={28} y={48} fill="var(--paper)" stroke="none" textAnchor="middle" fontSize={7}>{settled ? 'not delivered' : 'pending'}</text></>}</g>; })}
      </> : <>{visible.slice(0, 5).map((piece, i) => <svg key={piece.jobId} x={(260 - Math.min(5, visible.length) * 50) / 2 + 4 + i * 50} y={complete ? 66 : 26} width={complete ? 36 : 43} height={complete ? 48 : 57} viewBox="0 0 240 320" data-night-piece={piece.jobId}><CampaignArtwork brief={piece.brief} launch={piece.launch} launches={piece.launches} miniature /></svg>)}</>}
      <path d="M-4 126V146M264 126V146" stroke="var(--timber-dark)" strokeWidth={5} />
      <text x={130} y={119} fill="var(--paper)" stroke="none" textAnchor="middle" fontSize={7}>{status}</text>
    </g> : null}
  </g>;
}
