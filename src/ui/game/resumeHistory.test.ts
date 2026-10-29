import { describe, expect, it } from 'vitest';
import { createRun, replay } from '../../engine/sim';
import { previousMorning } from './resumeHistory';
import { reconstruct } from '../resumeReplay';

describe('resume presentation history', () => {
  it('uses the worker prefix only for the exact tape it rebuilt', () => {
    const start = createRun({ scenarioId: 'main-street', seed: 'resume-history' });
    const commands = [{ type: 'runDay' as const }, { type: 'pace' as const, pace: 'careful' as const }];
    const steps = reconstruct({ rules: start.rulesVersion, config: start.config, commands });
    let next = steps.next(); while (!next.done) next = steps.next();
    const rebuilt = next.value!;
    expect(previousMorning(rebuilt.state, rebuilt.history)).toEqual(start);
    const replaced = replay(start.config, [{ type: 'runDay' }, { type: 'pace', pace: 'push' }], start.rulesVersion).state;
    expect(replaced.commands).toHaveLength(rebuilt.state.commands.length);
    expect(previousMorning(replaced, rebuilt.history)).toBeUndefined();
    expect(previousMorning(start, rebuilt.history)).toBeUndefined();
  });
});
