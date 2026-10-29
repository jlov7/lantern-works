import { describe, expect, it } from 'vitest';
import { commandSchema } from '../ui/schema';
import { projectBrief, projectQuote } from './projects';
import { PRESETS, RULES } from './rules';
import { fits, projectForecast } from './selectors';
import { applyCommand, arrivalsFor, createRun, nextEligibleVisit, simulateDay } from './sim';
import type { CompanyState, Request } from './types';
import { CURRENT_RULES_VERSION, STUDIO_RULES_VERSION } from './versions';

function prepared(version = CURRENT_RULES_VERSION): CompanyState {
  const s = createRun({ scenarioId: 'main-street', seed: 'authored-proofs' }, version);
  s.requests = [];
  s.staffing = { aiTier: 'none', routing: 'human' };
  let state = s;
  for (const [index, castId] of ['clem', 'mara', 'mara', 'hugo'].entries()) {
    const req: Request = { id: `prepared-${index}`, day: 0, index, castId, segment: 'small', need: 'simple', wtpPercent: 100, lineIndex: 0, status: 'waiting', source: 'walkin', offer: { ...PRESETS.bespoke, price: 300, turnaroundDays: 3 } };
    state.requests.push(req);
    state = applyCommand(state, { type: 'accept', requestId: req.id }).state;
  }
  simulateDay(state, { forecast: true });
  simulateDay(state, { forecast: true });
  expect(state.jobs.every(j => j.status === 'delivered')).toBe(true);
  return state;
}

describe('authoring a binding commission', () => {
  it('requires a valid proof in new seasons but preserves original studio commands', () => {
    const state = prepared();
    const command = { type: 'acceptProject' as const, projectId: 'clem-ten' as const, approach: 'first-night' as const };
    expect(applyCommand(state, command).error).toContain('approve a proof');
    expect(applyCommand(prepared(STUDIO_RULES_VERSION), command).error).toBeUndefined();
    const design = projectBrief(state, command.projectId, command.approach).defaultDesign;
    design.pieces[0]!.copy = [];
    const result = applyCommand(state, { ...command, design });
    expect(result.error).toContain('CLEM JAZZ BAR');
    expect(result.state).toBe(state);
    expect(commandSchema.safeParse({ ...command, design: { ...design, materials: -100 } }).success).toBe(false);
  });

  it('freezes the exact design, copy, charge, work and command independently of the caller', () => {
    const state = prepared();
    const design = projectBrief(state, 'clem-ten', 'new-band').defaultDesign;
    design.pieces[0]!.palette = 'river'; design.pieces[0]!.headline = 'Here comes the next night'; design.pieces[0]!.treatment = 'third-ink';
    const quote = projectQuote(state, 'clem-ten', 'new-band', design)!;
    const result = applyCommand(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design });
    expect(result.error).toBeUndefined();
    const contract = result.state.contracts.at(-1)!;
    expect(contract.project).toEqual(quote.project);
    expect(contract.project!.materials).toBe(190);
    expect(result.state.cash - state.cash).toBe(1200 - 190);
    expect(result.state.jobs.at(-1)!.effort!.finish).toBe(RULES.effort.finish + 15);
    design.pieces[0]!.headline = 'Changed after booking';
    expect(contract.project!.proof!.design.pieces[0]!.headline).toBe('Here comes the next night');
    expect(result.state.commands.at(-1)).toMatchObject({ design: { pieces: [{ headline: 'Here comes the next night' }] } });
  });

  it('makes richer finishing appear in the same forecast and refuses a second booking', () => {
    const state = prepared();
    const design = projectBrief(state, 'mara-regular', 'weekly-rhythm').defaultDesign;
    for (const piece of design.pieces) piece.treatment = 'hand-border';
    const quote = projectQuote(state, 'mara-regular', 'weekly-rhythm', design)!;
    expect(quote.project.materials).toBe(60);
    expect(quote.profiles.map(p => p.finish)).toEqual([90, 90, 90]);
    expect(projectForecast(state, 'mara-regular', 'weekly-rhythm', { design })).not.toBeNull();
    const command = { type: 'acceptProject' as const, projectId: 'mara-regular' as const, approach: 'weekly-rhythm' as const, design };
    const accepted = applyCommand(state, command).state;
    expect(applyCommand(accepted, command).error).toContain('already');
    expect(fits(projectForecast(state, 'mara-regular', 'weekly-rhythm', { design })!)).toBe(true);
  });

  it('applies treatment after an earned archive finishing reduction', () => {
    let state = prepared();
    const design = projectBrief(state, 'clem-ten', 'first-night').defaultDesign;
    state = applyCommand(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', design }).state;
    while (state.day < 7) simulateDay(state, { forecast: true });
    const invitation = projectBrief(state, 'lantern-night', 'courtyard').defaultDesign;
    invitation.pieces[0]!.treatment = 'hand-border';
    const quote = projectQuote(state, 'lantern-night', 'courtyard', invitation)!;
    expect(quote.profiles[0]!.finish).toBe(90);
    expect(quote.project.materials).toBe(120);
    expect(quote.project.proof!.pieces[0]!.copy.find(c => c.id === 'contributors')!.text).toContain('Clem Jazz Bar');
  });
});

describe('specific relationship memory', () => {
  it('distinguishes declining a regular before promising from breaking their promise', () => {
    const state = prepared();
    const request: Request = { ...state.requests[0]!, id: 'honest-no', day: state.day, index: state.requests.length, status: 'waiting', contractId: undefined };
    state.requests.push(request);
    const next = applyCommand(state, { type: 'decline', requestId: request.id }).state;
    expect(next.lostCast).not.toContain('clem');
    expect(next.relationshipMemory!.at(-1)).toMatchObject({ castId: 'clem', kind: 'declined-before-promise', requestId: request.id });
    expect(nextEligibleVisit(next, 'clem')).toBe(state.day + 2);
    expect(arrivalsFor(next, state.day + 1).some(r => r.castId === 'clem')).toBe(false);
    const alreadyLost = structuredClone(state); alreadyLost.lostCast.push('clem');
    expect(applyCommand(alreadyLost, { type: 'decline', requestId: request.id }).state.lostCast).toContain('clem');
  });

  it('records fulfilled whole orders without clearing an unrelated broken promise', () => {
    const state = prepared();
    expect(state.relationshipMemory!.filter(m => m.kind === 'promise-kept')).toHaveLength(4);
    state.lostCast.push('clem');
    const request: Request = { ...state.requests[0]!, id: 'later-order', day: state.day, index: state.requests.length, status: 'waiting', contractId: undefined };
    state.requests.push(request);
    const next = applyCommand(state, { type: 'accept', requestId: request.id }).state;
    simulateDay(next, { forecast: true });
    expect(next.lostCast).toContain('clem');
    expect(next.relationshipMemory!.some(m => m.requestId === request.id && m.kind === 'promise-kept')).toBe(true);
  });
});
