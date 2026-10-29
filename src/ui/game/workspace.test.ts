import { describe, expect, it } from 'vitest';
import { nextCustomer } from './workspace';

describe('customer navigation', () => {
  const queue = [{ id: 'mina', status: 'waiting' as const }, { id: 'finn', status: 'accepted' as const }, { id: 'lorna', status: 'waiting' as const }];
  it('advances past answered people without answering anyone', () => {
    expect(nextCustomer(queue, 'mina')).toBe('lorna');
    expect(queue[0]!.status).toBe('waiting');
  });
  it('wraps to an earlier waiting person in arrival order', () => {
    expect(nextCustomer(queue, 'lorna')).toBe('mina');
    expect(nextCustomer(queue, null)).toBe('mina');
  });
  it('has no next customer once everyone is answered', () => {
    expect(nextCustomer(queue.map(r => ({ ...r, status: 'declined' })), 'mina')).toBeNull();
  });
});
