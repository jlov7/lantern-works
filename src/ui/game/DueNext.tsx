import { memo, type JSX } from 'react';
import { RULES } from '../../engine/rules';
import type { CompanyState, Job } from '../../engine/types';
import { dueNextStage } from './dueNextLabels';
import { promiseLabel } from './promiseLabel';

const DAY = RULES.minutesPerDay;
const SHOWN = 6;

function due(j: Job, today: number): string {
  const d = j.dueAt / DAY - 1;
  if (d === today) return 'due tonight';
  if (d === today + 1) return 'due tomorrow';
  return `due day ${d + 1}`;
}

/** Desktop only: the next promises falling due, beside the miniature, so the space there earns its keep. */
export const DueNext = memo(function DueNext({ state }: { state: CompanyState }): JSX.Element | null {
  const open = state.jobs.filter((j) => j.status === 'active' || (j.status === 'scheduled' && j.releaseDay <= state.day + 1)).sort((a, b) => a.dueAt - b.dueAt);
  if (open.length === 0) return null;
  return (
    <section className="due-next" aria-labelledby="due-next-h">
      <h2 id="due-next-h">Due next</h2>
      <ul>
        {open.slice(0, SHOWN).map((j) => (
          <li key={j.id} className={j.dueAt / DAY - 1 === state.day ? 'is-today' : ''}>
            <strong>{promiseLabel(state, j.id, 'customer')}</strong>
            <span>{dueNextStage(j, state.day)}</span>
            <span className="due-when">{due(j, state.day)}</span>
          </li>
        ))}
      </ul>
      {open.length > SHOWN && <p className="muted small">and {open.length - SHOWN} more under the Promises tab.</p>}
    </section>
  );
});
