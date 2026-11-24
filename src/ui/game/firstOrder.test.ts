import { describe, expect, it, vi } from 'vitest';
import { replay } from '../../engine/sim';
import { FIRST_ORDER_RULES_VERSION, PRESS_CHOICE_RULES_VERSION } from '../../engine/versions';
import { decodeShare, encodeShare } from '../persist';
import { FIRST_SEASON } from '../screens/firstSeason';
import { frameAt } from '../timeline';
import { bookFirstOrder, deliverFirstOrder, firstOrderBuyers, firstOrderPromiseOutcome, freshFirstOrder, loadFirstOrder, replayFirstOrderPromise, selectFirstEdition, type FirstOrder } from './firstOrder';

import { computeMorningPlan } from './morningPlan';

const fresh = freshFirstOrder();
const bandDraft = selectFirstEdition(fresh, 'band');

describe('the dedicated first-order choice', () => {
  it('keeps the delivery promises and lets Yara hold her order for the musicians', () => {
    const room = deliverFirstOrder(fresh)!;
    const band = deliverFirstOrder(bandDraft)!;
    expect([room.piece.deliveredAt, band.piece.deliveredAt]).toEqual([333, 288]);
    expect([room.state.revenue, band.state.revenue]).toEqual([900, 900]);
    expect([room.state.cash, band.state.cash]).toEqual([2980, 2980]);
    expect(room.response).not.toEqual(band.response);
    expect(room.turnedAway).toEqual(['Finn', 'Sam', 'Yara']);
    expect(band.turnedAway).toEqual(['Finn', 'Sam']);
    expect(room.heldOrders).toEqual([]);
    expect(band.heldOrders).toEqual(['Yara']);
    const first = band.state.requests.find(r => r.day === 0 && r.castId === 'yara')!;
    expect(first.status).toBe('deferred');
    expect(band.state.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'deferred', requestId: first.id })]));
    expect(band.state.requests.filter(r => r.day === 1 && r.castId === 'yara')).toEqual([
      expect.objectContaining({ status: 'waiting', need: first.need, wtpPercent: first.wtpPercent }),
    ]);
    expect(room.state.requests.some(r => r.day === 1 && r.castId === 'yara')).toBe(false);
    const played = replay(band.state.config, band.state.commands, band.state.rulesVersion);
    expect(played.errors).toEqual([]);
    expect(played.state).toEqual(band.state);
  });

  it('keeps Yara available to book without counting her as a lost buyer', () => {
    const room = computeMorningPlan(bookFirstOrder(fresh).state, null);
    const booked = bookFirstOrder(bandDraft).state;
    const band = computeMorningPlan(booked, null);
    const yara = booked.requests.find(req => req.castId === 'yara')!;
    expect(band.queue.together).toContain(yara.id);
    expect(band.outlook?.fitLeaving).toBe(2);
    expect(band.outlook!.fitValue).toBeLessThan(room.outlook!.fitValue);
    expect(band.outlook?.buyersLeaving).toBe(2);
    const after = deliverFirstOrder(bandDraft)!.state;
    const frame = frameAt(booked, after, 30);
    expect(frame.neighbours.find(neighbour => neighbour.requestId === yara.id)?.mood).toBe('waiting');
    expect(frame.neighbours.find(neighbour => neighbour.castId === 'finn')?.mood).toBe('leaving');
    expect(room.outlook?.fitLeaving).toBe(3);
  });

  it('keeps the regular guided season and older rules on their original request tape', () => {
    const band = deliverFirstOrder(bandDraft)!;
    for (const result of [
      replay(FIRST_SEASON, band.state.commands, FIRST_ORDER_RULES_VERSION),
      replay(FIRST_SEASON, band.state.commands, PRESS_CHOICE_RULES_VERSION),
    ]) {
      expect(result.errors).toEqual([]);
      expect(result.state.requests.find(r => r.day === 0 && r.castId === 'yara')?.status).toBe('walked');
      expect(result.state.requests.some(r => r.day === 1 && r.castId === 'yara')).toBe(false);
    }
  });

  it('keeps the opening marker in replay and challenge links', async () => {
    const { state } = deliverFirstOrder(bandDraft)!;
    for (const commands of [state.commands, []]) {
      const encoded = await encodeShare(state.config, commands, 'Clem', state.rulesVersion);
      const decoded = await decodeShare(encoded);
      expect(decoded).toMatchObject({ ok: true, payload: {
        rules: FIRST_ORDER_RULES_VERSION, commands, config: { opening: 'clem-first-order' },
      } });
      if (decoded.ok && commands.length) expect(decoded.state).toEqual(state);
    }
  });

  it('refuses an opening marker on other streets, seeds and earlier rules', async () => {
    const { config } = deliverFirstOrder(bandDraft)!.state;
    const attempts = [
      { config: { ...config, scenarioId: 'festival-week' }, rules: FIRST_ORDER_RULES_VERSION },
      { config: { ...config, seed: 'another-morning' }, rules: FIRST_ORDER_RULES_VERSION },
      { config, rules: PRESS_CHOICE_RULES_VERSION },
      { config, rules: 'lantern-6.1.0' },
    ];
    for (const attempt of attempts) {
      const encoded = await encodeShare(attempt.config, [], 'Clem', attempt.rules);
      expect(await decodeShare(encoded)).toMatchObject({ ok: false });
    }
  });

  it('resumes a draft written before the version marker with its original result', () => {
    const original = { step: 'window', edition: 'band', design: bandDraft.design };
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify(original) });
    try {
      const loaded = loadFirstOrder();
      expect(loaded).toEqual(original);
      const result = deliverFirstOrder(loaded)!;
      expect(result.state.rulesVersion).toBe(PRESS_CHOICE_RULES_VERSION);
      expect(result.turnedAway).toEqual(['Finn', 'Sam', 'Yara']);
      expect(result.heldOrders).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the first order', () => {
  it('leaves the other buyers waiting when the player continues planning', () => {
    const result = bookFirstOrder(freshFirstOrder());
    expect(result.error).toBeUndefined();
    expect(result.state.day).toBe(0);
    expect(result.state.contracts).toHaveLength(1);
    expect(result.state.requests.filter(request => request.status === 'waiting').length).toBeGreaterThanOrEqual(firstOrderBuyers);
    expect(result.state.commands.map(command => command.type)).toEqual(['accept']);
  });

  it('delivers two distinct proofs with consequences that replay exactly', () => {
    const draft = freshFirstOrder();
    draft.design = { ...draft.design, pieces: [{ ...draft.design.pieces[0]!, headline: 'The room is ours', palette: 'poppy' }] };
    const room = deliverFirstOrder(draft)!;
    const band = deliverFirstOrder(selectFirstEdition(draft, 'band'))!;
    for (const result of [room, band]) {
      expect(result.state.day).toBe(1);
      expect(result.piece.brief.proof?.design.pieces[0]).toMatchObject({ headline: 'The room is ours', palette: 'poppy' });
      expect(replay(result.state.config, result.state.commands, result.state.rulesVersion).state).toEqual(result.state);
    }
    expect(room.piece.brief.proof?.design.pieces[0]?.layout).toBe('gallery');
    expect(band.piece.brief.proof?.design.pieces[0]?.layout).toBe('headline');
    expect(room.state.contracts[0]?.intention).toBe('clem-room');
    expect(band.state.contracts[0]?.intention).toBe('clem-band');
    expect(band.piece.deliveredAt).toBeLessThan(room.piece.deliveredAt!);
  });
});

