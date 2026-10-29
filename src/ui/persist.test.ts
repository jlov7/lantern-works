import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../engine/rules';
import { replay } from '../engine/sim';
import { deleteRun, loadRuns, restore, trySaveRun } from './persist';
import type { SavedRun } from './schema';

const KEY = 'lantern.runs.v1';
const run = (n: number): SavedRun => ({
  v: 1, rules: RULES.version, id: `history-${n}`, label: `History ${n}`, savedAt: '2026-10-28T00:00:00Z',
  config: { scenarioId: 'main-street', seed: `history-${n}` }, commands: [{ type: 'pace', pace: 'careful' }],
});

describe('lossless save history', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps and reopens every distinct history across the twenty-first save and later updates', () => {
    const histories = Array.from({ length: 25 }, (_, n) => run(n));
    for (const history of histories) expect(trySaveRun(history)).toBe('saved');
    expect(loadRuns()).toHaveLength(25);
    for (const history of histories) {
      const saved = loadRuns().find(item => item.id === history.id)!;
      expect(saved).toEqual(history);
      expect(restore(saved)).toEqual(replay(history.config, history.commands, history.rules).state);
    }
    expect(trySaveRun({ ...histories[0]!, commands: [] })).toBe('saved');
    expect(loadRuns()).toHaveLength(25);
    expect(loadRuns()[0]!.commands).toEqual([]);
  });

  it('preserves all histories and raw unsupported records when a write exceeds quota', () => {
    const histories = Array.from({ length: 21 }, (_, n) => run(n));
    const unsupported = [{ ...run(30), rules: 'future-rules', extra: { kept: true } }, { unreadable: true }, null];
    const before = JSON.stringify([...histories, ...unsupported]);
    store.set(KEY, before);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    });
    expect(trySaveRun(run(21))).toBe('unavailable');
    expect(deleteRun(histories[0]!.id)).toBe(false);
    expect(store.get(KEY)).toBe(before);
  });

  it('observes an unchanged saved season without rewriting it and allows its first Undo after reload', () => {
    const original = run(101);
    const raw = JSON.stringify([original, { unreadable: true }], null, 2);
    store.set(KEY, raw);
    expect(trySaveRun({ ...original, savedAt: '2026-10-29T00:00:00Z' })).toBe('saved');
    expect(store.get(KEY)).toBe(raw);
    expect(trySaveRun({ ...original, commands: [] })).toBe('saved');
    expect(loadRuns()[0]!.commands).toEqual([]);
  });

  it('rejects Undo after another tab changes an observed saved season', () => {
    const original = run(102);
    store.set(KEY, JSON.stringify([original]));
    expect(trySaveRun({ ...original, savedAt: '2026-10-29T00:00:00Z' })).toBe('saved');
    const changed = { ...original, commands: [...original.commands, { type: 'pace' as const, pace: 'steady' as const }] };
    const raw = JSON.stringify([changed]);
    store.set(KEY, raw);
    expect(trySaveRun({ ...original, commands: [] })).toBe('stale');
    expect(store.get(KEY)).toBe(raw);
  });

  it.each(['{broken', '{"futureEnvelope":[]}', 'null'])('does not replace an unreadable save collection: %s', raw => {
    store.set(KEY, raw);
    expect(trySaveRun(run(0))).toBe('unavailable');
    expect(deleteRun('history-0')).toBe(false);
    expect(store.get(KEY)).toBe(raw);
  });

  it('does not replace existing saves when storage reads fail', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: vi.fn(),
    });
    expect(trySaveRun(run(0))).toBe('unavailable');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not delete work saved in another tab while deletion waits for Undo', () => {
    const before = run(0);
    const next = { ...before, commands: [...before.commands, { type: 'pace' as const, pace: 'steady' as const }] };
    store.set(KEY, JSON.stringify([next, run(1)]));
    expect(deleteRun(before.id, before)).toBe(false);
    expect(loadRuns()).toEqual([next, run(1)]);
  });

  it('reports a retained season as saved even if the optional current-season pointer cannot be written', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key !== KEY) throw new DOMException('full', 'QuotaExceededError');
        store.set(key, value);
      },
    });
    expect(trySaveRun(run(0))).toBe('saved');
    expect(loadRuns()).toEqual([run(0)]);
    expect(trySaveRun({ ...run(0), commands: [] })).toBe('saved');
  });
});
