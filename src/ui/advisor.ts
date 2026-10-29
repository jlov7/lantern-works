// Two bounded uses of Claude, each with an honest offline equivalent:
//  1. compile a plain-words offer idea into a typed OfferSpec (the engine, not the model, says who buys it)
//  2. write a short season debrief grounded only in the run's own numbers.
// The player's API key lives in this module's memory only: never stored, exported or shared.
// No function here rejects: every failure comes back as { ok: false, error }, so callers cannot get stuck busy.
import type { z } from 'zod';
import type { Debrief } from '../ai/debrief';
import type { CompiledOffer } from '../ai/offer';
import type { debriefReply, offerReply, TaskId } from '../ai/tasks';
import type { CompanyState, OfferSpec } from '../engine/types';

export type { Debrief } from '../ai/debrief';
export type { CompiledOffer } from '../ai/offer';

export const MODEL_ID = 'claude-opus-5-5';
export const CALL_LIMIT = 8;
/** The dev bridge spends the developer's subscription, not a key, so it gets a roomier limit. */
const BRIDGE_CALL_LIMIT = 40;
type Replies = { offer: z.infer<typeof offerReply>; debrief: z.infer<typeof debriefReply> };
/** Prompts, schemas and message builders load only when a call is made, keeping them out of the main chunk. */
const prompts = async () => ({ ...(await import('../ai/tasks')), ...(await import('../ai/messages')) });

/** Folded to '' in the production build, so no bridge path ships. */
const BRIDGE_BASE = import.meta.env.DEV ? '/__bridge' : '';

let apiKey: string | null = null;
let callsUsed = 0;
let bridge: { token: string; provider: string; model: string } | null = null;
/** The model that actually answered the last BYOK call (server-side fallback can change it). */
let answeredBy: string | null = null;

export function setApiKey(key: string | null): void {
  apiKey = key && key.trim() ? key.trim() : null;
  answeredBy = null;
}
export const hasApiKey = (): boolean => apiKey !== null;
/** True when either the player's key or the dev subscription bridge can answer. */
export const aiAvailable = (): boolean => apiKey !== null || bridge !== null;
export const callsLeft = (): number => (apiKey === null && bridge ? BRIDGE_CALL_LIMIT : CALL_LIMIT) - callsUsed;
/** Who answers AI requests right now, naming the model that last answered, for honest labels. */
/** Fired on window when AI availability changes after load (the dev bridge answers late), so labels can update. */
export const AI_CHANGED = 'lantern:ai';
export const aiLabel = (): string =>
  apiKey ? `Claude (${answeredBy ?? MODEL_ID}, your API key)` : bridge ? `${bridge.provider} (${bridge.model}) via your subscription (dev only)` : 'offline';

/**
 * In `pnpm dev` only: find the subscription bridge the dev server injected and check it answers.
 * The production build has no bridge, and this whole function is dead code there.
 */
export async function connectBridge(): Promise<boolean> {
  if (!import.meta.env.DEV || typeof document === 'undefined') return false;
  const token = document.querySelector<HTMLMetaElement>('meta[name="lantern-bridge"]')?.content;
  if (!token) return false;
  try {
    const r = await fetch(`${BRIDGE_BASE}/health`, { headers: { 'x-lantern-bridge': token } });
    const body = (await r.json()) as { ok?: boolean; provider?: string; model?: string };
    bridge = r.ok && body.ok ? { token, provider: body.provider ?? 'Claude', model: body.model ?? 'unknown model' } : null;
  } catch {
    bridge = null;
  }
  window.dispatchEvent(new Event(AI_CHANGED));
  return bridge !== null;
}

export type Source = 'claude' | 'offline';
/** `model` names the model that actually answered. */
export type AdvisorResult<T> = { ok: true; value: T; source: Source; model?: string } | { ok: false; error: string };

