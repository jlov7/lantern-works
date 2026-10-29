import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { dayPlan } from '../../engine/selectors';
import { applyCommand, replay, simulateDay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { CompanyState } from '../../engine/types';
import { planEnding } from './planEnding';

function lateBuyer(day: number) {
  let state: CompanyState | undefined;
  let id = '';
  runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.hand, { onBuyer: (s, requestId, fits) => {
    if (s.day === day && !fits && !state) { state = structuredClone(s); id = requestId; }
  } }, LEGACY_RULES_VERSION);
  expect(state).toBeDefined();
  return { state: state!, id };
}

describe('the selected buyer at closing', () => {
  it('does not promise another day when this launch misses tonight', () => {
    const { state, id } = lateBuyer(6);
    expect(id).toBe('d6-r1');
    const before = structuredClone(state);
    const plan = dayPlan(state, id)!;
    const taken = applyCommand(state, { type: 'accept', requestId: id });
    expect(taken.error).toBeUndefined();
    const jobId = taken.state.contracts.at(-1)!.jobIds[0]!;
    simulateDay(taken.state, { forecast: true });
    expect(taken.state.jobs.find(j => j.id === jobId)).toMatchObject({ status: 'missed', stage: 'finish', remaining: 13 });
    expect(planEnding(plan, state, id)).toBe(' Not finished today: it would miss tonight.');
    expect(state).toEqual(before);
  });

  it('still reports a completed launch when overtime makes its finishing fit', () => {
    const { state, id } = lateBuyer(6);
    const late = applyCommand(state, { type: 'overtime' });
    expect(late.error).toBeUndefined();
    const plan = dayPlan(late.state, id)!;
    const finish = plan.blocks.find(b => b.isNew && b.stage === 'finish')!;
    expect(finish.completed).toBe(true);
    const taken = applyCommand(late.state, { type: 'accept', requestId: id });
    const jobId = taken.state.contracts.at(-1)!.jobIds[0]!;
    simulateDay(taken.state, { forecast: true });
    expect(taken.state.jobs.find(j => j.id === jobId)?.status).toBe('delivered');
    expect(planEnding(plan, late.state, id)).toMatch(/^ Out at /);
  });

  it('retains tomorrow for work that really remains active past this evening', () => {
    const config = { scenarioId: 'main-street', seed: 'business-opening-observation-1' };
    const result = replay(config, [
      { type: 'setMenu', offers: [
        { name: 'Bespoke Launch', launches: 1, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 900 },
        { name: 'Launchlet', launches: 1, spacingDays: 3, turnaroundDays: 1, scope: 'simple', style: 'templated', price: 340 },
      ] },
      { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } },
      { type: 'accept', requestId: 'd0-r0' },
      { type: 'accept', requestId: 'd0-r3', maker: 'h1' },
      { type: 'decline', requestId: 'd0-r2' },
      { type: 'decline', requestId: 'd0-r4' },
      { type: 'runDay', calls: true },
      { type: 'accept', requestId: 'd1-r6' },
    ]);
    expect(result.errors).toEqual([]);
    const state = result.state, id = 'd1-r4';
    const plan = dayPlan(state, id)!;
    const taken = applyCommand(state, { type: 'accept', requestId: id });
    expect(taken.error).toBeUndefined();
    const jobId = taken.state.contracts.at(-1)!.jobIds[0]!;
    simulateDay(taken.state, { forecast: true });
    expect(taken.state.jobs.find(j => j.id === jobId)).toMatchObject({ status: 'active', stage: 'brief', remaining: 3 });
    expect(planEnding(plan, state, id)).toBe(' Not finished today: it carries on tomorrow.');
  });

  it('does not promise tomorrow past the season boundary', () => {
    const { state, id } = lateBuyer(11);
    expect(id).toBe('d11-r0');
    const plan = dayPlan(state, id)!;
    expect(plan.blocks.some(b => b.isNew && !b.completed)).toBe(true);
    const taken = applyCommand(state, { type: 'accept', requestId: id });
    expect(taken.error).toBeUndefined();
    const jobId = taken.state.contracts.at(-1)!.jobIds[0]!;
    simulateDay(taken.state, { forecast: true });
    expect(taken.state.jobs.find(j => j.id === jobId)?.status).toBe('refunded');
    expect(planEnding(plan, state, id)).toBe(' Not finished before the season ends.');
  });
});
