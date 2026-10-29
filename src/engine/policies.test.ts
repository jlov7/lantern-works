import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from './policies';
import { fits, forecast, reactionTo, windowRequests } from './selectors';
import { makerBusyWith, replay } from './sim';
import { LEGACY_RULES_VERSION } from './versions';
import type { Command } from './types';

const config = { scenarioId: 'main-street', seed: 'maker-policy' };

describe('ghost maker choices', () => {
  for (const maker of ['h1', 'h2'] as const) {
    it(`assigns tricky hand-made work to ${maker} and issues only legal commands`, () => {
      const s = runPolicy(config, { ...GHOSTS.hand, maker });
      const chosen = s.jobs.filter((j) => j.maker !== undefined);
      expect(chosen.length).toBeGreaterThan(0);
      expect(chosen.every((j) => j.maker === maker && j.need === 'nuanced')).toBe(true);
      expect(s.finished).toBe(true);
      expect(replay(config, s.commands).errors).toEqual([]);
    });
  }

  it('uses both makers as Ada becomes contested and free again', () => {
    const s = runPolicy(config, { ...GHOSTS.hand, maker: 'contested' });
    expect(new Set(s.jobs.flatMap((j) => j.maker ? [j.maker] : []))).toEqual(new Set(['h1', 'h2']));
    expect(replay(config, s.commands).errors).toEqual([]);
  });

  it('does not reserve Ada for a booking the policy declines', () => {
    let checked = false;
    const s = runPolicy({ ...config, seed: 'dilemma-6' }, { ...GHOSTS.hand, maker: 'contested' }, {
      onBuyer: (before, id) => {
        if (before.day !== 1 || id !== 'd1-r5') return;
        const tricky = windowRequests(before).filter((r) => r.status === 'waiting' && r.need === 'nuanced' && reactionTo(before, r).kind === 'buy');
        expect(tricky.map((r) => [r.id, r.source])).toEqual([['d1-r5', 'walkin'], ['d1-r7', 'booking']]);
        expect(makerBusyWith(before, 'h1')).toBeUndefined();
        expect(fits(forecast(before, id, { maker: 'h1' }))).toBe(true);
        checked = true;
      },
    }, LEGACY_RULES_VERSION);
    expect(checked).toBe(true);
    expect(s.commands).toContainEqual({ type: 'accept', requestId: 'd1-r5', maker: 'h1' });
    expect(s.commands).toContainEqual({ type: 'decline', requestId: 'd1-r7' });
    expect(replay({ ...config, seed: 'dilemma-6' }, s.commands, LEGACY_RULES_VERSION).errors).toEqual([]);
  });

  it('leaves AI-routed work unchanged when no hand-made maker choice is offered', () => {
    const usual = runPolicy(config, GHOSTS.faster);
    const chosen = runPolicy(config, { ...GHOSTS.faster, maker: 'h1' });
    expect(chosen.commands).toEqual(usual.commands);
    expect(chosen.jobs.every((j) => j.maker === undefined)).toBe(true);
  });

  it('takes counter-offers without a maker choice, as the player does', () => {
    const s = runPolicy(config, { ...GHOSTS.hand, maker: 'contested', counters: true });
    const counters = s.commands.filter((c): c is Extract<Command, { type: 'accept' }> => c.type === 'accept' && c.counter === true);
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.some((c) => s.requests.find((r) => r.id === c.requestId)?.need === 'nuanced')).toBe(true);
    expect(counters.every((c) => c.maker === undefined)).toBe(true);
    expect(replay(config, s.commands).errors).toEqual([]);
  });
});
