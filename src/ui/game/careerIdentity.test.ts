import { describe, expect, it } from 'vitest';
import fixture from '../../engine/fixtures/legacy-6.0.0.json';
import { adaptCareerContinuation, buildContinuation, deliveredPieces } from '../../engine/continuation';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { canUndoRun, careerIdentity } from './careerIdentity';
import { streetDisplayAt } from './streetDisplay';
import { nightStudy } from '../portfolio/study';
import { configSchema } from '../schema';

const tape = fixture.tapes[0]!;
const old = replay(configSchema.parse(tape.config), tape.commands as Command[], fixture.rules);
const kept = deliveredPieces(old.state).slice(0, 3);

function finish(state: CompanyState): CompanyState {
  for (let turn = 0; turn < 40 && !state.finished; turn++) {
    const command: Command = state.call ? { type: 'answer', option: 'ring' } : state.news.some(item => item.choice === null) ? { type: 'choose', newsId: state.news.find(item => item.choice === null)!.id, option: 0 } : { type: 'runDay' };
    const result = applyCommand(state, command);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  expect(state.finished).toBe(true);
  return state;
}

describe('career presentation and finished-season curation', () => {
  it('keeps old studios outside the career and distinguishes later purposes and the authored ending', () => {
    expect(old.errors).toEqual([]);
    expect(careerIdentity(old.state)).toBeNull();
    let state = createRun(adaptCareerContinuation(old.state, kept.map(piece => piece.id)), 'lantern-7.0.0');
    expect(careerIdentity(state)).toMatchObject({ stage: 'practice', complete: false, title: 'A practice of your own' });
    state = finish(state);
    state = createRun(buildContinuation(state, []), 'lantern-7.0.0');
    expect(careerIdentity(state)).toMatchObject({ stage: 'legacy', complete: false, title: 'What the studio leaves behind' });
    state = finish(state);
    expect(careerIdentity(state)).toMatchObject({ stage: 'legacy', complete: true });
    state = createRun(buildContinuation(state, []), 'lantern-7.0.0');
    expect(careerIdentity(state)).toMatchObject({ stage: 'open', title: 'Open studio' });
    expect(careerIdentity(state)!.line).toContain('recurring');
  });

  it('undoes only trailing curation after an ending and leaves the finished day protected', () => {
    const finished = finish(createRun(adaptCareerContinuation(old.state, kept.map(piece => piece.id)), 'lantern-7.0.0'));
    expect(canUndoRun(finished)).toBe(false);
    const selected = applyCommand(finished, { type: 'featurePieces', pieceIds: ['carried-2', 'carried-1'] });
    expect(selected.error).toBeUndefined();
    expect(canUndoRun(selected.state)).toBe(true);
    const undone = replay(selected.state.config, selected.state.commands.slice(0, -1), selected.state.rulesVersion);
    expect(undone.errors).toEqual([]);
    expect(undone.state).toEqual(finished);
    expect(canUndoRun(undone.state)).toBe(false);
    expect(canUndoRun(old.state)).toBe(false);
  });

  it('features exact retained artwork in selected order without making a gathering or host', () => {
    const state = createRun(adaptCareerContinuation(old.state, kept.map(piece => piece.id)), 'lantern-7.0.0');
    const result = applyCommand(state, { type: 'featurePieces', pieceIds: ['carried-2', 'carried-1'] });
    expect(result.error).toBeUndefined();
    const display = streetDisplayAt(result.state);
    expect(display.mode).toBe('studio');
    expect(display.hosts).toEqual([]);
    expect(display.locations.map(piece => piece.id)).toEqual(['carried-2', 'carried-1']);
    expect(display.locations[0]!.carried).toEqual(result.state.config.continuation!.pieces[1]);
    expect(display.locations.every(piece => piece.featured && !piece.eventPiece)).toBe(true);
  });

  it('keeps the actual gathering programme and host facts when unrelated work is featured', () => {
    const state = nightStudy('main-street', 'courtyard');
    const before = streetDisplayAt(state);
    const candidate = deliveredPieces(state).find(piece => !before.locations.some(location => location.id === piece.id))!;
    expect(candidate).toBeDefined();
    const selected = applyCommand(state, { type: 'featurePieces', pieceIds: [candidate.id] });
    expect(selected.error).toBeUndefined();
    const after = streetDisplayAt(selected.state);
    expect(after.locations.filter(piece => piece.eventPiece)).toEqual(before.locations.filter(piece => piece.eventPiece));
    expect(after.hosts).toEqual(before.hosts);
    expect(after.locations.find(piece => piece.id === candidate.id)).toMatchObject({ featured: true, place: 'Studio window' });
    const job = selected.state.jobs.find(job => job.id === candidate.id)!;
    expect(streetDisplayAt(selected.state, job.deliveredAt! - 1).locations.some(piece => piece.id === candidate.id)).toBe(false);
  });
});
