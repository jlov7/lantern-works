// The day as it happens, line by line, read from the engine's events up to the clock.
import { type JSX } from 'react';
import { RULES } from '../../engine/rules';
import { dayLabel } from '../format';
import type { LogLine } from '../narrate';
import { useClock, type Playback } from './clock';
import { logLines } from './log';

const DAY = RULES.minutesPerDay;

export function LogList({ lines, full = false }: { lines: LogLine[]; full?: boolean }): JSX.Element {
  return (
    <ol className={`log${full ? ' log-full' : ''}`} aria-label={full ? 'Everything that happened' : 'What is happening'}>
      {lines.map((l) => (
        <li key={l.key} className={`log-${l.tone}`}>
          <span className="log-time">{l.time}</span> {l.text}
        </li>
      ))}
      {lines.length === 0 && <li className="muted">The studio opens.</li>}
    </ol>
  );
}

/** The live log while the day plays. Re-renders on each simulated minute, nothing else does. */
export function DayLog({ play }: { play: Playback }): JSX.Element {
  const t = useClock(play.clock, (c) => Math.floor(c.t));
  const day = Math.floor(play.before.minute / DAY);
  return (
    <div className="daylog">
      <h2 tabIndex={-1}>{dayLabel(day)}, under way</h2>
      <LogList lines={logLines(play.after, day, t).slice(-9)} />
    </div>
  );
}
