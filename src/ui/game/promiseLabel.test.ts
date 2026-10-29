import { describe, expect, it } from 'vitest';
import { APPROACHES, projectBrief } from '../../engine/projects';
import { PRESETS } from '../../engine/rules';
import { applyCommand, createRun, replay, simulateDay } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { lateNames } from './forecastRisk';
import { promiseLabel } from './promiseLabel';

const config = { scenarioId: 'festival-week', seed: '8000' };
const opening: Command[] = [{ type: 'accept', requestId: 'd0-r0' }, { type: 'runDay' }, { type: 'runDay' }];

describe('ordinary and commission promise identities', () => {
  it('distinguishes the same customer’s ordinary launch and commission in lists and risks', () => {
    const before = replay(config, [...opening, { type: 'accept', requestId: 'd2-r1' }]);
    expect(before.errors).toEqual([]);
    const design = projectBrief(before.state, 'clem-ten', 'new-band').defaultDesign;
    const run = replay(config, [...before.state.commands, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design }]);
    expect(run.errors).toEqual([]);
    const ordinary = run.state.contracts.find(contract => contract.requestId === 'd2-r1')!.jobIds[0]!;
    const project = run.state.contracts.find(contract => contract.project)!.jobIds[0]!;
    expect(promiseLabel(run.state, ordinary)).toBe("Clem's launch");
    expect(promiseLabel(run.state, ordinary, 'customer')).toBe('Clem');
    expect(promiseLabel(run.state, project)).toBe(`Clem: ${APPROACHES['new-band'].artifact}`);
    expect(lateNames(run.state, [ordinary, project])).toBe(`Clem's launch and Clem: ${APPROACHES['new-band'].artifact}`);
  });

  it('identifies each piece of a commission series and preserves legacy ordinary wording', () => {
    let state = createRun(config);
    state.requests = [0, 1].map(index => ({ ...state.requests[0]!, id: `mara-${index}`, castId: 'mara', need: 'simple', offer: PRESETS.bespoke }));
    for (const request of state.requests) state = applyCommand(state, { type: 'accept', requestId: request.id }).state;
    for (let day = 0; day < 2; day++) simulateDay(state, { forecast: true });
    const accepted = applyCommand(state, { type: 'acceptProject', projectId: 'mara-regular', approach: 'weekly-rhythm', design: projectBrief(state, 'mara-regular', 'weekly-rhythm').defaultDesign });
    expect(accepted.error).toBeUndefined();
    const contract = accepted.state.contracts.find(contract => contract.project)!;
    expect(contract.jobIds.length).toBeGreaterThan(1);
    for (const [index, id] of contract.jobIds.entries()) expect(promiseLabel(accepted.state, id)).toContain(`launch ${index + 1} of ${contract.jobIds.length}`);
    const legacy = replay({ scenarioId: 'main-street', seed: 'first-season' }, [{ type: 'accept', requestId: 'd0-r0' }], LEGACY_RULES_VERSION);
    expect(legacy.errors).toEqual([]);
    expect(promiseLabel(legacy.state, legacy.state.jobs[0]!.id)).toBe("Clem's launch");
  });

  it('names the actual street event and chosen approach for the gathering', () => {
    const openingRun = replay(config, opening);
    expect(openingRun.errors).toEqual([]);
    const clemDesign = projectBrief(openingRun.state, 'clem-ten', 'new-band').defaultDesign;
    const before = replay(config, [...opening, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design: clemDesign }, { type: 'runDay' }, { type: 'runDay' }]);
    expect(before.errors).toEqual([]);
    const design = projectBrief(before.state, 'lantern-night', 'courtyard').defaultDesign;
    const run = replay(config, [...before.state.commands, { type: 'acceptProject', projectId: 'lantern-night', approach: 'courtyard', design }]);
    expect(run.errors).toEqual([]);
    const project = run.state.contracts.find(contract => contract.project?.id === 'lantern-night')!;
    expect(promiseLabel(run.state, project.jobIds[0]!)).toContain('The lantern walk, One courtyard');
  });
});
