import { describe, expect, it, vi } from 'vitest';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { counterFor, forecast, reactionTo, windowRequests, type Forecast } from '../../engine/selectors';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import late from './fixtures/late-phone-width.json';
import { queueModel } from './queueModel';
import observed from './fixtures/careful-maker-day.json';
import * as planning from './plannedWork';

function estimates(state: CompanyState) {
  return new Map(windowRequests(state).filter(r => r.status === 'waiting' && (reactionTo(state, r).kind === 'buy' || counterFor(state, r))).map(r => [r.id, forecast(state, r.id, counterFor(state, r) ? { counter: true } : {})] as [string, Forecast]));
}

describe('one shared customer queue', () => {
  it('classifies the recorded tricky buyer without planning every maker’s production details', () => {
    const { state, errors } = replay(observed.config, observed.commands as Command[], observed.rules);
    expect(errors).toEqual([]);
    const detailed = vi.spyOn(planning, 'plannedWork');
    try {
      const model = queueModel(state, estimates(state));
      expect(model.makers.get(observed.requestId)).toContainEqual({ id: 'h2', name: 'Tomas', fits: true });
      expect(model.buyers.map(request => request.id)).toContain(observed.requestId);
      expect(detailed).not.toHaveBeenCalled();
    } finally { detailed.mockRestore(); }
  });
  it('retains every neighbour exactly once across comparison groups, including the late season', () => {
    for (const state of [createRun({ scenarioId: 'main-street', seed: 'first-season' }), replay(late.config, late.commands as Command[], LEGACY_RULES_VERSION).state]) {
      const before = structuredClone(state);
      const model = queueModel(state, estimates(state));
      const ids = [...model.buyers, ...model.hagglers, ...model.walkers, ...model.tooLate, ...model.answered].map(r => r.id);
      expect(ids.toSorted()).toEqual(model.all.map(r => r.id).toSorted());
      expect(new Set(ids).size).toBe(ids.length);
      expect(model.all).toEqual(windowRequests(state));
      expect(state).toEqual(before);
    }
  });
  it('refreshes fit and answered facts from commands while keeping arrival order', () => {
    const state = createRun({ scenarioId: 'main-street', seed: 'first-season' });
    const before = queueModel(state, estimates(state));
    const id = before.together[0]!;
    const answer = applyCommand(state, { type: 'accept', requestId: id });
    expect(answer.error).toBeUndefined();
    const after = queueModel(answer.state, estimates(answer.state));
    expect(after.answered.map(r => r.id)).toContain(id);
    expect(after.waiting.map(r => r.id)).not.toContain(id);
    expect(after.all.map(r => r.id)).toEqual(before.all.map(r => r.id));
    expect(after.together.length).toBeLessThan(before.together.length);
  });
});
