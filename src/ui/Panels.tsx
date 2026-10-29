import { memo, type JSX } from 'react';
import { RULES } from '../engine/rules';
import { humanLoad, todayLoad } from '../engine/selectors';
import { reworkBp } from '../engine/sim';
import type { AiTier, CompanyState, Command, Job, Routing } from '../engine/types';
import { dayLabel, hours, oneIn, ROUTING_LABEL, TIER_LABEL } from './format';
import { aiDailyCost } from './game/capacityCosts';
import { promiseLabel } from './game/promiseLabel';

const TIERS: AiTier[] = ['none', 'solo', 'duo'];
const ROUTES: Routing[] = ['human', 'simple', 'all'];

function loadWords(ratio: number): string {
  if (ratio > 1) return 'more than they have';
  if (ratio > 0.85) return 'nearly full';
  return '';
}

export const DeskPanel = memo(function DeskPanel({ state, yesterday, disabled, apply, aiFrom = null }: { state: CompanyState; yesterday: { people: number; ai: number | null } | null; disabled: boolean; apply: (c: Command) => void; /** First season: the morning the AI desk opens. */ aiFrom?: number | null }): JSX.Element {
  const load = humanLoad(state);
  const ratio = load.available ? load.committed / load.available : 0;
  const setTier = (aiTier: AiTier) => apply({ type: 'setStaff', staffing: { aiTier, routing: aiTier === 'none' ? 'human' : state.staffing.routing === 'human' ? 'simple' : state.staffing.routing } });
  const setRoute = (routing: Routing) => apply({ type: 'setStaff', staffing: { aiTier: state.staffing.aiTier, routing } });
  const words = loadWords(ratio);
  const today = todayLoad(state);
  const todayRatio = today.available ? today.committed / today.available : 0;
  return (
    <section className="panel desk-panel" id="desk" aria-labelledby="desk-h">
      <h2 id="desk-h" tabIndex={-1}>The AI desk</h2>
      {aiFrom !== null && state.day < aiFrom && state.staffing.aiTier === 'none' ? (
        <p className="muted small">People do all the work for now. An AI desk can join from {dayLabel(aiFrom)}.</p>
      ) : (
      <>
      <p className="muted small">People work 9am to 3pm; an AI desk only makes, until 5pm.</p>
      <fieldset className="seg" disabled={disabled}>
        <legend>AI desk</legend>
        <div className="seg-row">
          {TIERS.map((t) => (
            <label key={t} className={`seg-opt${state.staffing.aiTier === t ? ' is-on' : ''}`}>
              <input type="radio" name="tier" checked={state.staffing.aiTier === t} onChange={() => setTier(t)} />
              <span>
                {TIER_LABEL[t]}
                <small>{aiDailyCost(state, t) ? `${aiDailyCost(state, t)} cr a day` : 'free'}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.staffing.aiTier !== 'none' && (
      <fieldset className="seg" disabled={disabled}>
        <legend>Who makes the work</legend>
        <div className="seg-row seg-col">
          {ROUTES.map((r) => (
            <label key={r} className={`seg-opt${state.staffing.routing === r ? ' is-on' : ''}`}>
              <input type="radio" name="route" checked={state.staffing.routing === r} onChange={() => setRoute(r)} />
              <span>
                {ROUTING_LABEL[r]}
                {r === 'all' && <small>AI-drafted tricky briefs need rework {oneIn(reworkBp(state, 'ai', 'nuanced'))}.</small>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      )}
      </>
      )}
      <div className="gauge" role="group" aria-label={`People's hours already promised over the next three days: ${hours(load.committed)} of ${hours(load.available)}${words ? `, ${words}` : ''}`}>
        <div className="gauge-label">
          <span>People's hours promised, next 3 days</span>
          <strong>
            {Math.round(load.committed / 60)} of {Math.round(load.available / 60)} h {words && <span className="gauge-words">{words}</span>}
          </strong>
        </div>
        <div className="gauge-track" aria-hidden="true">
          <div className={`gauge-fill${ratio > 1 ? ' over' : ratio > 0.85 ? ' tight' : ''}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        {today.committed > 0 && (
          <p className={`small gauge-today${todayRatio > 0.85 ? ' is-tight' : ''}`}>
            Due tonight: {hours(today.committed)} of today's {hours(today.available)}{todayRatio > 1 ? ', more than they have' : todayRatio > 0.85 ? ', nearly all of it' : ''}.
          </p>
        )}
        {yesterday && (
          <p className="muted small">
            Yesterday people were busy {Math.round(yesterday.people * 100)}% of their hours{yesterday.ai === null ? '.' : `, the AI desk ${Math.round(yesterday.ai * 100)}%.`}
          </p>
        )}
      </div>
    </section>
  );
});

const STAGE_COPY = { brief: 'waiting for a brief', produce: 'being made', finish: 'being finished', rework: 'needs rework', done: 'delivered' } as const;
const SHOWN = 8;

function PromiseRow({ state, j, evening }: { state: CompanyState; j: Job; evening: boolean }): JSX.Element {
  const dueDay = j.dueAt / RULES.minutesPerDay - 1;
  const who = j.assignee ? state.resources.find((r) => r.id === j.assignee)?.name : null;
  return (
    <li className={dueDay <= state.day ? 'due-today' : ''}>
      <span className="p-who">{promiseLabel(state, j.id)}</span>
      <span className="p-state">{j.status === 'scheduled' ? `starts ${dayLabel(j.releaseDay)}` : `${STAGE_COPY[j.stage]}${who ? ` (${who})` : ''}`}</span>
      <span className="p-due">{dueDay < state.day + 1 ? (evening ? `due tomorrow, ${dayLabel(dueDay)}` : 'due today') : `due ${dayLabel(dueDay)}`}</span>
    </li>
  );
}

export const PromisesList = memo(function PromisesList({ state, live, evening = false }: { state: CompanyState; live?: boolean; evening?: boolean }): JSX.Element {
  if (live) {
    return (
      <section className="panel promises" id="promises" aria-labelledby="prom-h">
        <h2 id="prom-h" tabIndex={-1}>Promises</h2>
        <p className="muted small">The day is under way. Follow it in the studio and the log; promises update this evening.</p>
      </section>
    );
  }
  const open = state.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled').sort((a, b) => a.dueAt - b.dueAt);
  return (
    <section className="panel promises" id="promises" aria-labelledby="prom-h">
      <h2 id="prom-h" tabIndex={-1}>Promises open ({open.length})</h2>
      {open.length === 0 ? (
        <p className="muted small">{state.contracts.length ? 'Every promise so far is kept or closed.' : 'Nothing promised yet. Take a request at the window.'}</p>
      ) : (
        <>
          <ol className="promise-list">
            {open.slice(0, SHOWN).map((j) => (
              <PromiseRow key={j.id} state={state} j={j} evening={evening} />
            ))}
          </ol>
          {open.length > SHOWN && (
            <details className="more">
              <summary>{open.length - SHOWN} more</summary>
              <ol className="promise-list">
                {open.slice(SHOWN).map((j) => (
                  <PromiseRow key={j.id} state={state} j={j} evening={evening} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
});
