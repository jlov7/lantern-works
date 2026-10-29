// The current decision: opening the morning, playing the day, reviewing its evening or approving a proof.
import { memo, useEffect, useRef, type JSX } from 'react';
import { RULES } from '../../engine/rules';
import { credits, dayLabel } from '../format';
import { clockLabel } from '../timeline';
import { useClock, type Playback } from './clock';
import { Coach } from './Guide';

const DAY = RULES.minutesPerDay;

interface Props {
  planning?: boolean;
  proofDecision?: { reviewing: boolean; blocked: boolean; invalid: boolean; onReturn: () => void };
  place: 'window' | 'work' | 'studio';
  onPlace: (place: 'window' | 'work' | 'studio') => void;
  onReview: () => void;
  day: number;
  finished: boolean;
  play: Playback | null;
  canUndo: boolean;
  onUndo: () => void;
  onOpen: () => void;
  onNext: () => void;
  /** What opening now brings by tonight if nothing needs redoing. */
  outlook: { delivered: number; earned: number; missed: number; running: number; leaving: number; buyersLeaving: number; fitLeaving: number; fitValue: number; haggling: number; regularsLeaving: string[] } | null;
  /** This morning's street news still needs an answer: the shop opens once it has one. */
  newsWaiting: boolean;
  /** Neighbours who named their own price and still need an answer before the shop opens. */
  haggling: number;
}

function Playing({ play }: { play: Playback }): JSX.Element {
  const { clock } = play;
  const t = useClock(clock, (c) => Math.floor(c.t));
  const paused = useClock(clock, (c) => c.paused);
  const held = useClock(clock, (c) => c.held);
  const offset = t - clock.start;
  return (
    <div className="playbar" role="group" aria-label="Day playback">
      <span className="clock" aria-hidden="true">
        {clockLabel(offset)}
      </span>
      <div className="playbar-track" aria-hidden="true">
        <div style={{ width: `${(offset / DAY) * 100}%` }} />
      </div>
      {held ? (
        <span className="small playbar-held">The day waits for your answer.</span>
      ) : (
        <>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => clock.pause(!paused)} aria-keyshortcuts="Space">
            {paused ? 'Resume' : 'Pause'}
          </button>
          {paused && (
            <button type="button" className="btn btn-small" onClick={() => clock.stepHour()}>
              Next hour
            </button>
          )}
          <button type="button" className="btn btn-small" onClick={() => clock.skip()} aria-keyshortcuts="S">
            Skip to evening
          </button>
        </>
      )}
    </div>
  );
}

export const ActionBar = memo(function ActionBar({ place, onPlace, onReview, day, finished, play, canUndo, onUndo, onOpen, onNext, outlook, newsWaiting, haggling, planning = false, proofDecision }: Props): JSX.Element | null {
  const done = useClock(play?.clock ?? null, (c) => c.done);
  const next = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const evening = play !== null && done;
  // The page keeps room for the bar at its real height, so the last cards can always scroll clear of it.
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      const flowing = window.innerHeight <= 580 || height > window.innerHeight / 3;
      el.dataset.flowing = String(flowing);
      document.documentElement.style.setProperty('--actionbar-h', `${flowing ? 0 : height}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); document.documentElement.style.removeProperty('--actionbar-h'); };
  }, []);
  // The evening's way on gets focus, so keyboard and screen-reader players land on it.
  useEffect(() => {
    if (evening) next.current?.focus({ preventScroll: true });
  }, [evening]);

  const regulars = outlook?.regularsLeaving ?? [];
  const reviewWaiting = !newsWaiting && (!!outlook?.fitLeaving || regulars.length > 0);
  const review = onReview;

  if (finished && !play) return null;
  return (
    <div ref={bar} className="actionbar workspace-dock" role="region" aria-label="Day controls">
      <Coach step={2} className="coach-up" />
      {!play && !proofDecision && newsWaiting && <p className="small outlook news-waiting" id="news-waiting">Answer the street news first.</p>}
      {!play && !proofDecision && !newsWaiting && haggling > 0 && (
        <p className="small outlook news-waiting" id="haggle-waiting">
          {haggling === 1 ? '1 neighbour named their own price' : `${haggling} neighbours named their own price`} at the window. Take any you want first: opening the shop turns the rest down.
        </p>
      )}
      {!play && !proofDecision && !newsWaiting && regulars.length > 0 && <p className="small outlook news-waiting" id="regulars-waiting">Opening now loses {regulars.length === 1 ? 'a regular' : `${regulars.length} regulars`} over unanswered new orders: {regulars.join(', ')}. They will not return.</p>}
      <div className="actionbar-row">
        {play && !done ? (
          <Playing play={play} />
        ) : evening ? (
          <button ref={next} type="button" className="btn btn-primary btn-open" onClick={onNext} aria-keyshortcuts="Enter">
            {finished ? 'See how the season went' : "Review tomorrow's window"}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            {proofDecision ? proofDecision.blocked ? <button type="button" className="btn btn-primary" onClick={proofDecision.onReturn}>Keep sketch & return to customers</button> : <button type="submit" form="project-proof-decision" className="btn btn-primary" disabled={planning || proofDecision.invalid}>{proofDecision.reviewing ? 'Book this proof' : 'Review proof & promise'}</button> : <>
            {(newsWaiting || reviewWaiting) && <button type="button" className="btn btn-primary btn-review" onClick={review}>{newsWaiting ? 'Answer street news' : 'Review waiting buyers'}</button>}
            <button type="button" className={`btn btn-open${newsWaiting || reviewWaiting ? '' : ' btn-primary'}`} onClick={onOpen} disabled={planning} aria-keyshortcuts="Space" aria-describedby={newsWaiting ? 'news-waiting' : [haggling ? 'haggle-waiting' : '', regulars.length ? 'regulars-waiting' : '', outlook ? 'outlook' : ''].filter(Boolean).join(' ') || undefined}>
              <span>Open <span className="open-words">the shop for </span>{dayLabel(day)}</span>
              {haggling > 0 && !newsWaiting && <span className="open-sub"><span className="vh">, </span>turning down {haggling === 1 ? '1 price offer' : `${haggling} price offers`}</span>}
              {!haggling && !newsWaiting && outlook && outlook.fitLeaving > 0 && <span className="open-sub"><span className="vh">, </span>turning away {outlook.fitLeaving} buyer{outlook.fitLeaving === 1 ? '' : 's'} who fit ({credits(outlook.fitValue)})</span>}
            </button>
            </>}
          </>
        )}
      </div>
      {!proofDecision && <nav className="place-nav" aria-label="Game places">{(['window', 'work', 'studio'] as const).map(destination => <button key={destination} type="button" className="btn" aria-current={place === destination ? 'page' : undefined} onClick={() => onPlace(destination)}>{destination === 'window' ? 'Window' : destination === 'work' ? 'Work' : 'Studio'}</button>)}</nav>}
    </div>
  );
});
