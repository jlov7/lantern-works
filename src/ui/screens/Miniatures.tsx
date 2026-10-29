// The miniature as a hero on the title and end screens. Read-only frames from the timeline; nothing here plays a day.
import { useEffect, useMemo, useState, type JSX } from 'react';
import { createRun } from '../../engine/sim';
import type { CompanyState, RunConfig } from '../../engine/types';
import { clockLabel, frameAt, type WorldFrame } from '../timeline';
import { World } from '../world/World';

const CLOSE = 480;

/** The last evening of the season: the street at five, the shop closed, the rack holding every parcel delivered. */
function eveningFrame(state: CompanyState): WorldFrame {
  const f = frameAt(state, state, state.minute);
  return { ...f, played: true, offset: CLOSE, clock: clockLabel(CLOSE), peopleOnShift: false, neighbours: [] };
}

export function EndHero({ state, reducedMotion }: { state: CompanyState; reducedMotion: boolean }): JSX.Element {
  const frame = useMemo(() => eveningFrame(state), [state]);
  return (
    <div className="hero-world" data-hero="end">
      <World frame={frame} state={state} reducedMotion={reducedMotion} scenarioId={state.config.scenarioId} />
    </div>
  );
}

/** Where the title's day rests under reduced motion: mid-afternoon, lamps not yet lit. */
const STILL_AT = 330;
/** Real milliseconds per game minute while the title's day passes: about a minute from 9am to the blue hour. */
const MS_PER_MIN = 130;
const STOP_AT = 465;

/** Today's street on its first morning, with the light moving slowly toward evening while the title is open. */
export function TitleHero({ config, reducedMotion }: { config: RunConfig; reducedMotion: boolean }): JSX.Element {
  const base = useMemo(() => {
    const s = createRun(config);
    return frameAt(s, s, s.minute);
  }, [config]);
  const [moving, setOffset] = useState(0);
  const offset = reducedMotion ? STILL_AT : moving;
  useEffect(() => {
    if (reducedMotion) return;
    const t0 = performance.now();
    const timer = setInterval(() => {
      if (document.hidden) return;
      const next = Math.min(STOP_AT, Math.floor((performance.now() - t0) / MS_PER_MIN));
      setOffset(next);
      if (next >= STOP_AT) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  const frame: WorldFrame = { ...base, played: true, offset, minute: base.minute + offset, clock: clockLabel(offset), peopleOnShift: true };
  return (
    <div className="hero-world" data-hero="title">
      <World frame={frame} reducedMotion={reducedMotion} scenarioId={config.scenarioId} />
    </div>
  );
}
