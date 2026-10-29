// The user messages for the two model tasks. Shared by the browser and the evals so they send the same text.
import { PRESETS, RULES } from '../engine/rules';
import type { OfferSpec } from '../engine/types';
import { offerTerms } from '../ui/format';
import { MAX_IDEA_CHARS } from './tasks';

/** Make player text safe to place inside a tag: it can never close or open one. */
export const escapeTagText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The offer task's user message. `day` is the 0-based day the offer would go on the window. */
export function offerUserMessage(text: string, menu: readonly OfferSpec[], day = 0): string {
  const d = Math.min(RULES.days - 1, Math.max(0, Math.floor(day)));
  const window = menu.length ? menu.map((o) => `${escapeTagText(o.name)} (${o.price} cr: ${offerTerms(o)})`).join('; ') : 'empty';
  const presets = Object.values(PRESETS)
    .map((o) => `${o.name} ${o.price} cr: ${offerTerms(o)}`)
    .join(' | ');
  return [
    `Today is day ${d + 1} of ${RULES.days}; ${RULES.days - d} days are left in the season, including today.`,
    `Current window: ${window}.`,
    `Starting templates for reference: ${presets}`,
    '',
    `<player_idea>${escapeTagText(text.slice(0, MAX_IDEA_CHARS))}</player_idea>`,
  ].join('\n');
}

/** The debrief task's user message. */
export const debriefUserMessage = (digest: unknown): string => `Digest:\n${JSON.stringify(digest)}`;
