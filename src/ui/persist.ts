// Local saves and share links. Saves are a config plus the command log; replay rebuilds the rest.
import { RULES, SCENARIOS } from '../engine/rules';
import { replay } from '../engine/sim';
import { supportsRulesVersion } from '../engine/versions';
import type { Command, CompanyState, RunConfig } from '../engine/types';
import { MAX_COMMANDS, savedRunSchema, shareSchema, type SavedRun, type SharePayload } from './schema';

const KEY_RUNS = 'lantern.runs.v1';
const KEY_CURRENT = 'lantern.current.v1';
const KEY_STAMPS = 'lantern.stamps.v1';
const KEY_PREFS = 'lantern.prefs.v1';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Splits the stored list into saves this build can play and everything else. Saves from other rules
 * versions, or ones this build cannot read (invalid commands, unknown fields), keep their original fields so a
 * later build, or the player, can still recover them. They are never silently dropped.
 */
function readRuns(): { runs: SavedRun[]; kept: unknown[]; readable: boolean; duplicates?: boolean } {
  let raw: unknown;
  try {
    const value = localStorage.getItem(KEY_RUNS);
    raw = value === null ? [] : JSON.parse(value);
  } catch {
    return { runs: [], kept: [], readable: false };
  }
  if (!Array.isArray(raw)) return { runs: [], kept: [], readable: false };
  const runs: SavedRun[] = [];
  const kept: unknown[] = [];
  for (const r of raw) {
    const p = savedRunSchema.safeParse(r);
    if (p.success && supportsRulesVersion(p.data.rules)) {
      // Saves are newest first. Older builds retained duplicate copies once a log exceeded the share limit.
      if (!runs.some((run) => run.id === p.data.id)) runs.push(p.data);
    } else kept.push(r);
  }
  return { runs, kept, readable: true, duplicates: raw.length > runs.length + kept.length };
}

function writeRuns(runs: SavedRun[], kept: unknown[]): boolean {
  return write(KEY_RUNS, [...runs, ...kept]);
}

export function loadRuns(): SavedRun[] {
  return readRuns().runs;
}

/** The command log this tab last wrote or saw in storage, per run id. Lets saveRun spot another tab's newer save. */
const lastSeen = new Map<string, string>();

const isPrefix = (a: SavedRun['commands'], b: SavedRun['commands']): boolean => a.length <= b.length && JSON.stringify(a) === JSON.stringify(b.slice(0, a.length));

export type SaveResult = 'saved' | 'stale' | 'unavailable';

/**
 * Saves a run unless that would lose work. 'stale' means another tab has saved a different history for
 * this run since this tab last saw it (for example, more days played); the stored save is left alone.
 * Extending the stored history, or overwriting what this tab itself last wrote (undo), is always allowed.
 * 'unavailable' means storage is blocked or full; the game keeps working unsaved.
 */
export function trySaveRun(run: SavedRun): SaveResult {
  // The reader normalizes nested object key order. Compare and write that same representation.
  const parsed = savedRunSchema.safeParse(run);
  if (!parsed.success) return 'unavailable';
  run = parsed.data;
  const { runs, kept, readable, duplicates } = readRuns();
  if (!readable) return 'unavailable';
  const stored = runs.find((r) => r.id === run.id);
  if (stored && JSON.stringify([stored.rules, stored.config]) !== JSON.stringify([run.rules, run.config])) return 'stale';
  // Opening an unchanged season observes it for Undo without rewriting its timestamp or raw history.
  if (!duplicates && stored && JSON.stringify({ ...stored, savedAt: run.savedAt }) === JSON.stringify(run)) {
    lastSeen.set(run.id, JSON.stringify(stored.commands));
    write(KEY_CURRENT, run.id);
    return 'saved';
  }
  if (stored && lastSeen.get(run.id) !== JSON.stringify(stored.commands) && !isPrefix(stored.commands, run.commands)) return 'stale';
  const ok = writeRuns([run, ...runs.filter((r) => r.id !== run.id)], kept);
  if (ok) {
    lastSeen.set(run.id, JSON.stringify(run.commands));
    // The run itself is saved even if this optional navigation hint hits the quota.
    write(KEY_CURRENT, run.id);
  }
  return ok ? 'saved' : 'unavailable';
}

/** True only when the run is now in storage; false when storage failed or a newer save from another tab won. */
export function saveRun(run: SavedRun): boolean {
  return trySaveRun(run) === 'saved';
}

/** A delayed delete can supply its original tape so it cannot remove another tab's newer work. */
export function deleteRun(id: string, expected?: SavedRun): boolean {
  const { runs, kept, readable } = readRuns();
  if (!readable) return false;
  const stored = runs.find(run => run.id === id);
  if (stored && expected && JSON.stringify([stored.rules, stored.config, stored.commands]) !== JSON.stringify([expected.rules, expected.config, expected.commands])) return false;
  const ok = writeRuns(
    runs.filter((r) => r.id !== id),
    kept,
  );
  if (ok) lastSeen.delete(id);
  return ok;
}

