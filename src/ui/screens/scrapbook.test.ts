import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { scrapbook } from './scrapbook';

describe('the season in moments', () => {
  it('gathers a handful of the evenings in day order, moments cut to their first sentence', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.bright);
    const clips = scrapbook(s);
    expect(clips.length).toBeGreaterThanOrEqual(3);
    expect(clips.length).toBeLessThanOrEqual(6);
    expect(clips.map((c) => c.day)).toEqual([...clips.map((c) => c.day)].sort((a, b) => a - b));
    expect(clips.find((c) => c.kind === 'moment')!.text).not.toMatch(/come by tomorrow/);
  });
});
