import { describe, expect, it } from 'vitest';
import fixture from './fixtures/career-7.0.0.json';
import { careerStories } from './career';
import { buildContinuation } from './continuation';
import { bookedPracticePress, practicePressChoice, practicePressOptions, projectBlocked, projectFor } from './projects';
import { applyCommand, createRun, replay, simulateDay } from './sim';
import type { Command, RunConfig } from './types';
import { CAREER_RULES_VERSION, CURRENT_RULES_VERSION } from './versions';

const practice = fixture.routes.find(route => route.id === 'prosperous')!.seasons[1]!;
const config = practice.config as RunConfig;
const prefix = practice.commands.slice(0, 24) as Command[];

describe('one shared press booking in the practice season', () => {
  it.each([
    ['clem-ten', 'mara-regular'],
    ['mara-regular', 'clem-ten'],
  ] as const)('booking %s leaves %s waiting and remembers why next season', (winner, waiting) => {
    const original = replay(config, prefix, CURRENT_RULES_VERSION);
    expect(original.errors).toEqual([]);
    expect(practicePressChoice(original.state)).toBe(true);
    expect(projectBlocked(original.state, 'clem-ten', 'new-band')).toBeNull();
    expect(projectBlocked(original.state, 'mara-regular', 'weekly-rhythm')).toBeNull();

    const booking = practice.commands.find(command => command.type === 'acceptProject' && command.projectId === winner)! as Command;
    const result = applyCommand(original.state, booking);
    expect(result.error).toBeUndefined();
    const booked = result.state;
    expect(bookedPracticePress(booked)).toBe(winner);
    expect(projectBlocked(booked, waiting, waiting === 'clem-ten' ? 'new-band' : 'weekly-rhythm')).toContain('shared press slot');
    const competing = practice.commands.find(command => command.type === 'acceptProject' && command.projectId === waiting)! as Command;
    expect(applyCommand(booked, competing).error).toContain('shared press slot');
    expect(replay(config, booked.commands, CURRENT_RULES_VERSION)).toMatchObject({ errors: [], state: { contracts: booked.contracts } });

    const finished = structuredClone(booked);
    while (!finished.finished) simulateDay(finished, { forecast: true });
    const stories = careerStories(finished);
    expect(stories.find(story => story.nodeId === `${waiting === 'clem-ten' ? 'clem' : 'mara'}-practice`)).toMatchObject({ outcome: 'not-taken' });
    const next = createRun(buildContinuation(finished, []), CURRENT_RULES_VERSION);
    expect(projectFor(next, waiting).invitation).toContain(`${winner === 'clem-ten' ? 'Clem' : 'Mara'} reserved the shared press last season.`);
  });

  it('shows the rival offer while the player can still earn its invitation', () => {
    const modest = fixture.routes.find(route => route.id === 'modest')!.seasons[1]!;
    const steps = modest.commands as Command[];
    const morning = replay(modest.config as RunConfig, steps.slice(0, steps.findIndex(c => c.type === 'acceptProject')), CURRENT_RULES_VERSION);
    expect(morning.errors).toEqual([]);
    const options = practicePressOptions(morning.state);
    expect(options.find(option => option.id === 'clem-ten')?.blocked).toBeNull();
    const mara = options.find(option => option.id === 'mara-regular');
    expect(mara?.blocked).toContain('ordinary order');
    expect(mara?.quote?.offer.price).toBeGreaterThan(0);
  });

  it('preserves a lost relationship as the reason a neighbour cannot book', () => {
    const withoutMara = prefix.filter(command => !(command.type === 'accept' && command.requestId === 'd1-r0') && command.type !== 'answer');
    const morning = replay(config, withoutMara, CURRENT_RULES_VERSION);
    expect(morning.errors).toEqual([]);
    expect(morning.state.lostCast).toContain('mara');
    const clem = practice.commands.find(command => command.type === 'acceptProject' && command.projectId === 'clem-ten')! as Command;
    const booked = applyCommand(morning.state, clem);
    expect(booked.error).toBeUndefined();
    expect(projectBlocked(booked.state, 'mara-regular', 'weekly-rhythm')).toContain('no longer commissioning');
  });

  it('keeps every 7.0 commission and branch playable under the original rules', () => {
    const original = replay(config, prefix, CAREER_RULES_VERSION);
    expect(original.errors).toEqual([]);
    expect(practicePressChoice(original.state)).toBe(false);
    const both = replay(config, practice.commands as Command[], CAREER_RULES_VERSION);
    expect(both.errors).toEqual([]);
    expect(both.state.finished).toBe(true);
    expect(both.state.contracts.filter(contract => contract.project?.id === 'clem-ten' || contract.project?.id === 'mara-regular')).toHaveLength(2);
  });
});
