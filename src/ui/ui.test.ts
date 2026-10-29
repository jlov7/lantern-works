import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateOffer } from '../engine/demand';
import { GHOSTS, runPolicy } from '../engine/policies';
import { CAST, PRESETS, RULES, SPECIAL_CAST } from '../engine/rules';
import { projectBrief } from '../engine/projects';
import { applyCommand, createRun, replay } from '../engine/sim';
import { buildContinuation } from '../engine/continuation';
import { LEGACY_RULES_VERSION } from '../engine/versions';
import { digest } from '../ai/debrief';
import { compileOfferOffline, legalise } from '../ai/offer';
import { decodeShare, deleteRun, encodeShare, loadRuns, restore, saveRun, trySaveRun } from './persist';
import { MAX_COMMANDS, type SavedRun } from './schema';
import { frameAt } from './timeline';
import { reconstruct } from './resumeReplay';

const CFG = { scenarioId: 'festival-week', seed: 'ui-1' };

describe('share links', () => {
  it('carries a continuing studio’s exact independent starting conditions', async () => {
    const parent = runPolicy(CFG, GHOSTS.hand);
    const config = buildContinuation(parent, [], 'same-studio');
    const before = createRun(config);
    const back = await decodeShare(await encodeShare(config, [], 'Studio challenge'));
    expect(back).toMatchObject({ ok: true, state: before, payload: { config, commands: [] } });
    expect(before.cash).toBe(parent.cash);
    expect(before.revenue).toBe(0);
    expect(before.config.continuation!.relationships.map(r => r.castId).sort()).toEqual([...CAST, ...SPECIAL_CAST].map(c => c.id).sort());
  });

  it('refuses a structurally valid continuation missing its relationship history', async () => {
    const config = buildContinuation(runPolicy(CFG, GHOSTS.hand), []);
    config.continuation!.relationships = [];
    const input = { config, commands: [], rules: RULES.version };
    expect(restore(input)).toBeNull();
    expect(reconstruct(input).next()).toEqual({ done: true, value: null });
    await expect(decodeShare(await encodeShare(config, []))).resolves.toMatchObject({ ok: false });
  });
  it('round-trip a finished season exactly', async () => {
    const s = runPolicy(CFG, GHOSTS.faster);
    const code = await encodeShare(s.config, s.commands, 'A test');
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(code);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state).toEqual(s);
  });

  it('keep original rules in an earlier season replay link', async () => {
    const s = runPolicy(CFG, GHOSTS.faster, {}, LEGACY_RULES_VERSION);
    const code = await encodeShare(s.config, s.commands, 'Earlier season', s.rulesVersion);
    const back = await decodeShare(code);
    expect(back).toMatchObject({ ok: true, payload: { rules: LEGACY_RULES_VERSION }, state: s });
  });

  it('refuse links whose moves do not replay, without loading anything', async () => {
    const s = runPolicy(CFG, GHOSTS.old);
    const tampered = s.commands.map((c) => (c.type === 'accept' ? { ...c, requestId: 'd0-r99' } : c));
    const back = await decodeShare(await encodeShare(s.config, tampered));
    expect(back).toMatchObject({ ok: false });
  });

  it('refuse oversize, non-base64url and extra-field payloads', async () => {
    expect(await decodeShare('x'.repeat(20_000))).toMatchObject({ ok: false });
    expect(await decodeShare('<script>alert(1)</script>')).toMatchObject({ ok: false });
    const s = runPolicy(CFG, GHOSTS.old);
    const withExtra = await encodeShare(s.config, [...s.commands.slice(0, 1), { type: 'runDay', setProfit: 1 } as never]);
    expect(await decodeShare(withExtra)).toMatchObject({ ok: false });
  });

  it('keep the share command limit even when a native season can contain more edits', async () => {
    const commands = Array.from({ length: MAX_COMMANDS }, () => ({ type: 'pace' as const, pace: 'steady' as const }));
    expect(await decodeShare(await encodeShare(CFG, commands))).toMatchObject({ ok: true });
    const oversized = { v: 1, rules: RULES.version, config: CFG, commands: [...commands, commands[0]!] };
    const bytes = await new Response(new Blob([JSON.stringify(oversized)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    expect(await decodeShare(Buffer.from(bytes).toString('base64url'))).toMatchObject({ ok: false });
    await expect(encodeShare(CFG, oversized.commands)).rejects.toThrow();
  });

  it('refuse to create a replay link whose legal edits exceed the decompressed import budget', async () => {
    const commands = Array.from({ length: MAX_COMMANDS }, () => ({ type: 'setMenu' as const, offers: [PRESETS.bespoke, PRESETS.launchlet] }));
    expect(replay(CFG, commands).errors).toEqual([]);
    await expect(encodeShare(CFG, commands)).rejects.toThrow();
  });
});

describe('offer compiler', () => {
  it('reads a plain-words idea into a legal offer', () => {
    const r = compileOfferOffline('something weekly for the little cafes, about 300 a go');
    expect(validateOffer(r.offer)).toBeNull();
    expect(r.offer.launches).toBe(3);
    expect(r.offer.price).toBe(900);
  });

  it('never returns an illegal offer, and says what it changed', () => {
    const r = legalise({ name: '', launches: 9, spacingDays: 0, turnaroundDays: 0, scope: 'any', style: 'templated', price: 123457 });
    expect(validateOffer(r.offer)).toBeNull();
    expect(r.adjustments.length).toBeGreaterThanOrEqual(5);
  });

  it('the debrief digest carries no future demand and no personal text', () => {
    const s = replay(CFG, runPolicy(CFG, GHOSTS.old).commands.slice(0, 15)).state;
    const d = JSON.stringify(digest(s));
    expect(d).not.toMatch(/d1[01]-r/);
    expect(digest(s).days.length).toBe(s.day);
  });
});

describe('world frame', () => {
  it('at the end of a day, the miniature shows exactly the engine state', () => {
    let s = runPolicy(CFG, GHOSTS.faster);
    s = replay(CFG, s.commands.slice(0, 40)).state;
    while (s.commands.length && s.commands[s.commands.length - 1]!.type !== 'runDay' && !s.finished) s = applyCommand(s, { type: 'runDay' }).state;
    const before = replay(CFG, s.commands.slice(0, -1)).state;
    const end = frameAt(before, s, before.minute + RULES.minutesPerDay);
    const engineOpen = s.jobs.filter((j) => j.status === 'active' && j.releaseDay <= before.day).map((j) => `${j.id}:${j.stage}`).sort();
    expect(end.folders.map((f) => `${f.jobId}:${f.stage}`).sort()).toEqual(engineOpen);
    expect(end.packagesTotal).toBe(s.jobs.filter((j) => j.status === 'delivered').length);
  });
});

describe('review regressions (ui)', () => {
  it('the final frame of a day shows misses at closing time, not still-open folders', async () => {
    const { createRun } = await import('../engine/sim');
    const { PRESETS } = await import('../engine/rules');
    let s = createRun({ scenarioId: 'main-street', seed: 'x' });
    s.menu = [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
    const after = applyCommand(s, { type: 'runDay' }).state;
    const end = frameAt(s, after, s.minute + RULES.minutesPerDay);
    expect(end.folders).toHaveLength(0);
    expect(end.missedToday).toEqual(['c1-l1']);
  });

  it('the hours gauge counts work a person is already holding, whatever the routing says', async () => {
    const { humanLoad } = await import('../engine/selectors');
    const { createRun } = await import('../engine/sim');
    const { PRESETS } = await import('../engine/rules');
    let s = createRun({ scenarioId: 'main-street', seed: 'x' });
    s.menu = [PRESETS.bespoke];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
    const j = s.jobs[0]!;
    Object.assign(j, { stage: 'produce', assignee: 'h1', method: 'human', remaining: 280 });
    s.resources.find((r) => r.id === 'h1')!.busyWith = j.id;
    s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
    expect(humanLoad(s).committed).toBe(280 + RULES.effort.finish);
  });
});

describe('review regressions, second pass', () => {
  it('every served neighbour gets a spot of their own, even on an eleven-arrival festival day', async () => {
    const { placeNeighbours } = await import('./world/place');
    const neighbours = Array.from({ length: 11 }, (_, i) => ({ requestId: `r${i}`, castId: 'mara', segment: 'small' as const, mood: 'served' as const }));
    const spots = placeNeighbours({ neighbours } as never).map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(11);
  });

  it('a desk retired this morning is still drawn while it drains, and its work counts against a real shift', async () => {
    const { createRun } = await import('../engine/sim');
    const { PRESETS } = await import('../engine/rules');
    let s = createRun({ scenarioId: 'main-street', seed: 'x' });
    s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
    s.menu = [PRESETS.bespoke];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
    const j = s.jobs[0]!;
    Object.assign(j, { stage: 'produce', assignee: 'ai1', method: 'ai', remaining: 30 });
    s.resources.find((r) => r.id === 'ai1')!.busyWith = j.id;
    s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } }).state;
    const after = applyCommand(s, { type: 'runDay' }).state;
    expect(after.resources.some((r) => r.id === 'ai1')).toBe(false);
    const mid = frameAt(s, after, s.minute + 10);
    expect(mid.workers.find((w) => w.id === 'ai1')).toMatchObject({ retired: true, working: true });
    expect(after.usage.aiBusy).toBeLessThanOrEqual(after.usage.aiShift);
    expect(after.usage.aiShift).toBe(RULES.aiShift);
  });
});

