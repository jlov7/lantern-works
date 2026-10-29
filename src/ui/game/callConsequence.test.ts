import { describe, expect, it } from 'vitest';
import type { CallChoice } from '../../engine/sim';
import { callConsequence } from './callConsequence';

const choice: CallChoice = { option: 'cut', blocked: null, cost: 0, deliveredAt: null, alsoMissed: [], keepsPromise: false, futureRisks: [] };
const outcome = (c: CallChoice) => callConsequence(c, 'Rory', 0, () => 'Oscar');

describe('call consequences', () => {
  it('does not promise on time when cutting the change still misses', () => {
    const result = outcome(choice);
    expect(result).toMatchObject({ saved: false, unavailable: false });
    expect(result.text).toBe("Still late, even without the change, but Rory won't buy from you again, and their kind notice.");
  });

  it('shows the ready time when cutting the change saves the launch', () => {
    const result = outcome({ ...choice, deliveredAt: 450, alsoMissed: ['other'] });
    expect(result.saved).toBe(true);
    expect(result.text).toBe("On time, ready by 4:30pm, but Rory won't buy from you again, and their kind notice. But Oscar would then miss tonight.");
  });

  it('marks a blocked ring unavailable without saved styling', () => {
    expect(outcome({ ...choice, option: 'ring', blocked: 'Tomorrow is past the season.' })).toEqual({ text: 'Tomorrow is past the season.', saved: false, unavailable: true });
  });

  it('counts multiple at-risk launches for one neighbour without repeating their name', () => {
    const result = callConsequence({ ...choice, deliveredAt: 450, alsoMissed: ['ravi-1', 'mina-1', 'ravi-2'] }, 'Nell', 0, id => id.startsWith('ravi') ? 'Ravi' : 'Mina');
    expect(result.text).toContain('But Ravi (2 launches) and Mina would then miss tonight.');
  });

  it('marks a ring saved only when it can keep the moved deadline', () => {
    expect(outcome({ ...choice, option: 'ring', keepsPromise: true, cost: 50 })).toEqual({ text: 'Due tomorrow instead. 50 cr back to them, and their kind think a little less of you.', saved: true, unavailable: false });
    expect(outcome({ ...choice, option: 'ring', cost: 50 })).toMatchObject({ saved: false, text: expect.stringContaining('Still forecast to miss that deadline.') });
  });

  it('names future deadlines while keeping shared risks and commissions distinct', () => {
    const result = callConsequence({ ...choice, option: 'ring', keepsPromise: true, futureRisks: [
      { jobId: 'agnes', dueAt: 3840, afterSeason: false, shared: false },
      { jobId: 'agnes-project', dueAt: 6240, afterSeason: true, shared: true },
    ] }, 'Malik', 2400, id => id === 'agnes' ? 'Agnes' : 'Agnes: lantern portraits');
    expect(result.text).toContain('Also at risk with this answer: Agnes (due Day 8).');
    expect(result.text).toContain('At risk across every available answer: Agnes: lantern portraits (due Day 13, season ends first).');
  });
});
