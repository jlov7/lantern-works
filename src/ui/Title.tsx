import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { GOALS } from '../engine/goals';
import { nightCalendar } from '../engine/projects';
import { RULES, SCENARIOS, scenarioById } from '../engine/rules';
import { PAR } from '../engine/selectors';
import type { RunConfig } from '../engine/types';
import { dayLabel } from './format';
import { HandbookButton } from './HandbookButton';
import { dailyConfig, loadRuns, loadStamps, subscribeRuns } from './persist';
import { replayFingerprint } from './resumeReplay';
import type { SavedRun } from './schema';
import { FIRST_SEASON, FIRST_SEASON_LABEL } from './screens/firstSeason';
import { TitleMiniature } from './screens/TitleMiniature';
import { SavesList } from './screens/SavesList';
import { olderSaves, type SaveFacts } from './screens/saves';
import { StampGlyph } from './screens/StampGlyph';
import { STAMPS } from './stamps';
import { useReducedMotion } from './useReducedMotion';
import '../styles/entry.css';

const STREET_HOOK: Record<string, string> = {
  'main-street': 'Win repeat work and decide which neighbourhood commissions to make room for.',
  'festival-week': 'Keep quick jobs moving while making room for an earlier lantern walk.',
  'bespoke-rush': 'Give demanding briefs time and attention, with an AI outage to plan around.',
};

function StreetChallenges({ id, name }: { id: string; name: string }) {
  const par = PAR[id];
  const goals = GOALS[id] ?? [];
  return <details className="street-challenges">
    <summary>Optional challenges</summary>
    {par && <p className="muted small">Gold: {par.gold} neighbours served.</p>}
    {goals.length > 0 && <ul className="goal-list" aria-label={`Side goals on ${name}`}>{goals.map(goal => <li key={goal.id}>{goal.label}</li>)}</ul>}
  </details>;
}

