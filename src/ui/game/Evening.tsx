// The evening card: one sentence, three numbers, the race with the ghost studios, and at most two notes you can act on.
import { memo, type JSX, type ReactNode } from 'react';
import { RULES } from '../../engine/rules';
import { medalParFor, servedByDay, summarize } from '../../engine/selectors';
import { credits, dayLabel, pct, signed } from '../format';
import { type Playback } from './clock';
import { LogList } from './DayLog';
import { dayUtil, eveningFacts, goalMoved, insightsFor, overtaken, paceLine, prepFor, regularLoss, type InsightAction } from './eveningFacts';
import type { Command, CompanyState, ProjectId } from '../../engine/types';
import type { Opens } from './firstSeason';
import { logLines } from './log';
import { Coach } from './Guide';
import { GHOSTS } from '../../engine/policies';
import { GHOST_IDS, type GhostId, type GhostResult } from '../screens/ghosts';
import { eveningCommissionAftermath, eveningCommissionPayoffs } from './commissionPayoff';
import { CommissionPayoff } from '../portfolio/CommissionPayoff';

const DAY = RULES.minutesPerDay;


// Notes shown each evening, per street and seed, so a note that hasn't changed since yesterday stays quiet.
const shownNotes = new Map<string, string[]>();

const GHOST_LABEL = (id: GhostId) => GHOSTS[id].label;

interface Props {
  play: Playback;
  /** The studio now, with any moves made since the day closed: a move taken from this card shows as done. */
  live: CompanyState;
  /** The ghost studios on this street, or null while they are still being worked out. */
  ghosts: Record<GhostId, GhostResult> | null;
  reducedMotion: boolean;
  onAction: (a: InsightAction) => void;
  onHourByHour: () => void;
  onInvitation?: (id: ProjectId) => void;
  /** Whether Noor can still be hired, from the live state: once hired from this card, its button says so. */
  canHire: boolean;
  /** Apply one move for tomorrow; the morning is already open below. */
  onPrep: (c: Command) => void;
  /** First season: moves for systems not open yet tomorrow are left out. */
  opens: Opens;
  /** More for the folded day in full, from the morning below (the season's running tally). */
  extra?: ReactNode;
}

