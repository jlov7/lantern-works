import { describe, expect, it } from 'vitest';
import fixture from './fixtures/festival-5.0.0.json';
import courtyard from './fixtures/main-courtyard-5.0.0.json';
import bakery from './fixtures/festival-mara-5.0.0.json';
import { approachFor, nightCalendar, nightResult, projectBlocked, projectQuote, projectRecords } from './projects';
import { RULES } from './rules';
import { applyCommand, createRun, replay } from './sim';
import type { Command } from './types';
import { summarize } from './selectors';

// These are recorded native-command seasons using real arrivals. They pin reachability,
// not an optimal strategy: both routes also contain missed ordinary work.
describe('the early festival can grow from actual neighbours', () => {
  it.each(fixture.routes)('$config.seed earns hosts, books the walk and keeps its Day 8 date', route => {
    let state = createRun(route.config, fixture.rules);
    expect(state.requests.slice(0, 2).map(r => r.castId)).toEqual(['clem', 'mara']);
    const calendar = nightCalendar(state);
    let bookedNight = false;
    for (const command of route.commands as Command[]) {
      if (command.type === 'acceptProject') {
        expect(projectBlocked(state, command.projectId, command.approach)).toBeNull();
        if (command.projectId === 'lantern-night') {
          expect(state.day).toBeLessThanOrEqual(calendar.closes);
          expect(projectRecords(state).filter(p => p.earned).map(p => p.id)).toEqual(['clem-ten', 'hugo-handover']);
          bookedNight = true;
        }
      }
      const result = applyCommand(state, command);
      expect(result.error, `Day ${state.day + 1}: ${JSON.stringify(command)}`).toBeUndefined();
      state = result.state;
    }
    expect(bookedNight).toBe(true);
    expect(state.finished).toBe(true);
    const night = nightResult(state).project!;
    expect(night).toMatchObject({ status: 'delivered', delivered: 3, promised: 3 });
    expect(night.jobs.every(j => j.releaseDay === 5 && j.dueAt === 8 * RULES.minutesPerDay)).toBe(true);
    expect(night.completedAt).toBeLessThanOrEqual(8 * RULES.minutesPerDay);
    expect(state.events.some(e => e.type === 'delivered' && e.minute > 8 * RULES.minutesPerDay)).toBe(true);
    const restored = replay(route.config, route.commands as Command[], fixture.rules);
    expect(restored.errors).toEqual([]);
    expect(restored.state).toEqual(state);
  });
});

it('keeps the native handmade Main Street season and its earned courtyard intact', () => {
  const result = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules);
  expect(result.errors).toEqual([]);
  expect(result.state.finished).toBe(true);
  const night = nightResult(result.state);
  expect(night.project).toMatchObject({ approach: 'courtyard', status: 'delivered', delivered: 1, promised: 1 });
  expect(night.contributors.map(record => record.approach)).toEqual(['first-night', 'quiet-sendoff']);
  expect(summarize(result.state)).toMatchObject({ cash: 7530, operatingResult: 4530, delivered: 27, missed: 0, refundedAtClose: 0, lostNeighbours: 7 });
});

it.each(bakery.routes)('earns the Festival bakery set before booking closes on $config.seed', route => {
  const commands = route.commands as Command[];
  const result = replay(route.config, commands, bakery.rules);
  expect(result.errors).toEqual([]);
  const state = result.state;
  expect(state.day).toBe(nightCalendar(state).closes);
  const record = projectRecords(state).find(record => record.id === 'mara-regular')!;
  expect(record).toMatchObject({ earned: true, delivered: 3, promised: 3, artifact: 'Mara’s festival bakery cards' });
  expect(record.contract.offer).toMatchObject({ name: 'Three cards for festival week', spacingDays: 0 });
  expect(record.jobs.every(job => job.releaseDay === 3 && job.dueAt === 5 * RULES.minutesPerDay)).toBe(true);
  expect(record.completedAt).toBeLessThan(5 * RULES.minutesPerDay);
  expect(projectQuote(state, 'lantern-night', 'courtyard')!.project).toMatchObject({ materials: 0, contributors: ['mara-regular'] });
  expect(summarize(state)).toMatchObject({ missed: 0, refundedAtClose: 0, operatingResult: -2940 });
  expect(approachFor({ config: { ...route.config, scenarioId: 'main-street' }, rulesVersion: fixture.rules }, 'weekly-rhythm').detail).toContain('two days apart');
});
