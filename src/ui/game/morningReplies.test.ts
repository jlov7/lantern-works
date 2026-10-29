import { describe, expect, it } from 'vitest';
import festival from '../../../test-fixtures/replays/festival-season1.json';
import { applyCommand, createRun, isRegular, replay } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { RULES } from '../../engine/rules';
import { returnAfterReply, reviewReplies, routineReplies } from './morningReplies';

describe('reviewed morning replies', () => {
  it('includes returning customers and exactly matches individual commands without mutating the morning', () => {
    const { state, errors } = replay(festival.config, festival.commands.slice(0, 108) as Command[], festival.rules);
    expect(errors).toEqual([]);
    const original = structuredClone(state);
    const requests = routineReplies(state);
    expect(requests.some(request => isRegular(state, request.castId))).toBe(true);
    const review = reviewReplies(state, requests.map(request => request.id));
    let expected = state;
    for (const request of requests) expected = applyCommand(expected, { type: 'decline', requestId: request.id }).state;
    expect(review.requests.map(request => request.id)).toEqual(requests.map(request => request.id));
    expect(review.losses.reduce((total, loss) => total + loss.points, 0)).toBe(Object.keys(state.rep).reduce((total, key) => total + state.rep[key as keyof typeof state.rep] - expected.rep[key as keyof typeof state.rep], 0));
    expect(review.lost).toEqual([]);
    expect(state).toEqual(original);
  });

  it('keeps exceptional requests, duplicate IDs and stale replies out of the group', () => {
    const state = createRun({ scenarioId: 'main-street', seed: 'reply-review' });
    state.requests[0]!.source = 'amends';
    state.requests[1]!.source = 'project';
    state.requests[2]!.status = 'accepted';
    const id = state.requests[3]!.id;
    expect(reviewReplies(state, [...state.requests.slice(0, 3).map(request => request.id), id, id, 'stale']).requests.map(request => request.id)).toEqual([id]);
  });

  it('describes a later season instead of promising an impossible day', () => {
    const state = createRun({ scenarioId: 'main-street', seed: 'reply-review' });
    expect(returnAfterReply(state, 'clem')).toBe('They may return from Day 3; a visit is not guaranteed.');
    state.day = RULES.days - 2;
    expect(returnAfterReply(state, 'clem')).toBe('A later visit would be in another season.');
    state.day = RULES.days - 1;
    expect(returnAfterReply(state, 'clem')).not.toContain('Day 14');
  });
});
