import { describe, expect, it } from 'vitest';
import { applyCommand, replay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { shareSchema } from '../schema';
import ordinary from './fixtures/ordinary-order-intake.json';
import { acceptedSibling, newsOrder, separateOrderLine } from './orderIntake';
import { regularLoss } from './eveningFacts';

const tape = shareSchema.parse(ordinary);
function prefix(count: number) {
  const result = replay(tape.config, tape.commands.slice(0, count), LEGACY_RULES_VERSION);
  expect(result.errors).toEqual([]);
  return result.state;
}

describe('order intake from the original ordinary account', () => {
  it('discloses the regular-loss risk before inviting the order', () => {
    const state = prefix(23);
    const before = structuredClone(state);
    const news = state.news.find(n => n.day === state.day)!;
    expect(news.card).toBe('clemTen');
    expect(news.choice).toBeNull();
    expect(newsOrder(state, news, 1)).toHaveProperty('intakeWarning', 'Turn this order away or leave it unanswered, and Clem will not return.');
    const card = applyCommand(state, { type: 'choose', newsId: news.id, option: 0 });
    const queued = applyCommand(state, { type: 'choose', newsId: news.id, option: 1 });
    expect(card.error).toBeUndefined();
    expect(queued.error).toBeUndefined();
    const request = queued.state.requests.find(r => !state.requests.some(old => old.id === r.id))!;
    expect(request.castId).toBe('clem');
    const declined = applyCommand(queued.state, { type: 'decline', requestId: request.id });
    expect(declined.error).toBeUndefined();
    expect(card.state.lostCast).not.toContain('clem');
    expect(queued.state.lostCast).not.toContain('clem');
    expect(declined.state.lostCast).toContain('clem');
    expect(state).toEqual(before);
  });

  it.each([33, 45])('does not invent a regular-loss consequence at prefix %i', count => {
    const state = prefix(count);
    const news = state.news.find(n => n.day === state.day)!;
    expect(newsOrder(state, news, 1)).toHaveProperty('intakeWarning', null);
    const queued = applyCommand(state, { type: 'choose', newsId: news.id, option: 1 });
    expect(queued.error).toBeUndefined();
    const request = queued.state.requests.find(r => !state.requests.some(old => old.id === r.id))!;
    const declined = applyCommand(queued.state, { type: 'decline', requestId: request.id });
    expect(declined.error).toBeUndefined();
    expect(declined.state.lostCast).not.toContain(request.castId);
  });

  it.each([24, 34, 46])('keeps a reviewed news order pending at prefix %i', count => {
    const state = prefix(count);
    const before = structuredClone(state);
    const news = state.news.find(n => n.day === state.day)!;
    expect(news.choice).toBe(1);
    const order = newsOrder(state, news, 1)!;
    expect(order.status).toBe('not taken yet. Take it on its ticket before opening');
    expect(state.requests.find(r => r.day === state.day && r.source === 'news')?.contractId).toBeUndefined();
    expect(newsOrder(state, news, 0)).toBeNull();
    expect(state).toEqual(before);
  });

  it('tracks the actual ticket through acceptance, refusal and unanswered opening', () => {
    const pending = prefix(24);
    const news = pending.news.find(n => n.day === 5)!;
    const accepted = prefix(28);
    expect(newsOrder(accepted, news, 1)?.status).toBe('taken at the window');
    expect(newsOrder(accepted, news, 1)?.remaining).toBe('Another order from Clem is still waiting at the window. Leave that order unanswered and Clem will not return.');
    const declined = applyCommand(pending, { type: 'decline', requestId: 'd5-n' });
    expect(declined.error).toBeUndefined();
    expect(newsOrder(declined.state, news, 1)?.status).toBe('turned away at the window');
    const opened = applyCommand(pending, { type: 'runDay' });
    expect(opened.error).toBeUndefined();
    expect(newsOrder(opened.state, news, 1)?.status).toBe('left unanswered when you opened');
  });

  it('distinguishes the two Clem orders before either is taken', () => {
    const state = prefix(24);
    for (const id of ['d5-r5', 'd5-n']) {
      const request = state.requests.find(r => r.id === id)!;
      expect(separateOrderLine(state, request)).toBe('Another order from Clem is at the window today.');
      expect(acceptedSibling(state, request)).toBeUndefined();
    }
    const ordinary = prefix(1);
    expect(separateOrderLine(ordinary, ordinary.requests[0]!)).toBeNull();
  });

  it('keeps a regular\'s separate-order consequence after the anniversary is taken', () => {
    const state = prefix(28);
    const before = structuredClone(state);
    const request = state.requests.find(r => r.id === 'd5-r5')!;
    expect(acceptedSibling(state, request)?.offer.name).toBe('Ten years of Clem');
    expect(separateOrderLine(state, request)).toBe('Ten years of Clem is already taken. This is another order. Leave this one unanswered and Clem will not return.');
    expect(state).toEqual(before);
  });

  it('names a declined additional order separately too', () => {
    const before = prefix(31);
    const declined = applyCommand(before, { type: 'decline', requestId: 'd5-r5' });
    expect(declined.error).toBeUndefined();
    expect(regularLoss(declined.state, 5)).toContain('You took Ten years of Clem for Clem, but turned another order away. Clem will not return.');
    expect(newsOrder(declined.state, before.news.find(n => n.day === 5)!, 1)?.remaining).toBeNull();
  });

  it('preserves the delivery benefit of a reviewed story order', () => {
    const state = prefix(34);
    const news = state.news.find(n => n.day === state.day)!;
    expect(newsOrder(state, news, 1)?.consequence).toBe('On delivery: stronger "One big moment" word of mouth.');
    const ending = prefix(81);
    const anniversary = ending.contracts.find(c => c.offer.name === 'Ten years of Clem')!;
    expect(anniversary.jobIds.every(id => ending.jobs.find(j => j.id === id)?.status === 'delivered')).toBe(true);
    expect(ending.lostCast).toContain('clem');
  });
});
