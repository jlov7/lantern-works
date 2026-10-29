import { reconstruct, type ReplayInput, type RebuiltRun } from './resumeReplay';
import { factsForState, type SaveFacts } from './screens/saves';

export { replayFingerprint } from './resumeReplay';
export type { ReplayInput, RebuiltRun } from './resumeReplay';
export type ReplayRequest = { kind: 'resume' | 'facts'; run: ReplayInput };
export type ReplayResponse = { ok: true; value: RebuiltRun | SaveFacts | null } | { ok: false };
export interface ReplayTask<T> { promise: Promise<T | null>; cancel: () => void }

const TIMEOUT_MS = 30_000;

function replayTask<T extends RebuiltRun | SaveFacts>(kind: ReplayRequest['kind'], input: ReplayInput): ReplayTask<T> {
  const run = structuredClone(input);
  let cancel = () => {};
  const promise = new Promise<T | null>((resolve, reject) => {
    let worker: Worker | null = null;
    let next: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (value: T | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(next);
      worker?.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => finish(null, new Error('Reading this season took too long. Please try again.')), TIMEOUT_MS);
    cancel = () => finish(null, new DOMException('Reading cancelled.', 'AbortError'));
    try {
      if (typeof Worker !== 'undefined') worker = new Worker(new URL('./resume.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Some browsers expose Worker but block its construction. Use the same bounded fallback.
    }
    if (worker) {
      worker.onmessage = (event: MessageEvent<ReplayResponse>) => {
        if (!event.data.ok) finish(null, new Error('This season could not be read. Please try again.'));
        else finish(event.data.value as T | null);
      };
      worker.onerror = () => finish(null, new Error('This season could not be read. Please try again.'));
      worker.onmessageerror = () => finish(null, new Error('This season could not be read. Please try again.'));
      try {
        worker.postMessage({ kind, run } satisfies ReplayRequest);
      } catch {
        finish(null, new Error('This season could not be read. Please try again.'));
      }
      return;
    }
    const steps = reconstruct(run);
    const step = () => {
      if (settled) return;
      try {
        const until = performance.now() + 8;
        do {
          const result = steps.next();
          if (result.done) {
            const value = result.value;
            finish((value && kind === 'facts' ? factsForState(value.state) : value) as T | null);
            return;
          }
        } while (performance.now() < until);
        next = setTimeout(step, 0);
      } catch {
        finish(null, new Error('This season could not be read. Please try again.'));
      }
    };
    next = setTimeout(step, 0);
  });
  return { promise, cancel: () => cancel() };
}

export const resumeRun = (run: ReplayInput): ReplayTask<RebuiltRun> => replayTask('resume', run);
export const readSaveFacts = (run: ReplayInput): ReplayTask<SaveFacts> => replayTask('facts', run);
