import { describe, expect, it } from 'vitest';
import { commandSchema } from '../ui/schema';
import { nightCalendar, nightResult, projectBlocked, projectBrief, projectQuote, projectRecords, PROJECTS } from './projects';
import { PRESETS, RULES } from './rules';
import { fits, projectForecast, reservationForecast, summarize } from './selectors';
import { applyCommand, callBlocked, callChoices, createRun, reservationBlocked, simulateDay, stageEffort } from './sim';
import type { Command, CompanyState, ProjectApproach, ProjectId } from './types';
import { LEGACY_RULES_VERSION } from './versions';

const DAY = RULES.minutesPerDay;
function apply(s: CompanyState, cmd: Command): CompanyState {
  const result = applyCommand(s, cmd);
  expect(result.error).toBeUndefined();
  return result.state;
}
function day(s: CompanyState): CompanyState {
  const next = structuredClone(s);
  simulateDay(next, { forecast: true });
  return next;
}
/** Hand-placed ordinary buyers isolate commission mechanics from the arrival tape. */
function prepared(scenarioId = 'main-street'): CompanyState {
  let s = apply(createRun({ scenarioId, seed: 'commission-test' }), { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } });
  s.requests = ['clem', 'mara', 'mara', 'hugo'].map((castId, index) => ({ id: `ordinary-${index}`, day: 0, index, castId, segment: castId === 'mara' ? 'small' : 'careful', need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin', offer: { ...PRESETS.bespoke, price: 300, turnaroundDays: 2 } }));
  for (const r of s.requests) s = apply(s, { type: 'accept', requestId: r.id });
  s = day(day(s));
  expect(s.jobs.every(j => j.status === 'delivered')).toBe(true);
  return s;
}
function project(s: CompanyState, projectId: ProjectId, approach: ProjectApproach): CompanyState {
  return apply(s, { type: 'acceptProject', projectId, approach, design: projectBrief(s, projectId, approach).defaultDesign });
}
function advanceTo(s: CompanyState, target: number): CompanyState {
  while (s.day < target) s = day(s);
  return s;
}
function ledger(s: CompanyState): void {
  expect(s.cash).toBe(RULES.initialCash + s.journal.reduce((a, e) => a + e.cash, 0));
  expect(s.unearned).toBe(s.jobs.filter(j => j.status === 'active' || j.status === 'scheduled').reduce((a, j) => a + j.allocation, 0));
  expect(summarize(s).operatingResult).toBe(s.cash - RULES.initialCash - s.unearned);
}

describe('milestone commissions', () => {
  it.each([
    ['clem-ten', 'first-night', 1200, 0, 1, [120]],
    ['clem-ten', 'new-band', 1200, 150, 1, [60]],
    ['mara-regular', 'weekly-rhythm', 1260, 0, 3, [60, 60, 60]],
    ['mara-regular', 'market-debut', 720, 0, 1, [90]],
    ['hugo-handover', 'quiet-sendoff', 500, 0, 1, [60]],
    ['hugo-handover', 'open-bench', 850, 0, 1, [120]],
  ] as const)('%s / %s freezes the quote and records exactly one acceptance', (id, approach, price, materials, launches, finishes) => {
    const s = prepared();
    const quote = projectQuote(s, id, approach)!;
    const next = project(s, id, approach);
    const c = next.contracts.at(-1)!;
    const jobs = next.jobs.filter(j => j.contractId === c.id);
    expect(next.revision).toBe(s.revision + 1);
    expect(next.commands.length).toBe(s.commands.length + 1);
    expect(next.cash - s.cash).toBe(price - materials);
    expect(next.unearned - s.unearned).toBe(price);
    expect(next.revenue).toBe(s.revenue);
    expect(c.project).toEqual(quote.project);
    expect(jobs).toHaveLength(launches);
    expect(jobs.map(j => ({ releaseDay: j.releaseDay, dueAt: j.dueAt }))).toEqual(quote.jobs);
    expect(jobs.map(j => stageEffort(next, { ...j, stage: 'finish' }, 'human'))).toEqual(finishes);
    expect(projectBlocked(next, id, approach)).toContain('already');
    ledger(next);
  });

  it('validates new commands both at the load boundary and inside the engine', () => {
    const s = prepared();
    for (const command of [
      { type: 'acceptProject', projectId: 'wrong', approach: 'first-night' },
      { type: 'acceptProject', projectId: '__proto__', approach: 'first-night' },
      { type: 'acceptProject', projectId: 'clem-ten', approach: 'wrong' },
      { type: 'reserve', requestId: 'x', startsInDays: 3 },
    ]) {
      expect(commandSchema.safeParse(command).success).toBe(false);
      expect(applyCommand(s, command as Command).error).toBeTruthy();
    }
    expect(applyCommand(s, { type: 'acceptProject', projectId: 'clem-ten', approach: 'trail' }).error).toBeTruthy();
    expect(applyCommand(s, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', maker: 'j1' }).error).toBeTruthy();
    const legacy = { ...s, rulesVersion: LEGACY_RULES_VERSION };
    expect(applyCommand(legacy, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night' }).error).toBeTruthy();
  });

  it('invitations require real whole ordinary orders and expire without creating a promise', () => {
    const s = createRun({ scenarioId: 'main-street', seed: 'blank' });
    s.day = 2; s.minute = 2 * DAY;
    expect(projectBlocked(s, 'clem-ten', 'first-night')).toContain('ordinary order');
    const end = advanceTo(s, RULES.days);
    expect(end.contracts).toHaveLength(0);
    expect(end.jobs).toHaveLength(0);
    expect(end.journal.filter(e => e.kind === 'fee' || e.kind === 'refund')).toHaveLength(0);
  });

  it('the recurring bakery commission earns its contribution only after all three launches', () => {
    let s = project(prepared(), 'mara-regular', 'weekly-rhythm');
    s = advanceTo(s, 5);
    expect(projectRecords(s)[0]).toMatchObject({ delivered: 2, earned: false });
    s = advanceTo(s, 7);
    expect(projectRecords(s)[0]).toMatchObject({ delivered: 3, earned: true, status: 'delivered' });
    expect(s.events.filter(e => e.type === 'project_completed')).toHaveLength(1);
    expect(projectQuote(s, 'lantern-night', 'courtyard')?.project.materials).toBe(0);
    expect(projectRecords(s, 3 * DAY)[0]?.earned).toBe(false);
    ledger(s);
  });

  it('completed benefits affect forecasts too and are not revoked by an unrelated later refusal', () => {
    let s = project(prepared(), 'mara-regular', 'market-debut');
    s = day(s);
    const record = projectRecords(s)[0]!;
    expect(record.earned).toBe(true);
    expect(s.modifiers.filter(m => m.kind === 'arrivals' && m.source === 'word')).toEqual([
      { kind: 'arrivals', segment: 'small', count: 1, day: 3, source: 'word' },
      { kind: 'arrivals', segment: 'small', count: 1, day: 4, source: 'word' },
    ]);
    s.lostCast.push('mara');
    s = advanceTo(s, 7);
    expect(projectQuote(s, 'lantern-night', 'courtyard')?.project.contributors).toEqual(['mara-regular']);
  });

  it('freezes only earned night reductions; a later library still helps accepted trail work', () => {
    let s = project(prepared(), 'clem-ten', 'new-band');
    s = project(s, 'hugo-handover', 'open-bench');
    s = advanceTo(s, 7);
    expect(projectRecords(s).every(p => p.earned)).toBe(true);
    s = project(s, 'lantern-night', 'trail');
    const jobs = s.jobs.filter(j => j.contractId === s.contracts.at(-1)!.id);
    expect(jobs.map(j => j.releaseDay)).toEqual([9, 9, 9]);
    expect(jobs.map(j => j.dueAt)).toEqual([12 * DAY, 12 * DAY, 12 * DAY]);
    expect(stageEffort(s, jobs[0]!, 'human')).toBe(20);
    s = apply(s, { type: 'buy', item: 'library' });
    expect(stageEffort(s, jobs[0]!, 'human')).toBe(Math.max(5, RULES.libraryBrief - 15));
    expect(fits(projectForecast(advanceTo(project(prepared(), 'clem-ten', 'first-night'), 7), 'lantern-night', 'courtyard')!)).toBe(true);
    s = advanceTo(s, 12);
    expect(nightResult(s).project).toMatchObject({ status: 'delivered', delivered: 3 });
    ledger(s);
  });

  it('quiet Hugo contributes to a courtyard without counting as a second trail host', () => {
    let s = project(prepared(), 'hugo-handover', 'quiet-sendoff');
    s = project(s, 'clem-ten', 'first-night');
    s = advanceTo(s, 7);
    expect(projectBlocked(s, 'lantern-night', 'courtyard')).toBeNull();
    expect(projectBlocked(s, 'lantern-night', 'trail')).toContain('two hosts');
  });

  it.each(['main-street', 'festival-week', 'bespoke-rush'])('%s gives the night its own calendar and real workload', scenario => {
    let s = project(prepared(scenario), 'clem-ten', 'first-night');
    s = project(s, 'hugo-handover', 'open-bench');
    const cal = nightCalendar(s);
    s = advanceTo(s, cal.opens);
    const quote = projectQuote(s, 'lantern-night', 'trail')!;
    expect(quote).not.toBeNull();
    expect(quote.jobs.every(j => j.releaseDay === cal.release && j.dueAt === (cal.day + 1) * DAY)).toBe(true);
    expect(quote.offer.launches).toBe(scenario === 'bespoke-rush' ? 2 : 3);
    expect(quote.request.need).toBe(scenario === 'bespoke-rush' ? 'nuanced' : 'simple');
    s = project(s, 'lantern-night', 'trail');
    s = advanceTo(s, cal.day + 1);
    expect(nightResult(s).settled).toBe(true);
    expect(nightResult(s).project?.status).toBe('delivered');
    expect(s.finished).toBe(scenario !== 'festival-week');
  });

  it('late completion cannot retroactively reduce an accepted night quote', () => {
    let s = project(prepared(), 'clem-ten', 'new-band');
    s = advanceTo(s, 6);
    s = project(s, 'mara-regular', 'weekly-rhythm');
    s = advanceTo(s, 7);
    s = project(s, 'lantern-night', 'courtyard');
    const night = s.contracts.at(-1)!;
    expect(night.project?.materials).toBe(100);
    s = advanceTo(s, 12);
    expect(s.contracts.find(c => c.id === night.id)!.project).toEqual(night.project);
    expect(s.journal.filter(e => e.kind === 'materials' && e.ref === night.id).map(e => e.cash)).toEqual([-100]);
  });

  it('a declined project change preserves the delivered original but withholds cooperation', () => {
    let s = project(prepared(), 'hugo-handover', 'quiet-sendoff');
    const job = s.jobs.at(-1)!;
    s.call = { jobId: job.id, minute: s.minute, cause: 'snag', minutes: 90 };
    job.snag = 90;
    expect(callChoices(s).find(c => c.option === 'cut')!.projectConsequence).toContain('contribution will be lost');
    s = apply(s, { type: 'answer', option: 'cut' });
    s = advanceTo(s, 5);
    expect(projectRecords(s)[0]).toMatchObject({ status: 'compromised', delivered: 1, earned: false });
    expect(s.journal.filter(e => e.kind === 'earn' && e.ref === job.id).map(e => e.revenue)).toEqual([500]);
    ledger(s);
  });

  it('the fixed event cannot be renegotiated and handover refunds work without returning materials', () => {
    let s = advanceTo(project(prepared('festival-week'), 'clem-ten', 'first-night'), 4);
    s = project(s, 'lantern-night', 'courtyard');
    const c = s.contracts.at(-1)!;
    s.call = { jobId: c.jobIds[0]!, minute: s.minute, cause: 'snag', minutes: 90 };
    expect(callBlocked(s, 'ring')).toBe('The event date cannot move.');
    s.call = null;
    s.modifiers.push({ kind: 'handover', day: s.day });
    s = day(s);
    expect(projectRecords(s).at(-1)?.status).toBe('failed');
    expect(s.journal.filter(e => e.kind === 'refund' && c.jobIds.includes(e.ref)).map(e => e.cash)).toEqual([-1800]);
    expect(s.journal.filter(e => e.kind === 'materials').map(e => e.cash)).toEqual([-100]);
    ledger(s);
  });

  it('partial night delivery does not claim the whole event was ready', () => {
    let s = project(prepared(), 'clem-ten', 'new-band');
    s = project(s, 'hugo-handover', 'open-bench');
    s = advanceTo(s, 7);
    s = project(s, 'lantern-night', 'trail');
    s = apply(s, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } });
    s = advanceTo(s, 9);
    // One hand and no shifts on the following days make only part of the promised programme possible.
    s.modifiers.push({ kind: 'absent', who: 'h2', day: 9, paid: true });
    for (const d of [10, 11]) for (const who of ['h1', 'h2']) s.modifiers.push({ kind: 'absent', who, day: d, paid: true });
    s = advanceTo(s, 12);
    const night = nightResult(s).project!;
    expect(night.delivered).toBeLessThan(night.promised);
    expect(['partial', 'failed']).toContain(night.status);
    ledger(s);
  });

  it('keeps the new project board separate from the old one-card news draw', () => {
    const s = prepared();
    const ids = Object.keys(PROJECTS).filter(id => id !== 'lantern-night') as ProjectId[];
    expect(ids.every(id => projectBlocked(s, id, PROJECTS[id].approaches[0]!) === null)).toBe(true);
    const next = apply(s, { type: 'runDay' });
    expect(next.news.some(n => ['clemTen', 'maraGrows', 'hugoRetires', 'streetParty'].includes(n.card))).toBe(false);
  });
});

describe('a future slot for a willing regular', () => {
  function waiting(): CompanyState {
    const s = prepared();
    s.menu = [{ ...PRESETS.bespoke, price: 100, turnaroundDays: 2 }];
    s.requests.push({ id: 'return', day: s.day, index: 0, castId: 'clem', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 1, status: 'waiting', source: 'walkin' });
    return s;
  }
  it('freezes a later release and takes a real advance, using the same forecast and ledger', () => {
    const s = waiting();
    expect(reservationBlocked(s, 'return', 1)).toBeNull();
    expect(fits(reservationForecast(s, 'return', 1)!)).toBe(true);
    let next = apply(s, { type: 'reserve', requestId: 'return', startsInDays: 1 });
    expect(next.contracts.at(-1)?.reserved).toBe(true);
    expect(next.jobs.at(-1)).toMatchObject({ status: 'scheduled', releaseDay: 3, dueAt: 5 * DAY });
    expect(next.cash - s.cash).toBe(100);
    expect(next.unearned - s.unearned).toBe(100);
    expect(next.revenue).toBe(s.revenue);
    next = day(next);
    next = apply(next, { type: 'setMenu', offers: [PRESETS.club] });
    expect(next.contracts.at(-1)?.offer).toMatchObject({ price: 100, launches: 1, startsInDays: 1 });
    next = advanceTo(next, 5);
    expect(next.jobs.at(-1)?.status).toBe('delivered');
    ledger(next);
  });
  it('refuses rush work, fixed orders, unknown customers and dates beyond the season', () => {
    const s = waiting();
    s.requests.at(-1)!.segment = 'rush';
    expect(reservationBlocked(s, 'return', 1)).toBeTruthy();
    s.requests.at(-1)!.segment = 'moment';
    s.requests.at(-1)!.offer = s.menu[0]!;
    expect(reservationBlocked(s, 'return', 1)).toContain('ordinary');
    delete s.requests.at(-1)!.offer;
    s.requests.at(-1)!.castId = 'unserved';
    expect(reservationBlocked(s, 'return', 1)).toContain('regulars');
    s.requests.at(-1)!.castId = 'clem';
    s.day = 11; s.minute = 11 * DAY; s.requests.at(-1)!.day = 11;
    expect(reservationBlocked(s, 'return', 1)).toContain('season');
  });
  it('recognizes a whole street-news order as a regular customer’s earlier work', () => {
    const s = waiting();
    const first = s.contracts.find(c => c.castId === 'clem')!;
    s.requests.find(r => r.id === first.requestId)!.source = 'news';
    expect(reservationBlocked(s, 'return', 1)).toBeNull();
    const next = apply(s, { type: 'reserve', requestId: 'return', startsInDays: 1 });
    expect(next.contracts.at(-1)).toMatchObject({ castId: 'clem', reserved: true });
  });
  it('lets an ordinary visitor drawn by street news reserve the same window offer', () => {
    const s = waiting();
    s.requests.at(-1)!.source = 'news';
    expect(reservationBlocked(s, 'return', 1)).toBeNull();
    expect(apply(s, { type: 'reserve', requestId: 'return', startsInDays: 1 }).contracts.at(-1)?.reserved).toBe(true);
    s.requests.at(-1)!.offer = s.menu[0]!;
    expect(reservationBlocked(s, 'return', 1)).toContain('ordinary');
  });
});
