// "On the street": word of mouth per customer type, who is about this week, and the street's two side goals.
import { memo, type JSX } from 'react';
import { GOALS } from '../../engine/goals';
import { RULES, SEGMENTS, phaseFor, scenarioById } from '../../engine/rules';
import { repLevel, SEGMENT_IDS } from '../../engine/sim';
import type { CompanyState } from '../../engine/types';
import { launchesToNextStep } from './wordOfMouth';

function meaning(rep: number): string | null {
  const level = repLevel(rep);
  const p = Math.abs(level) * RULES.rep.wtpPerLevel;
  const n = launchesToNextStep(rep);
  if (level > 0) return `Pay ${p}% more and send friends${n === null ? '.' : `; ${n} more on time for the next step.`}`;
  if (level < 0) return `Pay ${p}% less; some stay away. ${n} on time to win them back.`;
  return null;
}

function mix(share: number): string {
  if (share >= 0.35) return 'lots about';
  if (share >= 0.15) return 'some about';
  if (share > 0) return 'a few';
  return 'none this week';
}

export const StreetStrip = memo(function StreetStrip({ state }: { state: CompanyState }): JSX.Element {
  const scenario = scenarioById(state.config.scenarioId)!;
  const day = Math.min(state.day, RULES.days - 1);
  const phase = phaseFor(scenario, day);
  const total = SEGMENT_IDS.reduce((a, id) => a + phase.segmentWeights[id], 0) || 1;
  const goals = GOALS[state.config.scenarioId] ?? [];
  return (
    <section className="panel street-panel" id="street" aria-labelledby="street-h">
      <h2 id="street-h" tabIndex={-1}>On the street</h2>
      {phase.note && <p className={`phase-note${phase.fromDay === state.day ? ' is-new' : ''}`}>{phase.note}</p>}
      <ul className="rep-list">
        {SEGMENT_IDS.map((id) => {
          const lvl = repLevel(state.rep[id]);
          return (
            <li key={id}>
              <div className="rep-top">
                <span className="rep-name">{SEGMENTS[id].label}</span>
                <span className="rep-mix muted small">{mix(phase.segmentWeights[id] / total)}</span>
              </div>
              <span className="pips" role="img" aria-label={`Word of mouth ${lvl > 0 ? `+${lvl}` : lvl} on a scale of -2 to 4`}>
                {[-2, -1, 1, 2, 3, 4].map((k) => (
                  <span key={k} className={`pip${k < 0 ? ' pip-neg' : ''}${(k > 0 && lvl >= k) || (k < 0 && lvl <= k) ? ' on' : ''}`} />
                ))}
              </span>
              {meaning(state.rep[id]) && <span className="rep-means small">{meaning(state.rep[id])}</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Starts after about {launchesToNextStep(0)} on-time launches for a kind of customer. Misses hurt it most; turning a buyer away hurts less
        than leaving them waiting.
      </p>
      {goals.length > 0 && (
        <div className="side-goals">
          <h3>Side goals</h3>
          <ul>
            {goals.map((g) => (
              <li key={g.id}>
                {g.label} <span className="muted">({g.progress(state)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});
