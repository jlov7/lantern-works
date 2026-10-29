import festival from '../../test-fixtures/replays/festival-season1.json';
import { describe, expect, it } from 'vitest';
import heldCall from './fixtures/call-future-promises-5.0.0.json';
import { GHOSTS, runPolicy } from './policies';
import { PRESETS, RULES } from './rules';
import { reactionTo, takeableInTurn, windowRequests } from './selectors';
import { applyCommand, arrivalsFor, callChoices, createRun, getScenario, isRegular, nextEligibleVisit, replay } from './sim';
import type { Command, CompanyState } from './types';
import { CURRENT_RULES_VERSION, STUDIO_RULES_VERSION } from './versions';

/** Main Street, panel-1, Bespoke only, taking whoever fits: the first call comes on Day 7. */
function untilCall(): { s: CompanyState; commands: Command[] } {
  let s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'panel-1' }), { type: 'setMenu', offers: [PRESETS.bespoke] }).state;
  while (!s.finished) {
    for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
    for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
    s = applyCommand(s, { type: 'runDay', calls: true }).state;
    if (s.call) return { s, commands: s.commands };
  }
  throw new Error('no call this season');
}

describe('a call in the middle of the day', () => {
  it('shows the later promise endangered by ringing in the actual held Careful Season call', () => {
    const { state: s, errors } = replay(heldCall.config, heldCall.commands as Command[], heldCall.rules);
    expect(errors).toEqual([]);
    expect(s.call).toMatchObject({ jobId: 'c9-l1', minute: 2608, minutes: 150 });
    const original = structuredClone(s);
    const choices = callChoices(s);
    expect(choices.map(c => ({ option: c.option, cost: c.cost, deliveredAt: c.deliveredAt, alsoMissed: c.alsoMissed }))).toEqual([
      { option: 'late', cost: 480, deliveredAt: null, alsoMissed: [] },
      { option: 'cut', cost: 0, deliveredAt: 2719, alsoMissed: [] },
      { option: 'ring', cost: 225, deliveredAt: null, alsoMissed: [] },
      { option: 'ride', cost: 0, deliveredAt: null, alsoMissed: [] },
    ]);
    expect(choices.find(c => c.option === 'ring')).toMatchObject({ keepsPromise: true, futureRisks: [{ jobId: 'c15-l1', dueAt: 3840, afterSeason: false, shared: false }] });
    expect(choices.filter(c => c.option !== 'ring').every(c => c.futureRisks.length === 0)).toBe(true);
    expect(s).toEqual(original);
    // Tomorrow's native news is not yet known at this call. Previewing cannot draw it.
    expect(s.news.some(n => n.day > s.day)).toBe(false);
  });

  it('distinguishes risks shared by all answers and checks whether Ring can keep tomorrow', () => {
    const { state: s } = replay(heldCall.config, heldCall.commands as Command[], heldCall.rules);
    // A tighter existing deadline makes Agnes endangered across every answer.
    s.jobs.find(j => j.id === 'c16-l1')!.dueAt = 3360;
    for (const c of callChoices(s)) expect(c.futureRisks).toContainEqual({ jobId: 'c15-l1', dueAt: 3840, afterSeason: false, shared: true });
    s.jobs.find(j => j.id === s.call!.jobId)!.remaining = 10_000;
    expect(callChoices(s).find(c => c.option === 'ring')!.keepsPromise).toBe(false);
  });

  it('includes reserved promises beyond the season without running beyond its end', () => {
    const { state: s } = replay(heldCall.config, heldCall.commands as Command[], heldCall.rules);
    Object.assign(s.jobs.find(j => j.id === 'c16-l1')!, { status: 'scheduled', releaseDay: RULES.days, dueAt: (RULES.days + 1) * RULES.minutesPerDay });
    for (const c of callChoices(s)) expect(c.futureRisks).toContainEqual({ jobId: 'c16-l1', dueAt: 6240, afterSeason: true, shared: true });
  });

  it('does not reveal a future redo through call choices', () => {
    const commands: Command[] = [
      { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] },
      { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } },
      ...['d0-r0', 'd0-r1', 'd0-r2', 'd0-r3'].map((requestId) => ({ type: 'accept' as const, requestId })),
      { type: 'overtime' },
      { type: 'accept', requestId: 'd0-r4' },
      { type: 'runDay', calls: true },
      { type: 'answer', option: 'ride' },
      { type: 'decline', requestId: 'd1-r0' },
      { type: 'decline', requestId: 'd1-r1' },
      ...['d1-r2', 'd1-r3', 'd1-r4', 'd1-r5'].map((requestId) => ({ type: 'accept' as const, requestId })),
      { type: 'decline', requestId: 'd1-r6' },
      { type: 'runDay', calls: true },
    ];
    const { state: s, errors } = replay({ scenarioId: 'main-street', seed: 'm1' }, commands);
    expect(errors).toEqual([]);
    expect(s.call).toMatchObject({ jobId: 'c8-l1', minute: 679, cause: 'snag' });
    expect(s.jobs.find((j) => j.id === 'c9-l1')).toMatchObject({ stage: 'finish', remaining: 56, reworkFlag: false });

    const original = structuredClone(s);
    const originalChoices = callChoices(s);
    const hiddenRedo = structuredClone(s);
    hiddenRedo.jobs.find((j) => j.id === 'c9-l1')!.reworkFlag = true;
    expect(callChoices(hiddenRedo)).toEqual(originalChoices);
    expect(s).toEqual(original);
    expect(hiddenRedo.jobs.find((j) => j.id === 'c9-l1')!.reworkFlag).toBe(true);
  });

  it('stops the day, and leaving it plays out exactly as a day without calls', () => {
    const { s } = untilCall();
    expect(s.events.at(-1)?.type).toBe('call');
    const left = applyCommand(s, { type: 'answer', option: 'ride' }).state;
    let plain = createRun(s.config);
    for (const c of s.commands) plain = applyCommand(plain, c.type === 'runDay' ? { type: 'runDay' } : c).state;
    expect(left.cash).toBe(plain.cash);
    expect(left.jobs.find((j) => j.id === s.call!.jobId)!.status).toBe('missed');
    expect(left.events.filter((e) => e.type !== 'call')).toEqual(plain.events);
  });

  it('refuses everything but an answer until the phone is answered', () => {
    const { s } = untilCall();
    expect(applyCommand(s, { type: 'overtime' }).error).toBe('Answer the phone first.');
    expect(applyCommand(s, { type: 'runDay' }).error).toBe('Answer the phone first.');
  });

  it('does what each answer said it would', () => {
    const { s } = untilCall();
    const id = s.call!.jobId;
    for (const c of callChoices(s)) {
      if (c.blocked) continue;
      const t = applyCommand(s, { type: 'answer', option: c.option }).state;
      const j = t.jobs.find((x) => x.id === id)!;
      if (c.option === 'ring') expect(j.status).toBe('active');
      else if (c.deliveredAt !== null) expect(j.deliveredAt).toBe(c.deliveredAt);
      else expect(j.status).toBe('missed');
      expect(s.cash - t.cash).toBeGreaterThanOrEqual(c.cost);
    }
  });
});

