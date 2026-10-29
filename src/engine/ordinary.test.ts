import { describe, expect, it } from 'vitest';
import { buildContinuation, deliveredPieces, validateContinuation } from './continuation';
import type { CreativeIntention, DesignSpec } from './design';
import { contractProof, creativePromise, ordinaryBrief, ordinaryIntentions } from './ordinary';
import { patternReduction } from './patterns';
import { ordinaryOrdersDelivered, projectBlocked, projectBrief } from './projects';
import { CAST_BY_ID, PRESETS, RULES } from './rules';
import { dayPlan, forecast, summarize } from './selectors';
import { applyCommand, createRun, reactionFor, replay, reservationBlocked } from './sim';
import type { Command, CompanyState, Request, RunConfig } from './types';
import { AUTHORSHIP_RULES_VERSION, CREATIVE_PROMISE_RULES_VERSION, LEGACY_RULES_VERSION, STUDIO_RULES_VERSION } from './versions';
import legacy from './fixtures/legacy-6.0.0.json';

const config = { scenarioId: 'main-street', seed: 'creative-promises' };
// These pin the 6.1 ordinary-proof contract; career-specific changes have separate tests.
const fresh = () => createRun(config, CREATIVE_PROMISE_RULES_VERSION);
function step(state: CompanyState, command: Command) {
  const result = applyCommand(state, command);
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  return result.state;
}
function commandFor(state: CompanyState, intention?: CreativeIntention): Extract<Command, { type: 'accept' }> {
  const request = state.requests.find(r => r.day === state.day && r.castId === 'clem' && r.status === 'waiting')!;
  const reaction = reactionFor(state, request);
  if (reaction.kind !== 'buy') throw new Error('Clem must want the test offer.');
  const design = ordinaryBrief(request, reaction.offer)!.defaultDesign;
  design.pieces[0]!.headline = 'A seat near the music';
  design.pieces[0]!.palette = 'river';
  return { type: 'accept', requestId: request.id, design, ...(intention ? { intention } : {}) };
}
function delivered() {
  let state = step(fresh(), commandFor(fresh(), 'clem-room'));
  for (let n = 0; n < 3 && !creativePromise(state, 'clem'); n++) state = step(state, { type: 'runDay' });
  expect(creativePromise(state, 'clem')).not.toBeNull();
  return state;
}
function finish(state: CompanyState) {
  while (!state.finished) state = quietDay(state);
  return state;
}
function quietDay(state: CompanyState) {
  for (const request of state.requests.filter(r => r.day === state.day && r.status === 'waiting')) state = step(state, { type: 'decline', requestId: request.id });
  return step(state, { type: 'runDay' });
}
function injected(castId: string, source: Request['source'] = 'walkin', launches = 1) {
  const state = fresh();
  const request: Request = { id: 'ordinary-test', day: 0, index: 0, castId, segment: CAST_BY_ID[castId]!.segment, need: 'simple', wtpPercent: 100, lineIndex: 0, status: 'waiting', source, offer: { ...PRESETS.bespoke, launches } };
  state.requests = [request];
  return { state, request };
}
function returning() {
  let state = step(fresh(), commandFor(fresh(), 'clem-room'));
  while (state.day < 6) state = quietDay(state);
  const command = { ...commandFor(state, 'clem-band'), type: 'reserve' as const, startsInDays: 1 as const };
  expect(command.requestId).toBe('d6-r4');
  expect(reservationBlocked(state, command.requestId, command.startsInDays)).toBeNull();
  return { state, command };
}

