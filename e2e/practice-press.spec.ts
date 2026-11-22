import { expect, test, type Page } from '@playwright/test';
import fixture from '../src/engine/fixtures/career-7.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { CAREER_RULES_VERSION, CURRENT_RULES_VERSION } from '../src/engine/versions';

const route = fixture.routes.find(item => item.id === 'prosperous')!;
const practice = route.seasons[1]!;
const commands = practice.commands.slice(0, 24) as Command[];
const run = { v: 1, id: 'shared-press', label: 'Shared press', savedAt: '2026-11-21T12:00:00.000Z', rules: CURRENT_RULES_VERSION, config: practice.config as RunConfig, commands };

async function open(page: Page, save = run) {
  await page.goto('/');
  await page.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated' }));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([value]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${save.label}`, exact: true }).click();
}

for (const [winner, other, approach] of [
  ['Clem', 'Mara', 'A Thursday residency'],
  ['Mara', 'Clem', 'The counter and menu set'],
] as const) test(`${winner} can reserve the same practice press slot, leaving ${other} waiting`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('.project-notice').click();
  const options = page.locator('.project-press-choice');
  await expect(options).toContainText('One press booking for Clem or Mara');
  await expect(options.locator('button')).toHaveCount(2);
  await expect(options).toContainText('Clem');
  await expect(options).toContainText('Mara');
  await expect(options).toContainText('1,400 cr');
  await expect(options).toContainText('1,440 cr');
  await expect(options).toContainText('due Day');
  await options.getByRole('button', { name: new RegExp(`See ${winner}’s approaches`) }).click();
  await expect(page.locator('.project-board')).toContainText(`Booking ${winner} closes ${other}’s commission`);
  await page.getByRole('button', { name: new RegExp(approach) }).click();
  await expect(page.locator('.project-board')).toContainText(`${other}’s commission cannot be booked this season`);
  await page.getByRole('region', { name: 'Day controls' }).getByRole('button', { name: 'Review proof & promise', exact: true }).click();
  await expect(page.locator('.project-payment')).toBeVisible();
  await expect(page.locator('.quote-dates')).toBeVisible();
  await page.getByRole('region', { name: 'Day controls' }).getByRole('button', { name: 'Book this proof', exact: true }).click();
  await expect(page.locator('.project-receipt')).toContainText('Booked');
  if (!(await page.locator('.project-roster').evaluate(element => (element as HTMLDetailsElement).open))) await page.locator('.project-roster > summary').click();
  await page.locator('.project-roster .project-row').filter({ hasText: other }).click();
  await expect(page.locator('.project-board')).toContainText(`${winner} booked the shared press. No press booking remains for ${other} this season`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  const replayed = replay(saved.config, saved.commands, saved.rules);
  expect(replayed.errors).toEqual([]);
  expect(replayed.state.contracts.find(contract => contract.project?.id === (winner === 'Clem' ? 'clem-ten' : 'mara-regular'))).toBeDefined();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Shared press', exact: true }).click();
  await page.locator('.project-notice').click();
  await expect(page.locator('.project-board')).toContainText(`${winner} booked the shared press. No press booking remains for ${other} this season`);
});

test('a finished 7.0 opening studio can choose the new press rule for season two', async ({ page }) => {
  const opening = route.seasons[0]!;
  const old = { ...run, id: 'original', label: 'Original studio', rules: CAREER_RULES_VERSION, config: opening.config as RunConfig, commands: opening.commands as Command[] };
  await open(page, old);
  await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new season for your studio' });
  await expect(dialog.getByRole('radio', { name: 'Continue under the original rules' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'One shared press booking for Clem or Mara' }).check();
  await dialog.getByRole('button', { name: 'Open season 2', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Game places' })).toBeVisible();
  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(saves.find((save: typeof run) => save.id === 'original')?.rules).toBe(CAREER_RULES_VERSION);
  expect(saves.find((save: typeof run) => save.id !== 'original')?.rules).toBe(CURRENT_RULES_VERSION);
});

test('desktop shows both press options beside the commission roster', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.locator('.project-notice').click();
  const roster = await page.locator('.project-roster').boundingBox();
  const options = await page.locator('.project-press-choice').boundingBox();
  expect(options!.x).toBeGreaterThanOrEqual(roster!.x + roster!.width);
  await expect(page.locator('.project-press-choice button')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});