describe('selling the customer list on the last morning', () => {
  it('hands everything still in the works to Bright Lantern when the shop opens, orders taken after the sale too', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'panel-1' });
    while (s.day < 11) {
      for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
      for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    const offer = s.news.find((n) => n.day === 11 && n.choice === null)!;
    s = applyCommand(s, { type: 'choose', newsId: offer.id, option: 1 }).state;
    // Someone taken after the sale goes too: a same-day offer, so somebody at the window buys on the last day.
    s = applyCommand(s, { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    const buyer = windowRequests(s).find((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'buy')!;
    s = applyCommand(s, { type: 'accept', requestId: buyer.id }).state;
    const open = s.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled').map((j) => j.id);
    const end = applyCommand(s, { type: 'runDay' }).state;
    expect(open.length).toBeGreaterThan(0);
    for (const id of open) expect(end.jobs.find((j) => j.id === id)!.status).toBe('refunded');
    expect(end.events.some((e) => e.type === 'delivered' && e.day === 11)).toBe(false);
  });
});

describe('the rent review', () => {
  it('raises the rent from its morning for a studio under the target, and not for one over it', () => {
    const review = getScenario('main-street').review;
    const rentOn = (s: CompanyState, d: number) => -s.journal.filter((e) => e.kind === 'shop' && e.day === d).reduce((a, e) => a + e.cash, 0);
    let idle = createRun({ scenarioId: 'main-street', seed: 'panel-1' });
    while (!idle.finished) idle = applyCommand(idle, { type: 'runDay' }).state;
    expect(rentOn(idle, review.day - 1)).toBe(RULES.shopDailyCost);
    expect(rentOn(idle, review.day)).toBe(RULES.shopDailyCost + RULES.rentRise);
    const busy = runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.bright);
    expect(busy.events.find((e) => e.type === 'review')!.amount).toBeGreaterThanOrEqual(review.served);
    expect(rentOn(busy, review.day)).toBe(RULES.shopDailyCost);
  });
});

