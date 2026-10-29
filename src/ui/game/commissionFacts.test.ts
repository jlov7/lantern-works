import { describe, expect, it } from 'vitest';
import { RULES } from '../../engine/rules';
import { applyCommand, redoBpFor, replay, simulateDay } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { commissionQuote, studioSlot } from './commissionFacts';

const config = { scenarioId: 'main-street', seed: 'first-season' };
const opening: Command[] = [{ type: 'accept', requestId: 'd0-r0', maker: 'h1' }, { type: 'runDay' }, { type: 'runDay' }];
const returnMorning: Command[] = [...opening, { type: 'choose', newsId: 'n2', option: 0 }, ...['d2-r0', 'd2-r1', 'd2-r4', 'd2-r5'].map(requestId => ({ type: 'accept' as const, requestId })), { type: 'runDay' }];

describe('native commission and studio-slot presentation quotes', () => {
  it('quotes a legal commission without taking it, including the actual materials charge', () => {
    const before = replay(config, opening);
    expect(before.errors).toEqual([]);
    const original = structuredClone(before.state);
    const facts = commissionQuote(before.state, 'clem-ten', 'new-band', 'h1');
    expect(facts.blocked).toBeNull();
    expect(facts.quote?.offer.price).toBe(1200);
    expect(facts.quote?.project.materials).toBe(150);
    expect(facts.quote?.jobs).toEqual([{ releaseDay: 2, dueAt: 5 * RULES.minutesPerDay }]);
    const accepted = applyCommand(before.state, facts.command!);
    expect(accepted.error).toBeUndefined();
    expect(accepted.state.cash - before.state.cash).toBe(1050);
    expect(accepted.state.unearned - before.state.unearned).toBe(1200);
    expect(before.state).toEqual(original);
  });
  it('retains a native later release without promising a named maker', () => {
    const before = replay(config, returnMorning);
    expect(before.errors).toEqual([]);
    const original = structuredClone(before.state);
    const slot = studioSlot(before.state, 'd3-r6', 1);
    expect(slot.blocked).toBeNull();
    expect(slot.command).toEqual({ type: 'reserve', requestId: 'd3-r6', startsInDays: 1 });
    expect(slot.quote?.reserved).toBe(true);
    expect(slot.quote?.offer.startsInDays).toBe(1);
    expect(slot.jobs?.every(job => job.releaseDay === 4 && job.maker === undefined)).toBe(true);
    expect(before.state).toEqual(original);
  });
  it('keeps legacy seasons outside the new booking rules', () => {
    const state = replay(config, opening, LEGACY_RULES_VERSION).state;
    expect(commissionQuote(state, 'clem-ten', 'new-band').blocked).toContain('original commission rules');
    expect(studioSlot(state, 'd2-r0', 1).blocked).toContain('original booking rules');
  });

  it('quotes each route from native people’s clock time and actual projected production assignments', () => {
    const state = replay(config, opening).state;
    expect(state.jobs.every(job => job.status === 'delivered')).toBe(true);
    const totals: number[] = [];
    const chances: number[] = [];
    for (const maker of [undefined, 'h1', 'h2']) {
      const facts = commissionQuote(state, 'clem-ten', 'new-band', maker);
      const taken = applyCommand(state, facts.command!);
      expect(taken.error).toBeUndefined();
      const t = taken.state;
      const contract = t.contracts.at(-1)!;
      let minutes = 0;
      const busy = () => t.resources.filter(resource => resource.kind === 'human').reduce((sum, resource) => sum + resource.busyMinutes, 0);
      for (let day = t.day; day < RULES.days && !t.finished; day++) {
        const before = busy();
        simulateDay(t, { forecast: true });
        minutes += busy() - before;
        if (t.jobs.filter(job => contract.jobIds.includes(job.id)).every(job => job.status === 'delivered')) break;
      }
      expect(facts.work!.total).toBe(minutes);
      const production = t.events.slice(state.events.length).filter(event => event.type === 'task_done' && event.stage === 'produce' && contract.jobIds.includes(event.jobId!));
      expect(facts.production).toEqual(production.map(event => {
        const producer = t.resources.find(resource => resource.id === event.resourceId)!;
        const job = t.jobs.find(job => job.id === event.jobId)!;
        return { jobId: job.id, resourceId: producer.id, day: event.day, launch: job.launchIndex + 1, name: producer.name, firstTime: 100 - Math.round(redoBpFor(state, producer.kind, job.need, producer, event.day) / 100) };
      }));
      totals.push(minutes);
      chances.push(facts.production![0]!.firstTime);
    }
    expect(totals[1]).toBeGreaterThan(totals[2]!);
    expect(chances[1]).toBeGreaterThan(chances[2]!);
  });
});
