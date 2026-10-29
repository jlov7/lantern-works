import { describe, expect, it } from 'vitest';
import { CLOSING_PROMISE } from './fixtures/closingPromise';
import { RULES } from './rules';
import { fits, forecast, tonight } from './selectors';
import { applyCommand, replay, simulateDay } from './sim';
import type { CompanyState } from './types';

function closing(state: CompanyState): CompanyState {
  const result = structuredClone(state);
  for (const job of result.jobs) if (job.stage !== 'rework') job.reworkFlag = false;
  simulateDay(result, { forecast: true });
  return result;
}

describe('existing promises at season close', () => {
  it('rejects a Fits claim when admission displaces an existing delivery into a closing refund', () => {
    const { state, errors } = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands, CLOSING_PROMISE.rules);
    expect(errors).toEqual([]);
    const before = structuredClone(state);
    const accepted = applyCommand(state, CLOSING_PROMISE.candidate);
    expect(accepted.error).toBeUndefined();
    const idris = (s: CompanyState) => s.jobs.find((j) => j.id === 'c48-l1')!;
    expect(idris(closing(state)).status).toBe('delivered');
    expect(idris(closing(accepted.state))).toMatchObject({ status: 'refunded', remaining: 5, allocation: 900 });
    expect(tonight(state).earned).toBe(2055);
    expect(tonight(accepted.state).earned).toBe(1495);
    expect(CLOSING_PROMISE.candidate.type).toBe('accept');
    const candidate = CLOSING_PROMISE.candidate;
    if (candidate.type !== 'accept') throw new Error('Fixture must end before an acceptance.');
    const prediction = forecast(state, candidate.requestId);
    expect(prediction.atRisk).toEqual([]);
    expect(prediction.newAtRisk).toEqual([]);
    expect(prediction.newAfterSeason).toEqual([]);
    expect(prediction.existingAfterSeason).toEqual(['c48-l1']);
    expect(forecast(state).existingAfterSeason).toEqual([]);
    expect(fits(prediction)).toBe(false);
    expect(state).toEqual(before);
  });

  it('retains already-doomed live work but does not count an already-issued refund as a live risk', () => {
    const state = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands, CLOSING_PROMISE.rules).state;
    const accepted = applyCommand(state, CLOSING_PROMISE.candidate).state;
    const baseline = forecast(accepted);
    const after = forecast(accepted, 'd11-r2');
    expect(baseline.existingAfterSeason).toEqual(['c48-l1']);
    expect(after.existingAfterSeason).toEqual(baseline.existingAfterSeason);
    expect(after.atRisk).toEqual([]);
    expect(after.newAtRisk).toEqual([]);
    expect(after.newAfterSeason).toEqual([]);
    expect(fits(after)).toBe(false);
    expect(forecast(closing(accepted)).existingAfterSeason).toEqual([]);
  });

  it('ignores unrevealed rework draws while retaining already-known rework at closing', () => {
    const state = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands, CLOSING_PROMISE.rules).state;
    const hidden = structuredClone(state);
    for (const job of hidden.jobs) if (job.stage !== 'rework') job.reworkFlag = !job.reworkFlag;
    expect(forecast(hidden, 'd11-r1')).toEqual(forecast(state, 'd11-r1'));
    const known = structuredClone(state);
    const job = known.jobs.find((j) => j.id === 'c48-l1')!;
    job.stage = 'rework';
    job.remaining = RULES.minutesPerDay + 1;
    job.reworkFlag = true;
    expect(forecast(state).existingAfterSeason).toEqual([]);
    expect(forecast(known).existingAfterSeason).toContain(job.id);
    expect(forecast(known).atRisk).not.toContain(job.id);
  });

  it('does not call a deliberate Bright Lantern handover a closing-capacity refund', () => {
    const news = CLOSING_PROMISE.commands.findIndex((c) => c.type === 'choose' && c.newsId === 'n11');
    expect(news).toBeGreaterThan(0);
    const before = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands.slice(0, news), CLOSING_PROMISE.rules);
    expect(before.errors).toEqual([]);
    const handover = applyCommand(before.state, { type: 'choose', newsId: 'n11', option: 1 });
    expect(handover.error).toBeUndefined();
    const after = closing(handover.state);
    expect(after.jobs.filter((j) => j.status === 'refunded').map((j) => j.id)).toEqual(['c40-l1', 'c44-l1']);
    expect(after.events.slice(handover.state.events.length).filter((e) => e.type === 'refunded_horizon')).toEqual([]);
    expect(after.journal.filter((j) => j.ref === 'c40-l1' && j.kind === 'refund').at(-1)).toMatchObject({ minute: 5280, note: 'Handed to Bright Lantern with the customer list' });
    expect(forecast(handover.state).existingAfterSeason).toEqual([]);
    expect(fits(forecast(handover.state))).toBe(true);
  });
});
