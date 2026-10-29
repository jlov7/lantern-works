import { describe, expect, it } from 'vitest';
import { RULES } from '../../engine/rules';
import { applyCommand, createRun, redoBpFor, redoBpToday, replay, simulateDay } from '../../engine/sim';
import type { Command } from '../../engine/types';
import observed from './fixtures/careful-maker-day.json';
import { makerChoices } from './makers';
import { plannedWork } from './plannedWork';

describe('maker odds on the projected production day', () => {
  it('uses tomorrow’s native rate when the actual Careful Agnes plan carries beyond today’s careful pace', () => {
    const run = replay(observed.config, observed.commands as Command[], observed.rules);
    expect(run.errors).toEqual([]);
    const state = run.state;
    const request = state.requests.find(request => request.id === observed.requestId)!;
    const original = structuredClone(state);
    const choice = makerChoices(state, request)!.find(choice => choice.id === 'h2')!;
    expect(choice.fits).toBe(true);
    expect(choice.mins).toBe(440);
    expect(100 - Math.round(redoBpToday(state, 'human', request.need, 'h2') / 100)).toBe(92);
    const native = applyCommand(state, { type: 'accept', requestId: request.id, maker: 'h2' }).state;
    const jobId = native.contracts.at(-1)!.jobIds[0]!;
    for (const job of native.jobs) if (job.stage !== 'rework') job.reworkFlag = false;
    for (let day = native.day; day < RULES.days && !native.finished; day++) {
      simulateDay(native, { forecast: true });
      if (native.jobs.find(job => job.id === jobId)!.status === 'delivered') break;
    }
    const production = native.events.slice(state.events.length).find(event => event.type === 'task_done' && event.stage === 'produce' && event.jobId === jobId)!;
    expect(production.day).toBe(state.day + 1);
    const producer = native.resources.find(resource => resource.id === production.resourceId)!;
    const expected = 100 - Math.round(redoBpFor(state, producer.kind, request.need, producer, production.day) / 100);
    expect(expected).toBe(76);
    expect(choice.firstTime).toBe(expected);
    expect(state).toEqual(original);
  });

  it.each(['steady', 'push'] as const)('preserves native same-day maker odds and work minutes at %s pace', pace => {
    let state = createRun({ scenarioId: 'main-street', seed: 'maker-odds' });
    state.requests = [{ id: 'maker-buyer', day: 0, index: 0, castId: 'eli', segment: 'careful', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    if (pace !== 'steady') state = applyCommand(state, { type: 'pace', pace }).state;
    const request = state.requests[0]!;
    const choice = makerChoices(state, request)!.find(choice => choice.id === 'h2')!;
    const work = plannedWork(state, request.id, false, choice.id)!;
    expect(work.production[0]!.day).toBe(state.day);
    expect(choice.mins).toBe(work.first);
    expect(choice.firstTime).toBe(100 - Math.round(redoBpToday(state, 'human', request.need, choice.id) / 100));
  });
});
