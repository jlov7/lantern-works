import { expect, it } from 'vitest';
import { PRESETS } from '../../engine/rules';
import { applyCommand, createRun } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { mentoringPreview } from './mentoringPreview';

it('discloses season-close refunds even when the mentoring forecast has no missed deadlines', () => {
  let state = createRun({ scenarioId: 'main-street', seed: 'mentor-horizon-review' });
  const run = (command: Command) => {
    const result = applyCommand(state, command);
    expect(result.error).toBeUndefined();
    state = result.state;
  };
  run({ type: 'hire' });
  while (state.day < 10) {
    for (const news of state.news.filter(n => n.day === state.day && n.choice === null)) run({ type: 'choose', newsId: news.id, option: 0 });
    run({ type: 'runDay' });
  }
  for (const news of state.news.filter(n => n.day === state.day && n.choice === null)) run({ type: 'choose', newsId: news.id, option: 0 });
  run({ type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 200, launches: 3, spacingDays: 3, turnaroundDays: 3 }] });
  run({ type: 'accept', requestId: 'd10-r0' });
  const quote = mentoringPreview(state, 'j1', 'proofing');
  expect(quote?.late).toEqual([]);
  expect(quote?.refunded).toEqual(['c1-l2', 'c1-l3']);
});
