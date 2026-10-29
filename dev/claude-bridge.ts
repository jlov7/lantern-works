// Dev-only bridge: lets `pnpm dev` answer the game's two AI tasks through the developer's own Claude Code
// (or Codex) subscription instead of an API key. Never part of the production build (`apply: 'serve'`).
//
// Safety: only the two fixed tasks (system prompt and schema chosen here, not by the browser); a per-server
// random token injected into the dev page; localhost Host and same-origin only; JSON bodies up to 16 KB with a
// strict schema; 2 calls at a time with 4 queued; 45 s per call, then SIGTERM and SIGKILL. See bridge-core.ts.
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { BodyTooLargeError, createBridgeHandler, type BridgeResponse } from './bridge-core.ts';
import { askClaude, askCodex, CLAUDE_MODEL, CODEX_MODEL } from './claude-cli.ts';

type Provider = 'claude' | 'codex';

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += b.length;
    if (size > limit) throw new BodyTooLargeError();
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, r: BridgeResponse): void {
  res.statusCode = r.status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (r.status === 413) res.setHeader('connection', 'close');
  res.end(JSON.stringify(r.body));
}

export function claudeBridge(provider: Provider = process.env.LANTERN_BRIDGE === 'codex' ? 'codex' : 'claude'): Plugin {
  const token = randomBytes(16).toString('hex');
  return {
    name: 'lantern-subscription-bridge',
    apply: 'serve',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'lantern-bridge', content: token }, injectTo: 'head' }],
    configureServer(server) {
      const handle = createBridgeHandler({
        token,
        provider: provider === 'codex' ? 'Codex' : 'Claude',
        model: provider === 'codex' ? CODEX_MODEL : CLAUDE_MODEL,
        secure: Boolean(server.config.server.https),
        ask: (_task, system, schema, user) => (provider === 'codex' ? askCodex(system, schema, user) : askClaude(system, schema, user)),
        log: (level, msg) => server.config.logger[level](msg),
      });
      server.middlewares.use('/__bridge', (req, res) => {
        void handle({ method: req.method, url: req.url, headers: req.headers, readBody: (limit) => readBody(req, limit) })
          .catch((): BridgeResponse => ({ status: 500, body: { ok: false, error: 'Bridge error.' } }))
          .then((r) => send(res, r));
      });
    },
  };
}
