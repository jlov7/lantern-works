import { describe, expect, it } from 'vitest';
import { RULES } from '../engine/rules';
import { createRun } from '../engine/sim';
import type { CompanyState, ProjectApproach, ProjectId } from '../engine/types';
import { CURRENT_RULES_VERSION } from '../engine/versions';
import { STAMPS } from './stamps';

const DAY = RULES.minutesPerDay;
const stamp = (id: string) => STAMPS.find(s => s.id === id)!.earned;

/** Hand-placed final states isolate stamp predicates from seasonal arrival randomness. */
function season(): CompanyState {
  const s = createRun({ scenarioId: 'main-street', seed: 'studio-stamp-fixture' }, CURRENT_RULES_VERSION);
  s.day = RULES.days;
  s.minute = RULES.days * DAY;
  s.finished = true;
  return s;
}

function project(s: CompanyState, approach: ProjectApproach, statuses: ('delivered' | 'missed' | 'refunded')[] = ['delivered', 'delivered', 'delivered']): void {
  const id: ProjectId = 'lantern-night';
  const contractId = 'night-contract';
  const requestId = 'night-request';
  const jobIds = statuses.map((_status, i) => `night-job-${i}`);
  s.contracts.push({
    id: contractId, seq: s.contracts.length, requestId, castId: 'association', segment: 'moment',
    offer: { name: 'Lantern Night', launches: 3, spacingDays: 0, turnaroundDays: 1, scope: 'simple', style: 'custom', price: 1200 },
    price: 1200, acceptedDay: 7, jobIds, project: { id, approach, materials: 0, contributors: [] },
  });
  statuses.forEach((status, i) => s.jobs.push({
    id: jobIds[i]!, contractId, castId: 'association', launchIndex: i, releaseDay: 9, dueAt: 12 * DAY,
    allocation: 400, need: 'simple', templated: false, status,
    stage: status === 'delivered' ? 'done' : 'finish',
    remaining: status === 'missed' ? 10 : 0, assignee: status === 'delivered' ? 'h1' : null,
    method: status === 'delivered' ? 'human' : null, reworkFlag: false, deliveredAt: status === 'delivered' ? 11 * DAY : null,
  }));
  if (statuses.every(status => status === 'delivered')) s.events.push({ day: 11, minute: 12 * DAY, type: 'project_completed', requestId });
}

function reserved(s: CompanyState, index: number, status: 'delivered' | 'missed' | 'refunded' = 'delivered'): void {
  const contractId = `reserved-${index}`;
  const jobId = `${contractId}-job`;
  s.contracts.push({ id: contractId, seq: s.contracts.length, requestId: contractId, castId: 'clem', segment: 'moment', offer: { name: `Reserved ${index}`, launches: 1, spacingDays: 3, turnaroundDays: 2, scope: 'any', style: 'custom', price: 500 }, price: 500, acceptedDay: 0, jobIds: [jobId], reserved: true });
  s.jobs.push({ id: jobId, contractId, castId: 'clem', launchIndex: 0, releaseDay: 2, dueAt: 4 * DAY, allocation: 500, need: 'simple', templated: false, status, stage: status === 'delivered' ? 'done' : 'finish', remaining: status === 'missed' ? 10 : 0, assignee: status === 'delivered' ? 'h1' : null, method: status === 'delivered' ? 'human' : null, reworkFlag: false, deliveredAt: status === 'delivered' ? 3 * DAY : null });
}

function noor(s: CompanyState, id = 'j1', fromDay = 1, toDay: number | null = null): void {
  s.resources.push({ ...s.resources[0]!, id, role: 'junior', name: 'Noor', fromDay, toDay, dailyCost: RULES.staff.junior.dailyCost, speedPercent: 150, busyWith: null, mentorship: { kind: 'templates', day: 2, mentorId: 'h2', completedAt: 2 * DAY + 120 } });
}

function task(s: CompanyState, index: number): void {
  const start = 3 * DAY + index * 120;
  const jobId = `task-${index}`;
  s.events.push({ day: 3, minute: start, type: 'task_start', resourceId: 'j1', jobId, stage: 'produce' });
  s.events.push({ day: 3, minute: start + 90, type: 'task_done', resourceId: 'j1', jobId, stage: 'produce' });
}

describe('studio stamps', () => {
  it('requires a finished season and whole delivery for the night stamps', () => {
    const incomplete = season();
    project(incomplete, 'courtyard', ['delivered', 'delivered', 'missed']);
    expect(stamp('night-courtyard')(incomplete, {})).toBe(false);

    const delivered = season();
    project(delivered, 'courtyard');
    delivered.finished = false;
    expect(stamp('night-courtyard')(delivered, {})).toBe(false);
    delivered.finished = true;
    expect(stamp('night-courtyard')(delivered, {})).toBe(true);
    expect(stamp('night-trail')(delivered, {})).toBe(false);
  });

  it('counts Noor’s actual post-training task completions in her current employment', () => {
    const s = season();
    noor(s);
    s.commands.push({ type: 'hire' });
    s.events.push({ day: 2, minute: 2 * DAY + 120, type: 'mentoring_done', resourceId: 'j1', mentorId: 'h2', specialization: 'templates' });
    expect(stamp('noor-own-work')(s, {})).toBe(false);
    task(s, 0); task(s, 1);
    expect(stamp('noor-own-work')(s, {})).toBe(false);
    task(s, 2);
    expect(stamp('noor-own-work')(s, {})).toBe(true);

    const replacement = season();
    noor(replacement, 'j1', 0, 2);
    replacement.resources[2]!.mentorship!.day = 0;
    replacement.resources[2]!.mentorship!.completedAt = 120;
    replacement.resources.push({ ...replacement.resources[0]!, id: 'j2', role: 'junior', name: 'Noor', fromDay: 3, toDay: null, dailyCost: 250, speedPercent: 150, busyWith: null });
    for (let i = 0; i < 3; i++) {
      const at = DAY + i * 120;
      replacement.events.push({ day: 1, minute: at, type: 'task_start', resourceId: 'j1', jobId: `old-${i}`, stage: 'produce' });
      replacement.events.push({ day: 1, minute: at + 90, type: 'task_done', resourceId: 'j1', jobId: `old-${i}`, stage: 'produce' });
    }
    expect(stamp('noor-own-work')(replacement, {})).toBe(false);
  });

  it('requires three whole reserved orders and rejects any reserved miss or refund', () => {
    const complete = season();
    reserved(complete, 0); reserved(complete, 1); reserved(complete, 2);
    expect(stamp('booked-and-kept')(complete, {})).toBe(true);

    const two = season();
    reserved(two, 0); reserved(two, 1);
    expect(stamp('booked-and-kept')(two, {})).toBe(false);

    for (const status of ['missed', 'refunded'] as const) {
      const broken = season();
      reserved(broken, 0); reserved(broken, 1); reserved(broken, 2, status);
      expect(stamp('booked-and-kept')(broken, {})).toBe(false);
    }
  });
});
