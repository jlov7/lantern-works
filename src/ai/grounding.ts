// Automatic groundedness checks for a debrief: every number and name must come from the digest it was written from.
import { GHOSTS } from '../engine/policies';
import { CAST, PRESETS, SCENARIOS } from '../engine/rules';
import type { Debrief } from './debrief';

/** Every number in a value, including numbers written inside its strings, plus their absolute values. */
export function numbersIn(value: unknown, out = new Set<number>()): Set<number> {
  if (typeof value === 'number') {
    out.add(value);
    out.add(Math.abs(value));
  } else if (typeof value === 'string') {
    for (const x of textNumbers(value)) {
      out.add(x);
      out.add(Math.abs(x));
    }
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

/** Numbers written with digits ("1,200", "-300", "48%", "Day 3"). Ids such as offer_A carry none. */
export function textNumbers(text: string): number[] {
  return [...text.matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,(?=\d{3})/g, '').replace(/,$/, '')));
}

/** Proper names the game knows about; a debrief may use one only if the digest (or the player's own offer names) has it. */
const KNOWN_NAMES = [...CAST.map((c) => c.name), ...SCENARIOS.map((s) => s.name), ...Object.values(GHOSTS).map((g) => g.label), ...Object.values(PRESETS).map((p) => p.name)];

export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export interface GroundingOptions {
  /** Extra text the debrief may name from, such as the player's offer names after ids are mapped back. */
  allowedText?: string;
  maxWords?: number;
}

/** Problems with a debrief, empty when grounded. Words are counted over the paragraphs and tryNext. */
export function groundingProblems(d: Debrief, digest: unknown, opts: GroundingOptions = {}): string[] {
  const problems: string[] = [];
  const source = `${JSON.stringify(digest)}\n${opts.allowedText ?? ''}`;
  const allowed = numbersIn(digest);
  for (const x of textNumbers(opts.allowedText ?? '')) allowed.add(x);
  const text = [d.headline, ...d.paragraphs, d.tryNext].join('\n');
  for (const x of textNumbers(text)) if (!allowed.has(x)) problems.push(`number ${x} is not in the digest`);
  for (const name of KNOWN_NAMES) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text) && !source.includes(name)) problems.push(`name "${name}" is not in the digest`);
  }
  for (const id of text.match(/\boffer_[A-Z]+\b/g) ?? []) if (!source.includes(`"${id}"`)) problems.push(`offer id ${id} is not in the digest`);
  for (const key of new Set(text.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g) ?? [])) problems.push(`writes the field name ${key}`);
  if (/[\u2013\u2014]/.test(text)) problems.push('uses an em or en dash');
  if (/!/.test(text)) problems.push('uses an exclamation mark');
  const words = wordCount([...d.paragraphs, d.tryNext].join(' '));
  if (words > (opts.maxWords ?? 120)) problems.push(`${words} words (max ${opts.maxWords ?? 120})`);
  return problems;
}
