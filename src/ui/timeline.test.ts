import { describe, expect, it } from 'vitest';
import { CLOSING_PROMISE } from '../engine/fixtures/closingPromise';
import { PRESETS, RULES } from '../engine/rules';
import { applyCommand, createRun, replay } from '../engine/sim';
import type { CompanyState } from '../engine/types';
import { frameAt } from './timeline';

function carriedWork(): CompanyState {
  let s = createRun({ scenarioId: 'main-street', seed: 'x' });
  s.menu = [PRESETS.bespoke];
  s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
  s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
  s.resources = s.resources.filter((r) => r.id === 'h1');
  const j = s.jobs[0]!;
  Object.assign(j, { stage: 'produce', assignee: 'h1', method: 'human', remaining: 1000 });
  s.resources.find((r) => r.id === 'h1')!.busyWith = j.id;
  return s;
}

function maintenanceWork(scenarioId: string, priority: boolean): CompanyState {
  let s = createRun({ scenarioId, seed: 'x' });
  s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
  while (s.day < 3) s = applyCommand(s, { type: 'runDay' }).state;
  // The existing maintenance news fixture, followed by a carried production task.
  s.news = [{ id: 'n3x', day: 3, card: 'maintenance', choice: null }];
  s = applyCommand(s, { type: 'choose', newsId: 'n3x', option: priority ? 1 : 0 }).state;
  s = applyCommand(s, { type: 'runDay' }).state;
  s.menu = [{ ...PRESETS.bespoke, price: 500 }];
  s.requests = [{ id: 'x', day: 4, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
  s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
  const desk = s.resources.find((r) => r.kind === 'ai')!;
  const job = s.jobs[0]!;
  Object.assign(job, { stage: 'produce', assignee: desk.id, method: 'ai', remaining: 30 });
  desk.busyWith = job.id;
  return s;
}

describe('playback AI availability', () => {
  it.each([
    { scenarioId: 'main-street', priority: false, outage: true, busy: 0 },
    { scenarioId: 'bespoke-rush', priority: true, outage: false, busy: 30 },
  ])('matches native maintenance work on $scenarioId with priority $priority', ({ scenarioId, priority, outage, busy }) => {
    const before = maintenanceWork(scenarioId, priority);
    const result = applyCommand(before, { type: 'runDay' });
    expect(result.error).toBeUndefined();
    const after = result.state;
    const desk = before.resources.find((r) => r.kind === 'ai')!;
    expect(after.resources.find((r) => r.id === desk.id)!.busyMinutes - desk.busyMinutes).toBe(busy);
    const snapshots = structuredClone({ before, after });
    for (const offset of [0, 10, 0]) {
      const f = frameAt(before, after, before.minute + offset);
      expect(f.outage).toBe(outage);
      expect(f.workers.find((r) => r.id === desk.id)).toMatchObject({ jobId: before.jobs[0]!.id, working: !outage });
    }
    expect({ before, after }).toEqual(snapshots);
  });

  it('lets priority override both the current-day modifier and scripted outage', () => {
    const before = maintenanceWork('bespoke-rush', true);
    before.modifiers.push({ kind: 'outage', day: before.day });
    const after = applyCommand(before, { type: 'runDay' }).state;
    expect(after.resources.find((r) => r.kind === 'ai')!.busyMinutes).toBe(30);
    expect(frameAt(before, after, before.minute + 10).outage).toBe(false);
  });

  it('stops the held AI task at closing without reading tomorrow when rewound', () => {
    const before = maintenanceWork('main-street', false);
    const after = applyCommand(before, { type: 'runDay' }).state;
    const altered = structuredClone(before);
    altered.modifiers.push({ kind: 'noOutage', day: before.day + 1 }, { kind: 'outage', day: before.day + 1 });
    for (const offset of [479, 480, 10]) {
      const f = frameAt(before, after, before.minute + offset);
      expect(f).toEqual(frameAt(altered, after, before.minute + offset));
      expect(f.outage).toBe(offset < RULES.minutesPerDay);
      expect(f.workers.find((r) => r.kind === 'ai')?.working).toBe(false);
    }
  });
});

describe('playback staffing', () => {
  it('stops ordinary human work at 3pm while retaining its native holder', () => {
    const before = carriedWork();
    const after = applyCommand(before, { type: 'runDay' }).state;
    const held = before.jobs[0]!.id;
    expect(frameAt(before, after, 359).workers.find((r) => r.id === 'h1')).toMatchObject({ station: 'make', working: true, jobId: held });
    const closed = frameAt(before, after, 360);
    expect(closed.peopleOnShift).toBe(false);
    expect(closed.workers.find((r) => r.id === 'h1')).toMatchObject({ station: 'home', working: false, jobId: held });
    expect(closed.folders.find((f) => f.jobId === held)?.waiting).toBe(false);
  });

  it('keeps prebooked overtime working through 4:59pm and stops at 5pm', () => {
    const before = applyCommand(carriedWork(), { type: 'overtime' }).state;
    const after = applyCommand(before, { type: 'runDay' }).state;
    for (const minute of [360, 479]) {
      const frame = frameAt(before, after, minute);
      expect(frame.peopleOnShift).toBe(true);
      expect(frame.workers.find((r) => r.id === 'h1')).toMatchObject({ station: 'make', working: true });
    }
    const closed = frameAt(before, after, 480);
    expect(closed.peopleOnShift).toBe(false);
    expect(closed.workers.find((r) => r.id === 'h1')).toMatchObject({ station: 'home', working: false });
  });

  it('plays a native late answer from the original morning and rewinds across its timestamp', () => {
    const index = CLOSING_PROMISE.commands.findIndex((c) => c.type === 'answer' && c.option === 'late');
    const morning = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands.slice(0, index - 1), CLOSING_PROMISE.rules);
    expect(morning.errors).toEqual([]);
    const before = morning.state;
    const paused = applyCommand(before, { type: 'runDay', calls: true });
    expect(paused.error).toBeUndefined();
    expect(paused.state.call?.minute).toBe(2075);
    const answered = applyCommand(paused.state, { type: 'answer', option: 'late' });
    expect(answered.error).toBeUndefined();
    const after = answered.state;
    expect(before.overtimeDays).not.toContain(before.day);
    expect(after.journal.find((e) => e.day === before.day && e.note.endsWith('called in'))?.minute).toBe(2075);
    const snapshots = structuredClone({ before, after });
    const earlier = frameAt(before, after, 2074);
    expect(earlier).toEqual(frameAt(before, paused.state, 2074));
    expect(frameAt(before, after, 2075).workers.some((r) => r.kind === 'human' && r.working)).toBe(true);
    expect(frameAt(before, after, before.minute + 360).peopleOnShift).toBe(true);
    expect(frameAt(before, after, before.minute + 479).peopleOnShift).toBe(true);
    expect(frameAt(before, after, before.minute + 480).peopleOnShift).toBe(false);
    expect(frameAt(before, after, 2074)).toEqual(earlier);
    expect({ before, after }).toEqual(snapshots);
  });

  it('does not expose an overtime journal grant before its minute, including on rewind', () => {
    const before = carriedWork();
    const after = applyCommand(before, { type: 'runDay' }).state;
    // A late journal fixture separates the grant gate from the overlapping ordinary shift.
    after.overtimeDays.push(0);
    after.journal.push({ day: 0, minute: 400, kind: 'wages', cash: -RULES.staff.overtimePerPerson, unearned: 0, revenue: 0, ref: 'day0', note: 'Overtime until 5pm (1), called in' });
    for (const minute of [399, 400, 479, 480, 399]) {
      const frame = frameAt(before, after, minute);
      const onShift = minute >= 400 && minute < 480;
      expect(frame.peopleOnShift).toBe(onShift);
      expect(frame.workers.find((r) => r.id === 'h1')).toMatchObject({ station: onShift ? 'make' : 'home', working: onShift });
    }
  });

  it.each(['future', 'expired', 'absent'] as const)('puts down carried work for %s staff when opening, before any reassignment', (reason) => {
    const before = carriedWork();
    const person = before.resources.find((r) => r.id === 'h1')!;
    if (reason === 'future') person.fromDay = 1;
    if (reason === 'expired') { person.role = 'temp'; person.toDay = -1; }
    if (reason === 'absent') before.modifiers.push({ kind: 'absent', who: person.id, day: 0, paid: true });
    const after = applyCommand(before, { type: 'runDay' }).state;
    expect(after.resources.find((r) => r.id === person.id)?.busyWith ?? null).toBeNull();
    expect(after.jobs[0]!.assignee).toBeNull();
    const snapshots = structuredClone({ before, after });
    for (const frame of [frameAt(before, before, 0), frameAt(before, after, 0), frameAt(before, after, 10)]) {
      expect(frame.workers.find((r) => r.id === person.id)).toMatchObject({ station: 'home', jobId: null, working: false });
      expect(frame.folders[0]?.waiting).toBe(true);
    }
    expect({ before, after }).toEqual(snapshots);
  });

  it.each(['future', 'expired', 'absent'] as const)('puts down a %s kit holder and shows the native replacement rather than two builders', (reason) => {
    const before = carriedWork();
    before.jobs = [];
    const person = before.resources.find((r) => r.id === 'h1')!;
    person.busyWith = 'kit';
    before.kit = { status: 'building', remaining: 100, assignee: person.id };
    if (reason === 'future') person.fromDay = 1;
    if (reason === 'expired') { person.role = 'temp'; person.toDay = -1; }
    if (reason === 'absent') before.modifiers.push({ kind: 'absent', who: person.id, day: 0, paid: true });
    // A lead joining this morning picks up the kit at opening.
    before.resources.push({ ...person, id: 'h2', name: 'Tomas', role: 'lead', fromDay: 0, toDay: null, busyWith: null });
    const after = applyCommand(before, { type: 'runDay' }).state;
    expect(after.events.find((e) => e.type === 'task_start' && e.stage === 'kit')).toMatchObject({ minute: 0, resourceId: 'h2' });
    const morning = frameAt(before, before, 0);
    expect(morning.kit).toBe('none');
    expect(morning.workers.find((r) => r.id === 'h1')).toMatchObject({ station: 'home', working: false });
    const frame = frameAt(before, after, 0);
    expect(frame.kit).toBe('building');
    expect(frame.workers.filter((r) => r.station === 'kit')).toHaveLength(1);
    expect(frame.workers.find((r) => r.id === 'h2')).toMatchObject({ station: 'kit', working: true });
  });
});
