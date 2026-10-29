import { expect, test, type Page } from '@playwright/test';
import { CLOSING_PROMISE } from '../src/engine/fixtures/closingPromise';
import { fits, forecast } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { goPlace, selectCustomer } from './workspace-helpers';

async function openSaved(page: Page, commands: Command[]) {
  await page.goto('/');
  await page.evaluate(({ commands, config, rules }) => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'closing-promise', label: 'Closing promise', savedAt: new Date().toISOString(), config, commands }]));
  }, { commands, config: CLOSING_PROMISE.config, rules: CLOSING_PROMISE.rules });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Closing promise', exact: true }).click();
  await goPlace(page, 'Window');
  const folded = page.locator('.late-fold');
  if (await folded.count()) {
    if (await folded.getAttribute('open') === null) await folded.locator('summary').click();
    await expect(folded).toHaveAttribute('open', '');
  }
}

test('a named existing closing refund is warned and needs confirmation before acceptance', async ({ page }) => {
  const { state, errors } = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands, CLOSING_PROMISE.rules);
  expect(errors).toEqual([]);
  expect(fits(forecast(state, 'd11-r1'))).toBe(false);
  await openSaved(page, CLOSING_PROMISE.commands);
  const eli = await selectCustomer(page, 'd11-r1');
  await expect(eli.locator('.fit')).toHaveText('Would cause a closing refund.');
  await expect(eli).toContainText('Taking this would leave Idris\'s launch unfinished at closing. That work would be refunded.');
  await expect(eli).not.toContainText('make Idris late');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('closing-refund-warning.png'), fullPage: true });
  await eli.getByRole('button', { name: 'Take it anyway', exact: true }).click();
  await expect(eli.getByRole('button', { name: 'Yes, take it anyway', exact: true })).toBeVisible();
  const commandsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  expect(commandsBefore).toEqual(CLOSING_PROMISE.commands);
  await eli.getByRole('button', { name: 'Yes, take it anyway', exact: true }).click();
  await expect(page.locator('.reply-receipt')).toContainText('Sold: Launchlet, 340 cr paid up front.');
});

test('a pre-existing closing refund is named without blaming the next buyer', async ({ page }) => {
  await openSaved(page, [...CLOSING_PROMISE.commands, CLOSING_PROMISE.candidate]);
  const tilly = await selectCustomer(page, 'd11-r2');
  await expect(tilly).toContainText('Already unfinished at closing without this order: Idris\'s launch. That work would be refunded.');
  await expect(tilly.locator('.fit')).toHaveText('Already faces a closing refund.');
  await expect(tilly).toContainText('No additional refunds if no redos or changes.');
  await expect(tilly).toContainText('Already unfinished at closing without this order: Idris\'s launch. That work would be refunded.');
  await expect(tilly).not.toContainText('Taking this would leave');
  await expect(tilly).not.toContainText('Work:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
