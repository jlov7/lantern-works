import { expect, it } from 'vitest';
import observed from '../../../test-fixtures/replays/courier-session.json' with { type: 'json' };
import { replay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { Command } from '../../engine/types';
import { dueNextStage } from './dueNextLabels';

it('uses the actual release morning for the observed batch job', () => {
  const { state, errors } = replay(observed.config, observed.commands.slice(0, 37) as Command[], LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  const job = state.jobs.find(j => j.id === 'c16-l1')!;
  expect(job).toMatchObject({ status: 'scheduled', releaseDay: 5 });
  expect(dueNextStage(job, state.day)).toBe('starts today');
  expect(dueNextStage(job, state.day - 1)).toBe('starts tomorrow');
  expect(dueNextStage({ ...job, status: 'active', stage: 'rework' }, state.day)).toBe('needs rework');
});
