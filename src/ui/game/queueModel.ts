import { counterFor, fits, forecast, reactionTo, takeableInTurn, windowRequests, type Forecast } from '../../engine/selectors';
import type { CompanyState, Request } from '../../engine/types';
import { makerAvailability } from './makers';

/** Shared queue facts for the roster, comparison and focused decision. Arrival order stays intact. */
export function queueModel(state: CompanyState, forecasts: Map<string, Forecast>) {
  const all = windowRequests(state);
  const waiting = all.filter(r => r.status === 'waiting');
  const makers = new Map(all.map(r => [r.id, makerAvailability(state, r)]));
  const withMaker = (r: Request) => makers.get(r.id)?.some(m => m.fits) ?? false;
  const tooLate = waiting.filter(r => {
    const reaction = reactionTo(state, r);
    const estimate = forecasts.get(r.id);
    return reaction.kind === 'buy' && estimate !== undefined && estimate.newAfterSeason.length >= reaction.offer.launches && !withMaker(r);
  });
  const buyers = waiting.filter(r => reactionTo(state, r).kind === 'buy' && !tooLate.includes(r));
  const hagglers = waiting.filter(r => reactionTo(state, r).kind === 'walk' && counterFor(state, r));
  const walkers = waiting.filter(r => reactionTo(state, r).kind === 'walk' && !hagglers.includes(r));
  const answered = all.filter(r => r.status !== 'waiting');
  const fitting = buyers.filter(r => { const estimate = forecasts.get(r.id); return estimate !== undefined && fits(estimate); });
  const namedOnly = buyers.filter(r => !fitting.includes(r) && withMaker(r));
  const conflicts = buyers.filter(r => !fitting.includes(r) && !withMaker(r));
  return { all, waiting, makers, tooLate, buyers, hagglers, walkers, answered, fitting, namedOnly, conflicts, baseline: forecast(state), together: takeableInTurn(state) };
}
