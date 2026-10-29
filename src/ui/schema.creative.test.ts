import { describe, expect, it } from 'vitest';
import { buildContinuation, deliveredPieces } from '../engine/continuation';
import { ordinaryBrief } from '../engine/ordinary';
import { PRESETS } from '../engine/rules';
import { applyCommand, createRun, reactionFor, replay } from '../engine/sim';
import { AUTHORSHIP_RULES_VERSION, CREATIVE_PROMISE_RULES_VERSION, CURRENT_RULES_VERSION } from '../engine/versions';
import { commandSchema, configSchema, savedRunSchema, shareSchema } from './schema';

function sample(version: string = CURRENT_RULES_VERSION) {
  const config = { scenarioId: 'main-street', seed: 'proof-boundary' };
  const start = createRun(config, version);
  const request = start.requests.find(r => r.castId === 'clem')!;
  const design = ordinaryBrief(request, PRESETS.bespoke)!.defaultDesign;
  const command = { type: 'accept' as const, requestId: request.id, design, intention: 'clem-room' as const };
  const state = applyCommand(start, command).state;
  return { config, command, state };
}

describe('ordinary proofs across save and share boundaries', () => {
  it('round-trips the native command and replays the exact accepted artwork', () => {
    const { config, command, state } = sample();
    expect(commandSchema.parse(JSON.parse(JSON.stringify(command)))).toEqual(command);
    const saved = savedRunSchema.parse(JSON.parse(JSON.stringify({ v: 1, rules: CURRENT_RULES_VERSION, id: 'proof-save', label: 'First proof', savedAt: '', config, commands: state.commands })));
    const shared = shareSchema.parse(JSON.parse(JSON.stringify({ v: 1, rules: saved.rules, config: saved.config, commands: saved.commands })));
    expect(replay(shared.config, shared.commands, shared.rules)).toEqual({ state, errors: [] });
    const old = replay(config, [command], AUTHORSHIP_RULES_VERSION);
    expect(old.errors).toEqual([{ index: 0, error: expect.stringContaining('original ordinary artwork') }]);
    expect(old.state.contracts).toEqual([]);
  });

  it('round-trips a reserved proof through saves and shares without losing the composition or intention', () => {
    const config = { scenarioId: 'main-street', seed: 'creative-promises' };
    let state = createRun(config);
    const first = state.requests.find(r => r.castId === 'clem')!;
    state = applyCommand(state, { type: 'accept', requestId: first.id }).state;
    while (state.day < 6) {
      for (const request of state.requests.filter(r => r.day === state.day && r.status === 'waiting')) state = applyCommand(state, { type: 'decline', requestId: request.id }).state;
      state = applyCommand(state, { type: 'runDay' }).state;
    }
    const request = state.requests.find(r => r.id === 'd6-r4')!;
    const reaction = reactionFor(state, request);
    if (reaction.kind !== 'buy') throw new Error('Expected a willing returning customer.');
    const design = ordinaryBrief(request, reaction.offer)!.defaultDesign;
    design.pieces[0]!.headline = 'Room for the late set';
    const command = { type: 'reserve' as const, requestId: request.id, startsInDays: 1 as const, design, intention: 'clem-band' as const };
    const reserved = applyCommand(state, command);
    expect(reserved.error).toBeUndefined();
    const saved = savedRunSchema.parse(JSON.parse(JSON.stringify({ v: 1, rules: CURRENT_RULES_VERSION, id: 'reserve-proof', label: '', savedAt: '', config, commands: reserved.state.commands })));
    const shared = shareSchema.parse(JSON.parse(JSON.stringify({ v: 1, rules: saved.rules, config: saved.config, commands: saved.commands })));
    expect(shared.commands.at(-1)).toEqual(command);
    expect(replay(shared.config, shared.commands, shared.rules)).toEqual({ state: reserved.state, errors: [] });
    const old = replay(config, shared.commands, AUTHORSHIP_RULES_VERSION);
    expect(old.errors).toEqual([{ index: shared.commands.length - 1, error: expect.stringContaining('original ordinary artwork') }]);
    expect(old.state.contracts).toHaveLength(1);
  });

  it.each(['accept', 'reserve'] as const)('%s rejects injected approved facts, unknown intentions and malformed compositions', type => {
    const sampleCommand = sample().command;
    const command = type === 'accept' ? sampleCommand : { ...sampleCommand, type, startsInDays: 1 as const };
    for (const value of [
      { ...command, proof: { extras: [] } },
      { ...command, intention: 'best-art' },
      { ...command, design: { ...command.design, materials: -50 } },
      { ...command, design: { version: 1, pieces: [] } },
      { ...command, design: { ...command.design, pieces: [{ ...command.design.pieces[0], headline: 'x'.repeat(65) }] } },
    ]) expect(commandSchema.safeParse(value).success).toBe(false);
  });

  it.each([CREATIVE_PROMISE_RULES_VERSION, CURRENT_RULES_VERSION])('%s round-trips a carried print and its independent relationship memory', version => {
    let { state } = sample(version);
    while (!state.finished) state = applyCommand(state, { type: 'runDay' }).state;
    const source = deliveredPieces(state)[0]!;
    const config = buildContinuation(state, [source.id], 'proof-next');
    const parsed = configSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(parsed).toEqual(config);
    expect(parsed.continuation).toMatchObject({ version: version === CREATIVE_PROMISE_RULES_VERSION ? 2 : 3, pieces: [{ source: { kind: 'ordinary' } }] });
    const created = createRun(parsed, version);
    expect(created.config.continuation!.relationships.find(r => r.castId === 'clem')!.creativePromise?.design).toEqual(source.design);
    expect(configSchema.safeParse({ ...config, continuation: { ...config.continuation, version: 1 } }).success).toBe(false);
  });
});
