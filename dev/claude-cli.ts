// Run the developer's own `claude -p` or `codex exec` for one fixed task. Used by the dev bridge and the evals.
// Never `--bare`: that would demand an API key instead of the subscription.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const CLAUDE_MODEL = 'claude-sonnet-5-5';
export const CODEX_MODEL = 'gpt-6-sol';
export const CALL_TIMEOUT_MS = 45_000;
export const KILL_GRACE_MS = 2_000;
const MAX_OUTPUT = 1_000_000;

export class TimeoutError extends Error {
  readonly signal: string | null;
  constructor(signal: string | null) {
    super('The model call timed out.');
    this.signal = signal;
  }
}

export interface RunResult {
  code: number | null;
  signal: string | null;
  out: string;
  err: string;
}

/**
 * Spawn `cmd` with an argv array (no shell) from a fresh empty directory. After `timeoutMs` the child gets SIGTERM,
 * then SIGKILL `killGraceMs` later, and the promise rejects with TimeoutError once it has exited.
 */
export function run(cmd: string, args: string[], stdin: string, opts: { timeoutMs?: number; killGraceMs?: number; cwd?: string } = {}): Promise<RunResult> {
  const cwd = opts.cwd ?? mkdtempSync(join(tmpdir(), 'lantern-ai-'));
  const cleanup = () => {
    if (!opts.cwd) rmSync(cwd, { recursive: true, force: true });
  };
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd });
    let out = '';
    let err = '';
    let timedOut = false;
    let killer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killer = setTimeout(() => child.kill('SIGKILL'), opts.killGraceMs ?? KILL_GRACE_MS);
    }, opts.timeoutMs ?? CALL_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      clearTimeout(killer);
      cleanup();
    };
    child.stdout.on('data', (d: Buffer) => {
      if (out.length < MAX_OUTPUT) out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < MAX_OUTPUT) err += d.toString();
    });
    child.on('error', (e) => {
      done();
      resolve({ code: -1, signal: null, out, err: String(e) });
    });
    child.on('close', (code, signal) => {
      done();
      if (timedOut) reject(new TimeoutError(signal));
      else resolve({ code, signal, out, err });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(stdin);
  });
}

/** JSON Schema for a reply, without the `$schema` URI that the CLIs' validators reject. */
export function jsonSchema(schema: z.ZodType): string {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return JSON.stringify(rest);
}

let safeMode: Promise<boolean> | null = null;
/** `--safe-mode` (no CLAUDE.md, skills, plugins, hooks or MCP) is used only when this claude lists it. */
export function claudeHasSafeMode(): Promise<boolean> {
  safeMode ??= run('claude', ['--help'], '', { timeoutMs: 15_000 })
    .then((r) => r.out.includes('--safe-mode'))
    .catch(() => false);
  return safeMode;
}

export interface Answer {
  value: unknown;
  /** The model that actually answered. */
  model: string;
}

/** The model that did the most output work in a `claude -p --output-format json` reply. */
export function answeringModel(modelUsage: unknown, fallback: string): string {
  if (!modelUsage || typeof modelUsage !== 'object') return fallback;
  const entries = Object.entries(modelUsage as Record<string, { outputTokens?: number }>);
  entries.sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0));
  return entries[0]?.[0] ?? fallback;
}

export async function askClaude(system: string, schema: z.ZodType, user: string, opts: { model?: string; timeoutMs?: number } = {}): Promise<Answer> {
  const model = opts.model ?? CLAUDE_MODEL;
  const args = ['-p', ...((await claudeHasSafeMode()) ? ['--safe-mode'] : []), '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands', '--model', model, '--effort', 'low', '--system-prompt', system, '--output-format', 'json', '--json-schema', jsonSchema(schema)];
  const r = await run('claude', args, user, { timeoutMs: opts.timeoutMs });
  if (r.code !== 0) throw new Error(`claude exited ${r.code}: ${r.err.slice(0, 200) || r.out.slice(0, 200)}`);
  const parsed = JSON.parse(r.out) as { is_error?: boolean; structured_output?: unknown; result?: string; modelUsage?: unknown };
  if (parsed.is_error || parsed.structured_output === undefined) throw new Error(`claude returned no structured output: ${String(parsed.result ?? '').slice(0, 200)}`);
  return { value: parsed.structured_output, model: answeringModel(parsed.modelUsage, model) };
}

export async function askCodex(system: string, schema: z.ZodType, user: string, opts: { timeoutMs?: number } = {}): Promise<Answer> {
  const dir = mkdtempSync(join(tmpdir(), 'lantern-codex-'));
  try {
    const schemaFile = join(dir, 'schema.json');
    const outFile = join(dir, 'out.json');
    writeFileSync(schemaFile, jsonSchema(schema));
    const prompt = `${system}\n\nReply with JSON only.\n\n${user}`;
    const args = ['exec', '-m', CODEX_MODEL, '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '--ephemeral', '--skip-git-repo-check', '-C', dir, '--output-schema', schemaFile, '-o', outFile, '-'];
    const r = await run('codex', args, prompt, { timeoutMs: opts.timeoutMs, cwd: dir });
    if (r.code !== 0) throw new Error(`codex exited ${r.code}: ${r.err.slice(-200)}`);
    return { value: JSON.parse(readFileSync(outFile, 'utf8')), model: CODEX_MODEL };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
