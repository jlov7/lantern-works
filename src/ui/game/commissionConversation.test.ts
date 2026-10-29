import { describe, expect, it } from 'vitest';
import { CREATIVE_PROMISE_RULES_VERSION } from '../../engine/versions';
import { buildContinuation } from '../../engine/continuation';
import { createRun, simulateDay } from '../../engine/sim';
import { nightStudy } from '../portfolio/study';
import { commissionConversation } from './commissionConversation';

describe('customer intentions', () => {
  it('distinguishes the quiet keepsake from the public handover', () => {
    const talk = commissionConversation(createRun({ scenarioId: 'main-street', seed: 'talk' }), 'hugo-handover');
    expect(talk.castId).toBe('hugo');
    expect(talk.exchanges[0]!.answer).toContain('not an invitation');
    expect(talk.exchanges[1]!.answer).toContain('Ivo’s name');
  });

  it('remembers completed work without inventing it in a quiet prior season', () => {
    const parent = nightStudy('main-street', 'courtyard');
    const next = createRun(buildContinuation(parent, []));
    expect(commissionConversation(next, 'clem-ten').opening).toContain('old lettering last time');
    expect(commissionConversation(next, 'hugo-handover')).toMatchObject({ castId: 'ivo', name: 'Ivo' });
    const quiet = createRun({ scenarioId: 'main-street', seed: 'no-work' });
    while (!quiet.finished) simulateDay(quiet, { forecast: true });
    const unmade = createRun(buildContinuation(quiet, []));
    expect(commissionConversation(unmade, 'clem-ten').opening).not.toMatch(/last time|you made/);
    expect(commissionConversation(unmade, 'hugo-handover').castId).toBe('ivo');
    expect(commissionConversation(unmade, 'hugo-handover').opening).not.toContain('watching me leave');
  });

  it('preserves the old repeated handover presentation under its original rules', () => {
    const quiet = createRun({ scenarioId: 'main-street', seed: 'no-work' }, CREATIVE_PROMISE_RULES_VERSION);
    while (!quiet.finished) simulateDay(quiet, { forecast: true });
    const next = createRun(buildContinuation(quiet, []), CREATIVE_PROMISE_RULES_VERSION);
    expect(commissionConversation(next, 'hugo-handover').castId).toBe('hugo');
  });

  it('gives the actual event and production dates on each street', () => {
    const festival = commissionConversation(createRun({ scenarioId: 'festival-week', seed: 'talk' }), 'lantern-night');
    expect(festival.exchanges[1]!.answer).toContain('Day 8');
    expect(festival.exchanges[1]!.answer).toContain('Day 6');
    const careful = commissionConversation(createRun({ scenarioId: 'bespoke-rush', seed: 'talk' }), 'lantern-night');
    expect(careful.exchanges[0]!.answer).toContain('shared catalogue');
    expect(careful.exchanges[1]!.answer).toContain('Day 12');
  });
});
