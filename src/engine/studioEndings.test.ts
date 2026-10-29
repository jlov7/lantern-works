import { describe, expect, it } from 'vitest';
import { seasonEnding } from './endings';
import { nightCalendar, projectRecords } from './projects';
import { PRESETS, RULES } from './rules';
import { createRun } from './sim';
import type { CompanyState, ProjectApproach, ProjectId } from './types';
import { LEGACY_RULES_VERSION } from './versions';

const DAY = RULES.minutesPerDay;

/** Hand-placed final states isolate ordered ending selection from arrival and staffing randomness. */
function finalState(): CompanyState {
  const s = createRun({ scenarioId: 'main-street', seed: 'studio-ending-fixture' });
  s.finished = true;
  s.day = RULES.days;
  s.minute = RULES.days * DAY;
  return s;
}

function milestone(s: CompanyState, id: Exclude<ProjectId, 'lantern-night'>, approach: ProjectApproach = id === 'clem-ten' ? 'first-night' : id === 'mara-regular' ? 'market-debut' : 'quiet-sendoff', status: 'delivered' | 'compromised' = 'delivered') {
  const castId = id === 'clem-ten' ? 'clem' : id === 'mara-regular' ? 'mara' : 'hugo';
  const contractId = `project-${id}`;
  const requestId = `request-${id}`;
  const jobId = `job-${id}`;
  const price = 900;
  const at = 10 * DAY;
  s.contracts.push({
    id: contractId,
    seq: s.contracts.length,
    requestId,
    castId,
    segment: id === 'mara-regular' ? 'small' : 'careful',
    offer: { ...PRESETS.bespoke, name: id },
    price,
    acceptedDay: 2,
    jobIds: [jobId],
    project: { id, approach, materials: 0, contributors: [] },
  });
  s.jobs.push({
    id: jobId,
    contractId,
    castId,
    launchIndex: 0,
    releaseDay: 2,
    dueAt: at,
    allocation: price,
    need: 'simple',
    templated: false,
    status: 'delivered',
    stage: 'done',
    remaining: 0,
    assignee: 'h1',
    method: 'human',
    reworkFlag: false,
    deliveredAt: at,
    ...(status === 'compromised' ? { changeDeclined: true as const } : {}),
  });
  s.events.push({ day: 10, minute: at, type: 'project_completed', requestId, jobId });
  if (status === 'compromised') s.events.push({ day: 10, minute: at, type: 'project_change_declined', requestId, jobId });
  s.revenue += price;
  s.cash += price;
  return jobId;
}

function night(s: CompanyState, approach: 'courtyard' | 'trail', statuses: ('delivered' | 'missed' | 'refunded')[] = ['delivered']) {
  const calendar = nightCalendar(s);
  const contractId = 'project-lantern-night';
  const requestId = 'request-lantern-night';
  const jobIds = statuses.map((_status, i) => `night-job-${i}`);
  const price = 1200;
  s.contracts.push({
    id: contractId,
    seq: s.contracts.length,
    requestId,
    castId: 'association',
    segment: 'moment',
    offer: { ...PRESETS.bespoke, name: 'Lantern Night' },
    price,
    acceptedDay: calendar.opens,
    jobIds,
    project: { id: 'lantern-night', approach, materials: 0, contributors: [] },
  });
  statuses.forEach((status, i) => {
    const jobId = jobIds[i]!;
    s.jobs.push({
      id: jobId,
      contractId,
      castId: 'association',
      launchIndex: i,
      releaseDay: calendar.release,
      dueAt: (calendar.day + 1) * DAY,
      allocation: price / statuses.length,
      need: 'simple',
      templated: false,
      status,
      stage: status === 'delivered' ? 'done' : 'finish',
      remaining: status === 'missed' ? 20 : 0,
      assignee: status === 'delivered' ? 'h1' : null,
      method: status === 'delivered' ? 'human' : null,
      reworkFlag: false,
      deliveredAt: status === 'delivered' ? calendar.day * DAY : null,
    });
  });
  if (statuses.every(status => status === 'delivered')) s.events.push({ day: calendar.day, minute: (calendar.day + 1) * DAY, type: 'project_completed', requestId });
  s.revenue += price;
  s.cash += price;
  return jobIds;
}

