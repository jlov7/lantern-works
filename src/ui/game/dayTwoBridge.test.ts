import { describe, expect, it } from 'vitest';
import { bridgeLine, foldExplanations } from './dayTwoBridge';

describe('the Day 2 bridge', () => {
  it.each([
    [6, 1, '6 neighbours are waiting. One more job fits today.'],
    [6, 2, '6 neighbours are waiting. 2 jobs fit today, in queue order.'],
    [6, 0, '6 neighbours are waiting. Nothing more fits today.'],
    [1, 1, '1 neighbour is waiting. One more job fits today.'],
    [1, 0, '1 neighbour is waiting. Nothing more fits today.'],
    [0, 0, '0 neighbours are waiting. Nothing more fits today.'],
  ])('describes %i neighbours and %i fitting jobs', (waiting, takeable, line) => {
    expect(bridgeLine(waiting, takeable)).toBe(line);
  });

  it('only folds the first Day 2 of the first-order season', () => {
    const firstOrder = 'First order: Main Street';
    expect(foldExplanations(1, firstOrder, false)).toBe(true);
    expect(foldExplanations(1, firstOrder, true)).toBe(false);
    expect(foldExplanations(0, firstOrder, false)).toBe(false);
    expect(foldExplanations(2, firstOrder, false)).toBe(false);
    expect(foldExplanations(1, 'Main Street', false)).toBe(false);
    expect(foldExplanations(1, undefined, false)).toBe(false);
  });
});
