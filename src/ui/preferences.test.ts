import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadPrefs, savePrefs, type Prefs } from './persist';

const KEY = 'lantern.prefs.v1';
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps automatic studio selection through unrelated sound, motion and speed saves', () => {
  expect(loadPrefs()).toEqual({ speed: 1, sound: false, motion: 'system' });
  store.set(KEY, JSON.stringify({ speed: .5, sound: false, motion: 'full' }));
  expect(loadPrefs()).not.toHaveProperty('studioView');
  const changes: Partial<Prefs>[] = [{ sound: true }, { motion: 'reduce' }, { speed: 2 }];
  for (const change of changes) {
    savePrefs({ ...loadPrefs(), ...change });
    expect(JSON.parse(store.get(KEY)!)).not.toHaveProperty('studioView');
    expect(loadPrefs()).not.toHaveProperty('studioView');
  }
  expect(loadPrefs()).toEqual({ speed: 2, sound: true, motion: 'reduce' });
});

it.each(['miniature', 'illustrated'] as const)('preserves an existing saved %s value through other edits', studioView => {
  store.set(KEY, JSON.stringify({ speed: 3, sound: false, studioView }));
  expect(loadPrefs()).toEqual({ speed: 4, sound: false, motion: 'system', studioView });
  savePrefs({ ...loadPrefs(), sound: true });
  expect(loadPrefs().studioView).toBe(studioView);
});
