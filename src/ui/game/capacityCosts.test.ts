import { describe, expect, it } from 'vitest';
import { RULES } from '../../engine/rules';
import { applyCommand, createRun, simulateDay } from '../../engine/sim';
import type { CompanyState } from '../../engine/types';
import { aiDailyCost, capacityCost } from './capacityCosts';

const fresh = () => createRun({ scenarioId: 'main-street', seed: 'capacity-quotes' });
function charges(state: CompanyState, kind: 'ai' | 'wages'): number {
  const after = structuredClone(state);
  simulateDay(after, { forecast: true });
  return after.journal.slice(state.journal.length).filter((e) => e.kind === kind).reduce((sum, e) => sum - e.cash, 0);
}

describe('known capacity prices', () => {
  it('quotes each total AI tier and solo-to-duo increment against native billing, with only active supplier changes', () => {
    const state = fresh();
    state.modifiers.push({ kind: 'aiCost', delta: 80, fromDay: state.day }, { kind: 'aiCost', delta: 500, fromDay: state.day + 1 });
    const original = structuredClone(state);
    for (const tier of ['none', 'solo', 'duo'] as const) {
      const next = applyCommand(state, { type: 'setStaff', staffing: { aiTier: tier, routing: tier === 'none' ? 'human' : 'simple' } }).state;
      expect(aiDailyCost(state, tier)).toBe(charges(next, 'ai'));
    }
    expect(aiDailyCost(state, 'solo')).toBe(300);
    expect(aiDailyCost(state, 'duo') - aiDailyCost(state, 'solo')).toBe(260);
    expect(state).toEqual(original);
  });

  it('includes a temp\'s overtime at opening, separately from the upfront fee', () => {
    let state = applyCommand(fresh(), { type: 'hire' }).state;
    simulateDay(state, { forecast: true });
    state = applyCommand(state, { type: 'overtime' }).state;
    const original = structuredClone(state);
    const next = applyCommand(state, { type: 'temp' }).state;
    const quote = capacityCost(state, 'temp');
    expect(charges(state, 'wages') - state.resources.reduce((n, r) => n + r.dailyCost, 0)).toBe(360);
    expect(quote).toEqual({ now: 350, opening: 120, total: 470 });
    expect(quote.now).toBe(state.cash - next.cash);
    expect(quote.opening).toBe(charges(next, 'wages') - charges(state, 'wages'));
    expect(state).toEqual(original);
  });

  it('keeps normal prices and native overtime charges unchanged', () => {
    const state = fresh();
    expect(aiDailyCost(state, 'solo')).toBe(RULES.ai.solo.dailyCost);
    expect(aiDailyCost(state, 'duo')).toBe(RULES.ai.duo.dailyCost);
    expect(capacityCost(state, 'temp')).toEqual({ now: 350, opening: 0, total: 350 });
    const next = applyCommand(state, { type: 'overtime' }).state;
    expect(capacityCost(state, 'overtime')).toEqual({ now: 0, opening: charges(next, 'wages') - charges(state, 'wages'), total: 240 });
  });
});
