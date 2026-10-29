// Sticky top bar: the day, the money and the score, ticking with the clock while a day plays.
import { memo, useEffect, useRef, type JSX, type ReactNode } from 'react';
import { RULES } from '../../engine/rules';
import { medalParFor } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { credits, dayLabel, num, pct, runwayLabel } from '../format';
import { clockLabel } from '../timeline';
import { useClock, type Playback } from './clock';
import { profitHeading } from './eveningFacts';
import { statsAt, statsOf } from './live';
import { Rolling } from './Rolling';

interface Props {
  state: CompanyState;
  play: Playback | null;
  street: string;
  branch: boolean;
  claudeOn: boolean;
  speed: number;
  sound: boolean;
  reduced: boolean;
  onExit: () => void;
  onBooks: () => void;
  onKey: () => void;
  onSettings: () => void;
  children?: ReactNode;
}

const DAY = RULES.minutesPerDay;

/** "silver at 35": the next medal's threshold in neighbours served, or the top one reached. */
/** How many more misses the 90% kept that medals need can take, at the deliveries so far. */
const spareMisses = (delivered: number, missed: number): string => {
  const spare = Math.floor(delivered / 9) - missed;
  return spare < 0 ? 'under 90%: no medal' : spare === 0 ? 'next miss: under 90%' : `${spare} miss${spare === 1 ? '' : 'es'} to spare`;
};
const nextMedal = (served: number, par: { bronze: number; silver: number; gold: number }): string => {
  const next = (['bronze', 'silver', 'gold'] as const).find((m) => served < par[m]);
  return next ? `${par[next] - served} more for ${next}` : 'gold reached';
};

export const TopBar = memo(function TopBar(p: Props): JSX.Element {
  const t = useClock(p.play?.clock ?? null, (c) => (c.done ? -2 : Math.floor(c.t)));
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--topbar-h');
    };
  }, []);
  const { play, state } = p;
  const par = medalParFor(state);
  const playing = play !== null && t !== -2;
  const s = play ? (playing ? statsAt(play.before, play.after, t) : statsOf(play.after)) : statsOf(state);
  const day = play ? Math.floor(play.before.minute / DAY) : state.day;
  // Mornings only: during a day the bar ticks with the clock, and the heading is the morning's.
  const heading = play ? null : profitHeading(state);
  const when = play ? (playing ? clockLabel(t - day * DAY) : 'evening') : state.finished ? null : `of ${RULES.days}`;

  const tools = (
    <>
      <button type="button" className={`btn btn-small btn-tool${p.claudeOn ? ' is-on' : ''}`} onClick={p.onKey}>
        {p.claudeOn ? 'Claude on' : 'Use Claude'}
      </button>
      <button type="button" className="btn btn-small btn-tool btn-settings" onClick={event => { event.currentTarget.focus({ preventScroll: true }); p.onSettings(); }}>
        Settings
        <span className="tool-state" aria-hidden="true">
          {p.speed}x, sound {p.sound ? 'on' : 'off'}
        </span>
      </button>
    </>
  );

  return (
    <header className="topbar-wrap" ref={bar}>
      <div className="topbar">
        <button type="button" className="brand" onClick={p.onExit} aria-label="Lantern Works: back to the street map">
          <span className="brand-lamp" aria-hidden="true" />
          <span className="brand-name">Lantern Works</span>
        </button>
        <div className="topbar-day">
          <span className="day">
            {state.finished && !play ? 'Season over' : dayLabel(day)} {when && <span className="day-when">{when}</span>}
          </span>
          <span className="topbar-street">
            {p.street}
            {p.branch && <span className="tag tag-branch">branch</span>}
          </span>
        </div>
        <div className="topbar-stats">
          <button type="button" className={`stat stat-cash${s.cash < 0 ? ' neg' : ''}`} onClick={p.onBooks} aria-label={`Cash ${credits(s.cash)}, ${runwayLabel(s.runway)}. Open the books.`}>
            <span className="stat-label">Cash</span>
            <strong>
              <Rolling value={s.cash} format={credits} reduced={p.reduced} />
            </strong>
            <span className="stat-sub">{runwayLabel(s.runway)}</span>
          </button>
          <div className="stat stat-owed">
            <span className="stat-label">Owed</span>
            <strong>
              <Rolling value={s.owed} format={credits} reduced={p.reduced} chip={false} />
            </strong>
          </div>
          <div className="stat stat-served" title="Neighbours whose whole order was delivered">
            <span className="stat-label">Served</span>
            <strong>
              <Rolling value={s.served} format={num} reduced={p.reduced} />
            </strong>
            {/* The next medal, always in view: the season is scored on neighbours served. */}
            {par && <span className="stat-sub">{nextMedal(s.served, par)}</span>}
          </div>
          <div className={`stat stat-profit${s.profit < 0 ? ' neg' : ''}`} title="Earned from delivered launches, less every cost so far. Silver and gold need it above zero at the close.">
            <span className="stat-label">Profit</span>
            <strong>
              <Rolling value={s.profit} format={credits} reduced={p.reduced} chip={false} />
            </strong>
            {/* Where the season's profit is heading, each morning: silver and gold need it above zero at the close. */}
            {par && heading !== null ? (
              <span className="stat-sub">
                at this pace {heading < 0 ? '-' : '+'}
                {credits(Math.abs(heading))}
                {heading < 0 ? ', bronze at most' : ''}
              </span>
            ) : (
              par && s.profit < 0 && <span className="stat-sub">a loss caps you at bronze</span>
            )}
          </div>
          <div className="stat stat-kept" title="Medals need at least 90% of promises kept">
            <span className="stat-label">Kept</span>
            <strong>{pct(s.kept)}</strong>
            {par && <span className="stat-sub">{spareMisses(s.delivered, s.missed)}</span>}
          </div>
        </div>
        <div className="topbar-tools">{tools}</div>
        <details className="topbar-more">
          <summary aria-label="More: the books, Claude and settings">More</summary>
          <div className="more-panel">
            <p className="small">
              Served {num(s.served)}{par ? ` (${nextMedal(s.served, par)})` : ''}. Owed {credits(s.owed)}. Profit so far {credits(s.profit)}. Kept {pct(s.kept)}. {runwayLabel(s.runway)}.
            </p>
            <div className="more-tools">{tools}</div>
          </div>
        </details>
      </div>
      {p.children}
    </header>
  );
});
