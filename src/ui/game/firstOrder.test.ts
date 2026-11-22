import { describe, expect, it } from 'vitest';
import { replay } from '../../engine/sim';
import { bookFirstOrder, deliverFirstOrder, firstOrderBuyers, freshFirstOrder, selectFirstEdition } from './firstOrder';

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
