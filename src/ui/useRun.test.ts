import { describe, expect, it } from 'vitest';
import recorded from '../../test-fixtures/replays/handmade-run.json';
import { createRun, replay } from '../engine/sim';
import type { Command } from '../engine/types';
import { branchFrom } from './useRun';

const commands = recorded.commands as Command[];
const original = replay(recorded.config, commands, recorded.rules);

describe('branching from a morning', () => {
  it('starts Day 1 before its original sales and maker choices', () => {
    expect(original.errors).toEqual([]);
    const branch = branchFrom(original.state, recorded, 0);
    expect(branch.state).toEqual(createRun(recorded.config, recorded.rules));
    expect(branch.meta).toMatchObject({ parentId: recorded.id, branchDay: 0 });
    expect(branch.meta.id).not.toBe(recorded.id);
    expect(original.state.commands).toEqual(commands);
  });

  it.each([
    { day: 1, shownDay: 2, prefix: 3, ending: 'runDay' },
    { day: 2, shownDay: 3, prefix: 11, ending: 'answer' },
  ])('starts Day $shownDay after the previous $ending but before new decisions', ({ day, prefix, ending }) => {
    const expected = replay(recorded.config, commands.slice(0, prefix), recorded.rules);
    expect(expected.errors).toEqual([]);
    const branch = branchFrom(original.state, recorded, day);
    expect(branch.state).toEqual(expected.state);
    expect(branch.state.day).toBe(day);
    expect(branch.state.call).toBeNull();
    expect(branch.state.commands.at(-1)?.type).toBe(ending);
    expect(branch.state.requests.filter(r => r.day === day).every(r => r.status === 'waiting')).toBe(true);
    expect(branch.state.news.filter(n => n.day === day).every(n => n.choice === null)).toBe(true);
    expect(branch.meta.label).toContain(`branch from day ${day + 1}`);
    expect(original.state.commands).toEqual(commands);
  });
});