export function Title({ onStart, onResume, notice, onDismissNotice }: { onStart: (config: RunConfig, label: string, opts?: { guided?: boolean }) => void; onResume: (run: SavedRun) => void; notice: string | null; onDismissNotice?: () => void }): JSX.Element {
  const daily = useMemo(() => dailyConfig(), []);
  const reducedMotion = useReducedMotion();
  const [runs, setRuns] = useState(loadRuns);
  useEffect(() => subscribeRuns(setRuns), []);
  const hasSaves = runs.length > 0 || olderSaves().length > 0;
  const [stamps] = useState(loadStamps);
  // The most recent season still in progress, offered as the obvious next step.
  const [read, setRead] = useState<Map<string, SaveFacts | null>>(() => new Map());
  const readSave = useCallback((run: SavedRun, facts: SaveFacts | null) => {
    setRead(current => new Map(current).set(`${run.id}:${replayFingerprint(run)}`, facts));
  }, []);
  const latest = runs.map(run => ({ run, facts: read.get(`${run.id}:${replayFingerprint(run)}`) })).find(item => item.facts && !item.facts.finished);
  const seed = () => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 100000);
  const dailyScenario = scenarioById(daily.config.scenarioId);
  const dailyCalendar = nightCalendar({ config: daily.config });
  const playedToday = useMemo(() => loadRuns().filter((r) => r.config.seed === daily.config.seed && r.config.scenarioId === daily.config.scenarioId), [daily]);
  const startGuided = () => onStart(FIRST_SEASON, FIRST_SEASON_LABEL, { guided: true });
  const startDaily = () => onStart(daily.config, `Today's street, ${daily.label}`);

  return (
    <main className="title" id="main">
      <header className="title-hero">
        <div className="title-copy">
          <div className="title-sign" aria-hidden="true">
            <span>Lantern Works</span>
          </div>
          <h1 tabIndex={-1} data-screen-heading>
            Make something for your neighbours.
          </h1>
          <p className="lede">
            Open a small studio on a busy street. Take on commissions, make work with care, and see what your choices leave behind.
          </p>
          {notice && (
            <div className="banner banner-action" role="status">
              <p>{notice}</p>
              <div className="row wrap">
                <button type="button" className="btn btn-small" onClick={startDaily}>
                  Play today's street instead
                </button>
                {onDismissNotice && (
                  <button type="button" className="btn btn-small btn-quiet" onClick={onDismissNotice}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}
          {latest && (
            <div className="first-season">
              <p className="first-kicker">Pick up where you left off</p>
              <p>
                {latest.run.label}, {latest.facts!.progress}.
              </p>
              <button type="button" className="btn btn-primary btn-large" onClick={() => onResume(latest.run)}>
                Continue the season
              </button>
            </div>
          )}
          {!hasSaves && (
            <div className="first-season">
              <p className="first-kicker">Your first season</p>
              <p>Your first morning with Ada and Tomas, with a few pointers at the window.</p>
              <button type="button" className="btn btn-primary btn-large" onClick={startGuided}>
                First season: Main Street (guided)
              </button>
            </div>
          )}
          {hasSaves && !latest && <div className="first-season">
            <p className="first-kicker">A new season</p>
            <button type="button" className="btn btn-primary btn-large" onClick={startDaily}>Open the studio</button>
          </div>}
        </div>
        <TitleMiniature config={daily.config} reducedMotion={reducedMotion} />
      </header>

      <details className="title-drawer streets">
        <summary><h2>Pick a street</h2><small>Today’s street and other seasons</small></summary>
        <ul className="street-list">
          <li className="street street-daily">
            <p className="street-kicker">Today's street</p>
            <h3>{dailyScenario?.name ?? 'Today'}</h3>
            <p>{daily.label}. Everyone who plays today gets the same neighbours.</p>
            <p className="street-event">{dailyCalendar.name} · {dayLabel(dailyCalendar.day)}</p>
            {playedToday.length > 0 && <p className="small street-note">You have {playedToday.length === 1 ? 'a season' : `${playedToday.length} seasons`} on today's street below.</p>}
            <button type="button" className={`btn${hasSaves && !latest ? ' btn-primary' : ''}`} onClick={startDaily}>
              Open the studio
            </button>
            <StreetChallenges id={daily.config.scenarioId} name={dailyScenario?.name ?? 'Today'} />
          </li>
          {SCENARIOS.map((s) => { const calendar = nightCalendar({ config: { ...daily.config, scenarioId: s.id } }); return (
            <li key={s.id} className="street">
              <h3>{s.name}</h3>
              <p>{STREET_HOOK[s.id] ?? s.blurb}</p>
              <p className="street-event">{calendar.name} · {dayLabel(calendar.day)}</p>
              <button type="button" className="btn" onClick={() => onStart({ scenarioId: s.id, seed: seed() }, s.name)}>
                Play {s.name}
              </button>
              <StreetChallenges id={s.id} name={s.name} />
            </li>
          ); })}
        </ul>
        {hasSaves && (
          <p className="small first-again">
            <button type="button" className="btn btn-small btn-quiet" onClick={startGuided}>
              Play the guided first season again
            </button>
          </p>
        )}
      </details>

      <details className="title-drawer saved-drawer" hidden={!hasSaves} open={hasSaves || undefined}>
        <summary><span>Your seasons</span><small>Saved runs and replays</small></summary>
        <SavesList onResume={onResume} onStart={onStart} onRead={readSave} />
      </details>

      <details className="title-drawer how">
        <summary><span>How the studio works</span></summary>
        <p>Your makers share a limited workday. Choose who handles a tricky brief, train Noor as the studio grows, or reserve future studio time for a regular.</p>
        <p>AI can make work quicker, with more rework risk. Accepted prices and dates stay fixed. Customers pay up front, and that money stays owed until delivery.</p>
        <HandbookButton />
      </details>

      <details className="title-drawer stamp-book">
        <summary><span>Stamp book</span><small>Optional achievements</small></summary>
        <p className="muted small">
          {stamps.filter((id) => STAMPS.some((s) => s.id === id)).length} of {STAMPS.length} collected.
        </p>
        <ul className="stamps">
          {STAMPS.map((s) => {
            const got = stamps.includes(s.id);
            return (
              <li key={s.id} className={got ? 'got' : 'missing'}>
                <StampGlyph glyph={s.glyph} />
                <span className="stamp-text">
                  <strong>{got ? s.title : 'Not yet'}</strong>
                  <span>{s.hint}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
      <footer className="title-foot muted small">The street, people and numbers are fictional. Rules {RULES.version}. No account or API required, no tracking. Saves stay in this browser.</footer>
    </main>
  );
}
