// Properties over random play that uses every v3 command: money identities, replay and forecast purity.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PRESETS, RULES, SCENARIOS } from './rules';
import { forecast, summarize, windowRequests } from './selectors';
import { counterOffer } from './demand';
import { applyCommand, createRun, newsOptions, reactionFor, replay, SEGMENT_IDS } from './sim';
import type { Command, CompanyState } from './types';

type Move =
  | { k: 'answer'; take: boolean; pick: number }
  | { k: 'news'; option: number }
  | { k: 'menu'; which: number }
  | { k: 'staff'; tier: 'none' | 'solo' | 'duo'; routing: 'human' | 'simple' | 'all' }
  | { k: 'lever'; which: 'hire' | 'letGo' | 'temp' | 'overtime' | 'library' | 'checklist' | 'styleGuide' | 'flyers'; seg: number }
  | { k: 'run' };

const move: fc.Arbitrary<Move> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ k: fc.constant('answer' as const), take: fc.boolean(), pick: fc.nat(20) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('news' as const), option: fc.nat(3) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('menu' as const), which: fc.nat(4) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('staff' as const), tier: fc.constantFrom('none' as const, 'solo' as const, 'duo' as const), routing: fc.constantFrom('human' as const, 'simple' as const, 'all' as const) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('lever' as const), which: fc.constantFrom('hire' as const, 'letGo' as const, 'temp' as const, 'overtime' as const, 'library' as const, 'checklist' as const, 'styleGuide' as const, 'flyers' as const), seg: fc.nat(3) }) },
  { weight: 3, arbitrary: fc.constant({ k: 'run' as const }) },
);

const MENUS = [[PRESETS.bespoke], [PRESETS.bespoke, PRESETS.launchlet], [PRESETS.club], [PRESETS.club, PRESETS.launchlet], [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 600 }]];

function toCommand(s: CompanyState, m: Move): Command | null {
  switch (m.k) {
    case 'answer': {
      const waiting = windowRequests(s).filter((r) => r.status === 'waiting');
      if (!waiting.length) return null;
      const r = waiting[m.pick % waiting.length]!;
      if (!m.take) return { type: 'decline', requestId: r.id };
      // Take their counter-offer when they named one, so random play covers discounted sales too.
      return counterOffer(reactionFor(s, r), s.menu) ? { type: 'accept', requestId: r.id, counter: true } : { type: 'accept', requestId: r.id };
    }
    case 'news': {
      const n = s.news.find((x) => x.day === s.day && x.choice === null);
      return n ? { type: 'choose', newsId: n.id, option: m.option % newsOptions(s, n).length } : null;
    }
    case 'menu':
      return { type: 'setMenu', offers: MENUS[m.which % MENUS.length]! };
    case 'staff':
      return { type: 'setStaff', staffing: { aiTier: m.tier, routing: m.tier === 'none' ? 'human' : m.routing } };
    case 'lever': {
      if (m.which === 'letGo') {
        const j = s.resources.find((r) => r.role === 'junior');
        return j ? { type: 'letGo', resourceId: j.id } : null;
      }
      if (m.which === 'flyers') return { type: 'flyers', segment: SEGMENT_IDS[m.seg % 4]! };
      if (m.which === 'library' || m.which === 'checklist' || m.which === 'styleGuide') return { type: 'buy', item: m.which };
      return { type: m.which };
    }
    case 'run':
      return { type: 'runDay' };
  }
}

function play(scenarioId: string, seed: string, moves: Move[]): { state: CompanyState; commands: Command[]; forecastPure: boolean } {
  let s = createRun({ scenarioId, seed });
  const commands: Command[] = [];
  let forecastPure = true;
  for (const m of [...moves, ...Array.from({ length: RULES.days }, () => ({ k: 'run' as const }))]) {
    if (s.finished) break;
    const cmd = toCommand(s, m);
    if (!cmd) continue;
    if (cmd.type === 'accept') {
      const before = JSON.stringify(s);
      forecast(s, cmd.requestId);
      forecastPure &&= JSON.stringify(s) === before;
    }
    const r = applyCommand(s, cmd);
    if (r.error) {
      expect(r.state).toBe(s);
      continue;
    }
    s = r.state;
    commands.push(cmd);
  }
  return { state: s, commands, forecastPure };
}

describe('properties of v3 play', () => {
  it('money identities hold, replay is exact, and the forecast never mutates, across random play with every lever', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SCENARIOS.map((x) => x.id)), fc.string({ minLength: 1, maxLength: 5 }), fc.array(move, { minLength: 10, maxLength: 120 }), (sc, seed, moves) => {
        const { state: s, commands, forecastPure } = play(sc, seed, moves);
        expect(forecastPure).toBe(true);
        const sum = (k: string) => s.journal.filter((e) => e.kind === k).reduce((a, e) => a + e.cash, 0);
        expect(s.cash).toBe(RULES.initialCash + s.journal.reduce((a, e) => a + e.cash, 0));
        expect(s.unearned).toBe(sum('receipt') + sum('refund') - s.revenue);
        const open = s.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled').reduce((a, j) => a + j.allocation, 0);
        expect(s.unearned).toBe(open);
        expect(s.journal.filter((e) => e.kind === 'loan').reduce((a, e) => a + e.revenue, 0)).toBe(0);
        for (const v of Object.values(s.rep)) {
          expect(v).toBeGreaterThanOrEqual(RULES.rep.min);
          expect(v).toBeLessThanOrEqual(RULES.rep.max);
        }
        const visits = new Map<string, number>();
        for (const r of s.requests) if (r.source !== 'news' && r.source !== 'amends') visits.set(r.castId, (visits.get(r.castId) ?? 0) + 1);
        for (const n of visits.values()) expect(n).toBeLessThanOrEqual(RULES.maxVisits);
        const sm = summarize(s);
        expect(sm.served).toBeLessThanOrEqual(sm.sold);
        const again = replay(s.config, commands);
        expect(again.errors).toEqual([]);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(s));
      }),
      { numRuns: 60, seed: 20261012 },
    );
  }, 180_000);

  it('a human never works outside their shift and never holds two tasks; juniors never make or build the kit', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SCENARIOS.map((x) => x.id)), fc.string({ minLength: 1, maxLength: 5 }), fc.array(move, { minLength: 10, maxLength: 120 }), (sc, seed, moves) => {
        const { state: s } = play(sc, seed, moves);
        const day = RULES.minutesPerDay;
        for (const e of s.events) {
          if (e.type !== 'task_start' || !e.resourceId) continue;
          const offset = e.minute - e.day * day;
          if (e.resourceId.startsWith('ai')) continue;
          const late = s.overtimeDays.includes(e.day);
          expect(offset).toBeLessThan(late ? RULES.aiShift : RULES.humanShift);
          const r = s.resources.find((x) => x.id === e.resourceId);
          if (r?.role === 'junior' || e.resourceId.startsWith('j') || e.resourceId.startsWith('st')) expect(['produce', 'kit']).not.toContain(e.stage);
        }
        const busy = new Map<string, number>();
        for (const r of s.resources) if (r.busyWith) busy.set(r.busyWith, (busy.get(r.busyWith) ?? 0) + 1);
        for (const n of busy.values()) expect(n).toBe(1);
      }),
      { numRuns: 40, seed: 7 },
    );
  }, 180_000);
});
