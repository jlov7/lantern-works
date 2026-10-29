// Opening the shop: run the day in the engine, then play it back on a clock that only the time-showing parts follow.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RULES } from '../../engine/rules';
import { replay } from '../../engine/sim';
import type { CallOption, CompanyState } from '../../engine/types';
import { hasAuthorshipRules } from '../../engine/versions';
import { sounds } from '../sound';
import { clockLabel, frameAt } from '../timeline';
import type { RunHandle } from '../useRun';
import { Clock, type Playback } from './clock';
import { eveningFacts } from './eveningFacts';
import { digestAt } from './live';
import type { Speed } from '../SettingsDialog';
import { clearEvening, eveningUnseen, markEvening } from './storage';
import { previousMorning } from './resumeHistory';

const DAY = RULES.minutesPerDay;
/** Simulated minutes per real millisecond at 1x: a day plays in about eight seconds. */
const MIN_PER_MS = DAY / 8000;
/** The screen-reader digest speaks at most this often. */
const DIGEST_GAP_MS = 5000;

/** A reload in the evening, before moving on, shows that evening again; a reload during a call goes back to the call. */
function restoreEvening(run: RunHandle): Playback | null {
  const s = run.state;
  const cmds = s.commands;
  if (s.call && cmds.at(-1)?.type === 'runDay') {
    const before = previousMorning(s, run.history) ?? replay(s.config, cmds.slice(0, -1), s.rulesVersion).state;
    const clock = new Clock(before.minute, false);
    clock.holdAt(s.call.minute);
    clock.skip();
    return { before, after: s, clock };
  }
  const last = cmds.at(-1)?.type;
  if (s.finished || s.day === 0 || (last !== 'runDay' && last !== 'answer') || eveningUnseen(run.meta.id) !== s.day - 1) return null;
  const opened = cmds.findLastIndex((c) => c.type === 'runDay');
  const before = previousMorning(s, run.history) ?? replay(s.config, cmds.slice(0, opened), s.rulesVersion).state;
  return { before, after: s, clock: new Clock(before.minute, true) };
}

interface Options {
  run: RunHandle;
  reducedMotion: boolean;
  speed: Speed;
  sound: boolean;
  announce: (text: string) => void;
  onSeasonEnd: (s: CompanyState) => void;
}

export function usePlayback({ run, reducedMotion, speed, sound, announce, onSeasonEnd }: Options) {
  const [play, setPlay] = useState<Playback | null>(() => restoreEvening(run));
  // A call resumes the same clock before React replaces its subscriptions.
  const currentPlay = useRef(play);

  const open = useCallback((): string | null => {
    const before = run.current();
    const err = run.apply({ type: 'runDay', calls: true });
    if (err) return err;
    const after = run.current();
    if (!run.meta.readOnly) markEvening(run.meta.id, before.day);
    if (sound) sounds.open();
    const clock = new Clock(before.minute, reducedMotion && !after.call);
    // A booked lesson lasts one screen second at normal speed. Let the player see it before resuming.
    if (!reducedMotion && hasAuthorshipRules(before.rulesVersion) && frameAt(before, after, before.minute).workers.some(worker => worker.mentoring || worker.patternId)) clock.pause(true);
    if (after.call) clock.holdAt(after.call.minute);
    if (reducedMotion && after.call) clock.skip();
    currentPlay.current = { before, after, clock };
    setPlay(currentPlay.current);
    if (reducedMotion && !after.call) announce(`${eveningFacts({ before, after }).sentence} Evening.`);
    return null;
  }, [run, reducedMotion, sound, announce]);

  /** Answer a call: the rest of the day is worked out and plays on from the call. */
  const answerCall = useCallback(
    (option: CallOption): string | null => {
      if (!play) return null;
      const err = run.apply({ type: 'answer', option });
      if (err) return err;
      const after = run.current();
      currentPlay.current = { ...play, after };
      setPlay(currentPlay.current);
      play.clock.release();
      if (reducedMotion) play.clock.skip();
      return null;
    },
    [play, run, reducedMotion],
  );

  const next = useCallback(() => {
    clearEvening();
    currentPlay.current = null;
    setPlay(null);
    const s = run.current();
    if (s.finished) onSeasonEnd(s);
  }, [run, onSeasonEnd]);

  // Drive the clock with animation frames while the day is unfinished.
  useEffect(() => {
    if (!play) return;
    const { clock } = play;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last) clock.advance((now - last) * MIN_PER_MS * speed);
      last = now;
      raf = clock.get().done || clock.get().held ? 0 : requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && !clock.get().done && !clock.get().held) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    start();
    const off = clock.subscribe(start);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [play, speed]);

  // Chimes as things happen on the clock, an hourly digest for screen readers, and the evening summary.
  useEffect(() => {
    if (!play) return;
    const { clock } = play;
    const start = clock.start;
    let heard = clock.get().t;
    let hour = Math.floor((heard - start) / 60);
    let lastSaid = 0;
    let wasDone = clock.get().done;
    return clock.subscribe(() => {
      const latest = currentPlay.current;
      if (!latest || latest.clock !== clock) return;
      const { before, after } = latest;
      const { t, done } = clock.get();
      if (sound && t > heard) {
        for (const e of after.events) {
          if (e.minute <= heard || e.minute > t || e.minute < start) continue;
          if (e.type === 'delivered') sounds.delivered();
          else if (e.type === 'missed') sounds.missed();
          else if (e.type === 'kit_ready') sounds.kit();
        }
      }
      heard = t;
      const h = Math.floor((t - start) / 60);
      if (done && !wasDone) announce(`${eveningFacts(latest).sentence} Evening.`);
      else if (!done && h !== hour && performance.now() - lastSaid > DIGEST_GAP_MS) {
        lastSaid = performance.now();
        announce(digestAt(before, after, t, clockLabel(h * 60)));
      }
      hour = h;
      wasDone = done;
    });
  }, [play, sound, announce]);

  return { play, open, next, answerCall };
}
