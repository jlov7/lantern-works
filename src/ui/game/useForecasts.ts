import { useMemo } from 'react';
import { counterFor, forecast, reactionTo, windowRequests, type Forecast } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';

/** What taking each waiting buyer would do to the promises already made. Recomputed only when the state changes. */
export function useForecasts(state: CompanyState): Map<string, Forecast> {
  return useMemo(() => {
    const out = new Map<string, Forecast>();
    if (state.finished) return out;
    for (const r of windowRequests(state)) {
      if (r.status !== 'waiting') continue;
      if (reactionTo(state, r).kind === 'buy') out.set(r.id, forecast(state, r.id));
      else if (counterFor(state, r)) out.set(r.id, forecast(state, r.id, { counter: true }));
    }
    return out;
  }, [state]);
}
