import { expect, it } from 'vitest';
import { compareOutcomes } from './comparison';

const room = { deliveredAt: 333, cash: 2980, turnedAway: ['Finn', 'Sam', 'Yara'] };
const band = { deliveredAt: 288, cash: 2980, turnedAway: ['Finn', 'Sam', 'Yara'] };

it('accounts for the earlier delivery and identical walkouts and takings', () => {
  expect(compareOutcomes(room, band)).toEqual({
    minutesDiff: 45, cashDiff: 0, onlyA: [], onlyB: [], both: ['Finn', 'Sam', 'Yara'],
  });
});

it('retains the receipt order and isolates walkouts that belong to one edition', () => {
  const other = { ...band, cash: 2600, turnedAway: ['Sam', 'Finn', 'Mara'] };
  expect(compareOutcomes(room, other)).toEqual({
    minutesDiff: 45, cashDiff: 380, onlyA: ['Yara'], onlyB: ['Mara'], both: ['Finn', 'Sam'],
  });
  expect(compareOutcomes(other, room)).toMatchObject({
    minutesDiff: 45, onlyA: ['Mara'], onlyB: ['Yara'], both: ['Sam', 'Finn'],
  });
});
