import { afterEach, describe, expect, it, vi } from 'vitest';
import { replay } from '../engine/sim';
import type { Command } from '../engine/types';
import courtyard from '../engine/fixtures/main-courtyard-5.0.0.json';
import calls from '../engine/fixtures/call-future-promises-5.0.0.json';
import legacy from '../engine/fixtures/legacy-4.7.1.json';
import { savedRunSchema, type SavedRun } from './schema';
import { readSaveFacts, replayFingerprint, resumeRun, type ReplayResponse } from './resume';
import { reconstruct, type ReplayInput } from './resumeReplay';
import { saveFacts } from './screens/saves';

function rebuild(run: ReplayInput) {
  const steps = reconstruct(run);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

const asSave = (fixture: { rules: string; config: unknown; commands: unknown }) => savedRunSchema.parse({
  v: 1, id: 'fixture', label: 'Fixture', savedAt: '2026-10-26T00:00:00Z',
  rules: fixture.rules, config: fixture.config, commands: fixture.commands,
});
const tape = asSave(courtyard);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resume reconstruction', () => {
  for (const fixture of [courtyard, calls, { ...legacy.tapes[0]!, rules: legacy.rules }]) it(`preserves ${fixture.rules} replay and the state before its last runDay`, () => {
    const run = asSave(fixture);
    const original = JSON.stringify(run);
    const result = rebuild(run)!;
    expect(result.state).toEqual(replay(run.config, run.commands, run.rules).state);
    const last = run.commands.findLastIndex(c => c.type === 'runDay');
    expect(result.history.beforeDay).toEqual(last < 0 ? null : replay(run.config, run.commands.slice(0, last), run.rules).state);
    expect(result.history.commandFingerprint).toBe(JSON.stringify(run.commands));
    expect(result.history.commandCount).toBe(run.commands.length);
    expect(JSON.stringify(run)).toBe(original);
  });

  it('preserves a held call rather than silently finishing the day', () => {
    const run = savedRunSchema.parse(calls);
    const answer = run.commands.findIndex(c => c.type === 'answer');
    expect(answer).toBeGreaterThan(0);
    run.commands = run.commands.slice(0, answer);
    const result = rebuild(run)!;
    expect(result.state.call).not.toBeNull();
    expect(result.state).toEqual(replay(run.config, run.commands, run.rules).state);
    expect(result.history.beforeDay?.call).toBeNull();
  });

  it('rejects unsupported rules, unknown streets and illegal commands', () => {
    expect(rebuild({ ...tape, rules: 'future' })).toBeNull();
    expect(rebuild({ ...tape, config: { ...tape.config, scenarioId: 'missing' } })).toBeNull();
    expect(rebuild({ ...tape, commands: [{ type: 'answer', option: 'late' }] })).toBeNull();
  });

  it('distinguishes same-length tapes, rules and config while ignoring display metadata', () => {
    const a = { ...tape, commands: [{ type: 'pace', pace: 'steady' }] as Command[] };
    expect(replayFingerprint(a)).not.toBe(replayFingerprint({ ...a, commands: [{ type: 'pace', pace: 'push' }] }));
    expect(replayFingerprint(a)).not.toBe(replayFingerprint({ ...a, rules: 'lantern-4.7.1' }));
    expect(replayFingerprint(a)).not.toBe(replayFingerprint({ ...a, config: { ...a.config, seed: 'other' } }));
    const renamed: SavedRun = { ...a, label: 'Renamed' };
    expect(replayFingerprint(a)).toBe(replayFingerprint(renamed));
  });
});

describe('no-Worker fallback', () => {
  it('starts asynchronously with an immutable tape and reads the same facts', async () => {
    vi.stubGlobal('Worker', undefined);
    const run = { ...tape, commands: tape.commands.slice(0, 4) };
    const expected = rebuild(run);
    const task = resumeRun(run);
    run.commands.length = 0;
    expect(await task.promise).toEqual(expected);
    expect(await readSaveFacts(tape).promise).toEqual(saveFacts(tape));
  });

  it('cancels before reconstruction starts', async () => {
    vi.stubGlobal('Worker', undefined);
    vi.useFakeTimers();
    const task = resumeRun(tape);
    const rejected = expect(task.promise).rejects.toMatchObject({ name: 'AbortError' });
    task.cancel();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});

class TestWorker {
  static latest: TestWorker;
  onmessage: ((event: MessageEvent<ReplayResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { TestWorker.latest = this; }
}

describe('worker lifetime', () => {
  it('terminates on success and sends a detached snapshot', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const task = resumeRun(tape);
    const worker = TestWorker.latest;
    const posted = worker.postMessage.mock.calls[0] as unknown as [{ run: ReplayInput }];
    expect(posted[0].run.commands).toEqual(tape.commands);
    expect(posted[0].run.commands).not.toBe(tape.commands);
    const rebuilt = rebuild(tape);
    worker.onmessage?.({ data: { ok: true, value: rebuilt } } as MessageEvent<ReplayResponse>);
    expect(await task.promise).toEqual(rebuilt);
    expect(worker.terminate).toHaveBeenCalledOnce();
    task.cancel();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates on cancellation and ignores a late message', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const task = resumeRun(tape);
    const rejected = expect(task.promise).rejects.toMatchObject({ name: 'AbortError' });
    task.cancel();
    TestWorker.latest.onmessage?.({ data: { ok: true, value: null } } as MessageEvent<ReplayResponse>);
    await rejected;
    expect(TestWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it('surfaces worker failures without retrying', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const task = resumeRun(tape);
    TestWorker.latest.onerror?.();
    await expect(task.promise).rejects.toThrow('could not be read');
    expect(TestWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(TestWorker.latest.postMessage).toHaveBeenCalledOnce();
  });

  it('terminates after the deadline', async () => {
    vi.stubGlobal('Worker', TestWorker);
    vi.useFakeTimers();
    const task = resumeRun(tape);
    const rejected = expect(task.promise).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(TestWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
