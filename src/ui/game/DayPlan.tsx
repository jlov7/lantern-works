// Today, hour by hour: each person's (and desk's) lane with the brief, make and finish stretches the forecast
// expects. A buyer being looked at ("Show") is drawn in as dashed blocks, so whether they fit, and why free hours
// late in the day cannot take same-day work, can be seen rather than taken on trust.
import { memo, type CSSProperties, type JSX } from 'react';
import type { PlanBlock } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { castName } from '../format';
import { clockLabel } from '../timeline';
import { planEnding } from './planEnding';
import { planFree } from './planFree';
import type { MorningPlan } from './morningPlan';

const STAGE: Record<PlanBlock['stage'], string> = { brief: 'brief', produce: 'make', finish: 'finish', rework: 'redo', kit: 'template kit', done: 'done', mentoring: 'mentoring', pattern: 'pattern preparation' };

interface Props {
  state: CompanyState;
  /** A waiting buyer to draw in, or null. */
  considering: string | null;
  calendar: MorningPlan['calendar'] | null;
  /** Narrow screens: the hours grid folds behind its summary line, and opens when a buyer is shown. */
  folded?: boolean;
}

export const DayPlan = memo(function DayPlan({ state, considering, calendar, folded = false }: Props): JSX.Element | null {
  const baseline = calendar?.baseline;
  const plan = considering ? calendar?.considering === considering ? calendar.preview : null : baseline;
  if (!plan || !baseline || plan.lanes.length === 0) return null;
  const span = Math.max(...plan.lanes.map((l) => l.length));
  const castOf = considering ? state.requests.find((r) => r.id === considering)?.castId : undefined;
  const who = (b: PlanBlock) => (b.stage === 'pattern' ? 'Tomas’s pattern preparation' : b.jobId === 'mentoring' ? 'Noor’s lesson' : b.jobId === 'kit' ? 'kit' : b.isNew && castOf ? castName(castOf) : castName(state.jobs.find((j) => j.id === b.jobId)?.castId ?? '') || 'them');
  // Who has time left today, and from when: the one line a reader of the plan needs.
  const free = planFree(baseline);
  const theirs = plan.blocks.filter((b) => b.isNew);
  const lane = (id: string) => plan.lanes.find((l) => l.id === id)?.name ?? '';
  const ends = planEnding(plan, state, considering);
  const with_ = castOf
    ? theirs.length
      ? `With ${castName(castOf)}: ${theirs.map((b) => `${STAGE[b.stage]} ${clockLabel(b.from)}-${clockLabel(b.to)} (${lane(b.resourceId)})`).join(', ')}.${ends}`
      : `With ${castName(castOf)}: none of their work starts today, as people's hours are spoken for.`
    : null;
  const ticks = Array.from({ length: Math.floor(span / 120) + 1 }, (_, i) => i * 120);

  const line = (
    <>
      <strong>Free today:</strong> {free.join(', ')}.{with_ && <> {with_}</>}
      {!castOf && state.day === 0 && <span className="muted"> Show a buyer to see where their work would go.</span>}
    </>
  );
  const grid = (
    <div className="dayplan-grid" aria-hidden="true">
      <div className="dayplan-ticks" style={{ '--span': span } as CSSProperties}>
        {ticks.map((m) => (
          <span key={m} style={{ left: `${(m / span) * 100}%` }}>
            {clockLabel(m).replace(':00', '')}
          </span>
        ))}
      </div>
      {plan.lanes.map((l) => (
        <div key={l.id} className={`dayplan-lane lane-${l.kind}`}>
          <span className="dayplan-name">{l.name}</span>
          <span className="dayplan-track">
            <span className="dayplan-shift" style={{ width: `${(l.length / span) * 100}%` }} />
            {plan.blocks
              .filter((b) => b.resourceId === l.id && b.to > b.from)
              .map((b, i) => (
                <span
                  key={i}
                  className={`dayplan-block stage-${b.stage}${b.isNew ? ' is-new' : ''}`}
                  style={{ left: `${(b.from / span) * 100}%`, width: `${((b.to - b.from) / span) * 100}%` }}
                  data-label={who(b)}
                  title={`${STAGE[b.stage]}, ${who(b)}, ${clockLabel(b.from)} to ${clockLabel(b.to)}`}
                />
              ))}
          </span>
        </div>
      ))}
      <p className="dayplan-key small">
        <span className="stage-brief" /> brief <span className="stage-produce" /> make <span className="stage-finish" /> finish <span className="is-new" /> the buyer you are looking at
      </p>
    </div>
  );
  if (folded)
    return (
      <details className="dayplan" open={castOf !== undefined} aria-label="Today, hour by hour">
        <summary className="small dayplan-free">{line}</summary>
        {grid}
      </details>
    );
  return (
    <div className="dayplan" role="group" aria-label="Today, hour by hour">
      <p className="small dayplan-free">{line}</p>
      {grid}
    </div>
  );
});
