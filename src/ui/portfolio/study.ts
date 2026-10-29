// Controlled visual fixtures: ordinary prerequisites are hand-placed; commissions run through the real engine.
// No delivery status, completion event or project outcome is painted into these states.
import { nightCalendar, projectBlocked, projectBrief } from '../../engine/projects';
import { PRESETS, RULES } from '../../engine/rules';
import { applyCommand, createRun } from '../../engine/sim';
import type { Command, CompanyState, ProjectApproach, ProjectId } from '../../engine/types';

function apply(state: CompanyState, command: Command): CompanyState {
  const result = applyCommand(state, command);
  if (result.error) throw new Error(result.error);
  return result.state;
}

export function advanceStudy(state: CompanyState, day: number): CompanyState {
  for (let i = state.day; i < Math.min(day, RULES.days); i++) {
    // Keep this study's queue controlled; all accepted requests and their production history remain intact.
    state.requests = state.requests.filter(r => r.status !== 'waiting');
    state = apply(state, { type: 'runDay' });
  }
  return state;
}

export function preparedStudy(scenarioId = 'main-street'): CompanyState {
  let state = createRun({ scenarioId, seed: 'project-art-study' });
  state = apply(state, { type: 'setStaff', staffing: { aiTier: 'duo', routing: 'all' } });
  state = apply(state, { type: 'buy', item: 'checklist' });
  state.requests = ['clem', 'mara', 'mara', 'hugo'].map((castId, index) => ({ id: `study-${index}`, day: 0, index, castId, segment: castId === 'mara' ? 'small' : 'careful', need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin', offer: { ...PRESETS.bespoke, price: 300, turnaroundDays: 2 } }));
  for (const request of state.requests) state = apply(state, { type: 'accept', requestId: request.id });
  return advanceStudy(state, 2);
}

export function milestoneStudy(projectId: ProjectId, approach: ProjectApproach): CompanyState {
  const state = preparedStudy();
  return advanceStudy(apply(state, { type: 'acceptProject', projectId, approach, design: projectBrief(state, projectId, approach).defaultDesign }), 9);
}

export function nightStudy(scenarioId = 'main-street', route: 'courtyard' | 'trail' | 'partial' | 'window' = 'courtyard'): CompanyState {
  let state = preparedStudy(scenarioId);
  const clemApproach = route === 'courtyard' ? 'first-night' : 'new-band';
  state = apply(state, { type: 'acceptProject', projectId: 'clem-ten', approach: clemApproach, design: projectBrief(state, 'clem-ten', clemApproach).defaultDesign });
  const partnerId = scenarioId === 'festival-week' ? 'mara-regular' : 'hugo-handover';
  const partnerApproach = scenarioId === 'festival-week' ? 'market-debut' : route === 'courtyard' ? 'quiet-sendoff' : 'open-bench';
  state = apply(state, { type: 'acceptProject', projectId: partnerId, approach: partnerApproach, design: projectBrief(state, partnerId, partnerApproach).defaultDesign });
  const calendar = nightCalendar(state);
  state = advanceStudy(state, calendar.opens);
  const approach = route === 'courtyard' ? 'courtyard' : 'trail';
  if (route !== 'window') {
    for (let day = state.day; day <= calendar.closes && projectBlocked(state, 'lantern-night', approach); day++) state = advanceStudy(state, day + 1);
    state = apply(state, { type: 'acceptProject', projectId: 'lantern-night', approach, design: projectBrief(state, 'lantern-night', approach).defaultDesign });
    if (route === 'partial') {
      state = apply(state, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } });
      state = advanceStudy(state, calendar.release);
      for (let day = calendar.release; day <= calendar.day; day++) state.modifiers.push({ kind: 'absent', who: 'h2', day, paid: true });
      for (let day = calendar.release + (calendar.careful ? 2 : 1); day <= calendar.day; day++) state.modifiers.push({ kind: 'absent', who: 'h1', day, paid: true });
    }
  }
  return advanceStudy(state, RULES.days);
}
