import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { goalsFor } from '../engine/goals';
import { CAST_BY_ID, scenarioById } from '../engine/rules';
import { medalFor, medalParFor, summarize } from '../engine/selectors';
import type { CompanyState, RunConfig } from '../engine/types';
import { dayLabel } from './format';
import { addStamps, loadPrefs, loadStamps } from './persist';
import { GHOST_IDS, useGhosts } from './screens/ghosts';
import { gazette } from './screens/gazette';
import { GazettePage } from './screens/GazettePage';
import { scrapbook } from './screens/scrapbook';
import { missReasons } from './game/eveningFacts';
import { RULES } from '../engine/rules';
import { GHOSTS } from '../engine/policies';
import { seasonEnding } from '../engine/endings';
import { relationshipEpilogues } from './game/relationshipSummary';
import { BranchCompare, StudioCompare } from './screens/EndCompare';
import { EndDebrief } from './screens/EndDebrief';
import { EndShare } from './screens/EndShare';
import { MedalObject } from './screens/Medal';
import { EndHero } from './screens/Miniatures';
import { DAY_GLYPH, dayEvents, dayMarks } from './screens/season';
import { StampGlyph } from './screens/StampGlyph';
import { sounds } from './sound';
import { earnedStamps, STAMPS } from './stamps';
import { useReducedMotion } from './useReducedMotion';
import { useRun, type RunMeta } from './useRun';
import { PortfolioGallery } from './portfolio/PortfolioGallery';
import { neighbourLook } from './world/looks';
import { Figure } from './world/parts';
import { hasAuthorshipRules, hasStudioRules } from '../engine/versions';
import { noorWork, MENTORING } from '../engine/mentoring';
import { seasonCommissionPayoff } from './game/commissionPayoff';
import { CommissionPayoff } from './portfolio/CommissionPayoff';
import { ContinueStudio } from './creative/ContinueStudio';
import { NeighbourhoodWalk } from './neighbourhood/NeighbourhoodWalk';
import { CareerProgress } from './creative/CareerProgress';
import { FeaturedWork } from './creative/FeaturedWork';
import { careerIdentity } from './game/careerIdentity';

const tierName = (m: string | null) => (m ? `${m[0]!.toUpperCase()}${m.slice(1)}` : null);

