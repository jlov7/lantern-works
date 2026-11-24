import * as z from 'zod';
import fixture from '../../../test-fixtures/replays/festival-season1.json';
import { fits, forecast } from '../../engine/selectors';
import { applyCommand, isRegular } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { castName } from '../format';
import { restore } from '../persist';
import { shareSchema, type SharePayload } from '../schema';
import { haggling } from './morningReplies';
import { leverOptions } from './studioHint';

export const practicePriority = z.enum(['relationships', 'promises', 'cash']);
export const practiceDifficulty = z.enum(['guided', 'standard', 'hard']);
export type Priority = z.infer<typeof practicePriority>;
export type Difficulty = z.infer<typeof practiceDifficulty>;

export const PRIORITIES = {
  relationships: 'Keep a neighbour coming back',
  promises: 'Take work the studio can finish',
  cash: 'Protect the cash in the till',
} satisfies Record<Priority, string>;

export const DIFFICULTIES = {
  guided: 'Guided',
  standard: 'Standard',
  hard: 'Hard',
} satisfies Record<Difficulty, string>;

const fallback = {
  relationships: 'choose-neighbour',
  promises: 'protect-promise',
  cash: 'spend-for-capacity',
} as const;

const cardIds = z.enum(['choose-neighbour', 'protect-promise', 'spend-for-capacity']);
export const decisionSelection = z.strictObject({ challengeId: cardIds });
type CardId = z.infer<typeof cardIds>;

const planIds = ['current-crew', 'temp-wren', 'temp-lorna', 'temp-both'] as const;
type PlanId = typeof planIds[number];

const plans = {
  'current-crew': { hire: false, buyers: ['d10-r4', 'd10-r5'] },
  'temp-wren': { hire: true, buyers: ['d10-r0', 'd10-r4'] },
  'temp-lorna': { hire: true, buyers: ['d10-r2', 'd10-r4'] },
  'temp-both': { hire: true, buyers: ['d10-r2', 'd10-r0'] },
} as const satisfies Record<PlanId, { hire: boolean; buyers: readonly string[] }>;

const cards = [
  { id: 'choose-neighbour', question: 'Two plans fit with a temp. Which neighbour gets the other place?',
    options: ['temp-wren', 'temp-lorna'] },
  { id: 'spend-for-capacity', question: 'A temp changes who fits in the schedule. Would you pay for that change?',
    options: ['current-crew', 'temp-lorna'] },
  { id: 'protect-promise', question: 'Would you take both longer orders when the studio is already stretched?',
    options: ['temp-lorna', 'temp-both'] },
] as const satisfies ReadonlyArray<{ id: CardId; question: string; options: readonly [PlanId, PlanId] }>;

export interface PracticePlan {
  id: PlanId;
  bookings: string[];
  tempCostCr: number;
  depositCr: number;
  regularBookings: string[];
  forecastFlags: string[];
}

type Morning = Pick<SharePayload, 'config' | 'commands' | 'rules'>;
type Card = typeof cards[number];

export interface PracticeEvening {
  id: PlanId;
  cashCr: number;
  earnedCr: number;
  unearnedCr: number;
  delivered: number;
  missed: number;
  lostNeighbours: string[];
}

function planMoves(id: PlanId): Command[] {
  const { hire, buyers } = plans[id];
  const moves: Command[] = hire ? [{ type: 'temp' }] : [];
  for (const requestId of buyers) moves.push({ type: 'accept', requestId });
  return moves;
}

function festivalPractice() {
  const morning = shareSchema.parse({ v: 1, rules: fixture.rules, config: fixture.config, commands: fixture.commands.slice(0, 108) });
  const state = restore(morning);
  if (!state || state.day !== 10) throw new Error('The rehearsal morning could not be read.');
  const temp = leverOptions(state, { ai: true, pace: true }).find(option => option.id === 'temp');
  if (!temp) throw new Error('The rehearsal temp is unavailable.');
  const eveningMoves = new Map<PlanId, Command[]>();
  const options = planIds.map((id): PracticePlan => {
    let current = state;
    const bookings: string[] = [];
    const regularBookings: string[] = [];
    const forecastFlags: string[] = [];
    let depositCr = 0;
    const moves = planMoves(id);
    for (const move of moves) {
      if (move.type === 'accept') {
        const request = current.requests.find(request => request.id === move.requestId && request.day === state.day && request.status === 'waiting');
        if (!request) throw new Error('A rehearsal customer is unavailable.');
        const name = castName(request.castId);
        bookings.push(name);
        if (isRegular(state, request.castId)) regularBookings.push(name);
        if (!fits(forecast(current, request.id))) forecastFlags.push(name);
      }
      const next = applyCommand(current, move);
      if (next.error) throw new Error('A rehearsal plan is unavailable.');
      if (move.type === 'accept') depositCr += next.state.cash - current.cash;
      current = next.state;
    }
    for (const request of haggling(current)) moves.push({ type: 'decline', requestId: request.id });
    moves.push({ type: 'runDay', calls: true });
    eveningMoves.set(id, moves);
    return { id, bookings, tempCostCr: plans[id].hire ? temp.cost : 0, depositCr, regularBookings, forecastFlags };
  });
  return { morning, day: state.day, revenue: state.revenue, startingLost: new Set(state.lostCast), options, eveningMoves };
}

let practice: ReturnType<typeof festivalPractice> | undefined;

export function loadDecisionPractice() {
  return practice ??= festivalPractice();
}

export function eligibleDecisionCards(difficulty: Difficulty, options: readonly PracticePlan[]): Card[] {
  return cards.filter(card => {
    const first = options.find(option => option.id === card.options[0]);
    const second = options.find(option => option.id === card.options[1]);
    if (!first || !second) return false;
    const aFits = first.forecastFlags.length === 0;
    const bFits = second.forecastFlags.length === 0;
    if (difficulty === 'guided') return aFits && bFits && first.tempCostCr === second.tempCostCr;
    if (difficulty === 'hard') return aFits !== bFits;
    return true;
  });
}

export function resolveDecisionCard(priority: Priority, eligible: readonly Card[], selection?: unknown) {
  const result = decisionSelection.safeParse(selection);
  const fromModel = eligible.length > 1 && result.success && eligible.find(card => card.id === result.data.challengeId);
  if (fromModel) return { card: fromModel, source: 'model' as const };
  const card = eligible.find(card => card.id === fallback[priority]) ?? eligible[0];
  return { card, source: 'authored' as const };
}

export function practiceEvening(run: Morning, challenge: ReturnType<typeof loadDecisionPractice>, card: Card): PracticeEvening | null {
  const { morning, day, revenue } = challenge;
  const prefix = run.commands.slice(0, morning.commands.length);
  if (run.rules !== morning.rules || JSON.stringify(run.config) !== JSON.stringify(morning.config)
    || JSON.stringify(prefix) !== JSON.stringify(morning.commands)) return null;

  const moves = JSON.stringify(run.commands.slice(morning.commands.length));
  const id = card.options.find(id => JSON.stringify(challenge.eveningMoves.get(id)) === moves);
  if (!id) return null;

  const state = restore(run);
  if (!state || state.call || state.day !== day + 1) return null;
  const events = state.events.filter(event => event.day === day);
  return {
    id, cashCr: state.cash, earnedCr: state.revenue - revenue, unearnedCr: state.unearned,
    delivered: events.filter(event => event.type === 'delivered').length,
    missed: events.filter(event => event.type === 'missed').length,
    lostNeighbours: state.lostCast.filter(id => !challenge.startingLost.has(id)).map(castName),
  };
}
