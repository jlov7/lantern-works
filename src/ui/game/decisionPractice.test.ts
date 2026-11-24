import { describe, expect, it } from 'vitest';
import type { Command } from '../../engine/types';
import { eligibleDecisionCards, loadDecisionPractice, practiceEvening, resolveDecisionCard } from './decisionPractice';

const practice = loadDecisionPractice();
const guided = eligibleDecisionCards('guided', practice.options);
const standard = eligibleDecisionCards('standard', practice.options);
const hard = eligibleDecisionCards('hard', practice.options);

const hire: Command = { type: 'temp' };
const bookLorna: Command = { type: 'accept', requestId: 'd10-r2' };
const bookBea: Command = { type: 'accept', requestId: 'd10-r4' };
const bookWren: Command = { type: 'accept', requestId: 'd10-r0' };
const decline: Command = { type: 'decline', requestId: 'd10-r3' };
const open: Command = { type: 'runDay', calls: true };
const after = (...commands: Command[]) => ({ ...practice.morning, commands: [...practice.morning.commands, ...commands] });

describe('Festival Week decision practice', () => {
  it('uses the recorded morning and filters cards using public forecasts', () => {
    expect(practice.day).toBe(10);
    expect(practice.morning.rules).toBe('lantern-6.1.0');
    expect(practice.morning.commands).toHaveLength(108);
    expect(practice.options.map(option => option.forecastFlags)).toEqual([[], [], [], ['Wren']]);
    expect(practice.options.map(option => [option.tempCostCr, option.depositCr])).toEqual([
      [0, 680], [350, 1240], [350, 1240], [350, 1800],
    ]);
    expect(guided.map(card => card.id)).toEqual(['choose-neighbour']);
    expect(standard.map(card => card.id)).toEqual(['choose-neighbour', 'spend-for-capacity', 'protect-promise']);
    expect(hard.map(card => card.id)).toEqual(['protect-promise']);
  });

  it('selects from eligible cards and falls back if a model response adds facts or gives an invalid id', () => {
    expect(resolveDecisionCard('cash', standard)).toMatchObject({ card: { id: 'spend-for-capacity' }, source: 'authored' });
    expect(resolveDecisionCard('cash', standard, { challengeId: 'protect-promise' })).toMatchObject({ card: { id: 'protect-promise' }, source: 'model' });
    expect(resolveDecisionCard('cash', standard, { challengeId: 'protect-promise', cashAtClose: 13_367 })).toMatchObject({ card: { id: 'spend-for-capacity' }, source: 'authored' });
    expect(resolveDecisionCard('cash', guided, { challengeId: 'protect-promise' })).toMatchObject({ card: { id: 'choose-neighbour' }, source: 'authored' });
    expect(resolveDecisionCard('cash', [], { challengeId: 'protect-promise' }).card).toBeUndefined();
  });

  it('reads actual completed evenings and distinguishes the deposits from income', () => {
    expect(practiceEvening(after(hire, bookLorna, bookBea, decline, open), practice, hard[0]!)).toEqual({
      id: 'temp-lorna', cashCr: 12_807, earnedCr: 3_615, unearnedCr: 2_700, delivered: 7, missed: 0, lostNeighbours: [],
    });
    expect(practiceEvening(after(hire, bookWren, bookBea, decline, open), practice, guided[0]!)?.lostNeighbours).toEqual(['Lorna']);
    expect(practiceEvening(after(hire, bookLorna, bookWren, decline, open), practice, hard[0]!)).toEqual({
      id: 'temp-both', cashCr: 13_367, earnedCr: 3_275, unearnedCr: 3_600, delivered: 6, missed: 0, lostNeighbours: ['Bea'],
    });
  });

  it('ignores partial, modified and out-of-card attempts', () => {
    const exact = after(hire, bookLorna, bookBea, decline, open);
    expect(practiceEvening(after(hire, bookLorna, bookBea, open), practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, bookLorna, bookBea, { type: 'decline', requestId: 'd10-r5' }, decline, open), practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, bookLorna, bookBea, decline, { type: 'runDay' }), practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, bookLorna, bookBea, decline), practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, { ...bookLorna, maker: 'h1' } as Command, bookBea, decline, open), practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, bookLorna, bookWren, decline, open), practice, guided[0]!)).toBeNull();
    expect(practiceEvening({ ...exact, config: { ...exact.config, seed: 'another-morning' } }, practice, hard[0]!)).toBeNull();
    expect(practiceEvening({ ...exact, commands: exact.commands.slice(1) }, practice, hard[0]!)).toBeNull();
    expect(practiceEvening(after(hire, bookLorna, bookBea, decline, open, open), practice, hard[0]!)).toBeNull();
  });
});
