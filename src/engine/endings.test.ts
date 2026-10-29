import { describe, expect, it } from 'vitest';
import { epilogues, seasonEnding } from './endings';
import { PRESETS } from './rules';
import { applyCommand, createRun, replay } from './sim';
import { nightResult } from './projects';
import careful from './fixtures/heartfelt-careful.json';
import festival from '../ui/game/fixtures/heartfelt-festival.json';
import type { Command, CompanyState } from './types';

function apply(s: CompanyState, command: Command): CompanyState {
  const result = applyCommand(s, command);
  if (result.error) throw new Error(result.error);
  return result.state;
}

function deliveredRushOrder(): CompanyState {
  let s = createRun({ scenarioId: 'main-street', seed: 'rush-proof-0' });
  s = apply(s, { type: 'setMenu', offers: [PRESETS.launchlet] });
  const request = s.requests.find((r) => r.castId === 'yusuf')!;
  s = apply(s, { type: 'accept', requestId: request.id });
  s = apply(s, { type: 'runDay' });
  expect(s.contracts).toHaveLength(1);
  expect(s.jobs[0]!.status).toBe('delivered');
  return s;
}

describe('neighbour epilogues', () => {
  it('keeps native Careful work while naming the later distance and its recorded timing', () => {
    const { state: s, errors } = replay(careful.config, careful.commands as Command[], careful.rules);
    expect(errors).toEqual([]);
    const ending = epilogues(s);
    const hugo = ending.find(e => e.castId === 'hugo')!.line;
    const clem = ending.find(e => e.castId === 'clem')!.line;
    expect(hugo).toContain('apprentice’s name is on the workshop sign');
    expect(hugo).toContain('Hugo no longer commissions work here after a missed promise on Day 7');
    expect(clem).toContain('The new band has the anniversary wall');
    expect(clem).toContain('Clem’s Day 8 visit ended without an order');
    expect(clem).not.toContain('missed promise');
    expect(nightResult(s).contributors.map(c => c.contract.castId)).toEqual(['hugo', 'clem']);
    expect(nightResult(s).contributors.every(c => c.earned)).toBe(true);
    const old = epilogues({ ...s, rulesVersion: 'lantern-5.0.0' });
    expect(old.find(e => e.castId === 'hugo')!.line).not.toContain('no longer');
    expect(old.find(e => e.castId === 'clem')!.line).not.toContain('without an order');
  });

  it('keeps refused changes distinct from missed work and respects a recovered relationship', () => {
    const s = deliveredRushOrder();
    s.lostCast.push('yusuf');
    s.relationshipMemory!.push({ castId: 'yusuf', kind: 'change-refused', day: 2, minute: 1000 });
    expect(epilogues(s)[0]!.line).toContain('refused change on Day 3');
    expect(epilogues(s)[0]!.line).not.toContain('missed promise');
    s.lostCast = [];
    expect(epilogues(s)[0]!.line).not.toContain('no longer');
  });

  it('acknowledges actual ordinary work after the native early Festival gathering', () => {
    const s = replay(festival.config, festival.commands as Command[], festival.rules).state;
    expect(seasonEnding(s).line).toContain('After the gathering,');
    expect(seasonEnding({ ...s, rulesVersion: 'lantern-5.0.0' }).line).not.toContain('After the gathering,');
  });

  it('does not invent a second visit after one delivered rush order', () => {
    expect(epilogues(deliveredRushOrder())[0]!.line).toBe('Yusuf asked late, and Yusuf Fruit Barrow still made it.');
  });

  it('retains the repeated-visit wording for two delivered rush orders', () => {
    const s = deliveredRushOrder();
    const first = s.contracts[0]!;
    s.jobs.push({ ...s.jobs[0]!, id: 'c2-l1', contractId: 'c2' });
    s.contracts.push({ ...first, id: 'c2', seq: 2, requestId: 'repeat-yusuf', jobIds: ['c2-l1'] });
    expect(epilogues(s)[0]!.line).toBe('Yusuf asked late, twice, and Yusuf Fruit Barrow still made it.');
  });

  it('reports all five completed orders instead of capping a regular at four', () => {
    const s = deliveredRushOrder();
    const first = s.contracts[0]!;
    for (let n = 2; n <= 5; n++) {
      s.jobs.push({ ...s.jobs[0]!, id: `c${n}-l1`, contractId: `c${n}` });
      s.contracts.push({ ...first, id: `c${n}`, seq: n, requestId: `repeat-${n}`, jobIds: [`c${n}-l1`] });
    }
    expect(epilogues(s)[0]!.line).toBe('Yusuf came to you 5 times. Yusuf Fruit Barrow now sends new customers your way.');
  });
});
