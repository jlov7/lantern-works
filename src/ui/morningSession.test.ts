import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { PRESETS, RULES } from '../engine/rules';
import { forecast } from '../engine/selectors';
import { applyCommand, replay } from '../engine/sim';
import type { Command, RunConfig } from '../engine/types';
import { loadRuns, restore, trySaveRun } from './persist';
import { MAX_COMMANDS, type SavedRun } from './schema';

afterEach(() => vi.unstubAllGlobals());

it('keeps the native temp rescue and the next admission exact across a long-history reload', () => {
  const fixture = JSON.parse(readFileSync(new URL('../engine/fixtures/temp-assignment.json', import.meta.url), 'utf8')) as { config: RunConfig; commands: Command[] };
  const edits: Command[] = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({ type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 500 + (i % 2) * 10 }] }));
  const commands = [...edits, ...fixture.commands];
  const native = replay(fixture.config, commands);
  expect(native.errors).toEqual([]);
  expect(forecast(native.state, 'd3-r7')).toEqual({ atRisk: [], newAtRisk: [], newAfterSeason: [], existingAfterSeason: [] });

  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
  const saved: SavedRun = { v: 1, rules: RULES.version, id: 'long-temp', label: 'Long temp rescue', savedAt: '2026-10-23T00:00:00Z', config: fixture.config, commands };
  expect(trySaveRun(saved)).toBe('saved');
  expect(loadRuns()).toEqual([saved]);
  const restored = restore(loadRuns()[0]!);
  expect(restored).toEqual(native.state);

  const taken = applyCommand(restored!, { type: 'accept', requestId: 'd3-r7' });
  expect(taken.error).toBeUndefined();
  expect(trySaveRun({ ...saved, commands: taken.state.commands })).toBe('saved');
  expect(loadRuns()).toHaveLength(1);
  expect(restore(loadRuns()[0]!)).toEqual(taken.state);
});
