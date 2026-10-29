// The dev bridge's request handling as a plain async function, so it can be tested without Vite or a socket.
//
// Order of checks: localhost Host, same-origin Origin (when sent), per-server token, route, JSON content type,
// 16 KB body cap, strict body schema, concurrency (2 running, 4 queued), then one fixed task with a hard timeout.
import { z } from 'zod';
import { MAX_USER_CHARS, TASKS, type TaskId } from '../src/ai/tasks.ts';
import { TimeoutError, type Answer } from './claude-cli.ts';

export const BODY_LIMIT = 16 * 1024;
export const MAX_RUNNING = 2;
export const MAX_QUEUED = 4;

export class BodyTooLargeError extends Error {}

export interface BridgeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Read the body, rejecting with BodyTooLargeError past `limit` bytes. */
  readBody(limit: number): Promise<string>;
}

export interface BridgeResponse {
  status: number;
  body: { ok: boolean; [k: string]: unknown };
}

export type Asker = (task: TaskId, system: string, schema: z.ZodType, user: string) => Promise<Answer>;

const runBody = z.strictObject({ task: z.enum(['offer', 'debrief']), user: z.string().min(1).max(MAX_USER_CHARS) });

/** At most `running` jobs at once and `queued` waiting; beyond that `acquire` returns null. */
export function createLimiter(running = MAX_RUNNING, queued = MAX_QUEUED) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return {
    acquire(): Promise<() => void> | null {
      if (active < running) {
        active++;
        return Promise.resolve(release);
      }
      if (waiting.length >= queued) return null;
      return new Promise((resolve) => waiting.push(() => resolve(release)));
    },
    stats: () => ({ active, waiting: waiting.length }),
  };
}
export type Limiter = ReturnType<typeof createLimiter>;

const header = (h: BridgeRequest['headers'], k: string): string | undefined => {
  const v = h[k];
  return Array.isArray(v) ? v[0] : v;
};

export interface BridgeOptions {
  token: string;
  provider: string;
  model: string;
  ask: Asker;
  /** The dev server serves https. */
  secure?: boolean;
  limiter?: Limiter;
  log?: (level: 'info' | 'warn', msg: string) => void;
}

export function createBridgeHandler(o: BridgeOptions): (req: BridgeRequest) => Promise<BridgeResponse> {
  const limiter = o.limiter ?? createLimiter();
  const fail = (status: number, error: string): BridgeResponse => ({ status, body: { ok: false, error } });
  return async (req) => {
    const hostHeader = header(req.headers, 'host') ?? '';
    const host = hostHeader.replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return fail(403, 'Bridge is localhost only.');
    const origin = header(req.headers, 'origin');
    if (origin !== undefined && origin !== `${o.secure ? 'https' : 'http'}://${hostHeader}`) return fail(403, 'Bridge accepts same-origin requests only.');
    if (header(req.headers, 'x-lantern-bridge') !== o.token) return fail(403, 'Missing bridge token.');
    if (req.method === 'GET' && req.url === '/health') return { status: 200, body: { ok: true, provider: o.provider, model: o.model } };
    if (req.method !== 'POST' || req.url !== '/run') return fail(404, 'Not found.');
    if (!/^application\/json\s*(;|$)/i.test(header(req.headers, 'content-type') ?? '')) return fail(415, 'Send JSON.');
    let input: z.infer<typeof runBody>;
    try {
      const parsed = runBody.safeParse(JSON.parse(await req.readBody(BODY_LIMIT)));
      if (!parsed.success) return fail(400, 'Bad request.');
      input = parsed.data;
    } catch (e) {
      return e instanceof BodyTooLargeError ? fail(413, 'Request too large.') : fail(400, 'Bad request.');
    }
    const slot = limiter.acquire();
    if (!slot) return fail(429, 'The bridge is busy. Try again in a moment.');
    const release = await slot;
    const started = Date.now();
    try {
      const t = TASKS[input.task];
      const answer = await o.ask(input.task, t.system, t.schema, input.user);
      const value = t.schema.safeParse(answer.value);
      if (!value.success) {
        o.log?.('warn', `[bridge] ${input.task} reply did not match the schema after ${Date.now() - started} ms`);
        return fail(502, `${o.provider} did not return a usable answer.`);
      }
      o.log?.('info', `[bridge] ${input.task} via ${answer.model} in ${Date.now() - started} ms`);
      return { status: 200, body: { ok: true, value: value.data, model: answer.model } };
    } catch (e) {
      if (e instanceof TimeoutError) {
        o.log?.('warn', `[bridge] ${input.task} timed out after ${Date.now() - started} ms (${e.signal ?? 'exited'})`);
        return fail(504, `${o.provider} took too long to answer.`);
      }
      o.log?.('warn', `[bridge] ${input.task} failed after ${Date.now() - started} ms: ${String(e).slice(0, 300)}`);
      return fail(502, `${o.provider} did not return a usable answer.`);
    } finally {
      release();
    }
  };
}
