import { describe, expect, it } from 'vitest';
import second from '../../../test-fixtures/replays/careful-season2.json';
import trail from './fixtures/heartfelt-trail.json';
import { buildContinuation } from '../../engine/continuation';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { RULES } from '../../engine/rules';
import { epilogues } from '../../engine/endings';
import type { Command, CompanyState, RunConfig } from '../../engine/types';
import { rememberedLine } from './regulars';
import { relationshipEpilogues, relationshipSummary } from './relationshipSummary';

const secondConfig = second.config as RunConfig;
const secondCommands = second.commands as Command[];
const native = (config: RunConfig, commands: readonly Command[], rules: string) => {
  const result = replay(config, commands, rules);
  expect(result.errors).toEqual([]);
  return result.state;
};
const step = (state: CompanyState, command: Command) => {
  const result = applyCommand(state, command);
  expect(result.error).toBeUndefined();
  return result.state;
};

describe('relationship cause from the recorded dealings', () => {
  it('attributes Finn’s loss to the unanswered request while retaining all four paid jobs', () => {
    const state = native(secondConfig, secondCommands, second.rules);
    const before = JSON.stringify(state);
    expect(state.jobs.filter(j => j.castId === 'finn').every(j => j.status === 'delivered')).toBe(true);
    expect(state.config.continuation!.relationships.find(r => r.castId === 'finn')!.ordinaryDelivered + state.contracts.filter(c => c.castId === 'finn').length).toBe(4);
    expect(relationshipSummary(state, 'finn').loss).toMatchObject({ cause: 'unanswered-request', requestId: 'd2-r1', minute: 960 });
    expect(relationshipSummary(state, 'finn', 959).lost).toBe(false);
    const line = relationshipSummary(state, 'finn').line!;
    expect(line).toContain('An unanswered request on Day 3');
    expect(line).not.toMatch(/missed|broken|faulty/);
    expect(rememberedLine(state, state.requests.find(r => r.id === 'd2-r1')!)).toBe(line);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('uses the morning menu even after a later menu makes the old request unaffordable', () => {
    const state = native(secondConfig, secondCommands, second.rules);
    state.menu = [{ ...state.menu[0]!, price: 100000 }];
    expect(relationshipSummary(state, 'finn').loss?.cause).toBe('unanswered-request');
  });

  it('keeps legacy continuation uncertainty and offers a new chance without inventing faulty work', () => {
    const parent = native(secondConfig, secondCommands, second.rules);
    let state = createRun(buildContinuation(parent, [], 'relationship-amends'), parent.rulesVersion);
    state = step(state, { type: 'runDay' });
    const request = state.requests.find(r => r.castId === 'finn' && r.source === 'amends')!;
    expect(request).toBeDefined();
    expect(relationshipSummary(state, 'finn').loss?.cause).toBe('unknown');
    expect(rememberedLine(state, request)).toContain('retained history does not establish why');
    expect(rememberedLine(state, request)).toContain('chance to rebuild trust');
    expect(rememberedLine(state, request)).not.toContain('last job');
    state = step(state, { type: 'accept', requestId: request.id });
    while (state.day < 4) state = step(state, { type: 'runDay' });
    expect(state.jobs.find(j => j.castId === 'finn')?.status).toBe('delivered');
    expect(relationshipSummary(state, 'finn').lost).toBe(false);
  });

  it('preserves a native ordinary refused-change cause after the original print is delivered', () => {
    const state = native(trail.config, trail.commands as Command[], trail.rules);
    const change = state.relationshipMemory!.find(m => m.kind === 'change-refused')!;
    expect(change).toBeDefined();
    const contract = state.contracts.find(c => c.id === change.contractId)!;
    const job = state.jobs.find(j => j.contractId === contract.id && j.deliveredAt !== null)!;
    expect(job).toBeDefined();
    expect(relationshipSummary(state, change.castId, change.minute - 1).lost).toBe(false);
    expect(relationshipSummary(state, change.castId, job.deliveredAt!).loss?.cause).toBe('refused-extra-change');
    expect(state.relationshipMemory!.some(m => m.contractId === contract.id && m.kind === 'promise-kept' && m.minute > change.minute)).toBe(true);
    expect(relationshipSummary(state, change.castId).line).toContain('extra change was declined');
    expect(relationshipSummary(state, change.castId).line).not.toContain('missed');
  });

  it('retains ending selections and completed milestones while replacing their relationship attribution', () => {
    const state = native(trail.config, trail.commands as Command[], trail.rules);
    const before = epilogues(state);
    const after = relationshipEpilogues(state);
    expect(after.map(r => r.castId)).toEqual(before.map(r => r.castId));
    for (const regular of after) {
      if (state.lostCast.includes(regular.castId)) expect(regular.line).toContain(relationshipSummary(state, regular.castId).line);
      else expect(regular).toEqual(before.find(r => r.castId === regular.castId));
    }
  });

  it('does not attribute non-buying walkouts or deliberate refusals to lost relationships', () => {
    const state = native(secondConfig, secondCommands, second.rules);
    for (const castId of new Set(state.requests.map(r => r.castId))) {
      expect(relationshipSummary(state, castId).lost).toBe(state.lostCast.includes(castId));
    }
    const inheritedLost = createRun(buildContinuation(state, []), state.rulesVersion);
    expect(relationshipSummary(inheritedLost, 'finn').loss?.cause).toBe('unknown');
  });

  it('names a missed promise from actual deadline settlement', () => {
    let state = createRun({ scenarioId: 'main-street', seed: 'relationship-miss' });
    for (let day = 0; day < RULES.days; day++) {
      for (const request of state.requests.filter(r => r.day === state.day && r.status === 'waiting')) {
        const result = applyCommand(state, { type: 'accept', requestId: request.id });
        if (!result.error) state = result.state;
      }
      state = step(state, { type: 'runDay' });
    }
    const missed = state.events.find(e => e.type === 'missed')!;
    expect(missed).toBeDefined();
    const job = state.jobs.find(j => j.id === missed.jobId)!;
    expect(relationshipSummary(state, job.castId, missed.minute).loss?.cause).toBe('missed-promise');
  });
});