function missedOther(s: CompanyState): void {
  const id = 'other-missed';
  s.jobs.push({ id, contractId: 'other-contract', castId: 'eli', launchIndex: 0, releaseDay: 9, dueAt: 10 * DAY, allocation: 100, need: 'simple', templated: false, status: 'missed', stage: 'finish', remaining: 1, assignee: null, method: null, reworkFlag: false, deliveredAt: null });
  s.contracts.push({ id: 'other-contract', seq: s.contracts.length, requestId: 'other-request', castId: 'eli', segment: 'moment', offer: { ...PRESETS.bespoke }, price: 100, acceptedDay: 9, jobIds: [id] });
}

describe('5.0 studio endings', () => {
  it('keeps insolvency ahead of completed studio stories', () => {
    const s = finalState();
    milestone(s, 'clem-ten');
    milestone(s, 'hugo-handover', 'open-bench');
    s.cash = -50;
    expect(seasonEnding(s)).toMatchObject({ id: 'runway', title: 'The work stayed. The cash ran out.' });
  });

  it('reports a partial accepted night as unfinished, including money and other misses', () => {
    const s = finalState();
    night(s, 'trail', ['delivered', 'missed', 'refunded']);
    missedOther(s);
    s.journal.push({ day: 11, minute: 11 * DAY, kind: 'wages', cash: -1700, unearned: 0, revenue: 0, ref: 'fixture', note: 'fixture cost' });
    const ending = seasonEnding(s);
    expect(projectRecords(s).find(p => p.id === 'lantern-night')).toMatchObject({ status: 'partial', delivered: 1, promised: 3 });
    expect(ending).toMatchObject({ id: 'night-unfinished', title: 'Lantern Night, unfinished' });
    expect(ending.line).toContain('1 of 3 promised pieces were delivered for Day 12. The rest were refunded.');
    expect(ending.line).toContain('The season lost 500 cr.');
    expect(ending.line).toContain('1 other launch was missed or refunded.');
  });

  it('reports a fully failed accepted night as unfinished', () => {
    const s = finalState();
    night(s, 'courtyard', ['missed', 'refunded']);
    expect(projectRecords(s).find(p => p.id === 'lantern-night')).toMatchObject({ status: 'failed', delivered: 0, promised: 2 });
    expect(seasonEnding(s)).toMatchObject({ id: 'night-unfinished', title: 'Lantern Night, unfinished' });
  });

  it.each(['courtyard', 'trail'] as const)('keeps a fulfilled %s ending even with an operating loss and another miss', approach => {
    const s = finalState();
    night(s, approach, ['delivered', 'delivered', 'delivered']);
    missedOther(s);
    s.cash = 100;
    s.journal.push({ day: 11, minute: 11 * DAY, kind: 'wages', cash: -2700, unearned: 0, revenue: 0, ref: 'fixture', note: 'fixture cost' });
    expect(projectRecords(s).find(p => p.id === 'lantern-night')).toMatchObject({ status: 'delivered', delivered: 3, promised: 3 });
    const ending = seasonEnding(s);
    expect(ending.id).toBe(`night-${approach}`);
    expect(ending.title).toBe(approach === 'courtyard' ? 'A courtyard full of your work' : 'A trail of your own making');
    expect(ending.line).toContain('The season lost 1,500 cr.');
    expect(ending.line).toContain('1 other launch was missed or refunded.');
  });

  it('uses the neighbourhood ending only for two completed milestones with no night commission', () => {
    const s = finalState();
    milestone(s, 'clem-ten');
    milestone(s, 'hugo-handover', 'open-bench');
    expect(seasonEnding(s)).toMatchObject({ id: 'neighbourhood', title: 'A studio the street can point to' });
  });

  it('uses the latest completed milestone when only one is finished', () => {
    const s = finalState();
    milestone(s, 'clem-ten');
    expect(seasonEnding(s)).toMatchObject({ id: 'milestone-clem-ten', title: 'Clem’s anniversary photograph' });
  });

  it('does not award an unfinished benefit after the customer declines a change', () => {
    const s = finalState();
    milestone(s, 'hugo-handover', 'open-bench', 'compromised');
    const ending = seasonEnding(s);
    expect(ending.id).toBe('milestone-hugo-handover');
    expect(ending.line).toContain('The apprentice’s workshop sign was delivered. An extra change was declined, so Hugo did not contribute further.');
    expect(ending.line).not.toContain('The workshop can host the trail');
    expect(ending.line).not.toContain('Earn 4 careful reputation');
  });

  it('leaves the legacy ending order unchanged', () => {
    const s = { ...finalState(), rulesVersion: LEGACY_RULES_VERSION };
    milestone(s, 'clem-ten');
    expect(seasonEnding(s).id).toBe('bespoke');
  });
});
