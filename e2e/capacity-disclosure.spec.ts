import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { forecast, reactionTo, takeableInTurn, windowRequests } from '../src/engine/selectors';
import { applyCommand, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { leverOptions } from '../src/ui/game/studioHint';
import handmade from '../src/engine/fixtures/main-courtyard-5.0.0.json' with { type: 'json' };
import { goPlace } from './workspace-helpers';

const busy = JSON.parse(readFileSync('test-fixtures/replays/busy-courtyard.json', 'utf8')) as { config: RunConfig; commands: Command[]; rules: string };
const commandsOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);

async function load(page: Page, config: RunConfig, commands: Command[], rules: string) {
  await page.goto('/');
  await page.evaluate(saved => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([saved]));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
  }, { v: 1, id: 'capacity', rules, label: 'Capacity disclosure', savedAt: new Date().toISOString(), config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Capacity disclosure', exact: true }).click();
}

test('last-day buyers outside the baseline horizon retain helpful capacity choices and live Undo', async ({ page }) => {
  const commands = handmade.commands.slice(0, 69) as Command[];
  const { state, errors } = replay(handmade.config, commands, handmade.rules);
  expect(errors).toEqual([]);
  const buyers = windowRequests(state).filter(request => request.status === 'waiting' && reactionTo(state, request).kind === 'buy');
  expect(buyers).toHaveLength(8);
  expect(buyers.every(request => forecast(state, request.id).newAfterSeason.length === 1)).toBe(true);
  const options = leverOptions(state, { ai: true, pace: true });
  expect(options.map(option => option.id)).toEqual(['ai', 'overtime', 'temp']);
  await load(page, handmade.config, commands, handmade.rules);
  const disclosure = page.locator('.decision-levers');
  await expect(disclosure).toBeVisible();
  await expect(disclosure.locator('.levers button')).toHaveCount(0);
  await disclosure.locator('summary').click();
  await expect(disclosure.locator('.levers li')).toHaveCount(options.length);
  await disclosure.getByRole('button', { name: /^Book overtime/ }).click();
  const after = applyCommand(state, { type: 'overtime' });
  expect(after.error).toBeUndefined();
  await expect(disclosure.locator('.levers li')).toHaveCount(leverOptions(after.state, { ai: true, pace: true }).length);
  await expect(disclosure.getByRole('button', { name: /^Book overtime/ })).toHaveCount(0);
  expect(await commandsOf(page)).toEqual([...commands, { type: 'overtime' }]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(disclosure.locator('.levers li')).toHaveCount(options.length);
  expect(await commandsOf(page)).toEqual(commands);
});

test('an exhausted capacity comparison says so without changing the recorded morning', async ({ page }) => {
  const commands: Command[] = [...busy.commands.slice(0, 62), { type: 'temp' }, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'simple' } }, { type: 'pace', pace: 'push' }];
  const run = replay(busy.config, commands, busy.rules);
  expect(run.errors).toEqual([]);
  expect(takeableInTurn(run.state)).toHaveLength(10);
  expect(leverOptions(run.state, { ai: true, pace: true })).toEqual([]);
  await load(page, busy.config, commands, busy.rules);
  const disclosure = page.locator('.decision-levers');
  await disclosure.locator('summary').click();
  await expect(disclosure).toContainText('None of these changes makes room for a different buyer in queue order.');
  await disclosure.locator('summary').click();
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  await comparison.locator('.compare-options > summary').click();
  await expect(comparison.locator('.levers button')).toHaveCount(0);
  await comparison.getByRole('button', { name: /^Return to / }).click();
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
  await expect(comparison.locator('.compare-options')).not.toHaveAttribute('open');
  await comparison.getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Studio');
  await goPlace(page, 'Window');
  await expect(disclosure).not.toHaveAttribute('open');
  expect(await commandsOf(page)).toEqual(commands);
});