describe('regulars', () => {
  /** Main Street, panel-1, taking whoever fits, until a regular who would buy is at the window. */
  function untilRegular(version = CURRENT_RULES_VERSION): CompanyState {
    let s = createRun({ scenarioId: 'main-street', seed: 'panel-1' }, version);
    while (!s.finished) {
      for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
      if (windowRequests(s).some((r) => r.status === 'waiting' && isRegular(s, r.castId) && reactionTo(s, r).kind === 'buy')) return s;
      for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    throw new Error('no regular came back');
  }

  it.each([STUDIO_RULES_VERSION, CURRENT_RULES_VERSION])('%s keeps ignored regulars lost and applies its refusal rule', version => {
    const s = untilRegular(version);
    const r = windowRequests(s).find((x) => x.status === 'waiting' && isRegular(s, x.castId) && reactionTo(s, x).kind === 'buy')!;
    const declined = applyCommand(s, { type: 'decline', requestId: r.id }).state;
    if (version === STUDIO_RULES_VERSION) {
      expect(declined.lostCast).toContain(r.castId);
    } else {
      expect(declined.lostCast).not.toContain(r.castId);
      expect(isRegular(declined, r.castId)).toBe(true);
      expect(declined.relationshipMemory!.at(-1)).toMatchObject({ castId: r.castId, kind: 'declined-before-promise', requestId: r.id });
      expect(nextEligibleVisit(declined, r.castId)).toBe(s.day + 2);
      expect(arrivalsFor(declined, s.day + 1).some(x => x.castId === r.castId)).toBe(false);
    }
    const ignored = applyCommand(s, { type: 'runDay' }).state;
    expect(ignored.lostCast).toContain(r.castId);
    let later = ignored;
    while (!later.finished) later = applyCommand(later, { type: 'runDay' }).state;
    expect(later.requests.filter((x) => x.castId === r.castId && x.day > s.day)).toEqual([]);
    // Taking the order preserves the regular, but missing that promise still loses them.
    let promised = applyCommand(s, { type: 'accept', requestId: r.id }).state;
    expect(promised.lostCast).not.toContain(r.castId);
    const jobId = promised.contracts.find(c => c.requestId === r.id)!.jobIds[0]!;
    promised.jobs.find(j => j.id === jobId)!.remaining = 10_000;
    while (!promised.finished && promised.jobs.find(j => j.id === jobId)!.status === 'active') promised = applyCommand(promised, { type: 'runDay' }).state;
    expect(promised.jobs.find(j => j.id === jobId)!.status).toBe('missed');
    expect(promised.lostCast).toContain(r.castId);
  });
});

it('reports the gathering closure shared by every available Festival call answer', () => {
  const { state, errors } = replay(festival.config, festival.commands.slice(0, 44) as Command[], festival.rules);
  expect(errors).toEqual([]);
  const original = structuredClone(state);
  const choices = callChoices(state);
  const available = choices.filter(choice => !choice.blocked);
  expect(available).toHaveLength(3);
  for (const choice of available) expect(choice.gatheringBooking).toEqual({ day: 5, available: false, shared: true });
  expect(available.find(choice => choice.option === 'cut')!.deliveredAt).not.toBeNull();
  expect(state).toEqual(original);
});