async function callBridge<K extends TaskId>(task: K, user: string, schema: z.ZodType<Replies[K]>): Promise<AdvisorResult<Replies[K]>> {
  if (!import.meta.env.DEV || !bridge) return { ok: false, error: 'No AI is connected.' };
  if (callsUsed >= BRIDGE_CALL_LIMIT) return { ok: false, error: `This session's ${BRIDGE_CALL_LIMIT} AI calls are used up. Reload to reset.` };
  callsUsed++;
  let r: Response;
  try {
    r = await fetch(`${BRIDGE_BASE}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lantern-bridge': bridge.token },
      body: JSON.stringify({ task, user }),
    });
  } catch {
    callsUsed--;
    return { ok: false, error: 'Could not reach the dev server bridge.' };
  }
  try {
    const body = (await r.json()) as { ok: boolean; value?: unknown; model?: string; error?: string };
    if (r.status === 429) callsUsed--;
    if (!body.ok) return { ok: false, error: body.error ?? 'The subscription bridge failed.' };
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) return { ok: false, error: 'The reply did not match the expected shape. Try again.' };
    if (body.model) bridge.model = body.model;
    return { ok: true, value: parsed.data, source: 'claude', model: body.model ?? bridge.model };
  } catch {
    return { ok: false, error: 'The dev server bridge sent an unreadable reply.' };
  }
}

type SDK = typeof import('@anthropic-ai/sdk').default;

function describeError(Anthropic: SDK | null, e: unknown): { error: string; refund: boolean } {
  if (!Anthropic) return { error: 'Could not load the Claude client. Check your connection and try again.', refund: true };
  if (e instanceof Anthropic.AuthenticationError) return { error: 'That API key was rejected. Check it and try again.', refund: true };
  if (e instanceof Anthropic.PermissionDeniedError) return { error: 'This key is not allowed to use that model.', refund: true };
  if (e instanceof Anthropic.RateLimitError) return { error: 'The API is rate limiting this key. Wait a minute and try again.', refund: true };
  // A timeout may still have been processed and billed, so it keeps its place in the quota.
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { error: 'Claude took too long to answer. Try again.', refund: false };
  if (e instanceof Anthropic.APIConnectionError) return { error: 'Could not reach the Anthropic API. Check your connection.', refund: true };
  if (e instanceof Anthropic.APIError) return { error: `The API returned an error (${e.status ?? 'unknown'}).`, refund: false };
  return { error: 'Something went wrong talking to Claude.', refund: false };
}

/** One call for a fixed task. `makeUser` builds the user message from the lazily loaded builders. */
async function callClaude<K extends TaskId>(task: K, makeUser: (p: Awaited<ReturnType<typeof prompts>>) => string): Promise<AdvisorResult<Replies[K]>> {
  if (!apiKey && !bridge) return { ok: false, error: 'Add an Anthropic API key first.' };
  let p: Awaited<ReturnType<typeof prompts>>;
  let user: string;
  try {
    p = await prompts();
    user = makeUser(p);
  } catch {
    return { ok: false, error: 'Could not prepare the request. Check your connection and try again.' };
  }
  const schema = p.TASKS[task].schema as unknown as z.ZodType<Replies[K]>;
  if (!apiKey) return callBridge(task, user, schema);
  if (callsUsed >= CALL_LIMIT) return { ok: false, error: `This session's ${CALL_LIMIT} Claude calls are used up. Reload to reset.` };
  callsUsed++;
  let Anthropic: SDK | null = null;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
    const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
    const c = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 45_000 });
    const res = await c.beta.messages.parse({
      model: MODEL_ID,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      system: p.TASKS[task].system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.model) answeredBy = res.model;
    if (res.stop_reason === 'refusal') return { ok: false, error: 'Claude declined this request.' };
    if (res.stop_reason === 'max_tokens' || res.parsed_output == null) return { ok: false, error: 'Claude did not return a usable answer. Try again.' };
    return { ok: true, value: res.parsed_output as Replies[K], source: 'claude', model: res.model ?? MODEL_ID };
  } catch (e) {
    const { error, refund } = describeError(Anthropic, e);
    if (refund) callsUsed = Math.max(0, callsUsed - 1);
    return { ok: false, error };
  }
}

// ---------- 1. offer compiler ----------

/** `day` is the 0-based day the offer would go on the window; it makes the model and the season fit agree. */
export async function compileOfferClaude(text: string, menu: OfferSpec[], day = 0): Promise<AdvisorResult<CompiledOffer>> {
  const r = await callClaude('offer', (p) => p.offerUserMessage(text, menu, day));
  if (!r.ok) return r;
  try {
    const { finishOfferReply } = await import('../ai/offer');
    return { ok: true, source: 'claude', model: r.model, value: finishOfferReply(r.value, day, text) };
  } catch {
    return { ok: false, error: 'Claude returned an offer the game could not read. Try again.' };
  }
}

// ---------- 2. season debrief ----------

export async function debriefClaude(s: CompanyState): Promise<AdvisorResult<Debrief>> {
  let names: Record<string, string>;
  let d: typeof import('../ai/debrief');
  try {
    d = await import('../ai/debrief');
    names = d.offerNames(s);
  } catch {
    return { ok: false, error: 'Could not summarise this season for Claude.' };
  }
  const { digest, withOfferNames } = d;
  const r = await callClaude('debrief', (p) => p.debriefUserMessage(digest(s, { ghosts: true })));
  if (!r.ok) return r;
  const name = (t: string, max: number) => withOfferNames(t, names).slice(0, max);
  return {
    ok: true,
    source: 'claude',
    model: r.model,
    value: { headline: name(r.value.headline, 120), paragraphs: r.value.paragraphs.slice(0, 3).map((p) => name(p, 900)), tryNext: name(r.value.tryNext, 300) },
  };
}
