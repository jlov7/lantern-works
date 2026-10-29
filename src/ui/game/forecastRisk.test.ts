import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { fits, fitsWithRedo, forecast, type Forecast } from '../../engine/selectors';
import { applyCommand, createRun, redoBpToday, replay, simulateDay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { CLOSING_PROMISE } from '../../engine/fixtures/closingPromise';
import { forecastRisk } from './forecastRisk';
import { commandSchema } from '../schema';
import type { Command, OfferSpec } from '../../engine/types';

const config = { scenarioId: 'main-street', seed: 'batch-check-m-0' };
const state = replay(config, runPolicy(config, GHOSTS.hand, {}, LEGACY_RULES_VERSION).commands.slice(0, 37), LEGACY_RULES_VERSION).state;
const empty: Forecast = { atRisk: [], newAtRisk: [], newAfterSeason: [], existingAfterSeason: [] };
const risk = (after: Forecast, baseline = empty) => forecastRisk(state, after, baseline, 1, false, false);

describe('forecast risk wording', () => {
  it('describes a tight multi-launch fit without inventing a whole-order probability', () => {
    const config = { scenarioId: 'main-street', seed: 'panel-1' };
    const offer: OfferSpec = { name: 'Two simple launches', launches: 2, spacingDays: 2, turnaroundDays: 1, scope: 'simple', style: 'custom', price: 100 };
    const menu: Command = { type: 'setMenu', offers: [offer] };
    expect(commandSchema.safeParse(menu).success).toBe(true);
    const posted = applyCommand(createRun(config, LEGACY_RULES_VERSION), menu);
    expect(posted.error).toBeUndefined();
    const state = posted.state;
    const buyer = state.requests.find((r) => r.id === 'd0-r0')!;
    const baseline = forecast(state);
    const after = forecast(state, buyer.id);
    const bp = redoBpToday(state, 'human', 'simple');
    expect(buyer.castId).toBe('mara');
    expect(buyer.need).toBe('simple');
    expect(bp).toBe(800);
    expect(fits(after)).toBe(true);
    expect(fitsWithRedo(state, buyer.id)).toBe(false);
    const accepted = applyCommand(state, { type: 'accept', requestId: buyer.id });
    expect(accepted.error).toBeUndefined();
    const before = structuredClone(accepted.state);
    const jobIds = accepted.state.contracts.at(-1)!.jobIds;
    const outcomes = Array.from({ length: 4 }, (_, mask) => {
      const branch = structuredClone(accepted.state);
      const redo = jobIds.filter((_id, index) => (mask & (1 << index)) !== 0);
      for (let day = 0; day < 12 && branch.jobs.some((job) => jobIds.includes(job.id) && (job.status === 'active' || job.status === 'scheduled')); day++) {
        simulateDay(branch, { forecast: true, redo });
      }
      const jobs = branch.jobs.filter((job) => jobIds.includes(job.id));
      const p = bp / 10_000;
      return {
        whole: jobs.every((job) => job.status === 'delivered'),
        weight: p ** redo.length * (1 - p) ** (jobIds.length - redo.length),
        jobs: jobs.map((job) => ({ status: job.status, need: job.need, method: job.method })),
      };
    });
    expect(jobIds).toHaveLength(2);
    expect(outcomes).toEqual([
      { whole: true, weight: 0.8464, jobs: [{ status: 'delivered', need: 'simple', method: 'human' }, { status: 'delivered', need: 'simple', method: 'human' }] },
      { whole: false, weight: 0.0736, jobs: [{ status: 'missed', need: 'simple', method: 'human' }, { status: 'delivered', need: 'simple', method: 'human' }] },
      { whole: false, weight: 0.0736, jobs: [{ status: 'delivered', need: 'simple', method: 'human' }, { status: 'missed', need: 'simple', method: 'human' }] },
      { whole: false, weight: 0.0064, jobs: [{ status: 'missed', need: 'simple', method: 'human' }, { status: 'missed', need: 'simple', method: 'human' }] },
    ]);
    expect(accepted.state).toEqual(before);
    expect(forecastRisk(state, after, baseline, offer.launches, true, false)).toEqual({
      tone: 'warn', chip: 'Fits, with redo risk.',
      detail: 'Redos could make this or other work late, or leave it unfinished at closing.',
    });
    expect(forecastRisk(state, after, baseline, offer.launches, true, true).chip).toBe('Fits, with redo risk; a miss now would cost the medal.');
  });

  it('attributes a native newly displaced existing promise to taking this order', () => {
    const baseline = forecast(state);
    const after = forecast(state, 'd3-r4');
    expect(baseline.atRisk).toEqual([]);
    expect(after.atRisk).toEqual(['c12-l1']);
    expect(risk(after, baseline)).toMatchObject({ tone: 'warn', chip: 'Makes an existing promise late.' });
    expect(risk(after, baseline).detail).toMatch(/^Taking this would make .* late\.$/);
  });

  it('keeps existing failure conditional without blaming an order that adds no misses', () => {
    const late = { ...empty, atRisk: ['c12-l1'] };
    const result = risk(late, late);
    expect(result).toMatchObject({ tone: 'warn', chip: 'Existing promises already late.' });
    expect(result.detail).toMatch(/^No additional misses if no redos or changes\. Already late without this order:/);
    expect(result.detail).not.toMatch(/Taking this would make|Fits/);
  });

  it('retains an order’s own failure as well as baseline and newly displaced failures', () => {
    const result = risk({ ...empty, newAtRisk: ['new'], atRisk: ['c11-l1', 'c12-l1'] }, { ...empty, atRisk: ['c12-l1'] });
    expect(result.chip).toBe('Late.');
    expect(result.detail).toContain('This order would be late, even without redos or changes.');
    expect(result.detail).toContain('Taking this would make');
    expect(result.detail).toContain('Already late without this order:');
  });

  it('preserves season refunds and the no-redo medal caveat', () => {
    expect(risk({ ...empty, newAfterSeason: ['new'] })).toMatchObject({ tone: 'bad', chip: 'Too late in the season.' });
    expect(forecastRisk(state, empty, empty, 1, true, true)).toMatchObject({
      tone: 'warn', chip: 'Fits, with redo risk; a miss now would cost the medal.',
      detail: 'Redos could make this or other work late, or leave it unfinished at closing.',
    });
  });

  it('names an existing closing refund separately from a missed deadline and attributes only new refunds', () => {
    const state = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands, CLOSING_PROMISE.rules).state;
    const baseline = forecast(state);
    const after = forecast(state, 'd11-r1');
    const result = forecastRisk(state, after, baseline, 1, false, false);
    expect(result).toEqual({
      tone: 'warn', chip: 'Would cause a closing refund.',
      detail: 'Taking this would leave Idris\'s launch unfinished at closing. That work would be refunded.',
    });
    const accepted = applyCommand(state, CLOSING_PROMISE.candidate).state;
    const next = forecastRisk(accepted, forecast(accepted, 'd11-r2'), forecast(accepted), 1, false, false);
    expect(next).toEqual({
      tone: 'warn', chip: 'Already faces a closing refund.',
      detail: 'No additional refunds if no redos or changes. Already unfinished at closing without this order: Idris\'s launch. That work would be refunded.',
    });
    expect(next.detail).not.toContain('Taking this');
    expect(next.detail).not.toContain('late');
  });
});
