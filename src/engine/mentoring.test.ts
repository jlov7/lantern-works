import { describe, expect, it } from 'vitest';
import { frameAt } from '../ui/timeline';
import { commandSchema } from '../ui/schema';
import { canProduce, effortPercent, MENTORING, noorWork, specializationOn } from './mentoring';
import { PRESETS, RULES } from './rules';
import { dayPlan, forecast, humanLoad } from './selectors';
import { applyCommand, createRun, mentoringBlocked, simulateDay } from './sim';
import type { Command, CompanyState, Specialization } from './types';
import { LEGACY_RULES_VERSION } from './versions';

const DAY = RULES.minutesPerDay;
const apply = (s: CompanyState, command: Command): CompanyState => {
  const result = applyCommand(s, command);
  expect(result.error).toBeUndefined();
  return result.state;
};
const day = (s: CompanyState): CompanyState => { const next = structuredClone(s); simulateDay(next, { forecast: true }); return next; };
function hired(): CompanyState {
  let s = createRun({ scenarioId: 'main-street', seed: 'mentoring' });
  s.requests = [];
  s = apply(s, { type: 'hire' });
  return day(s);
}
function acceptFixture(s: CompanyState, need: 'simple' | 'nuanced' = 'simple', templated = false, count = 1): CompanyState {
  for (let index = 0; index < count; index++) {
    const id = `placed-${s.day}-${index}-${s.contracts.length}`;
    s.requests.push({ id, day: s.day, index, castId: 'mara', segment: 'small', need, wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin', offer: { ...PRESETS.bespoke, price: 200, turnaroundDays: 2, style: templated ? 'templated' : 'custom' } });
    s = apply(s, { type: 'accept', requestId: id });
  }
  return s;
}
const train = (s: CompanyState, kind: Specialization): CompanyState => apply(s, { type: 'mentor', resourceId: s.resources.find(r => r.name === 'Noor')!.id, specialization: kind });

describe('Noor chooses a specialism', () => {
  it.each(['proofing', 'templates'] as const)('%s occupies both people for the exact time, without adding a fee', kind => {
    const s = hired();
    const next = train(s, kind);
    const lesson = MENTORING[kind];
    const noor = next.resources.find(r => r.name === 'Noor')!;
    expect(next.cash).toBe(s.cash);
    expect(next.journal).toEqual(s.journal);
    const end = day(next);
    for (const id of [noor.id, lesson.mentorId]) {
      expect(end.resources.find(r => r.id === id)!.busyMinutes - s.resources.find(r => r.id === id)!.busyMinutes).toBe(lesson.minutes);
    }
    expect(end.usage.humanBusy - s.usage.humanBusy).toBe(2 * lesson.minutes);
    expect(end.events.find(e => e.type === 'mentoring_done')?.minute).toBe(DAY + lesson.minutes);
    expect(specializationOn(noor, next.day)).toBeNull();
    expect(specializationOn(end.resources.find(r => r.id === noor.id)!, end.day)).toBe(kind);
    expect(humanLoad(next, 1).available).toBeLessThan(humanLoad(s, 1).available);
    expect(end.journal.filter(e => e.day === 1 && e.kind === 'wages').map(e => e.cash)).toEqual([-(800 + 250)]);
  });

  it('pauses a carried stage and resumes it after the lesson in simulation, plan and playback', () => {
    let s = acceptFixture(hired());
    const j = s.jobs.at(-1)!;
    const ada = s.resources.find(r => r.id === 'h1')!;
    j.stage = 'produce'; j.assignee = ada.id; j.method = 'human'; j.remaining = 100; j.assigneeSpeed = 100; ada.busyWith = j.id;
    s = train(s, 'proofing');
    const next = day(s);
    const done = next.events.find(e => e.type === 'task_done' && e.jobId === j.id && e.stage === 'produce')!;
    expect(done.minute).toBe(DAY + 190);
    const plan = dayPlan(s)!;
    expect(plan.blocks.filter(b => b.stage === 'mentoring').map(b => [b.resourceId, b.from, b.to])).toEqual([['j1', 0, 90], ['h1', 0, 90]]);
    expect(plan.blocks.find(b => b.resourceId === 'h1' && b.stage === 'produce')).toMatchObject({ from: 90, to: 190 });
    expect(frameAt(s, next, DAY + 45).workers.find(r => r.id === 'h1')).toMatchObject({ mentoring: 'proofing', jobId: null, working: true });
    expect(frameAt(s, next, DAY + 100).workers.find(r => r.id === 'h1')).toMatchObject({ jobId: j.id, working: true });
  });

  it('the real loss of time changes a promise from fitting to missing', () => {
    let s = acceptFixture(hired(), 'simple', false, 3);
    for (const j of s.jobs) { j.dueAt = 2 * DAY; j.stage = 'finish'; j.effort = { finish: 230 }; }
    expect(forecast(s).atRisk).toHaveLength(0);
    s = train(s, 'proofing');
    expect(forecast(s).atRisk.length).toBeGreaterThan(0);
    expect(day(s).jobs.filter(j => j.status === 'missed').map(j => j.id)).toEqual(forecast(s).atRisk);
  });

  it('proofing becomes 115% on newly started work, but still cannot make a launch', () => {
    let s = day(train(hired(), 'proofing'));
    const noor = s.resources.find(r => r.name === 'Noor')!;
    expect(effortPercent(noor, { stage: 'finish' }, s.day)).toBe(115);
    expect(canProduce(noor, { need: 'simple', templated: true }, s.day)).toBe(false);
    s = acceptFixture(s, 'simple', false, 3);
    for (const j of s.jobs) j.stage = 'finish';
    const next = day(s);
    const start = next.events.find(e => e.day === s.day && e.resourceId === noor.id && e.type === 'task_start')!;
    const end = next.events.find(e => e.day === s.day && e.resourceId === noor.id && e.type === 'task_done')!;
    expect(end.minute - start.minute).toBe(69);
    expect(noorWork(next)?.completed).toBe(1);
  });

  it('templates allows only simple templated production, at 125%, and records actual use', () => {
    let s = day(train(hired(), 'templates'));
    const noor = s.resources.find(r => r.name === 'Noor')!;
    expect(canProduce(noor, { need: 'nuanced', templated: true }, s.day)).toBe(false);
    expect(canProduce(noor, { need: 'simple', templated: false }, s.day)).toBe(false);
    expect(effortPercent(noor, { stage: 'finish' }, s.day)).toBe(150);
    expect(noorWork(s)?.completed).toBe(0);
    s = acceptFixture(s, 'simple', true, 3);
    s.kit = { status: 'ready', remaining: 0, assignee: null };
    for (const j of s.jobs) j.stage = 'produce';
    const next = day(s);
    const start = next.events.find(e => e.resourceId === noor.id && e.type === 'task_start' && e.stage === 'produce')!;
    const end = next.events.find(e => e.resourceId === noor.id && e.type === 'task_done' && e.stage === 'produce')!;
    expect(end.minute - start.minute).toBe(113);
    expect(noorWork(next)?.completed).toBe(1);
  });

  it('a replacement hire has a new identity, no inherited specialism, and no inherited task credit', () => {
    let s = day(train(hired(), 'templates'));
    s = apply(s, { type: 'letGo', resourceId: 'j1' });
    s = day(s);
    s = apply(s, { type: 'hire' });
    s = day(s);
    const noor = s.resources.find(r => r.name === 'Noor' && r.toDay === null)!;
    expect(noor.id).toBe('j2');
    expect(noor.mentorship).toBeUndefined();
    expect(noorWork(s)).toBeNull();
    expect(mentoringBlocked(s, noor.id, 'proofing')).toBeNull();
    s = train(s, 'proofing');
    expect(mentoringBlocked(s, noor.id, 'templates')).toContain('already');
  });

  it('checks the working crew, news, season and version at the engine and load boundaries', () => {
    let s = apply(createRun({ scenarioId: 'main-street', seed: 'mentor-gates' }), { type: 'hire' });
    expect(mentoringBlocked(s, 'j1', 'proofing')).toContain('working today');
    s = day(s);
    s.news.push({ id: 'fixture-news', day: s.day, card: 'ill', choice: null });
    expect(mentoringBlocked(s, 'j1', 'proofing')).toContain('news');
    s.news = [];
    s.modifiers.push({ kind: 'absent', who: 'h1', day: s.day, paid: true });
    expect(mentoringBlocked(s, 'j1', 'proofing')).toContain('Ada is not in');
    expect(mentoringBlocked(s, 'j1', 'templates')).toBeNull();
    expect(mentoringBlocked({ ...s, rulesVersion: LEGACY_RULES_VERSION }, 'j1', 'templates')).toContain('original');
    expect(commandSchema.safeParse({ type: 'mentor', resourceId: 'j1', specialization: 'magic' }).success).toBe(false);
    expect(applyCommand(s, { type: 'mentor', resourceId: 'j1', specialization: 'magic' } as unknown as Command).error).toBeTruthy();
    s.day = 11; s.minute = 11 * DAY;
    expect(mentoringBlocked(s, 'j1', 'templates')).toContain('no next morning');
  });

  it('retains the speed of an active stage when the new morning grants proofing', () => {
    let s = train(hired(), 'proofing');
    s = acceptFixture(s);
    const noor = s.resources.find(r => r.name === 'Noor')!;
    const j = s.jobs.at(-1)!;
    j.stage = 'finish'; j.assignee = noor.id; j.assigneeSpeed = 150; j.remaining = 400; noor.busyWith = j.id;
    s = day(s);
    // 90-minute lesson leaves 270 working minutes. The remaining stage keeps its original 150% scale.
    expect(s.jobs.at(-1)?.remaining).toBe(130);
    s.modifiers.push({ kind: 'absent', who: noor.id, day: s.day, paid: true });
    const after = day(s);
    const start = after.events.find(e => e.day === 2 && e.type === 'task_start' && e.jobId === j.id)!;
    const end = after.events.find(e => e.day === 2 && e.type === 'task_done' && e.jobId === j.id)!;
    expect(end.minute - start.minute).toBe(87);
  });
});