describe('the first ordinary creative promise', () => {
  it.each(['clem', 'mara', 'hugo', 'ivo'])('%s has a semantic brief and explicit intentions without commission identity', castId => {
    const { state, request } = injected(castId);
    const brief = ordinaryBrief(request, request.offer!)!;
    expect(brief).not.toHaveProperty('projectId');
    expect(brief).not.toHaveProperty('approach');
    expect(brief.intention).toBe(CAST_BY_ID[castId]!.lines[0]);
    expect(brief.pieces[0]!.copy.some(c => c.text === CAST_BY_ID[castId]!.business)).toBe(true);
    for (const intention of ordinaryIntentions(castId)) {
      const accepted = step(state, { type: 'accept', requestId: request.id, design: brief.defaultDesign, intention: intention.id });
      expect(accepted.contracts[0]).toMatchObject({ intention: intention.id, proof: { design: brief.defaultDesign, extras: [{ materials: 0, finishMinutes: 0 }] } });
      expect(accepted.contracts[0]).not.toHaveProperty('project');
    }
  });

  it.each(['ordinary-a', 'ordinary-b', 'ordinary-c'])('leaves economics, effort, risk, forecasts and delivery unchanged (%s)', seed => {
    const start = createRun({ ...config, seed }, CREATIVE_PROMISE_RULES_VERSION);
    const authored = commandFor(start, 'clem-band');
    let withProof = step(start, authored);
    let automatic = step(start, { type: 'accept', requestId: authored.requestId });
    for (let day = 0; day < 4; day++) {
      expect(withProof.jobs).toEqual(automatic.jobs);
      expect(withProof.events).toEqual(automatic.events);
      expect(withProof.journal).toEqual(automatic.journal);
      expect(withProof.rep).toEqual(automatic.rep);
      expect(withProof.relationshipMemory).toEqual(automatic.relationshipMemory);
      expect(summarize(withProof)).toEqual(summarize(automatic));
      expect(dayPlan(withProof)).toEqual(dayPlan(automatic));
      expect(forecast(withProof)).toEqual(forecast(automatic));
      withProof = step(withProof, { type: 'runDay' });
      automatic = step(automatic, { type: 'runDay' });
    }
  });

  it('freezes the exact command, approved artwork and required copy independently of the caller', () => {
    const start = fresh();
    const command = commandFor(start, 'clem-room');
    const accepted = step(start, command);
    const frozen = structuredClone(accepted);
    const proof = contractProof(accepted.contracts[0]!)!;
    expect(proof.design).toEqual(command.design);
    command.design!.pieces[0]!.headline = 'Changed later';
    command.design!.pieces[0]!.motifs[0]!.x = 1;
    command.intention = 'clem-band';
    expect(accepted).toEqual(frozen);
    const reconstructed = replay(config, JSON.parse(JSON.stringify(accepted.commands)), CREATIVE_PROMISE_RULES_VERSION);
    expect(reconstructed).toEqual({ state: accepted, errors: [] });
    const undone = replay(config, accepted.commands.slice(0, -1), CREATIVE_PROMISE_RULES_VERSION).state;
    expect(undone).toEqual(start);
    expect(step(undone, frozen.commands[0]!)).toEqual(accepted);
  });

  it.each([
    ['missing copy', (d: DesignSpec) => { d.pieces[0]!.copy = []; }],
    ['wrong motif', (d: DesignSpec) => { d.pieces[0]!.motifs[0]!.id = 'loaf'; }],
    ['wrong artifact', (d: DesignSpec) => { d.pieces[0]!.kind = 'card'; }],
    ['extra piece', (d: DesignSpec) => { d.pieces.push(structuredClone(d.pieces[0]!)); }],
    ['paid ink', (d: DesignSpec) => { d.pieces[0]!.treatment = 'third-ink'; }],
    ['paid border', (d: DesignSpec) => { d.pieces[0]!.treatment = 'hand-border'; }],
  ] as const)('rejects %s without altering the state', (_label, mutate) => {
    const start = fresh();
    const command = commandFor(start);
    mutate(command.design!);
    const result = applyCommand(start, command);
    expect(result.error).toBeTruthy();
    expect(result.state).toBe(start);
  });

  it('rejects other customers, multi-launch offers, special sources and mismatched intentions', () => {
    const design = commandFor(fresh()).design!;
    for (const [castId, source, launches] of [['finn', 'walkin', 1], ['clem', 'walkin', 2], ['clem', 'news', 1], ['clem', 'amends', 1], ['clem', 'project', 1]] as const) {
      const { state, request } = injected(castId, source, launches);
      expect(ordinaryBrief(request, request.offer!)).toBeNull();
      const result = applyCommand(state, { type: 'accept', requestId: request.id, design });
      expect(result.error).toContain('single-launch ordinary');
      expect(result.state).toBe(state);
      expect(applyCommand(state, { type: 'accept', requestId: request.id }).error).toBeUndefined();
    }
    const start = fresh();
    const wrong = { ...commandFor(start), intention: 'mara-regulars' as const };
    expect(applyCommand(start, wrong)).toEqual({ state: start, error: expect.stringContaining('intention') });
    expect(applyCommand(start, { type: 'accept', requestId: wrong.requestId, intention: 'clem-room' })).toEqual({ state: start, error: expect.stringContaining('intention') });
    const forged = { type: 'accept' as const, requestId: wrong.requestId, proof: { design, extras: [] } };
    expect(applyCommand(start, forged)).toEqual({ state: start, error: expect.stringContaining('not an approved proof') });
    expect(ordinaryIntentions('__proto__')).toEqual([]);
  });

  it.each([AUTHORSHIP_RULES_VERSION, STUDIO_RULES_VERSION, LEGACY_RULES_VERSION])('%s refuses new fields and keeps the original acceptance', version => {
    const start = createRun(config, version);
    const requestId = start.requests[0]!.id;
    const design = commandFor(fresh()).design;
    for (const fields of [{ design }, { intention: 'clem-room' as const }]) {
      for (const command of [{ type: 'accept', requestId, ...fields }, { type: 'reserve', requestId, startsInDays: 1, ...fields }] as const) {
        expect(applyCommand(start, command)).toEqual({ state: start, error: expect.stringContaining('original ordinary artwork') });
      }
    }
    expect(creativePromise(start, 'clem')).toBeNull();
  });

  it('recognises only a completed ordinary proof at the displayed minute', () => {
    const accepted = step(fresh(), commandFor(fresh(), 'clem-room'));
    expect(creativePromise(accepted, 'clem')).toBeNull();
    const state = delivered();
    const promise = creativePromise(state, 'clem')!;
    expect(promise).toMatchObject({ castId: 'clem', sourceSeason: 1, intention: 'clem-room', design: { headline: 'A seat near the music', palette: 'river' } });
    expect(creativePromise(state, 'clem', promise.deliveredAt - 1)).toBeNull();
    expect(creativePromise(state, 'clem', promise.deliveredAt)).toEqual(promise);
    for (const status of ['missed', 'refunded', 'active'] as const) {
      const changed = structuredClone(state);
      changed.jobs.find(j => j.id === promise.jobId)!.status = status;
      expect(creativePromise(changed, 'clem')).toBeNull();
    }
    const automatic = step(fresh(), { type: 'accept', requestId: commandFor(fresh()).requestId });
    expect(creativePromise(finish(automatic), 'clem')).toBeNull();
    promise.design.palette = 'poppy';
    expect(creativePromise(state, 'clem')!.design.palette).toBe('river');
    state.lostCast.push('clem');
    expect(creativePromise(state, 'clem')).not.toBeNull();
    expect(state.lostCast).toContain('clem');
  });

  it('uses the existing earned invitation and freezes its source when the milestone is booked', () => {
    let state = delivered();
    while (state.day < 2) state = step(state, { type: 'runDay' });
    expect(ordinaryOrdersDelivered(state, 'clem')).toBe(1);
    expect(projectBlocked(state, 'clem-ten', 'new-band')).toBeNull();
    const promise = creativePromise(state, 'clem')!;
    state = step(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design: projectBrief(state, 'clem-ten', 'new-band').defaultDesign });
    const milestone = state.contracts.find(c => c.project)!;
    expect(milestone.project!.creativePromise).toEqual(promise);
    expect(contractProof(milestone)).toBe(milestone.project!.proof);
    // A later authored delivery cannot replace the booked source.
    const original = state.requests.find(r => r.id === promise.requestId)!;
    const later: Request = { ...original, id: 'later-clem', day: state.day, status: 'waiting', contractId: undefined };
    state.requests.push(later);
    const design = ordinaryBrief(later, PRESETS.bespoke)!.defaultDesign;
    design.pieces[0]!.palette = 'poppy';
    state = step(state, { type: 'accept', requestId: later.id, design, intention: 'clem-band' });
    state = finish(state);
    expect(creativePromise(state, 'clem')).toEqual(promise);
    expect(state.contracts.find(c => c.id === milestone.id)!.project!.creativePromise).toEqual(promise);
  });
});

