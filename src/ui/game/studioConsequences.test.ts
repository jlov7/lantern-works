import { describe, expect, it } from 'vitest';
import recorded from '../../engine/fixtures/main-courtyard-5.0.0.json';
import careers from '../../engine/fixtures/career-7.0.0.json';
import { seasonEnding } from '../../engine/endings';
import { applyCommand, replay } from '../../engine/sim';
import type { Command, RunConfig } from '../../engine/types';
import { insightsFor, noteOf } from './eveningFacts';
import { regularsLeaving } from './orderIntake';

const commands = recorded.commands as Command[];
function at(count: number) {
  const result = replay(recorded.config, commands.slice(0, count), recorded.rules);
  expect(result.errors).toEqual([]);
  return result.state;
}

describe('consequences from the native Main Street courtyard season', () => {
  it.each([
    [61, ['saoirse', 'ravi']],
    [65, ['oscar', 'finn', 'sam', 'kofi']],
    [69, ['tobias']],
  ] as const)('names the regulars actually lost when command %i opens', (count, expected) => {
    const before = at(count);
    expect(regularsLeaving(before)).toEqual(expected);
    const opened = applyCommand(before, commands[count]!);
    expect(opened.error).toBeUndefined();
    expect(opened.state.lostCast.filter(id => !before.lostCast.includes(id))).toEqual(expected);
  });

  it('does not count another waiting visit from the same regular twice, or amends and already answered visits', () => {
    const state = at(61);
    const saoirse = state.requests.find(request => request.day === state.day && request.castId === 'saoirse')!;
    state.requests.push({ ...saoirse, id: 'same-regular-extra' });
    expect(regularsLeaving(state)).toEqual(['saoirse', 'ravi']);
    saoirse.status = 'declined';
    state.requests.find(request => request.id === 'same-regular-extra')!.source = 'amends';
    expect(regularsLeaving(state)).toEqual(['ravi']);
    state.menu = [];
    // Ravi's fixed news order still buys its own terms even with nothing on the window.
    expect(regularsLeaving(state)).toEqual(['ravi']);
    state.requests.find(request => request.day === state.day && request.castId === 'ravi')!.status = 'accepted';
    expect(regularsLeaving(state)).toEqual([]);
  });

  it('keeps lost neighbours visible beside the successful night', () => {
    const ending = seasonEnding(at(commands.length));
    expect(ending.id).toBe('night-courtyard');
    expect(ending.line).toContain('with completed work for Clem and Hugo');
    expect(ending.line).toContain('7 neighbours no longer return.');
  });

  it('leaves the gathering to its recorded payoff instead of an unrelated customer quotation', () => {
    const state = at(commands.length);
    expect(state.events.some(event => event.day === 11 && event.type === 'project_completed')).toBe(true);
    expect(noteOf(state, 11)).not.toMatch(/street association|Summer street party/);
    expect(noteOf(state, 11)).toMatch(/^Tobias at Tobias Violins:/);
  });

  it.each([
    ['modest', 'opening', 11, 'Tobias'],
    ['damaged', 'open', 0, 'Ines'],
  ])('keeps %s %s delivery thanks separate from a promise to return', (route, stage, day, name) => {
    const tape = careers.routes.find(item => item.id === route)!.seasons.find(item => item.stage === stage)!;
    const result = replay(tape.config as RunConfig, tape.commands as Command[], careers.rules);
    expect(result.errors).toEqual([]);
    // A completed job can coexist with an unanswered newer request. Delivery praise cannot promise future visits.
    const note = noteOf(result.state, Number(day));
    expect(note).toContain(`${name} at `);
    expect(note).not.toMatch(/I'll be back|Same again soon/);
  });

  it('reports closing capacity losses without suggesting a new hire after the season', () => {
    const before = at(69);
    const after = at(commands.length);
    const notes = insightsFor(before, after, 11, 0);
    expect(notes.some(note => note.text.includes("Those who didn't fit would have paid"))).toBe(true);
    expect(notes.some(note => /Hiring Noor|Overtime costs/.test(note.text))).toBe(false);
  });
});
