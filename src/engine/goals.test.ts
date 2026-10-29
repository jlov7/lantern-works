import { describe, expect, it } from 'vitest';
import { GOALS } from './goals';
import { GHOSTS, runPolicy, type Policy } from './policies';
import { PRESETS, SCENARIOS } from './rules';
import { reactionTo, windowRequests } from './selectors';
import { applyCommand, createRun } from './sim';

const managers: Policy[] = [
  GHOSTS.old,
  GHOSTS.faster,
  GHOSTS.bright,
  { id: 'club', label: 'club', menu: [PRESETS.club, PRESETS.bespoke], staffing: { aiTier: 'none', routing: 'human' }, accept: 'forecast', news: 'sensible', overtime: true, plan: [{ day: 2, hire: true }] },
  { id: 'active', label: 'active', menu: [{ ...PRESETS.bespoke, price: 800 }, { ...PRESETS.launchlet, price: 290 }], staffing: { aiTier: 'solo', routing: 'all' }, accept: 'cheapest', news: 'sensible', overtime: true, plan: [{ day: 1, buy: ['styleGuide'] }, { day: 3, hire: true }] },
  { id: 'careful', label: 'careful', menu: [{ ...PRESETS.bespoke, price: 800 }], staffing: { aiTier: 'none', routing: 'human' }, accept: 'forecast', news: 'sensible', overtime: true, plan: [{ day: 1, hire: true, buy: ['checklist'] }] },
];

describe('side goals', () => {
  it('every goal is met by some manager and missed by another, on some seed', () => {
    for (const sc of SCENARIOS) {
      const runs = managers.flatMap((p) => ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((seed) => runPolicy({ scenarioId: sc.id, seed }, p)));
      for (const g of GOALS[sc.id]!) {
        const met = runs.filter((s) => g.met(s)).length;
        expect(met, `${sc.id}/${g.id} met by nobody`).toBeGreaterThan(0);
        expect(met, `${sc.id}/${g.id} met by everybody`).toBeLessThan(runs.length);
      }
    }
  }, 120_000);
});

describe('side-goal progress during a season', () => {
  it('starts every Main Street goal at zero and reports misses as soon as they happen', () => {
    const s = createRun({ scenarioId: 'main-street', seed: 'goals-progress' });
    expect(GOALS['main-street']!.map((g) => g.progress(s))).toEqual(['0 of 6 delivered', 'none so far']);
    const bespoke = GOALS['bespoke-rush']!.find((g) => g.id === 'no-ai-25')!;
    const withDesk = applyCommand(applyCommand(createRun({ scenarioId: 'bespoke-rush', seed: 'goals-progress' }), { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'simple' } }).state, { type: 'runDay' }).state;
    expect(bespoke.progress(withDesk)).toBe('missed: an AI desk was used');
  });

  it('counts a careful order as in the works until it is delivered', () => {
    const careful = GOALS['main-street']!.find((g) => g.id === 'careful-6')!;
    let s = createRun({ scenarioId: 'main-street', seed: 'goals-progress' });
    for (let d = 0; d < 6 && !careful.progress(s).includes('in the works'); d++) {
      for (const r of windowRequests(s)) if (r.segment === 'careful' && reactionTo(s, r).kind === 'buy') s = applyCommand(s, { type: 'accept', requestId: r.id }).state;
      if (!careful.progress(s).includes('in the works')) s = applyCommand(s, { type: 'runDay' }).state;
    }
    expect(careful.progress(s)).toMatch(/^0 of 6 delivered, [1-9] in the works$/);
  });
});
