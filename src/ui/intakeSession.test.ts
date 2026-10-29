import { afterEach, expect, it, vi } from 'vitest';
import { PRESETS } from '../engine/rules';
import { LEGACY_RULES_VERSION } from '../engine/versions';
import { applyCommand, replay } from '../engine/sim';
import type { Command } from '../engine/types';
import { regularLoss } from './game/eveningFacts';
import { newsOrder } from './game/orderIntake';
import ordinary from './game/fixtures/ordinary-order-intake.json';
import { loadRuns, restore, trySaveRun } from './persist';
import { MAX_COMMANDS, shareSchema, type SavedRun } from './schema';

afterEach(() => vi.unstubAllGlobals());

it('keeps separate-order intake and its evening exact across a long local save', () => {
  const tape = shareSchema.parse(ordinary);
  const edits: Command[] = Array.from({ length: MAX_COMMANDS + 2 }, () => ({ type: 'setMenu', offers: [PRESETS.bespoke] }));
  const commands = [...edits, ...tape.commands.slice(0, 28)];
  const native = replay(tape.config, commands, LEGACY_RULES_VERSION);
  expect(native.errors).toEqual([]);
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
  const save: SavedRun = { v: 1, rules: LEGACY_RULES_VERSION, id: 'long-intake', label: 'Long intake session', savedAt: '2026-10-23T00:00:00Z', config: tape.config, commands };
  expect(trySaveRun(save)).toBe('saved');
  expect(loadRuns()).toEqual([save]);
  let state = restore(loadRuns()[0]!)!;
  expect(state).toEqual(native.state);
  const before = structuredClone(state);
  const news = state.news.find(n => n.day === 5)!;
  expect(newsOrder(state, news, 1)?.status).toBe('taken at the window');
  expect(newsOrder(state, news, 1)?.remaining).toContain('Leave that order unanswered and Clem will not return.');
  expect(state).toEqual(before);
  for (const command of tape.commands.slice(28, 32)) {
    const next = applyCommand(state, command);
    expect(next.error).toBeUndefined();
    state = next.state;
  }
  expect(state).toEqual(replay(tape.config, [...edits, ...tape.commands.slice(0, 32)], LEGACY_RULES_VERSION).state);
  expect(regularLoss(state, 5)).toContain('You took Ten years of Clem for Clem, but left another order waiting when you opened.');
  expect(trySaveRun({ ...save, commands: state.commands })).toBe('saved');
  expect(loadRuns()).toHaveLength(1);
  expect(restore(loadRuns()[0]!)).toEqual(state);
});