export const Evening = memo(function Evening({ play, live, ghosts, reducedMotion, onAction, onHourByHour, onInvitation, canHire, onPrep, opens, extra }: Props): JSX.Element {
  const { before, after } = play;
  const f = eveningFacts(play);
  const payoffs = eveningCommissionPayoffs(after, f.day, Math.min(after.minute, (f.day + 1) * DAY));
  const aftermath = eveningCommissionAftermath(after, f.day);
  const you = servedByDay(after)[f.day] ?? 0;
  const util = dayUtil(before, after);
  const today = (kind: string) => after.journal.filter((e) => e.day === f.day && e.kind === kind).reduce((a, e) => a + e.cash, 0);
  const running = today('wages') + today('shop') + today('ai');
  const refunds = today('refund') + today('fee');
  // Earned so far less every cost so far: the number that shows whether the studio is paying its way.
  const profit = summarize(after).operatingResult;

  const key = `${after.config.scenarioId}|${after.config.seed}`;
  const all = insightsFor(before, after, f.day, f.missed);
  const lost = regularLoss(after, f.day);
  const yesterday = shownNotes.get(`${key}|${f.day - 1}`) ?? [];
  // With the next morning open below, one note is enough: the evening above it stays a headline, not a report.
  const fresh = all.filter((n) => n.text !== lost && !yesterday.includes(n.text));
  // The evening ends on a choice: one move for tomorrow aimed at what today lost, or carry on as you are.
  const preps = prepFor(before, after, f.day).filter((p) => !(opens && ((p.command.type === 'flyers' && after.day < opens.flyers) || (p.command.type === 'buy' && after.day < opens.upgrades))));
  const covered = (a: InsightAction) => preps.length > 0 && (a === 'hire' || a === 'studio');
  // Above the next morning, one thing to act on: the prep moves when there are any, otherwise one note. A street that
  // changes tomorrow always says so.
  const notes = after.finished ? fresh.slice(0, 2) : preps.length ? fresh.filter((n) => n.text.startsWith('Tomorrow the street changes')).slice(0, 1) : fresh.slice(0, 1);
  // Moves made since the day closed (Undo takes them back, and the button returns).
  const since = live.commands.slice(after.commands.length).map((c) => JSON.stringify(c));
  shownNotes.set(`${key}|${f.day}`, notes.map((n) => n.text));

  const race = [{ id: 'you', label: 'You', n: you }, ...GHOST_IDS.map((id) => ({ id, label: GHOST_LABEL(id), n: ghosts?.[id].served[f.day] ?? 0 }))];
  const top = Math.max(1, ...race.map((r) => r.n));
  const par = medalParFor(after);
  const passed = ghosts ? overtaken(servedByDay(after), GHOST_IDS.map((id) => ({ label: GHOST_LABEL(id), served: ghosts[id].served })), f.day) : [];
  const goal = goalMoved(before, after);
  // The rivals' race and the money's small print: on screen on the season's last evening, folded into the day in
  // full while the next morning waits below, so the evening above it stays short.
  const extras = (
    <>
      {/* Only when the two figures could look contradictory: cash down on a day that earned, or the first evening. */}
      {(f.day === 0 || (f.cashChange < 0 && f.earned > 0)) && (
        <p className="small cash-why">
          Pay up front counts as earned once it ships. Today: {signed(today('receipt'))} paid, {signed(running)} running costs
          {refunds ? `, ${signed(refunds)} refunds and fees` : ''}
          {f.cashChange - today('receipt') - running - refunds ? `, ${signed(f.cashChange - today('receipt') - running - refunds)} other` : ''}.
        </p>
      )}
      {!after.config.continuation && <div className="race">
        <p className="race-title small">
          <span aria-hidden="true">{ghosts ? 'Served so far on this street' : 'Working out the other studios on this street...'}</span>
          <span className="vh">
            {ghosts ? `Neighbours served so far on this street: you ${you}, ${GHOST_IDS.map((id) => `${GHOST_LABEL(id)} ${ghosts[id].served[f.day] ?? 0}`).join(', ')}.` : 'Working out the other studios on this street.'}
          </span>
        </p>
        {/* Always one row per studio, so nothing below moves when the ghosts arrive. */}
        <ul className="race-bars" aria-hidden="true">
          {race.map((r) => (
            <li key={r.id} className={r.id === 'you' ? 'is-you' : ''}>
              <span className="race-name">{r.label}</span>
              <span className="race-bar" style={{ width: r.id === 'you' || ghosts ? `${(r.n / top) * 100}%` : 0 }} />
              <span className="race-n">{r.id === 'you' || ghosts ? r.n : ''}</span>
            </li>
          ))}
        </ul>
      </div>}
    </>
  );
  const moment = f.first ?? (passed.length ? `You passed ${passed.join(' and ')} today, counting neighbours served.` : null);
  // The money and a lost regular stay beside today's delivery result; chatter and the race fold away.
  const brief = !after.finished;
  const stats = (
    <dl className="evening-stats">
      <div className="hero">
        <dt>Earned today</dt>
        <dd>{credits(f.earned)}</dd>
      </div>
      <div>
        <dt>Running costs today</dt>
        <dd>{credits(-running)}</dd>
      </div>
      <div>
        <dt>Profit so far</dt>
        <dd className={profit < 0 ? 'neg' : ''}>{signed(profit)}</dd>
      </div>
    </dl>
  );
  const lead = lost ?? moment ?? f.note;

  return (
    <section className="evening" aria-labelledby="evening-h">
      <h2 id="evening-h" tabIndex={-1}>
        {dayLabel(f.day)}, evening{after.finished ? ', season over' : ''}
      </h2>
      {payoffs.map(payoff => <CommissionPayoff key={payoff.id} payoff={payoff} onInvitation={onInvitation} />)}
      <p className="evening-sentence">{f.sentence}</p>
      {aftermath && <div className="evening-aftermath"><p className="evening-note">{aftermath}</p><p className="small">A composition you made can become a pattern for another season. You choose which work to keep.</p><button type="button" className="btn btn-small btn-paper" onClick={() => onAction('patterns')}>Visit the pattern shelf</button></div>}
      {!brief && <p className="evening-chatter">{f.chatter}</p>}
      {brief ? lead && <p className={!lost && moment ? 'evening-first' : 'evening-note'}>{lead}</p> : moment && <p className="evening-first">{moment}</p>}
      {!brief && lost && <p className="evening-note">{lost}</p>}
      {!brief && f.note && <p className="evening-note">{f.note}</p>}
      {/* Paid capacity that sat idle, the evening it happens: the panel found players paying for a desk at 10%. */}
      {util.ai !== null && util.ai < 0.5 && today('ai') < 0 && (
        <p className="small idle-line">
          The AI desk was busy {pct(util.ai)} of its hours today, for {credits(-today('ai'))}.
        </p>
      )}
      {!brief && goal && <p className="evening-note evening-goal">{goal}</p>}
      {stats}
      {after.finished && extras}
      {notes.map((n) => (
        <div key={n.text} className="insight">
          <p>{n.text}</p>
          {!after.finished &&
            !covered(n.action) &&
            (n.action === 'hire' && !canHire ? (
              <p className="small insight-done">Hired.</p>
            ) : (
              <button type="button" className="btn btn-small btn-paper" onClick={() => onAction(n.action)}>
                {n.verb}
              </button>
            ))}
        </div>
      ))}
      {preps.length > 0 && !after.finished && (
        <div className="prep">
          <p className="prep-head">
            <strong>Before you open {dayLabel(after.day)}</strong> (or change nothing):
          </p>
          <ul>
            {preps.map((p) => (
              <li key={p.label}>
                {since.includes(JSON.stringify(p.command)) ? (
                  <p className="small insight-done">Done: {p.label}.</p>
                ) : (
                  <button type="button" className="btn btn-small btn-paper" onClick={() => onPrep(p.command)}>
                    {p.label}
                  </button>
                )}
                <span className="small">{p.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Coach step={3} manual />
      <details className="evening-more">
        <summary>{after.finished ? 'The day in full' : 'The day in full: the money, the street race, the log'}</summary>
        {brief && (
          <>
            {par && f.day > 0 && <p className="small medal-pace">{paceLine(you, f.day, par)}</p>}
            <p className="evening-chatter">{f.chatter}</p>
            {lost && moment && <p className="evening-first">{moment}</p>}
            {(moment || lost) && f.note && <p className="evening-note">{f.note}</p>}
            {goal && <p className="evening-note evening-goal">{goal}</p>}
            {extras}
          </>
        )}
        {extra}
        <p className="small">
          Cash change today {signed(f.cashChange)}.{' '}
          Paid up front {signed(today('receipt'))}, running costs {signed(running)}
          {refunds ? `, refunds and fees ${signed(refunds)}` : ''}. Earned means delivered; the rest is still owed.
        </p>
        <p className="small">
          People were busy {pct(util.people)} of their hours{util.ai === null ? '.' : `; the AI desk ${pct(util.ai)}.`}
        </p>
        <LogList lines={logLines(after, f.day, before.minute + DAY)} full />
        {reducedMotion && (
          <button type="button" className="btn btn-small btn-paper" onClick={onHourByHour}>
            Step through the day hour by hour
          </button>
        )}
      </details>
    </section>
  );
});
