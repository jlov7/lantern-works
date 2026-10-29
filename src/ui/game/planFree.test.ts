import { expect, it } from 'vitest';
import type { PlanBlock } from '../../engine/selectors';
import { planFree } from './planFree';

const block = (from: number, to: number): PlanBlock => ({ resourceId: 'h1', jobId: 'c1-l1', stage: 'finish', from, to, isNew: false, completed: true });

it('names a half-hour tail without confusing it with all the free gaps or AI capacity', () => {
  expect(planFree({
    lanes: [
      { id: 'h1', name: 'Ada', kind: 'human', length: 360 },
      { id: 'ai1', name: 'AI desk 1', kind: 'ai', length: 480 },
    ],
    blocks: [block(0, 240), block(300, 330)],
  })).toEqual(['Ada 1.5 hours (half an hour from 2:30pm)']);
});

it('retains the hour unit on a longer tail and names fully occupied people', () => {
  const lanes = [{ id: 'h1', name: 'Ada', kind: 'human' as const, length: 360 }];
  expect(planFree({ lanes, blocks: [block(0, 180), block(240, 300)] })).toEqual(['Ada 2 hours (1 hour from 2:00pm)']);
  expect(planFree({ lanes, blocks: [block(0, 360)] })).toEqual(['Ada none']);
});