describe('local saves', () => {
  const KEY = 'lantern.runs.v1';
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const s = runPolicy(CFG, GHOSTS.old);
  const run = (id: string, n: number): SavedRun => ({ v: 1, rules: RULES.version, id, label: id, savedAt: '2026-10-11T00:00:00Z', config: CFG, commands: s.commands.slice(0, n) });

  it('load and continue an original season without changing its rules or its saved identity', () => {
    const native = runPolicy(CFG, GHOSTS.old, {}, LEGACY_RULES_VERSION);
    const saved = { ...run('original-rules', 0), rules: native.rulesVersion, commands: native.commands.slice(0, 7) };
    store.set(KEY, JSON.stringify([saved]));
    expect(loadRuns()).toEqual([saved]);
    const restored = restore(loadRuns()[0]!)!;
    expect(restored.rulesVersion).toBe(LEGACY_RULES_VERSION);
    expect(restored).toEqual(replay(CFG, saved.commands, LEGACY_RULES_VERSION).state);
    const next = applyCommand(restored, native.commands[7]!);
    expect(next.error).toBeUndefined();
    expect(trySaveRun({ ...saved, commands: next.state.commands })).toBe('saved');
    expect(loadRuns()).toEqual([{ ...saved, commands: next.state.commands }]);
    expect(restore(loadRuns()[0]!)).toEqual(next.state);
  });

  it('reload a legal season beyond the share limit and replace it without accumulating hidden copies', () => {
    const commands = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({ type: 'setMenu' as const, offers: [{ ...PRESETS.bespoke, price: 500 + (i % 2) * 10 }] }));
    const original = replay(CFG, commands);
    expect(original.errors).toEqual([]);
    const saved = { ...run('long-edited', 0), commands };
    expect(trySaveRun(saved)).toBe('saved');
    expect(loadRuns()).toHaveLength(1);
    expect(loadRuns()).toEqual([saved]);
    expect(restore(loadRuns()[0]!)).toEqual(original.state);

    const next = applyCommand(original.state, { type: 'setMenu', offers: [PRESETS.bespoke] });
    expect(next.error).toBeUndefined();
    expect(trySaveRun({ ...saved, commands: next.state.commands })).toBe('saved');
    expect(JSON.parse(store.get(KEY)!)).toHaveLength(1);
    expect(restore(loadRuns()[0]!)).toEqual(next.state);
  });

  it('recover only the latest long history when an older build retained duplicate copies', () => {
    const older = { ...run('recovered-long', 0), commands: Array.from({ length: MAX_COMMANDS + 1 }, () => ({ type: 'pace' as const, pace: 'steady' as const })) };
    const latest = { ...older, commands: [...older.commands, { type: 'pace' as const, pace: 'careful' as const }] };
    const other = run('unrelated-season', 3);
    store.set(KEY, JSON.stringify([latest, older, other]));
    expect(loadRuns()).toEqual([latest, other]);
    const native = replay(CFG, latest.commands);
    expect(native.errors).toEqual([]);
    expect(restore(loadRuns()[0]!)).toEqual(native.state);
    expect(trySaveRun(latest)).toBe('saved');
    expect(JSON.parse(store.get(KEY)!)).toEqual([latest, other]);
  });

  it('keep saves from other rules versions, and unreadable ones, untouched when saving and deleting', () => {
    const old = { ...run('old', 3), rules: 'lantern-1.0.0' };
    const unreadable = { v: 1, rules: RULES.version, id: 'long', commands: 'not a list' };
    store.set(KEY, JSON.stringify([old, unreadable]));
    expect(loadRuns()).toEqual([]);
    expect(saveRun(run('new-1', 5))).toBe(true);
    deleteRun('new-1');
    expect(saveRun(run('new-2', 5))).toBe(true);
    const raw = JSON.parse(store.get(KEY)!) as unknown[];
    expect(raw).toContainEqual(old);
    expect(raw).toContainEqual(unreadable);
    expect(loadRuns().map((r) => r.id)).toEqual(['new-2']);
  });

  it('a stale tab cannot overwrite a newer save of the same run, but undo in the same tab still saves', () => {
    expect(trySaveRun(run('r', 10))).toBe('saved');
    expect(trySaveRun(run('r', 9))).toBe('saved'); // undo in this tab
    // Another tab plays on from the same run; its module state is separate, so write storage directly.
    const newer = run('r', 30);
    store.set(KEY, JSON.stringify([newer]));
    expect(trySaveRun(run('r', 11))).toBe('stale');
    expect(saveRun(run('r', 11))).toBe(false);
    expect(loadRuns()[0]!.commands).toEqual(newer.commands);
    // Extending what is stored is fine.
    expect(trySaveRun(run('r', 31))).toBe('saved');
  });

  it('saves Undo after a proof edit regardless of nested object insertion order', () => {
    const config = { scenarioId: 'main-street', seed: 'first-season' };
    const before = replay(config, [{ type: 'accept', requestId: 'd0-r0', maker: 'h1' }, { type: 'runDay' }, { type: 'runDay' }]).state;
    const design = projectBrief(before, 'clem-ten', 'new-band').defaultDesign;
    design.pieces[0]!.headline = 'A new room for the night';
    const accepted = applyCommand(before, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design });
    expect(accepted.error).toBeUndefined();
    const saved = { ...run('proof-undo', 0), config, commands: accepted.state.commands };
    expect(trySaveRun(saved)).toBe('saved');
    expect(trySaveRun({ ...saved, commands: before.commands })).toBe('saved');
    expect(loadRuns()[0]!.commands).toEqual(before.commands);
    expect(restore(loadRuns()[0]!)).toEqual(before);
  });

  it('does not overwrite another tab’s changed origin when the command counts match', () => {
    const original = run('changed-origin', 0);
    expect(trySaveRun(original)).toBe('saved');
    const changed = { ...original, config: { ...original.config, seed: 'a-different-street' } };
    store.set(KEY, JSON.stringify([changed]));
    expect(trySaveRun(original)).toBe('stale');
    expect(loadRuns()).toEqual([changed]);
  });

  it('report blocked or full storage as a failed save', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(trySaveRun(run('q', 2))).toBe('unavailable');
    expect(saveRun(run('q', 2))).toBe(false);
  });
});
