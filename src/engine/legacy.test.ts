// Fixed histories captured at 6c0e0de, before studio rules were introduced. Never regenerate from new policies.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/legacy-4.7.1.json';
import studio from './fixtures/legacy-5.0.0.json';
import authored from './fixtures/legacy-6.0.0.json';
import creative from './fixtures/legacy-6.1.0.json';
import { buildContinuation } from './continuation';
import { applyCommand, createRun, replay } from './sim';
import type { Command, RunConfig } from './types';
import { CURRENT_RULES_VERSION, LEGACY_RULES_VERSION } from './versions';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('original seasons', () => {
  it.each(fixture.tapes)('$id preserves every recorded state through its original rules', tape => {
    let state = createRun(tape.config, LEGACY_RULES_VERSION);
    expect(hash(state)).toBe(tape.states[0]);
    for (const [index, command] of (tape.commands as Command[]).entries()) {
      const result = applyCommand(state, command);
      expect(result.error, `${tape.id}, command ${index}`).toBeUndefined();
      state = result.state;
      expect(hash(state), `${tape.id}, prefix ${index + 1}`).toBe(tape.states[index + 1]);
    }
    expect(replay(tape.config, tape.commands as Command[], LEGACY_RULES_VERSION)).toEqual({ state, errors: [] });
  });

  it('new seasons use current rules and unknown rules are refused', () => {
    const config = fixture.tapes[0]!.config;
    expect(createRun(config).rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(() => createRun(config, 'lantern-unknown')).toThrow('Unsupported rules version');
  });
});

describe('creative-promise seasons captured before careers', () => {
  it('retains the immutable 6.1 capture', () => {
    const contents = readFileSync(new URL('./fixtures/legacy-6.1.0.json', import.meta.url));
    expect(createHash('sha256').update(contents).digest('hex')).toBe('51c057e5b8b00550c6f8d675a50bab445d7e09421e48beddafb23e37678e25c9');
  });
  it.each(creative.tapes)('$id preserves every recorded prefix and continuation', tape => {
    let state = createRun(tape.config as RunConfig, creative.rules);
    expect(hash(state)).toBe(tape.states[0]);
    for (const [index, command] of (tape.commands as Command[]).entries()) {
      const result = applyCommand(state, command);
      expect(result.error, `${tape.id}, command ${index}`).toBeUndefined();
      state = result.state;
      expect(hash(state), `${tape.id}, prefix ${index + 1}`).toBe(tape.states[index + 1]);
    }
    for (const continuation of creative.continuations.filter(c => c.tapeId === tape.id)) expect(hash(buildContinuation(state, continuation.selected, continuation.seed))).toBe(continuation.hash);
  });
});

describe('studio seasons captured before authored proofs', () => {
  it.each(studio.tapes)('$id preserves every recorded command prefix', tape => {
    let state = createRun(tape.config, studio.rules);
    expect(hash(state)).toBe(tape.states[0]);
    for (const [index, command] of (tape.commands as Command[]).entries()) {
      const result = applyCommand(state, command);
      expect(result.error, `${tape.id}, command ${index}`).toBeUndefined();
      state = result.state;
      expect(hash(state), `${tape.id}, prefix ${index + 1}`).toBe(tape.states[index + 1]);
    }
  });
});

// Captured at 47099f1 before ordinary proofs. These hashes must never be regenerated from new rules.
describe('authored seasons captured before creative promises', () => {
  it('retains the immutable baseline capture', () => {
    const contents = readFileSync(new URL('./fixtures/legacy-6.0.0.json', import.meta.url));
    expect(createHash('sha256').update(contents).digest('hex')).toBe('8b8a8192aefccb7cf5307be540ffc2b021274545602231b26a28d61809b96ac5');
  });
  it.each(authored.tapes)('$id preserves every recorded command prefix', tape => {
    const config = tape.config as RunConfig;
    let state = createRun(config, authored.rules);
    expect(hash(state)).toBe(tape.states[0]);
    for (const [index, command] of (tape.commands as Command[]).entries()) {
      const result = applyCommand(state, command);
      expect(result.error, `${tape.id}, command ${index}`).toBeUndefined();
      state = result.state;
      expect(hash(state), `${tape.id}, prefix ${index + 1}`).toBe(tape.states[index + 1]);
    }
    for (const continuation of authored.continuations.filter(c => c.tapeId === tape.id)) {
      expect(hash(buildContinuation(state, continuation.selected, continuation.seed))).toBe(continuation.hash);
    }
  });
});
