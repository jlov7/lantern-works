import { describe, expect, it } from 'vitest';
import { miniatureFrameKey, miniatureScene, stationPoint } from './adapter';
import { miniatureStudyFrames } from './study-frames';
import { CLOSING_PROMISE } from '../../engine/fixtures/closingPromise';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { buildContinuation } from '../../engine/continuation';
import type { Command, CompanyState } from '../../engine/types';
import { frameAt } from '../timeline';
import courtyard from '../game/fixtures/heartfelt-courtyard.json';

function nativeFrame(minute: number) {
  const day = Math.floor(minute / 480);
  let state = createRun(CLOSING_PROMISE.config, CLOSING_PROMISE.rules);
  let before = state;
  for (const command of CLOSING_PROMISE.commands) {
    if (command.type === 'runDay' && state.day === day) before = state;
    const applied = applyCommand(state, command);
    expect(applied.error).toBeUndefined();
    state = applied.state;
    if (state.day > day) break;
  }
  return { state, frame: frameAt(before, state, minute) };
}

const frames = miniatureStudyFrames();
describe('miniature historical adapter', () => {
  it('keeps minute-only clock updates cheap without skipping real work or outage transitions', () => {
    const frame = frames[1]!.frame;
    const next = { ...frame, minute: frame.minute + 1, offset: frame.offset + 1, clock: '10:28am' };
    expect(miniatureFrameKey(next)).toBe(miniatureFrameKey(frame));
    expect(miniatureFrameKey({ ...frame, outage: !frame.outage })).not.toBe(miniatureFrameKey(frame));
    expect(miniatureFrameKey({ ...frame, folders: frame.folders.map(folder => ({ ...folder, waiting: !folder.waiting })) })).not.toBe(miniatureFrameKey(frame));
    expect(miniatureFrameKey({ ...frame, packagesToday: [...frame.packagesToday, 'new-delivery'] })).not.toBe(miniatureFrameKey(frame));
  });
  it('does not show final deliveries or final job stages on the production frame', () => {
    const production = frames[1]!;
    const scene = miniatureScene(production.frame, production.state);
    expect(scene.people.find(p => p.worker.name === 'Ada')?.worker).toMatchObject({ station: 'make', working: true });
    expect(scene.surfaces.length).toBeGreaterThan(0);
    for (const surface of scene.surfaces) {
      const folder = production.frame.folders.find(f => f.jobId === surface.key)!;
      expect(surface.stage).toBe(folder.stage);
      expect(scene.delivered.some(p => p.jobId === surface.key)).toBe(false);
    }
    expect(scene.surfaces.some(s => s.piece.brief.proof)).toBe(true);
    expect(scene.delivered.every(p => p.deliveredAt! <= production.frame.minute)).toBe(true);
  });
  it('keeps the exact booked design and frozen copy on its real work piece', () => {
    const current = frames[1]!;
    const surface = miniatureScene(current.frame, current.state).surfaces.find(s => s.piece.brief.proof)!;
    const contract = current.state.contracts.find(c => c.id === surface.piece.contractId)!;
    expect(surface.piece.brief.proof).toEqual(contract.project!.proof);
    expect(surface.piece.brief.proof!.design.pieces).toHaveLength(1);
  });
  it('uses existing neighbours only and does not accept any request when selecting', () => {
    const morning = frames[0]!;
    const clem = morning.frame.neighbours.find(n => n.castId === 'clem')!;
    const snapshot = structuredClone(morning.state);
    const scene = miniatureScene(morning.frame, morning.state, clem.requestId);
    expect(scene.preview?.castId).toBe('clem');
    expect(scene.neighbours.map(p => p.n.requestId).every(id => morning.frame.neighbours.some(n => n.requestId === id))).toBe(true);
    expect(scene.delivered).toEqual([]);
    expect(morning.state).toEqual(snapshot);
    expect(miniatureScene(morning.frame, morning.state, 'made-up').preview).toBeUndefined();
  });
  it('removes off-shift people at closing and preserves the native paused call', () => {
    expect(miniatureScene(frames[2]!.frame, frames[2]!.state).people).toEqual([]);
    const held = frames[3]!;
    expect(held.state.call?.minute).toBe(held.frame.minute);
    expect(held.frame.offset).toBeLessThan(480);
    expect(held.frame.workers.some(w => w.working)).toBe(true);
  });
  it('makes roster slots distinct without moving a worker to an invented activity', () => {
    expect(stationPoint('make', 0)).not.toEqual(stationPoint('make', 1));
    for (const fixture of frames) for (const person of miniatureScene(fixture.frame, fixture.state).people) expect(person.at).toEqual(stationPoint(person.worker.station, person.index));
  });
  it('keeps people recognizable when the queue or staff roster changes order', () => {
    const current = nativeFrame(4973);
    const frame = { ...current.frame, neighbours: frames[0]!.frame.neighbours };
    const first = miniatureScene(frame, current.state);
    const reordered = miniatureScene({ ...frame, workers: frame.workers.toReversed(), neighbours: frame.neighbours.toReversed() }, current.state);
    for (const person of first.people) expect(reordered.people.find(next => next.worker.id === person.worker.id)?.look).toEqual(person.look);
    for (const person of first.neighbours) expect(reordered.neighbours.find(next => next.n.requestId === person.n.requestId)?.look).toEqual(person.look);
    const noor = first.people.find(person => person.worker.name === 'Noor');
    expect(noor).toBeDefined();
    expect(noor!.look).not.toEqual(first.people.find(person => person.worker.name === 'Ada')!.look);
  });
  it('stacks three waiting prints within one bench instead of multiplying the spacing', () => {
    const current = frames[1]!;
    const frame = { ...current.frame, folders: current.state.jobs.slice(0, 3).map(job => ({ jobId: job.id, castId: job.castId, stage: 'brief' as const, waiting: true, dueToday: false, templated: false })) };
    const surfaces = miniatureScene(frame, current.state).surfaces;
    expect(surfaces).toHaveLength(3);
    expect(surfaces[1]!.at[0] - surfaces[0]!.at[0]).toBeCloseTo(.22);
    expect(surfaces[2]!.at[0] - surfaces[1]!.at[0]).toBeCloseTo(.22);
    expect(surfaces.every(surface => surface.waiting)).toBe(true);
  });
  it('keeps every native queued print inspectable and every actively held print visible', () => {
    for (const minute of [960, 4800, 4973]) {
      const current = nativeFrame(minute);
      const scene = miniatureScene(current.frame, current.state);
      expect(scene.surfaces.map(art => art.key).sort()).toEqual(current.frame.folders.map(folder => folder.jobId).sort());
      for (const worker of current.frame.workers.filter(worker => worker.working && worker.jobId)) expect(scene.surfaces.find(art => art.key === worker.jobId)?.visible).toBe(true);
      const positions = scene.surfaces.filter(art => art.visible).map(art => JSON.stringify(art.at));
      expect(new Set(positions).size).toBe(positions.length);
    }
    const busy = nativeFrame(4973);
    const waiting = { ...busy.frame, workers: busy.frame.workers.map(worker => ({ ...worker, working: false, jobId: null })), folders: busy.frame.folders.map(folder => ({ ...folder, waiting: true })) };
    const hidden = miniatureScene(waiting, busy.state).surfaces.find(art => !art.visible)!;
    expect(hidden).toBeDefined();
    expect(miniatureScene(waiting, busy.state, null, hidden.key).surfaces.find(art => art.key === hidden.key)?.visible).toBe(true);
  });
  it('rests a native finishing print above the table instead of through it', () => {
    const current = nativeFrame(189);
    const print = miniatureScene(current.frame, current.state).surfaces.find(art => art.key === 'c1-l1')!;
    expect(print.standing).toBe(true);
    const height = print.piece.brief.proof ? .72 : .96;
    expect(print.at[1] - Math.cos(.35) * height / 2).toBeGreaterThan(1.015);
  });
  it('keeps the chosen artwork and shows pattern preparation and teaching only during their real work', () => {
    const finished = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules);
    expect(finished.errors).toEqual([]);
    const config = buildContinuation(finished.state, ['c5-l1']);
    const carried = config.continuation!.pieces[0]!;
    const apply = (state: CompanyState, command: Command) => {
      const result = applyCommand(state, command); expect(result.error).toBeUndefined(); return result.state;
    };
    const staffed = apply(createRun(config, finished.state.rulesVersion), { type: 'hire' });
    const before = apply(staffed, { type: 'preparePattern', sourceId: carried.id });
    const after = apply(before, { type: 'runDay' });
    const preparing = miniatureScene(frameAt(before, after, 30), after);
    expect(preparing.keepsakes).toEqual([carried]);
    expect(preparing.learning?.label).toBe('Tomas · preparing a studio pattern');
    expect(preparing.learning?.source?.design).toEqual(carried.design);
    expect(miniatureScene(frameAt(before, after, 61), after).learning).toBeUndefined();
    const noor = after.resources.find(resource => resource.role === 'junior')!;
    const lesson = apply(after, { type: 'teachPattern', patternId: after.patterns![0]!.id, resourceId: noor.id });
    const taught = apply(lesson, { type: 'runDay' });
    const learning = miniatureScene(frameAt(lesson, taught, lesson.minute + 30), taught).learning;
    expect(learning?.label).toBe('Tomas and Noor · a studio pattern lesson');
    expect(learning?.source?.copy).toEqual(carried.copy);
    expect(miniatureScene(frameAt(lesson, taught, lesson.minute + 60), taught).learning).toBeUndefined();
  });
  it('separates a proofing lesson from simultaneous preparation of an unrelated pattern', () => {
    const finished = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules);
    expect(finished.errors).toEqual([]);
    const config = buildContinuation(finished.state, ['c5-l1']);
    const carried = config.continuation!.pieces[0]!;
    let state = createRun(config, finished.state.rulesVersion);
    for (const command of [{ type: 'hire' }, { type: 'runDay' }, { type: 'preparePattern', sourceId: carried.id }] satisfies Command[]) {
      const result = applyCommand(state, command); expect(result.error).toBeUndefined(); state = result.state;
    }
    const noor = state.resources.find(resource => resource.name === 'Noor')!;
    const booked = applyCommand(state, { type: 'mentor', resourceId: noor.id, specialization: 'proofing' });
    expect(booked.error).toBeUndefined();
    const worked = applyCommand(booked.state, { type: 'runDay' });
    expect(worked.error).toBeUndefined();
    const scene = miniatureScene(frameAt(booked.state, worked.state, booked.state.minute + 30), worked.state);
    expect(scene.learning).toMatchObject({ label: 'Tomas · preparing a studio pattern', otherLabel: 'Ada and Noor · a proofing lesson', source: carried });
  });
});