/** Calls back when another tab changes the saved runs. Returns an unsubscribe function. */
export function subscribeRuns(onChange: (runs: SavedRun[]) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === KEY_RUNS || e.key === null) onChange(loadRuns());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function currentRunId(): string | null {
  const v = read(KEY_CURRENT);
  return typeof v === 'string' ? v : null;
}

export function restore(run: Pick<SavedRun, 'config' | 'commands'> & Partial<Pick<SavedRun, 'rules'>>): CompanyState | null {
  if (!SCENARIOS.some((s) => s.id === run.config.scenarioId)) return null;
  const rules = run.rules ?? RULES.version;
  if (!supportsRulesVersion(rules)) return null;
  try {
    const { state, errors } = replay(run.config, run.commands, rules);
    return errors.length ? null : state;
  } catch {
    return null;
  }
}

export function loadStamps(): string[] {
  const v = read(KEY_STAMPS);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
}

export function addStamps(ids: string[]): string[] {
  const have = loadStamps();
  const fresh = ids.filter((id) => !have.includes(id));
  if (fresh.length) write(KEY_STAMPS, [...have, ...fresh]);
  return fresh;
}

/** Player settings; the same shape as SettingsDialog's SettingsPrefs (kept here so scripts can read it without JSX). */
export interface Prefs {
  speed: 0.5 | 1 | 2 | 4;
  sound: boolean;
  motion: 'system' | 'reduce' | 'full';
  studioView?: 'miniature' | 'illustrated';
}

/** Fired on window whenever the settings are saved, so open screens can follow them. */
export const PREFS_EVENT = 'lantern:prefs';

/** Reads settings, including the older { speed: 1 | 3, sound } shape (3x becomes the nearest new speed, 4x). */
export function loadPrefs(): Prefs {
  const v = read(KEY_PREFS) as { speed?: unknown; sound?: unknown; motion?: unknown; studioView?: unknown } | null;
  const speed = v?.speed === 3 ? 4 : v?.speed === 0.5 || v?.speed === 2 || v?.speed === 4 ? v.speed : 1;
  const motion = v?.motion === 'reduce' || v?.motion === 'full' ? v.motion : 'system';
  return { speed, sound: v?.sound === true, motion, ...(v?.studioView === 'miniature' || v?.studioView === 'illustrated' ? { studioView: v.studioView } : {}) };
}

export function savePrefs(p: Prefs): void {
  write(KEY_PREFS, p);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PREFS_EVENT));
}

// Share links: base64url(deflate-raw(JSON)). Bounded before and after decompression.
const MAX_ENCODED = 12_000;
const MAX_JSON = 96_000;

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function encodeShare(config: RunConfig, commands: Command[], name?: string, rulesVersion: string = RULES.version): Promise<string> {
  if (!supportsRulesVersion(rulesVersion)) throw new Error('This season uses unsupported rules.');
  if (commands.length > MAX_COMMANDS) throw new Error('This season is too long for a replay link.');
  const payload: SharePayload = { v: 1, rules: rulesVersion, config, commands, ...(name ? { name } : {}) };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (json.length > MAX_JSON) throw new Error('This season is too long for a replay link.');
  const encoded = toB64url(await pipe(json, new CompressionStream('deflate-raw'), MAX_JSON));
  if (encoded.length > MAX_ENCODED) throw new Error('This season is too long for a replay link.');
  return encoded;
}

export type DecodedShare = { ok: true; payload: SharePayload; state: CompanyState } | { ok: false; reason: string };

export async function decodeShare(encoded: string): Promise<DecodedShare> {
  if (encoded.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded)) return { ok: false, reason: 'This link is damaged or too long.' };
  let parsed: unknown;
  try {
    const bytes = await pipe(fromB64url(encoded), new DecompressionStream('deflate-raw'), MAX_JSON);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, reason: 'This link is damaged or too long.' };
  }
  const p = shareSchema.safeParse(parsed);
  if (!p.success) return { ok: false, reason: 'This link does not describe a Lantern Works season.' };
  if (!supportsRulesVersion(p.data.rules)) return { ok: false, reason: `This link was made with rules ${p.data.rules}; this build uses ${RULES.version}.` };
  const state = restore(p.data);
  if (!state) return { ok: false, reason: 'The moves in this link do not replay on this street.' };
  return { ok: true, payload: p.data, state };
}

export function newRunId(): string {
  return `run-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
}

/** Today's street: same scenario and seed for everyone on a given local date. */
export function dailyConfig(date = new Date()): { config: RunConfig; label: string } {
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const scenario = SCENARIOS[dayNumber % SCENARIOS.length]!;
  return { config: { scenarioId: scenario.id, seed: `daily-${ymd}` }, label: `${scenario.name}, ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` };
}