describe('the two-morning promise', () => {
  it('judges both promises from the real results of the two editions', () => {
    const room = deliverFirstOrder(fresh)!;
    const band = deliverFirstOrder(bandDraft)!;
    expect(firstOrderPromiseOutcome('clem', room)).toEqual({ kept: true, roomPrint: true, yaraReturns: false, yaraHasRoom: false });
    expect(firstOrderPromiseOutcome('clem', band)).toEqual({ kept: false, roomPrint: false, yaraReturns: true, yaraHasRoom: true });
    expect(firstOrderPromiseOutcome('yara', room)).toEqual({ kept: false, roomPrint: true, yaraReturns: false, yaraHasRoom: false });
    expect(firstOrderPromiseOutcome('yara', band)).toEqual({ kept: true, roomPrint: false, yaraReturns: true, yaraHasRoom: true });
    const order = band.state.requests.find(item => item.day === 1 && item.castId === 'yara')!;
    expect(order.status).toBe('waiting');
    const declined = { ...band, state: { ...band.state, requests: band.state.requests.map(req => req === order ? { ...req, status: 'declined' as const } : req) } };
    expect(firstOrderPromiseOutcome('yara', declined)).toMatchObject({ kept: false, yaraHasRoom: false });
  });

  it('returns to the press with the same proof details and promise', () => {
    const opening = freshFirstOrder(true);
    const draft: FirstOrder = {
      ...opening, step: 'window', nextMorning: true, promise: 'yara',
      design: { ...opening.design, pieces: [{ ...opening.design.pieces[0]!, headline: 'First set', palette: 'poppy' }] },
    };
    const other = replayFirstOrderPromise(draft);
    expect(other).toMatchObject({ edition: 'band', step: 'press', promise: 'yara', rules: draft.rules, replaying: true });
    expect(other.nextMorning).toBeUndefined();
    expect(other.design.pieces[0]).toMatchObject({ headline: 'First set', palette: 'poppy', layout: 'headline' });
    expect(deliverFirstOrder(draft)?.piece.brief.proof?.design.pieces[0]?.motifs[0]?.id).toBe('door');
    expect(deliverFirstOrder(other)?.piece.brief.proof?.design.pieces[0]?.motifs[0]?.id).toBe('trumpet');
    expect(replayFirstOrderPromise(other).design).toEqual(draft.design);
    expect(deliverFirstOrder(other)?.state.config).toEqual(deliverFirstOrder(draft)?.state.config);
  });

  it('only restores a second morning from a current promise ending', () => {
    const ending: FirstOrder = { ...fresh, step: 'window', nextMorning: true, promise: 'clem' };
    const read = vi.fn(() => JSON.stringify(ending));
    vi.stubGlobal('sessionStorage', { getItem: read });
    try {
      expect(loadFirstOrder(true)).toEqual(ending);
      expect(read).toHaveBeenLastCalledWith('lantern.first-order-promise.v1');
      for (const invalid of [{ ...ending, promise: undefined }, { ...ending, rules: undefined }, { ...ending, step: 'press' },
        { ...ending, nextMorning: undefined, replaying: true, step: 'design' }]) {
        read.mockReturnValueOnce(JSON.stringify(invalid));
        expect(loadFirstOrder(true)).toEqual(freshFirstOrder(true));
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