export function EndScreen({ state: initialState, meta: initialMeta, onBranch, onNewSeason, onContinue, onHome }: { state: CompanyState; meta: RunMeta; onBranch: (day: number, state: CompanyState, meta: RunMeta) => void; onNewSeason: () => void; onContinue: (config: RunConfig, rulesVersion: string) => void; onHome: () => void }): JSX.Element {
  const run = useRun({ state: initialState, meta: initialMeta });
  const { state, meta } = run;
  const career = careerIdentity(state);
  const [continuing, setContinuing] = useState(false);
  const sum = summarize(state);
  const end = useMemo(() => seasonEnding(state), [state]);
  const payoff = useMemo(() => seasonCommissionPayoff(state), [state]);
  const regulars = useMemo(() => relationshipEpilogues(state), [state]);
  const medal = medalFor(state);
  const par = medalParFor(state);
  const goals = goalsFor(state);
  // Every missed launch by day and cause, so a broken promise on the end screen can be traced to its morning.
  const misses = Array.from({ length: RULES.days }, (_, d) => missReasons(state, d).map((why) => `${dayLabel(d)}: ${why}`)).flat();
  const reducedMotion = useReducedMotion();
  const readOnly = meta.readOnly === true;
  const ghosts = useGhosts(state.config, state.rulesVersion);
  const currentRules = hasStudioRules(state.rulesVersion);
  const development = noorWork(state);
  const events = useMemo(() => dayEvents(state), [state]);
  const marks = useMemo(() => dayMarks(state), [state]);

  const [stampsBefore] = useState(loadStamps);
  const earned = useMemo(() => earnedStamps(initialState, ghosts ? { brightServed: ghosts.bright.summary.served } : {}), [initialState, ghosts]);
  const fresh = readOnly ? [] : earned.filter((id) => !stampsBefore.includes(id));

  const hero = useRef<HTMLDivElement>(null);
  const rewindH = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!readOnly) addStamps(earned);
  }, [earned, readOnly]);

  // The medal moment: one short fanfare, only for your own season and only when sound is on.
  useEffect(() => {
    if (!readOnly && medal.medal && loadPrefs().sound) sounds.medal();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tryBranch = () => {
    const h = rewindH.current;
    h?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    h?.focus({ preventScroll: true });
  };

  const scen = scenarioById(state.config.scenarioId);
  const medalLine = state.config.continuation ? `Season ${state.config.continuation.season}` : medal.medal ? `${tierName(medal.medal)} medal` : 'No medal this time';
  const paper = useMemo(() => gazette(state, ghosts ? GHOST_IDS.map((id) => ({ label: GHOSTS[id].label, served: ghosts[id].summary.served })) : null), [state, ghosts]);
  const shownStamps = STAMPS.filter((s) => earned.includes(s.id));
  const clippings = useMemo(() => scrapbook(state), [state]);
  const authored = hasAuthorshipRules(state.rulesVersion);
  const picture = <div ref={hero} className="end-picture">{authored && (payoff || state.featuredPieceIds?.length) ? <NeighbourhoodWalk state={state} /> : payoff ? <CommissionPayoff payoff={payoff} variant="hero" /> : <EndHero state={state} reducedMotion={reducedMotion} />}</div>;

  return (
    <main className="end" id="main">
      {initialMeta.readOnly && !readOnly && <p className="banner" role="status">Copy saved in this browser. You can find this season on the street map.</p>}
      {!run.storageOk && <p className="banner" role="status">This browser could not save your latest moves. Previously saved seasons remain stored. Keep this tab open to retain the moves since the last successful save.</p>}
      {run.saved === 'stale' && <p className="banner" role="status">This season continued in another tab. Moves here are no longer saved; reopen it from the street map.</p>}
      {readOnly && (
        <aside className="shared-banner" aria-label="Shared season">
          <p role="status">Replay preview. This season is not saved in this browser.</p>
          <p>
            <strong>
              A friend served {sum.served} on {scen?.name ?? 'this street'}.
            </strong>{' '}
            Can you beat it? Same street, same neighbours; the choices are yours.
          </p>
          <button type="button" className="btn btn-primary" onClick={run.keepCopy}>
            Keep a copy
          </button>{' '}
          <button type="button" className="btn btn-primary" onClick={onNewSeason}>
            Play this street
          </button>
        </aside>
      )}

      <header className={`end-hero${authored ? ' end-hero-authored' : ''}`}>
        {!authored && picture}
        <div className="end-verdict">
          <p className="end-eyebrow">
            {meta.label.includes(scen?.name ?? '\u0000') ? meta.label : `${scen?.name}, ${meta.label}`} <span className="muted">· seed {state.config.seed}</span>
          </p>
          <h1 tabIndex={-1} data-screen-heading>
            {end.title}
          </h1>
          <p className="end-line">{end.line}</p>
          {currentRules && <p className="small end-balance">Closing cash: {sum.cash.toLocaleString('en-GB')} cr. {sum.delivered} launches delivered; {sum.missed + sum.refundedAtClose} missed or refunded.</p>}
          {currentRules && development && development.completed > 0 && <p className="small end-development">{MENTORING[development.kind].name} led to {development.completed} completed {development.completed === 1 ? 'task' : 'tasks'} using Noor’s new specialism. She is still part of the studio.</p>}
          <details className="end-challenge" open={!currentRules}>
          <summary hidden={!currentRules}>Optional challenges: medals and side goals</summary>
          <div className={`medal-block medal-${medal.medal ?? 'none'}`}>
            <MedalObject tier={medal.medal} size={112} />
            <div className="medal-words">
              <strong>{medalLine}</strong>
              <span>{medal.reason}</span>
              {par && (
                <details className="medal-rules small">
                  <summary>Medal rules</summary>
                  <p className="muted">
                  Medals count neighbours served, whole orders delivered: bronze {par.bronze}, silver {par.silver}, gold {par.gold}, as long as 90% of promises are kept and the studio is not overdrawn at the close. Silver and gold also need the season in profit.
                  </p>
                </details>
              )}
              {goals.length > 0 && (
                <ul className="goals" aria-label="Side goals">
                  {goals.map(({ goal, met }) => (
                    <li key={goal.id} className={met ? 'met' : 'unmet'}>
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                        {met ? <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />}
                      </svg>
                      {goal.label}: {met ? 'met' : `not met (${goal.progress(state)})`}
                    </li>
                  ))}
                </ul>
              )}
              {/* The first three, so a season of many misses does not push the next steps below the fold. */}
              {misses.length > 0 && (
                <span className="muted small">
                  Missed: {misses.slice(0, 3).join('; ')}
                  {misses.length > 3 ? `; and ${misses.length - 3} more` : ''}.
                </span>
              )}
            </div>
          </div>
          </details>
          <div className="end-actions">
            {!readOnly && hasAuthorshipRules(state.rulesVersion) && <button type="button" className="btn btn-primary" onClick={() => setContinuing(true)}>{career?.complete ? 'Continue in open studio' : 'Continue this studio'}</button>}
            {!readOnly && (
              <button type="button" className="btn btn-primary" onClick={onNewSeason}>
                Play this street again
              </button>
            )}
            <button type="button" className="btn" onClick={tryBranch}>
              {readOnly ? 'Try a branch from their season' : 'Try a branch'}
            </button>
          </div>
        </div>
        {authored && picture}
      </header>

      <CareerProgress state={state} />
      {regulars.length > 0 && (
        <section className="end-regulars" aria-labelledby="reg-h">
          <h2 id="reg-h">The regulars</h2>
          <ul>
            {regulars.map((r) => (
              <li key={r.castId}><svg className="regular-portrait" viewBox="-28 -82 56 88" aria-hidden="true" stroke="var(--ink)" strokeWidth={1.2}><g transform="translate(0 -2)"><Figure look={neighbourLook(r.castId, CAST_BY_ID[r.castId]?.hue ?? 220)} pose="front" /></g></svg><span>{r.line}</span></li>
            ))}
          </ul>
        </section>
      )}

      {!readOnly && <FeaturedWork state={state} onFeature={pieceIds => run.apply({ type: 'featurePieces', pieceIds })} onUndo={run.undo} canUndo={state.commands.at(-1)?.type === 'featurePieces' && run.canUndo} disabled={run.saved === 'stale'} />}
      <PortfolioGallery state={state} heading="The season’s body of work" />

      <div className="end-records">
      <details className="end-disclosure"><summary>The Gazette: how the street remembers it</summary><div><GazettePage paper={paper} id="gz-h" /></div></details>

      {/* What happened and why, straight after the story: the explanation matters more than the keepsakes below it. */}
      <details className="end-disclosure"><summary>The studio ledger: what happened and why</summary><div><EndDebrief state={state} readOnly={readOnly} onBranch={day => onBranch(day, state, meta)} /></div></details>

      <details className="end-disclosure"><summary>Keepsakes: moments and stamps</summary><div>

      {clippings.length > 0 && (
        <section className="end-scrapbook" aria-labelledby="sb-h">
          <h2 id="sb-h">The season in moments</h2>
          <ol>
            {clippings.map((c) => (
              <li key={c.day} className={`clip clip-${c.kind}`}>
                <span className="clip-day">{dayLabel(c.day)}</span> {c.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      {shownStamps.length > 0 && (
        <section className="end-stamps" aria-labelledby="st-h">
          <h2 id="st-h">{readOnly ? 'Stamps this season earned' : 'Stamps'}</h2>
          <ul className="stamps">
            {shownStamps.map((s, i) => {
              const isNew = fresh.includes(s.id);
              return (
                <li key={s.id} className={`got${isNew ? ' new' : ''}`} style={isNew ? { animationDelay: `${300 + i * 140}ms` } : undefined}>
                  <StampGlyph glyph={s.glyph} />
                  <span className="stamp-text">
                    <strong>{s.title}</strong>
                    <span>{s.hint}</span>
                    {isNew && <em>New</em>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      </div></details>

      <details className="end-disclosure"><summary>Other ways this street could have gone</summary><div>
      {meta.parentId && <BranchCompare state={state} meta={meta} />}

      <StudioCompare state={state} ghosts={ghosts} />
      </div></details>
      </div>

      <section className="end-rewind" aria-labelledby="rw-h">
        <h2 id="rw-h" ref={rewindH} tabIndex={-1}>
          What if?
        </h2>
        <p className="muted small">Go back to any morning and try something else. {readOnly ? 'Their season stays as it was; yours starts from that morning.' : 'This season stays saved; the new one is a branch.'}</p>
        <ol className="rewind-days">
          {events.map((ev, d) => (
            <li key={d}>
              <button type="button" className="rewind-day" onClick={() => onBranch(d, state, meta)}>
                <span className="rewind-n">
                  {dayLabel(d)} <span aria-hidden="true">{DAY_GLYPH[marks[d]!]}</span>
                </span>
                <span className="rewind-ev">{ev}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <details className="end-disclosure"><summary>Keep a postcard or share this season</summary><div><EndShare state={state} title={end.title} line={end.line} medalLine={medalLine} hero={hero} /></div></details>

      {continuing && <ContinueStudio state={state} onClose={() => setContinuing(false)} onContinue={onContinue} />}
      <footer className="end-foot row wrap">
        <button type="button" className="btn btn-quiet" onClick={onHome}>
          Choose another street
        </button>
      </footer>
    </main>
  );
}
