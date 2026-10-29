// Read-only helpers for the title's saves list. Writing stays in persist.ts.
import { scenarioById } from '../../engine/rules';
import { hasStudioRules, supportsRulesVersion } from '../../engine/versions';
import { seasonEnding } from '../../engine/endings';
import { medalFor, summarize, type Medal } from '../../engine/selectors';
import { restore } from '../persist';
import { dayLabel } from '../format';
import type { SavedRun } from '../schema';
import type { CompanyState } from '../../engine/types';

/** A save written by another rules version. persist.ts keeps these untouched; the title offers the same street fresh. */
export interface OlderSave {
  id: string;
  label: string;
  rules: string;
  scenarioId: string;
  seed: string;
  savedAt: string | null;
}

/** Saves in storage from other rules versions whose street this build still knows. */
export function olderSaves(): OlderSave[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: OlderSave[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || supportsRulesVersion(String(r.rules))) continue;
    const config = r.config as Record<string, unknown> | undefined;
    const scenarioId = typeof config?.scenarioId === 'string' ? config.scenarioId : null;
    const seed = typeof config?.seed === 'string' && config.seed.length <= 40 ? config.seed : null;
    if (!scenarioId || !seed || !scenarioById(scenarioId)) continue;
    out.push({
      id: typeof r.id === 'string' ? r.id.slice(0, 60) : `${scenarioId}-${seed}`,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.slice(0, 60) : (scenarioById(scenarioId)?.name ?? 'A season'),
      rules: typeof r.rules === 'string' ? r.rules.slice(0, 40) : 'unknown',
      scenarioId,
      seed,
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : null,
    });
  }
  return out;
}

export interface SaveFacts {
  served: number;
  medal: Medal;
  finished: boolean;
  progress: string;
  ending: string | null;
}

/** Replays a save to read its numbers. Null when it no longer replays. */
export function saveFacts(run: SavedRun): SaveFacts | null {
  const s = restore(run);
  if (!s) return null;
  return factsForState(s);
}

export function factsForState(s: CompanyState): SaveFacts {
  return {
    served: summarize(s).served,
    medal: s.finished ? medalFor(s).medal : null,
    finished: s.finished,
    progress: s.finished ? 'Finished' : `${dayLabel(s.day)}${s.call ? ', call waiting' : ' morning'}`,
    ending: s.finished && hasStudioRules(s.rulesVersion) ? seasonEnding(s).title : null,
  };
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' }) : null;

/** "today", "yesterday", "3 days ago", or a date for older saves. */
export function lastPlayed(iso: string | null, now = new Date()): string {
  if (!iso) return 'some time ago';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'some time ago';
  const day = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const diff = day(t) - day(now);
  if (diff > -7 && diff <= 0) return rtf ? rtf.format(diff, 'day') : `${-diff} days ago`;
  return `on ${t.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]}`;
}
