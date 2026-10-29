import type { Forecast } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { promiseLabel } from './promiseLabel';

export function lateNames(state: CompanyState, ids: string[]): string {
  const names = ids.slice(0, 2).map(id => promiseLabel(state, id));
  return `${names.join(' and ')}${ids.length > 2 ? ` and ${ids.length - 2} more` : ''}`;
}

/** Attribute only failures added by this admission; keep existing misses and closing refunds distinct. */
export function forecastRisk(state: CompanyState, after: Forecast, baseline: Forecast, launches: number, tight: boolean, stake: boolean): { tone: 'ok' | 'warn' | 'bad'; chip: string; detail: string | null } {
  const newlyLate = after.atRisk.filter((id) => !baseline.atRisk.includes(id));
  const alreadyLate = after.atRisk.filter((id) => baseline.atRisk.includes(id));
  const newlyRefunded = after.existingAfterSeason.filter((id) => !baseline.existingAfterSeason.includes(id));
  const alreadyRefunded = after.existingAfterSeason.filter((id) => baseline.existingAfterSeason.includes(id));
  const season = after.newAfterSeason.length;
  const ownLate = after.newAtRisk.length > 0;
  const details: string[] = [];
  if (season >= launches) details.push("This can't be finished before the season ends. It would be refunded.");
  else {
    if (ownLate) details.push('This order would be late, even without redos or changes.');
    if (season) details.push(`${season} of ${launches} launches fall after the season ends and would be refunded.`);
  }
  if (newlyLate.length) details.push(`Taking this would make ${lateNames(state, newlyLate)} late.`);
  if (newlyRefunded.length) details.push(`Taking this would leave ${lateNames(state, newlyRefunded)} unfinished at closing. That work would be refunded.`);
  if (alreadyLate.length) {
    if (!ownLate && !season && !newlyLate.length && !newlyRefunded.length) details.push('No additional misses if no redos or changes.');
    details.push(`Already late without this order: ${lateNames(state, alreadyLate)}.`);
  }
  if (alreadyRefunded.length) {
    if (!ownLate && !season && !newlyLate.length && !newlyRefunded.length && !alreadyLate.length) details.push('No additional refunds if no redos or changes.');
    details.push(`Already unfinished at closing without this order: ${lateNames(state, alreadyRefunded)}. That work would be refunded.`);
  }
  if (tight) details.push('Redos could make this or other work late, or leave it unfinished at closing.');
  const detail = details.length ? details.join(' ') : null;
  if (season >= launches) return { tone: 'bad', chip: 'Too late in the season.', detail };
  if (ownLate) return { tone: 'bad', chip: 'Late.', detail };
  if (newlyRefunded.length) return { tone: 'warn', chip: 'Would cause a closing refund.', detail };
  if (newlyLate.length) return { tone: 'warn', chip: 'Makes an existing promise late.', detail };
  if (alreadyRefunded.length) return { tone: 'warn', chip: 'Already faces a closing refund.', detail };
  if (alreadyLate.length) return { tone: 'warn', chip: 'Existing promises already late.', detail };
  if (season) return { tone: 'warn', chip: 'Fits, part refunded.', detail };
  if (tight) return { tone: 'warn', chip: `Fits, with redo risk${stake ? '; a miss now would cost the medal' : ''}.`, detail };
  return { tone: 'ok', chip: 'Fits.', detail };
}
