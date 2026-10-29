import festival from '../../../test-fixtures/replays/festival-season1.json';
import type { Command } from '../../engine/types';
import { expect, it } from 'vitest';
import { PRESETS, RULES } from '../../engine/rules';
import { takeableInTurn } from '../../engine/selectors';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { leverOptions, leverResult } from './studioHint';

it('discloses that overtime slows tomorrow and cannot be repeated tomorrow', () => {
  let s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'panel-10' }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
  for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
  s = applyCommand(s, { type: 'runDay' }).state;
  expect(leverOptions(s, { ai: true, pace: true }).find((l) => l.id === 'overtime')?.note).toBe(`charged at opening; everyone ${RULES.staff.tiredPercent - 100}% slower tomorrow; no overtime tomorrow`);
});

it('shows a useful Festival substitution when the fitting count stays the same', () => {
  const { state, errors } = replay(festival.config, festival.commands.slice(0, 108) as Command[], festival.rules);
  expect(errors).toEqual([]);
  const temp = leverOptions(state, { ai: true, pace: true }).find(option => option.id === 'temp');
  expect(temp).toBeDefined();
  expect(temp!.n).toBe(0);
  expect(temp!.gained.length).toBeGreaterThan(0);
  expect(temp!.displaced.length).toBeGreaterThan(0);
  expect(leverResult(state, temp!)).toContain('no longer fit');
  expect(leverResult(state, temp!)).toContain('Same number');
});
