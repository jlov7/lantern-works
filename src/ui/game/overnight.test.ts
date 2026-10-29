import { describe, expect, it } from 'vitest';
import recorded from '../../../test-fixtures/replays/handmade-run.json';
import { replay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { Command } from '../../engine/types';
import { overnight } from './eveningFacts';

const commands = recorded.commands as Command[];

describe('yesterday\'s earnings after a call', () => {
  it.each([11, 16])('includes deliveries after the answer, with %i saved commands', count => {
    const before = replay(recorded.config, commands.slice(0, 9), LEGACY_RULES_VERSION);
    const held = replay(recorded.config, commands.slice(0, 10), LEGACY_RULES_VERSION);
    const after = replay(recorded.config, commands.slice(0, count), LEGACY_RULES_VERSION);
    expect([...before.errors, ...held.errors, ...after.errors]).toEqual([]);
    expect(held.state.call).not.toBeNull();
    expect(held.state.revenue - before.state.revenue).toBe(0);
    expect(after.state.call).toBeNull();
    expect(after.state.day).toBe(2);
    expect(after.state.revenue - before.state.revenue).toBe(1240);
    expect(overnight(after.state).at(-1)).toContain('you earned 1,240 cr against 1,160 cr of running costs');
  });
});
