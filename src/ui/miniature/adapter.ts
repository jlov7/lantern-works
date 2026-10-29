import type { CompanyState } from '../../engine/types';
import type { Station, WorldFrame } from '../timeline';
import { briefFor, portfolioAt, projectSceneAt, workFor, type WorkPiece } from '../game/portfolio';
import { hasStudioRules } from '../../engine/versions';
import { aiWorkers, describeFrame, groupFolders, placeHumans, placeNeighbours } from '../world/place';
import { lightAt } from '../world/light';
import { patternSources } from '../../engine/patterns';
import { contractProof } from '../../engine/ordinary';
import { RULES } from '../../engine/rules';
import { customerLook, staffLook } from './appearance';

export type Point = [number, number, number];
export type CameraView = 'studio' | 'window' | 'work';
export const SURFACES: Record<string, Point> = {
  brief: [-2.55, 1.04, 1.15], tray: [-.8, .84, 1.55],
  make0: [-.45, 1.04, -.8], make1: [1.15, 1.04, -.8],
  finish: [3.2, 1.04, -.8], ai0: [2.8, .97, 1.6], ai1: [4, .97, 1.6],
};
const STAFF_SPOTS: Record<Station, Point> = {
  brief: [-2.6, 0, 1.95], make: [-.45, 0, .15], finish: [3.2, 0, .15],
  kit: [-2.7, 0, -1.7], idle: [-3.8, 0, 1.75], home: [-5.5, 0, 4], ai: [2.8, 0, 1.6],
};
export function stationPoint(station: Station, index: number): Point {
  const base = STAFF_SPOTS[station];
  return [base[0] + (station === 'make' ? index % 2 * 1.6 + Math.floor(index / 2) * .48 : station === 'idle' ? index * 2.5 : index * .56), base[1], base[2] + (station === 'make' ? Math.floor(index / 2) * .4 : 0)];
}
export interface SurfaceArt { key: string; piece: WorkPiece; at: Point; standing: boolean; stage: string; waiting: boolean; visible: boolean }

/** Clock text can advance without rebuilding an unchanged room. Work transitions remain exact. */
export function miniatureFrameKey(frame: WorldFrame): string {
  return JSON.stringify([frame.day, Math.floor(frame.offset / 15), frame.peopleOnShift, frame.outage, frame.workers, frame.folders, frame.packagesToday, frame.packagesTotal, frame.missedToday, frame.kit, frame.menu, frame.neighbours, frame.played, frame.scenarioId]);
}

/** Only the projected folders choose a work surface. Final jobs supply artwork, never historical stage or holder. */
export function miniatureScene(frame: WorldFrame, state?: CompanyState, selectedRequestId?: string | null, inspectedJobId?: string | null) {
  const delivered = state ? portfolioAt(state, frame.minute) : [];
  const active = state ? workFor(state, frame.folders.map(f => f.jobId), frame.minute) : [];
  const grouped = groupFolders(frame);
  const surfaces: SurfaceArt[] = [];
  const slots = new Map<string, number>();
  const held = new Set(frame.workers.filter(worker => worker.working && worker.jobId).map(worker => worker.jobId));
  const add = (ids: string[], surface: string) => {
    const waiting = ids.filter(id => !held.has(id) && id !== inspectedJobId);
    const visible = new Set([...waiting.slice(0, 3), ...ids.filter(id => held.has(id) || id === inspectedJobId)]);
    [...waiting, ...ids.filter(id => held.has(id) || id === inspectedJobId)].forEach(id => {
    const piece = active.find(p => p.jobId === id);
    const base = SURFACES[surface];
    const shown = visible.has(id);
    const slot = shown ? slots.get(surface) ?? 0 : 0;
    if (shown) slots.set(surface, slot + 1);
    const folder = frame.folders.find(f => f.jobId === id)!;
    if (piece && base) {
      const standing = surface === 'finish';
      const lift = standing ? Math.cos(.35) * (piece.brief.proof ? .72 : .96) / 2 : 0;
      surfaces.push({ key: id, piece, at: [base[0] + Math.min(slot, 2) * .22, base[1] + slot * .018 + lift, base[2] + Math.min(slot, 2) * .09], standing, stage: folder.stage, waiting: folder.waiting, visible: shown });
    }
    });
  };
  add(grouped.brief.map(f => f.jobId), 'brief');
  add(grouped.tray.map(f => f.jobId), 'tray');
  add(grouped.finish.map(f => f.jobId), 'finish');
  for (const [id, folders] of grouped.desk) {
    const worker = frame.workers.find(w => w.id === id)!;
    const roster = frame.workers.filter(w => w.kind === worker.kind);
    const index = roster.findIndex(w => w.id === id);
    add(folders.map(f => f.jobId), worker.kind === 'human' ? `make${index % 2}` : `ai${index}`);
  }
  const neighbours = placeNeighbours(frame).filter(p => !p.gone).map((p, index) => ({ ...p, look: customerLook(p.n.castId), at: [-2.65 + (p.queue > 0 ? 2 + (p.queue - 1) * .72 : p.queue < 0 ? index * .72 : 0), 0, p.queue > 0 ? 4.3 : 3.7] as Point }));
  const request = selectedRequestId && state?.requests.find(r => r.id === selectedRequestId && r.day === frame.day && frame.neighbours.some(n => n.requestId === r.id));
  const previewContract = request ? state?.contracts.find(contract => contract.id === request.contractId && contract.acceptedDay * RULES.minutesPerDay <= frame.minute) : undefined;
  const preview = request ? briefFor(request, previewContract?.offer ?? request.offer, state?.config, previewContract ? contractProof(previewContract) : undefined, state?.rulesVersion) : undefined;
  const project = state && hasStudioRules(state.rulesVersion) ? projectSceneAt(state, frame.minute) : undefined;
  const wall = [...new Map([...(project?.milestones.flatMap(milestone => milestone.pieces.slice(-1)) ?? []), ...delivered.toReversed()].map(piece => [piece.jobId, piece])).values()].slice(0, 5);
  const learners = frame.workers.filter(worker => worker.mentoring);
  const preparing = frame.workers.find(worker => worker.patternId);
  const lesson = state?.patternTeaching?.find(lesson => lesson.day === frame.day && learners.some(worker => worker.id === lesson.resourceId));
  const pattern = state?.patterns?.find(pattern => pattern.id === (preparing?.patternId ?? lesson?.patternId));
  const source = state && pattern ? patternSources(state).find(source => source.id === pattern.sourceId) : undefined;
  const lessonLabel = learners.length ? `${learners.map(worker => worker.name).join(' and ')} · ${learners[0]!.mentoring === 'pattern' ? 'a studio pattern lesson' : learners[0]!.mentoring === 'proofing' ? 'a proofing lesson' : 'a template-making lesson'}` : undefined;
  const learning = preparing ? { label: `${preparing.name} · preparing a studio pattern`, source, otherLabel: lessonLabel } : lessonLabel ? { label: lessonLabel, source } : undefined;
  return {
    description: describeFrame(frame), desks: aiWorkers(frame), outage: frame.outage, light: lightAt(Math.floor(frame.offset / 15) * 15), delivered, wall, surfaces, neighbours, preview, learning,
    keepsakes: state?.config.continuation?.pieces.slice(-3) ?? [], kit: frame.kit, scenarioId: frame.scenarioId ?? state?.config.scenarioId,
    people: placeHumans(frame).filter(p => !p.gone).map(p => ({ ...p, look: staffLook(p.worker.name), at: stationPoint(p.worker.station, p.index) })),
    project,
  };
}
