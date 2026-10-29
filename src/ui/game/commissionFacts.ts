import { projectBlocked, projectBrief, projectQuote, type ProjectRecord } from '../../engine/projects';
import { hasAuthorshipRules } from '../../engine/versions';
import { validateDesign, type CreativeIntention, type DesignSpec } from '../../engine/design';
import { fits, forecast, projectForecast, reservationForecast, takeableInTurn } from '../../engine/selectors';
import { applyCommand, redoBpFor, reservationBlocked } from '../../engine/sim';
import type { CompanyState, ProjectApproach, ProjectId } from '../../engine/types';
import { forecastRisk } from './forecastRisk';
import { plannedCommandWork } from './plannedWork';

export function projectCompletionLine(record: ProjectRecord): string {
  if (record.id === 'lantern-night') return record.status === 'compromised' ? 'The original gathering programme is delivered. The extra change was declined.' : record.delivered === record.promised ? 'The gathering programme is delivered.' : record.status === 'working' ? 'The gathering programme is still in progress.' : 'The gathering programme is incomplete.';
  return record.earned ? 'The contribution has been earned.' : record.status === 'working' ? 'The contribution is earned only when the whole promise is complete.' : record.status === 'compromised' ? 'The original work was delivered, but declining the extra change withheld the gathering contribution.' : 'The contribution has not been earned.';
}

export function commissionQuote(state: CompanyState, id: ProjectId, approach: ProjectApproach, maker?: string, design?: DesignSpec, sourceId?: string) {
  const blocked = projectBlocked(state, id, approach, sourceId);
  if (blocked) return { blocked, quote: null };
  const brief = projectBrief(state, id, approach, sourceId);
  const chosen = design ?? brief.defaultDesign;
  if (hasAuthorshipRules(state.rulesVersion)) {
    const errors = validateDesign(brief, chosen);
    if (errors.length) return { blocked: errors[0]!, quote: null };
  }
  const quote = projectQuote(state, id, approach, chosen, sourceId);
  if (!quote) return { blocked: 'This commission cannot finish within the season.', quote: null };
  const command = { type: 'acceptProject' as const, projectId: id, approach, ...(sourceId ? { sourceId } : {}), ...(maker ? { maker } : {}), ...(hasAuthorshipRules(state.rulesVersion) ? { design: chosen } : {}) };
  const accepted = applyCommand(state, command);
  if (accepted.error) return { blocked: accepted.error, quote: null };
  const estimate = projectForecast(state, id, approach, { maker, design: chosen, sourceId })!;
  const redo = projectForecast(state, id, approach, { maker, design: chosen, sourceId, redo: true })!;
  const work = plannedCommandWork(state, command)!;
  const production = work.production.map(task => {
    const producer = accepted.state.resources.find(resource => resource.id === task.resourceId)!;
    const job = accepted.state.jobs.find(job => job.id === task.jobId)!;
    return { ...task, launch: job.launchIndex + 1, name: producer.name, firstTime: 100 - Math.round(redoBpFor(state, producer.kind, job.need, producer, task.day) / 100) };
  });
  return { blocked: null, quote, command, estimate, work, production, risk: forecastRisk(state, estimate, forecast(state), quote.offer.launches, fits(estimate) && !fits(redo), false), others: takeableInTurn(accepted.state).length };
}

/** The quote comes from the accepted native command; it never promises a named maker. */
export function studioSlot(state: CompanyState, requestId: string, startsInDays: 1 | 2, design?: DesignSpec, intention?: CreativeIntention) {
  const blocked = reservationBlocked(state, requestId, startsInDays);
  if (blocked) return { blocked, startsInDays, quote: null };
  const command = { type: 'reserve' as const, requestId, startsInDays, ...(design ? { design } : {}), ...(intention ? { intention } : {}) };
  const accepted = applyCommand(state, command);
  if (accepted.error) return { blocked: accepted.error, startsInDays, quote: null };
  const contract = accepted.state.contracts.at(-1)!;
  const estimate = reservationForecast(state, requestId, startsInDays, { design, intention })!;
  return { blocked: null, startsInDays, quote: contract, command, jobs: accepted.state.jobs.filter(job => job.contractId === contract.id), estimate, risk: forecastRisk(state, estimate, forecast(state), contract.offer.launches, false, false), others: takeableInTurn(accepted.state).length };
}
