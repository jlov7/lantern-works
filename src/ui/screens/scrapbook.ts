// The season in moments, for the end screen: the evenings' best lines gathered by day, so what happened in play is
// still there when the season is looked back on. Rebuilt from the commands; no React here.
import { applyCommand, createRun } from '../../engine/sim';
import type { CompanyState } from '../../engine/types';
import { chatterOf, momentOf } from '../game/eveningFacts';

export interface Clipping {
  day: number;
  text: string;
  /** A moment the evening led with, or a line from the studio. */
  kind: 'moment' | 'chatter';
}

const MOMENTS = 4;
const CHATTER = 2;

/** The moment without the evening's advice after it (the part with numbers in it); a punchline stays, and so does any
 * sentence a cut would split mid-quotation. */
function headline(text: string): string {
  const first = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  const rest = text.slice(first.length);
  return !/\d/.test(rest) || (first.match(/"/g)?.length ?? 0) % 2 ? text : first;
}

export function scrapbook(s: CompanyState): Clipping[] {
  const moments: Clipping[] = [];
  const quiet: number[] = [];
  let t = createRun(s.config, s.rulesVersion);
  for (const c of s.commands) {
    const r = applyCommand(t, c);
    if (r.error) continue;
    if (c.type === 'runDay') {
      const day = t.day;
      const delivered = r.state.events.filter((e) => e.day === day && e.type === 'delivered').length;
      const text = momentOf(t, r.state, day, delivered);
      if (text) moments.push({ day, text: headline(text), kind: 'moment' });
      else quiet.push(day);
    }
    t = r.state;
  }
  // Spread the moments over the season rather than taking the first few, then let the studio speak on two other days.
  const step = moments.length / MOMENTS;
  const picked = moments.length <= MOMENTS ? moments : Array.from({ length: MOMENTS }, (_, i) => moments[Math.floor(i * step)]!);
  const voices = quiet.filter((_, i, a) => i === Math.floor(a.length / 3) || i === Math.floor((2 * a.length) / 3)).slice(0, CHATTER);
  const chatter = voices.map((day): Clipping => ({ day, text: chatterOf(s, s, day), kind: 'chatter' }));
  return [...picked, ...chatter].sort((a, b) => a.day - b.day);
}
