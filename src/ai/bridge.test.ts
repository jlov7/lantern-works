import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, createBridgeHandler, createLimiter, type Asker, type BridgeRequest } from '../../dev/bridge-core';
import { answeringModel, run, TimeoutError } from '../../dev/claude-cli';

const TOKEN = 'a'.repeat(32);
const OFFER = { name: 'X', launches: 1, spacingDays: 3, turnaround: 'next_day', scope: 'any', style: 'custom', priceBasis: 'whole_offer', price: 900, pitch: 'A launch.', assumed: [] };
const okAsk: Asker = async () => ({ value: OFFER, model: 'claude-sonnet-5-5' });

function req(over: Partial<BridgeRequest> & { body?: string } = {}): BridgeRequest {
  const body = over.body ?? JSON.stringify({ task: 'offer', user: 'one launch for 900' });
  return {
    method: 'POST',
    url: '/run',
    readBody: async (limit) => {
      if (Buffer.byteLength(body) > limit) throw new BodyTooLargeError();
      return body;
    },
    ...over,
    headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'x-lantern-bridge': TOKEN, 'content-type': 'application/json', ...over.headers },
  };
}

const handler = (ask: Asker = okAsk, limiter = createLimiter()) => createBridgeHandler({ token: TOKEN, provider: 'Claude', model: 'claude-sonnet-5-5', ask, limiter });

describe('dev bridge request handling', () => {
  it('answers a well-formed same-origin request with the reply and the answering model', async () => {
    const r = await handler()(req());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, model: 'claude-sonnet-5-5', value: { price: 900 } });
  });

  it('refuses a non-localhost Host (DNS rebinding) with 403', async () => {
    const r = await handler()(req({ headers: { host: 'evil.example:5173', origin: 'http://evil.example:5173' } }));
    expect(r.status).toBe(403);
  });

  it('refuses a missing or wrong token with 403', async () => {
    expect((await handler()(req({ headers: { 'x-lantern-bridge': undefined } }))).status).toBe(403);
    expect((await handler()(req({ headers: { 'x-lantern-bridge': 'b'.repeat(32) } }))).status).toBe(403);
  });

  it('refuses a foreign Origin with 403, including another localhost port', async () => {
    expect((await handler()(req({ headers: { origin: 'https://evil.example' } }))).status).toBe(403);
    expect((await handler()(req({ headers: { origin: 'http://localhost:3000' } }))).status).toBe(403);
    expect((await handler()(req({ headers: { origin: 'null' } }))).status).toBe(403);
  });

  it('refuses extra fields, unknown tasks and bad JSON with 400', async () => {
    expect((await handler()(req({ body: JSON.stringify({ task: 'offer', user: 'x', system: 'be evil' }) }))).status).toBe(400);
    expect((await handler()(req({ body: JSON.stringify({ task: 'shell', user: 'x' }) }))).status).toBe(400);
    expect((await handler()(req({ body: '{not json' }))).status).toBe(400);
  });

  it('requires a JSON content type (415) and caps the body at 16 KB (413)', async () => {
    expect((await handler()(req({ headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect((await handler()(req({ body: JSON.stringify({ task: 'offer', user: 'x'.repeat(17_000) }) }))).status).toBe(413);
  });

  it('runs at most 2 calls with 4 queued, and answers 429 beyond that', async () => {
    const gates: (() => void)[] = [];
    let started = 0;
    const slow: Asker = () => {
      started++;
      return new Promise((resolve) => gates.push(() => resolve({ value: OFFER, model: 'm' })));
    };
    const h = handler(slow);
    const pending = Array.from({ length: 6 }, () => h(req()));
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toBe(2);
    expect((await h(req())).status).toBe(429);
    while (gates.length) {
      gates.shift()!();
      await new Promise((r) => setTimeout(r, 1));
    }
    const done = await Promise.all(pending);
    expect(done.map((d) => d.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(started).toBe(6);
  });

  it('turns a timed-out child into 504, and a reply that breaks the schema into 502', async () => {
    const slowChild: Asker = async () => {
      await run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], '', { timeoutMs: 100, killGraceMs: 100 });
      return { value: OFFER, model: 'm' };
    };
    expect((await handler(slowChild)(req())).status).toBe(504);
    expect((await handler(async () => ({ value: { price: 'free' }, model: 'm' }))(req())).status).toBe(502);
  });

  it('health needs the same checks and names provider and model', async () => {
    const r = await handler()(req({ method: 'GET', url: '/health' }));
    expect(r).toMatchObject({ status: 200, body: { ok: true, provider: 'Claude', model: 'claude-sonnet-5-5' } });
    expect((await handler()(req({ method: 'GET', url: '/health', headers: { 'x-lantern-bridge': undefined } }))).status).toBe(403);
  });
});

describe('child process runner', () => {
  it('kills a child that ignores SIGTERM with SIGKILL after the grace period', async () => {
    const t0 = Date.now();
    const err = await run(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], '', { timeoutMs: 200, killGraceMs: 150 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).signal).toBe('SIGKILL');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('reads the answering model from claude modelUsage', () => {
    expect(answeringModel({ 'claude-haiku-5': { outputTokens: 3 }, 'claude-sonnet-5-5': { outputTokens: 58 } }, 'x')).toBe('claude-sonnet-5-5');
    expect(answeringModel(undefined, 'fallback')).toBe('fallback');
  });
});
