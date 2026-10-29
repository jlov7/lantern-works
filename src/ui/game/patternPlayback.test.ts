import { describe, expect, it } from 'vitest';
import { buildContinuation, deliveredPieces } from '../../engine/continuation';
import { applyCommand, createRun } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { nightStudy } from '../portfolio/study';
import { frameAt } from '../timeline';
import { narrate } from '../narrate';

const apply = (s: CompanyState, command: Command) => {
  const result = applyCommand(s, command);
  expect(result.error).toBeUndefined();
  return result.state;
};

describe('pattern work during playback', () => {
  it('shows real preparation and teaching appointments only while they happen', () => {
    const parent = nightStudy('main-street', 'courtyard');
    // This controlled visual fixture needs a solvent opening to exercise paid preparation.
    parent.cash = 5000;
    let s = createRun(buildContinuation(parent, [deliveredPieces(parent)[0]!.id]));
    s = apply(s, { type: 'preparePattern', sourceId: 'carried-1' });
    s = apply(s, { type: 'hire' });
    const before = s;
    s = apply(s, { type: 'runDay' });
    const patternId = s.patterns![0]!.id;
    expect(frameAt(before, s, 59).workers.find(r => r.id === 'h2')).toMatchObject({ working: true, station: 'brief', patternId });
    expect(frameAt(before, s, 61).workers.find(r => r.id === 'h2')!.patternId).toBeUndefined();
    const ready = s.events.find(e => e.type === 'pattern_ready')!;
    expect(narrate(s, ready, 0)!.text).toContain('15 fewer briefing minutes');
    for (const news of s.news.filter(n => n.choice === null)) s = apply(s, { type: 'choose', newsId: news.id, option: 0 });
    s = apply(s, { type: 'teachPattern', patternId, resourceId: 'j1' });
    const lesson = s;
    s = apply(s, { type: 'runDay' });
    for (const id of ['h2', 'j1']) {
      expect(frameAt(lesson, s, 539).workers.find(r => r.id === id)).toMatchObject({ working: true, mentoring: 'pattern' });
      expect(frameAt(lesson, s, 541).workers.find(r => r.id === id)!.mentoring).toBeUndefined();
    }
    const done = s.events.find(e => e.type === 'pattern_teaching_done')!;
    expect(narrate(s, done, 0)!.text).toBe('Noor finished the pattern lesson. She can use it from tomorrow morning.');
  });
});
