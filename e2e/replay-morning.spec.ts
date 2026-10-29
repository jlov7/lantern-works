import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SavedRun } from '../src/ui/schema';

const recorded = JSON.parse(readFileSync('test-fixtures/replays/handmade-run.json', 'utf8')) as SavedRun;

test('retrying Day 3 preserves the completed call and reopens the morning decisions', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.guide.v1', 'seen');
  }, recorded);
  await page.reload();
  await page.getByRole('button', { name: `Look back at ${recorded.label}`, exact: true }).click();
  await page.locator('.end-rewind').getByRole('button', { name: /^Day 3\b/ }).click();
  await expect(page).toHaveTitle('Day 3 of 12, Main Street - Lantern Works');
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add the order to the window', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(saves.find((save: { id: string }) => save.id === recorded.id).commands).toEqual(recorded.commands);
  const branch = saves.find((save: { parentId?: string }) => save.parentId === recorded.id);
  expect(branch.commands).toEqual(recorded.commands.slice(0, 11));
  expect(branch.branchDay).toBe(2);
  await page.screenshot({ path: test.info().outputPath('fresh-day-three.png'), fullPage: true });
});
