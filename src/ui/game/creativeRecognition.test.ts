import { describe, expect, it } from 'vitest';
import { ordinaryBrief } from '../../engine/ordinary';
import { projectBrief } from '../../engine/projects';
import { reactionTo } from '../../engine/selectors';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { commissionInspiration } from './creativeRecognition';
import { ordinaryComposition } from './ordinaryComposition';
import { commissionConversation } from './commissionConversation';
import { eveningCommissionPayoffs } from './commissionPayoff';
import { portfolioAt, workFor } from './portfolio';
import { streetDisplayAt } from './streetDisplay';

const config = { scenarioId: 'main-street', seed: 'first-season' };
function take(): { state: CompanyState; commands: Command[] } {
  const state = createRun(config);
  const request = state.requests.find(request => request.castId === 'clem')!;
  const reaction = reactionTo(state, request);
  if (reaction.kind !== 'buy') throw new Error('The guided first visitor must be able to buy.');
  const brief = ordinaryBrief(request, reaction.offer)!;
  const design = ordinaryComposition(brief, brief.defaultDesign, 1);
  design.pieces[0]!.headline = 'Stay for the last note';
  design.pieces[0]!.palette = 'river';
  const commands: Command[] = [{ type: 'accept', requestId: request.id, design, intention: 'clem-band' }];
  const result = replay(config, commands);
  expect(result.errors).toEqual([]);
  return { state: result.state, commands };
}

describe('recognising the first creative promise', () => {
  it('carries one exact print through work, timed delivery and the street', () => {
    const accepted = take();
    const proof = accepted.state.contracts[0]!.proof!;
    expect(workFor(accepted.state, [accepted.state.jobs[0]!.id], accepted.state.minute)[0]?.brief.proof).toEqual(proof);
    expect(commissionInspiration(accepted.state, 'clem-ten')).toBeNull();
    const result = replay(config, [...accepted.commands, { type: 'runDay' }]);
    expect(result.errors).toEqual([]);
    const state = result.state;
    const minute = state.jobs[0]!.deliveredAt!;
    expect(minute).toBeGreaterThan(0);
    expect(eveningCommissionPayoffs(state, 0, minute - 1).filter(payoff => payoff.kind === 'ordinary')).toEqual([]);
    const payoff = eveningCommissionPayoffs(state, 0, minute).find(payoff => payoff.kind === 'ordinary')!;
    expect(payoff.featuredPiece?.brief.proof).toEqual(proof);
    expect(payoff.response).toContain('Stay for the last note');
    expect(payoff.consequence).toContain('musicians');
    expect(payoff.invitation?.projectId).toBe('clem-ten');
    expect(portfolioAt(state, minute)[0]!.brief.proof).toEqual(proof);
    expect(streetDisplayAt(state, minute).locations.find(location => location.work?.castId === 'clem')?.work?.brief.proof).toEqual(proof);
  });

  it('recognises the stated direction while leaving both milestone approaches available', () => {
    const accepted = take();
    const state = replay(config, [...accepted.commands, { type: 'runDay' }, { type: 'runDay' }]).state;
    const conversation = commissionConversation(state, 'clem-ten');
    expect(conversation.opening).toContain('musicians');
    expect(conversation.proposal).toBe('new-band');
    expect(conversation.memory?.design.headline).toBe('Stay for the last note');
    const design = projectBrief(state, 'clem-ten', 'first-night').defaultDesign;
    const booked = applyCommand(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', design });
    expect(booked.error).toBeUndefined();
    expect(commissionInspiration(booked.state, 'clem-ten')).toEqual(conversation.memory);
  });

  it('does not invent a broken promise or repair for an unexplained relationship loss', () => {
    const accepted = take();
    const state = replay(config, [...accepted.commands, { type: 'runDay' }]).state;
    state.lostCast.push('clem');
    const payoff = eveningCommissionPayoffs(state, 0).find(payoff => payoff.kind === 'ordinary')!;
    expect(payoff.response).toContain('Stay for the last note');
    expect(payoff.consequence).toContain('does not establish why');
    expect(payoff.consequence).not.toContain('broken promise');
    expect(payoff.invitation).toBeUndefined();
    expect(commissionInspiration(state, 'clem-ten')).toBeNull();
  });
});
