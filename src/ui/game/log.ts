import { RULES } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import { dayEvents, narrate, type LogLine } from '../narrate';
import { clockLabel } from '../timeline';

const DAY = RULES.minutesPerDay;

/** Every log line for a day, up to absolute minute `t`, with the 3pm home time in its place. */
export function logLines(after: CompanyState, day: number, t: number): LogLine[] {
  const closing: LogLine = { key: 'home', time: clockLabel(RULES.humanShift), text: 'Without overtime, people head home at 3pm. With overtime, they work on until 5pm, as does an AI desk.', tone: 'plain' };
  const lines: LogLine[] = [];
  let homeShown = false;
  dayEvents(after, day).forEach((e, i) => {
    if (e.minute > t) return;
    if (!homeShown && e.minute - day * DAY >= RULES.humanShift) {
      lines.push(closing);
      homeShown = true;
    }
    const l = narrate(after, e, i);
    if (l) lines.push(l);
  });
  if (!homeShown && t - day * DAY >= RULES.humanShift) lines.push(closing);
  return lines;
}
