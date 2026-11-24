import { describe, expect, it } from 'vitest';
import { castName } from '../format';
import { deliverFirstOrder, firstOrderMorning, freshFirstOrder, selectFirstEdition } from './firstOrder';
import { firstOrderBayPoster, firstOrderMorningFrame, firstOrderStage } from './firstOrderScene';
import { BAYS, leaverPose } from './signatureTargets';

describe('first order miniature uses the same morning', () => {
  it('places Clem at the jazz bar and reveals no departures on the design step', () => {
    expect(firstOrderMorningFrame().clock).toBe('9:00am');
    const stage = firstOrderStage(freshFirstOrder(), 'design', { leavers: ['unexpected'] });
    expect(stage.clem).toEqual([.45, 0, 5.70]);
    expect(stage.queue.map(item => castName(item.castId))).toEqual(['Gus', 'Finn', 'Sam', 'Yara']);
    expect(stage.leavers).toEqual([]);
  });
  it.each(['room', 'band'] as const)('uses actual request IDs for %s departures', edition => {
    const draft = selectFirstEdition(freshFirstOrder(), edition);
    const delivery = deliverFirstOrder(draft)!;
    const names = delivery.turnedAwayIds.map(id => castName(firstOrderMorning.requests.find(item => item.id === id)!.castId));
    expect(names).toEqual(edition === 'room' ? ['Finn', 'Sam', 'Yara'] : ['Finn', 'Sam']);
    expect(names).toEqual(delivery.turnedAway);
    const booked = firstOrderStage(draft, 'press', { leavers: delivery.turnedAwayIds });
    expect(booked.leavers).toEqual(delivery.turnedAwayIds);
    const leavers = booked.leavers.map(id => booked.queue.find(item => item.requestId === id)!.at);
    leavers.forEach((at, index) => at.forEach((value, axis) => {
      expect(value).toBeCloseTo(leaverPose(index, 0, false).at[axis]!, 10);
    }));
  });
  it('keys both bay prints to the visible proof without rerasterising for a step or selection', () => {
    const draft = freshFirstOrder();
    const room = firstOrderBayPoster(draft, 'room');
    const band = firstOrderBayPoster(draft, 'band');
    expect(room.key).toMatch(/^edition:room:[0-9a-f]{8}$/);
    expect(band.key).toMatch(/^edition:band:[0-9a-f]{8}$/);
    expect(room.design).toEqual(draft.design.pieces[0]);
    expect(band.design).toEqual(selectFirstEdition(draft, 'band').design.pieces[0]);
    expect(BAYS.room.centre[0]).toBe(1.40);
    expect(BAYS.band.centre[0]).toBe(-.50);
    expect(firstOrderBayPoster({ ...draft, step: 'press' }, 'room')).toEqual(room);
    expect(firstOrderBayPoster(selectFirstEdition(draft, 'band'), 'room')).toEqual(room);
    const changed = (edit: { headline: string } | { palette: 'poppy' }) => ({
      ...draft, design: { ...draft.design, pieces: [{ ...draft.design.pieces[0]!, ...edit }] },
    });
    for (const next of [changed({ headline: 'One evening of brass' }), changed({ palette: 'poppy' })]) {
      expect(firstOrderBayPoster(next, 'room').key).not.toBe(room.key);
      expect(firstOrderBayPoster(next, 'band').key).not.toBe(band.key);
    }
  });
  it('shows the delivered edition and clears the queue at the window', () => {
    const draft = selectFirstEdition(freshFirstOrder(), 'band');
    const stage = firstOrderStage(draft, 'window', { deliveredKey: 'delivered:band:proof', leavers: ['unexpected'] });
    expect(stage.hung).toEqual({ bay: 'band', key: 'delivered:band:proof' });
    expect(stage.queue).toEqual([]);
    expect(stage.leavers).toEqual([]);
    expect(stage.clem).toEqual([.45, 0, 5.70]);
  });
  it('walks a stable path and keeps feet still in reduced motion', () => {
    const middle = leaverPose(1, 1000, false);
    expect(middle).toEqual(leaverPose(1, 1000, false));
    expect(middle.at[0]).toBeGreaterThan(.07);
    expect(leaverPose(1, 1601, false).visible).toBe(false);
    expect(leaverPose(1, 1199, true)).toEqual({ at: leaverPose(1, 0, false).at, turn: Math.PI, visible: true });
    expect(leaverPose(1, 1200, true).visible).toBe(false);
  });
});
