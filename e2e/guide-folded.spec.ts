import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { fits, forecast, windowRequests } from '../src/engine/selectors';
import { createRun, replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

test('skipping the replayed customer lesson reaches the focused late decision without making a sale', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'first-season' };
  const commands: Command[] = [
    { type: 'setMenu', offers: [{ name: 'Bespoke Launch', launches: 4, spacingDays: 2, turnaroundDays: 1, scope: 'any', style: 'custom', price: 50 }] },
    ...createRun(config).requests.map(r => ({ type: 'accept' as const, requestId: r.id })),
    { type: 'runDay' },
  ];
  const native = replay(config, commands);
  expect(native.errors).toEqual([]);
  expect(native.state.day).toBe(1);
  expect(windowRequests(native.state)).toHaveLength(6);
  expect(windowRequests(native.state).every(r => !fits(forecast(native.state, r.id)))).toBe(true);
  const run = { v: 1, rules: RULES.version, id: 'guide-folded-replay', label: 'Folded guide replay', savedAt: '2026-10-24T00:00:00.000Z', config, commands };
  await page.addInitScript(saved => {
    if (localStorage.getItem('lantern.runs.v1') !== null) throw new Error('The isolated fixture context must start empty');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([saved]));
  }, run);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue the season', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show the tutorial again' }).click();
  const coach = page.getByRole('complementary', { name: /^Guide, step/ });
  await coach.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(coach).toHaveAccessibleName('Guide, step 2 of 5');
  await coach.getByRole('button', { name: 'Skip the guide', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await expect(page.locator('.ticket-waiting')).toHaveCount(1);
  await expect(page.locator('.ticket-waiting .btn-take-risky')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Compare all neighbours' })).toBeVisible();
  await expect(page.locator('.late-fold')).toHaveAttribute('open');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
});
