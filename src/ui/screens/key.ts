// Checks a pasted Anthropic API key before it is used, so a typo gets an inline explanation instead of a failed call.
export const KEY_PREFIX = 'sk-ant-';

/** Why a pasted key cannot be right, or null when it looks like an Anthropic key. */
export function keyProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'Paste your key first.';
  if (/\s/.test(v)) return 'That has spaces in it. Copy the key again, on its own.';
  if (!v.startsWith(KEY_PREFIX)) return `Anthropic API keys start with "${KEY_PREFIX}". Check you copied the whole key, not a different service's.`;
  if (v.length < 30) return 'That looks too short to be a whole key. Copy it again.';
  return null;
}
