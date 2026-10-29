import { describe, expect, it } from 'vitest';
import { buildContinuation } from '../../engine/continuation';
import { ordinaryBrief, ordinaryIntentions, ordinaryRequestLine } from '../../engine/ordinary';
import { compatiblePatterns, patternSources } from '../../engine/patterns';
import { lendingSources, projectBrief } from '../../engine/projects';
import { PRESETS } from '../../engine/rules';
import { applyCommand, createRun, replay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import opening from './fixtures/heartfelt-trail.json';
import { commissionConversation } from './commissionConversation';
import { commissionQuote, studioSlot } from './commissionFacts';
import { eveningCommissionPayoffs } from './commissionPayoff';
import { deliveredPatternUses, intentionFor } from './creativeRecognition';
import { briefFor, portfolioAt } from './portfolio';

function step(state: CompanyState, command: Command): CompanyState {
  const result = applyCommand(state, command);
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  return result.state;
}
function nextMorning(state: CompanyState): CompanyState {
  for (const news of state.news.filter(news => news.day === state.day && news.choice === null)) state = step(state, { type: 'choose', newsId: news.id, option: 0 });
  for (const request of state.requests.filter(request => request.day === state.day && request.status === 'waiting')) state = step(state, { type: 'decline', requestId: request.id });
  return step(state, { type: 'runDay' });
}
function legacy() {
  const parent = replay(opening.config, opening.commands as Command[]);
  expect(parent.errors).toEqual([]);
  const source = patternSources(parent.state).find(piece => piece.castId === 'clem' && piece.design.kind === 'poster')!;
  expect(source).toBeDefined();
  let practice = createRun(buildContinuation(parent.state, [source.id]));
  const retained = practice.config.continuation!.pieces[0]!;
  practice = step(practice, { type: 'preparePattern', sourceId: retained.id });
  while (!practice.finished) practice = nextMorning(practice);
  return createRun(buildContinuation(practice, [retained.id], 'evolving-proof'));
}

describe('evolving work presentation', () => {
  it('uses the stamped recurring brief for request, preview, approved print and payoff', () => {
    let state = legacy();
    state = step(state, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 300 }] });
    const request = state.requests.find(request => request.castId === 'clem')!;
    expect(request.briefId).toMatch(/clem-legacy-/);
    const brief = ordinaryBrief(request, state.menu[0]!)!;
    const preview = briefFor(request);
    expect(preview.headline).toBe(brief.title);
    expect(preview.detail).toBe(ordinaryRequestLine(request));
    expect(preview.request).toBe(ordinaryRequestLine(request));
    const intention = ordinaryIntentions(request.castId, request.briefId)[0]!;
    state = step(state, { type: 'accept', requestId: request.id, design: brief.defaultDesign, intention: intention.id });
    for (let day = 0; day < 3 && !portfolioAt(state).some(piece => piece.requestId === request.id); day++) state = nextMorning(state);
    const piece = portfolioAt(state).find(piece => piece.requestId === request.id)!;
    expect(piece.brief.headline).toBe(brief.title);
    expect(piece.brief.proof!.pieces[0]!.copy).toEqual(brief.pieces[0]!.copy);
    const payoff = eveningCommissionPayoffs(state, Math.ceil(piece.deliveredAt! / 480) - 1).find(payoff => payoff.kind === 'ordinary')!;
    expect(payoff.title).toBe(brief.title);
    expect(payoff.consequence).toContain(intention.response);
    expect(payoff.consequence).not.toMatch(/how it began|first workshop|sign of my own/);
    expect(intentionFor({ sourceSeason: 3, contractId: piece.contractId, requestId: request.id, jobId: piece.jobId, castId: request.castId, briefId: request.briefId, deliveredAt: piece.deliveredAt!, design: brief.defaultDesign.pieces[0]!, title: brief.title, copy: brief.pieces[0]!.copy, intention: intention.id })?.response).toBe(intention.response);
  });

  it('quotes a reserved ordinary proof with the same draft that is accepted', () => {
    const state = legacy();
    const request = state.requests.find(request => request.castId === 'clem')!;
    const brief = ordinaryBrief(request, PRESETS.bespoke)!;
    const design = compatiblePatterns(state, brief)[0]!.design;
    const intention = ordinaryIntentions(request.castId, request.briefId)[0]!.id;
    const slot = studioSlot(state, request.id, 1, design, intention);
    expect(slot.blocked).toBeNull();
    expect(slot.command).toMatchObject({ type: 'reserve', requestId: request.id, design, intention });
    const accepted = step(state, slot.command!);
    expect(slot.quote).toEqual(accepted.contracts.at(-1));
    expect(slot.quote!.proof!.design).toEqual(design);
    expect(slot.estimate).toBeDefined();
  });

  it('keeps lending blocked until an exact retained source reaches every quote and command', () => {
    let state = legacy();
    state = nextMorning(nextMorning(state));
    const source = lendingSources(state, 'clem-ten', 'first-night')[0]!;
    const pending = projectBrief(state, 'clem-ten', 'first-night');
    const resolved = projectBrief(state, 'clem-ten', 'first-night', source.id);
    expect(pending.defaultDesign.pieces.map(piece => piece.copy)).toEqual(resolved.defaultDesign.pieces.map(piece => piece.copy));
    expect(commissionQuote(state, 'clem-ten', 'first-night').quote).toBeNull();
    const quote = commissionQuote(state, 'clem-ten', 'first-night', undefined, resolved.defaultDesign, source.id);
    expect(quote.blocked).toBeNull();
    expect(quote.command?.sourceId).toBe(source.id);
    expect(quote.quote?.project.lentPiece).toEqual(source);
    const accepted = step(state, quote.command!);
    expect(accepted.contracts.at(-1)!.project!.lentPiece).toEqual(source);
    expect(accepted.commands.at(-1)).toEqual(quote.command);
    expect(quote.work!.total).not.toBeNull();
    expect(quote.estimate).toBeDefined();
  });

  it('offers native compatible ordinary patterns without dropping new required copy', () => {
    const state = legacy();
    const request = state.requests.find(request => request.castId === 'clem')!;
    const brief = ordinaryBrief(request, PRESETS.bespoke)!;
    const patterns = compatiblePatterns(state, brief);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]!.briefReduction).toBe(15);
    expect(patterns[0]!.design.pieces[0]!.copy).toEqual(brief.defaultDesign.pieces[0]!.copy);
    expect(brief.pieces[0]!.copy.map(copy => copy.text).join(' ')).not.toMatch(/anniversary|ten years/i);
  });

  it('reports pattern use only after native briefing and delivery', () => {
    let state = legacy();
    state = step(state, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 300 }] });
    const request = state.requests.find(request => request.castId === 'clem')!;
    const brief = ordinaryBrief(request, state.menu[0]!)!;
    const pattern = compatiblePatterns(state, brief)[0]!;
    expect(deliveredPatternUses(state, pattern.id)).toBe(0);
    state = step(state, { type: 'accept', requestId: request.id, design: pattern.design });
    expect(deliveredPatternUses(state, pattern.id)).toBe(0);
    for (let day = 0; day < 3 && !portfolioAt(state).some(piece => piece.requestId === request.id); day++) state = nextMorning(state);
    expect(state.events.find(event => event.type === 'pattern_used' && event.patternId === pattern.id)).toMatchObject({ amount: 15, stage: 'brief' });
    expect(deliveredPatternUses(state, pattern.id)).toBe(1);
    const beforeDelivery = structuredClone(state);
    beforeDelivery.jobs.find(job => job.contractId === state.contracts.find(contract => contract.requestId === request.id)!.id)!.deliveredAt = null;
    expect(deliveredPatternUses(beforeDelivery, pattern.id)).toBe(0);
  });

  it('does not describe a complete coordinated archive after only its first delivery', () => {
    let state = nextMorning(nextMorning(legacy()));
    const brief = projectBrief(state, 'clem-ten', 'new-band');
    state = step(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design: brief.defaultDesign });
    const contract = state.contracts.at(-1)!;
    for (let day = 0; day < 3 && state.jobs.some(job => job.contractId === contract.id && job.deliveredAt === null); day++) state = nextMorning(state);
    const deliveries = state.jobs.filter(job => job.contractId === contract.id).map(job => job.deliveredAt!).sort((a, b) => a - b);
    expect(deliveries[0]).toBeGreaterThan(0);
    expect(deliveries[1]).toBeGreaterThan(deliveries[0]!);
    const payoff = eveningCommissionPayoffs(state, Math.ceil(deliveries[0]! / 480) - 1, deliveries[0]!).find(payoff => payoff.kind === 'milestone')!;
    expect(payoff.line).toBe('1 of 2 pieces delivered.');
    expect(payoff.response).toContain('other one will sit beside it');
    expect(payoff.response).not.toContain('prints side by side');
    expect(payoff.consequence).toContain('remaining 1 piece');
  });

  it('keeps legacy and open-studio conversations separate from the one-time milestones', () => {
    const state = legacy();
    for (const id of ['clem-ten', 'mara-regular', 'hugo-handover'] as const) {
      const talk = commissionConversation(state, id);
      expect(JSON.stringify(talk.exchanges) + talk.opening).not.toMatch(/turns ten|anniversary|first repair|name above the door|watching me leave/);
    }
    expect(commissionConversation(state, 'clem-ten').exchanges[0]!.answer).toContain('exact piece');
    expect(commissionConversation(state, 'mara-regular').exchanges[0]!.answer).toContain('stays closed');
    expect(commissionConversation(state, 'hugo-handover').castId).toBe('ivo');
  });
});