describe('ordinary proofs reserved for a later start', () => {
  it('freezes, delivers and replays the returning customer’s artwork without changing the reservation terms', () => {
    const { state, command } = returning();
    let authored = step(state, command);
    let automatic = step(state, { type: 'reserve', requestId: command.requestId, startsInDays: command.startsInDays });
    const frozen = structuredClone(authored);
    const contract = authored.contracts.at(-1)!;
    expect(contract).toMatchObject({ requestId: command.requestId, reserved: true, intention: 'clem-band', proof: { design: command.design } });
    expect(contract.offer.startsInDays).toBe(1);
    expect(authored.jobs.at(-1)!.releaseDay).toBe(7);
    command.design!.pieces[0]!.headline = 'Changed after booking';
    command.design!.pieces[0]!.motifs[0]!.x = 1;
    command.intention = 'clem-room';
    expect(authored).toEqual(frozen);
    expect(replay(config, JSON.parse(JSON.stringify(authored.commands)), CREATIVE_PROMISE_RULES_VERSION)).toEqual({ state: authored, errors: [] });
    const undone = replay(config, authored.commands.slice(0, -1), CREATIVE_PROMISE_RULES_VERSION).state;
    expect(undone).toEqual(state);
    expect(step(undone, frozen.commands.at(-1)!)).toEqual(authored);
    while (!authored.finished) {
      expect(authored.jobs).toEqual(automatic.jobs);
      expect(authored.journal).toEqual(automatic.journal);
      expect(authored.relationshipMemory).toEqual(automatic.relationshipMemory);
      expect(summarize(authored)).toEqual(summarize(automatic));
      authored = quietDay(authored);
      automatic = quietDay(automatic);
    }
    const piece = deliveredPieces(authored).find(p => p.sourceJobId === contract.jobIds[0])!;
    expect(piece).toMatchObject({ source: { kind: 'ordinary', requestId: contract.requestId, intention: 'clem-band' }, design: frozen.contracts.at(-1)!.proof!.design.pieces[0] });
    expect(buildContinuation(authored, [piece.id]).continuation!.pieces[0]!.design).toEqual(piece.design);
  });

  it('rejects malformed artwork, injected proofs and mismatched or unsupported intentions without accepting the reservation', () => {
    const { state, command } = returning();
    const noCopy = structuredClone(command.design!);
    noCopy.pieces[0]!.copy = [];
    const paidInk = structuredClone(command.design!);
    paidInk.pieces[0]!.treatment = 'third-ink';
    for (const invalid of [
      { ...command, design: noCopy },
      { ...command, design: paidInk },
      { ...command, intention: 'mara-regulars' as const },
      { ...command, design: undefined },
      { ...command, proof: { extras: [] } },
    ]) {
      const result = applyCommand(state, invalid);
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(state);
    }
  });

  it('keeps reservation eligibility and ordinary artwork source limits independent', () => {
    const { state, command } = returning();
    for (const change of ['street news', 'multiple launches'] as const) {
      const unsupported = structuredClone(state);
      if (change === 'street news') unsupported.requests.find(r => r.id === command.requestId)!.source = 'news';
      else unsupported.menu = [{ ...PRESETS.bespoke, launches: 2, spacingDays: 1, turnaroundDays: 1, price: 100 }];
      expect(reservationBlocked(unsupported, command.requestId, 1)).toBeNull();
      expect(applyCommand(unsupported, command)).toEqual({ state: unsupported, error: expect.stringContaining('single-launch ordinary') });
      expect(applyCommand(unsupported, { type: 'reserve', requestId: command.requestId, startsInDays: 1 }).error).toBeUndefined();
    }
    const lost = structuredClone(state);
    lost.lostCast.push('clem');
    expect(applyCommand(lost, command)).toEqual({ state: lost, error: expect.stringContaining('regulars') });
    const fixed = structuredClone(state);
    fixed.requests.find(r => r.id === command.requestId)!.offer = PRESETS.bespoke;
    expect(applyCommand(fixed, command)).toEqual({ state: fixed, error: expect.stringContaining('ordinary waiting') });
  });
});

describe('ordinary artwork carried between seasons', () => {
  it('upgrades a v1 continuation into honest v2 project sources without changing the old config', () => {
    const tape = legacy.tapes.find(t => t.id === 'continuing-pattern-studio')!;
    const config = structuredClone(tape.config) as RunConfig;
    const before = structuredClone(config);
    const state = finish(createRun(config, CREATIVE_PROMISE_RULES_VERSION));
    const next = buildContinuation(state, ['carried-1']);
    expect(config).toEqual(before);
    expect(config.continuation!.version).toBe(1);
    expect(next.continuation).toMatchObject({ version: 2, pieces: [{ source: { kind: 'project', projectId: 'clem-ten', approach: 'first-night' } }] });
    expect(next.continuation!.pieces[0]).not.toHaveProperty('projectId');
    expect(next.continuation!.pieces[0]!.design).toEqual(config.continuation!.pieces[0]!.design);
  });
  it('offers delivered ordinary prints as paid pattern sources without ordinary production discounts', () => {
    let state = delivered();
    const source = deliveredPieces(state)[0]!;
    expect(source.source).toMatchObject({ kind: 'ordinary', intention: 'clem-room' });
    const cash = state.cash;
    state = step(state, { type: 'preparePattern', sourceId: source.id });
    expect(state.cash).toBe(cash - 50);
    state = step(state, { type: 'runDay' });
    expect(state.patterns![0]).toMatchObject({ status: 'ready', remaining: 0 });
    const job = { ...state.jobs[0]!, stage: 'brief' as const };
    const tomas = state.resources.find(r => r.id === 'h2')!;
    expect(patternReduction(state, job, tomas, state.day)).toBe(0);
    const finished = finish(state);
    const next = buildContinuation(finished, [source.id], 'ordinary-next');
    expect(next.continuation).toMatchObject({ version: 2, pieces: [{ source: { kind: 'ordinary', requestId: state.contracts[0]!.requestId }, design: source.design }], patterns: [{ status: 'ready' }] });
    const remembered = next.continuation!.relationships.find(r => r.castId === 'clem')!.creativePromise;
    expect(remembered).toEqual(creativePromise(finished, 'clem'));
    const start = createRun(JSON.parse(JSON.stringify(next)), CREATIVE_PROMISE_RULES_VERSION);
    expect(start.contracts).toEqual([]);
    expect(creativePromise(start, 'clem')).toBeNull();
    expect(start.config.continuation!.relationships.find(r => r.castId === 'clem')!.creativePromise).toEqual(remembered);
    expect(start.patterns![0]!.piece).toEqual(source.design);
    expect(buildContinuation(finished, []).continuation!.relationships.find(r => r.castId === 'clem')!.creativePromise).toEqual(remembered);
    expect(replay(next, [{ type: 'runDay' }], CREATIVE_PROMISE_RULES_VERSION)).toEqual({ state: step(start, { type: 'runDay' }), errors: [] });
    let ready = quietDay(quietDay(start));
    ready = step(ready, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', design: projectBrief(ready, 'clem-ten', 'first-night').defaultDesign });
    expect(ready.contracts[0]!.project!.creativePromise).toEqual(remembered);
    const third = buildContinuation(finish(start), ['carried-1'], 'ordinary-third');
    expect(third.continuation!.pieces[0]!.sourceSeason).toBe(1);
    expect(third.continuation!.relationships.find(r => r.castId === 'clem')!.creativePromise).toEqual(remembered);
  });

  it('rejects v2 on old rules and validates the source, intention and remembered artwork', () => {
    const state = finish(delivered());
    const source = deliveredPieces(state)[0]!;
    const config = buildContinuation(state, [source.id]);
    expect(() => createRun(config, AUTHORSHIP_RULES_VERSION)).toThrow('requires creative promise rules');
    for (const version of [STUDIO_RULES_VERSION, LEGACY_RULES_VERSION]) expect(() => createRun(config, version)).toThrow('require authored');
    const snapshot = config.continuation!;
    expect(snapshot.version).toBe(2);
    if (snapshot.version !== 2) throw new Error('Expected current snapshot.');
    const wrongIntention = structuredClone(snapshot);
    wrongIntention.pieces[0]!.source = { kind: 'ordinary', requestId: 'first', intention: 'mara-newcomers' };
    expect(() => validateContinuation(wrongIntention)).toThrow('source or intention');
    const forged = structuredClone(snapshot);
    forged.relationships.find(r => r.castId === 'clem')!.creativePromise!.castId = 'mara';
    expect(() => validateContinuation(forged)).toThrow('remembered creative promise');
    const missingCopy = structuredClone(snapshot);
    missingCopy.relationships.find(r => r.castId === 'clem')!.creativePromise!.design.copy = [];
    expect(() => validateContinuation(missingCopy)).toThrow('remembered creative promise');
    const emptyCopy = structuredClone(snapshot);
    emptyCopy.pieces[0]!.design.copy = [];
    emptyCopy.pieces[0]!.copy = [];
    expect(() => validateContinuation(emptyCopy)).toThrow('source or intention');
    const paid = structuredClone(snapshot);
    paid.pieces[0]!.design.treatment = 'third-ink';
    expect(() => validateContinuation(paid)).toThrow('source or intention');
    const wrongProject = structuredClone(snapshot);
    wrongProject.pieces[0]!.source = { kind: 'project', projectId: 'mara-regular', approach: 'first-night' };
    expect(() => validateContinuation(wrongProject)).toThrow('source or intention');
    expect(() => validateContinuation({ ...snapshot, version: 1 })).toThrow('malformed');
    expect(snapshot.season).toBe(2);
    expect(snapshot.relationships.find(r => r.castId === 'clem')!.ordinaryDelivered).toBe(1);
    expect(snapshot.relationships.find(r => r.castId === 'clem')!.creativePromise!.deliveredAt).toBeLessThanOrEqual(RULES.days * RULES.minutesPerDay);
  });
});
