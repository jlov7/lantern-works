import { expect, test, type Page } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { RULES } from '../src/engine/rules';
import { goPlace, takeFocused } from './workspace-helpers';

const savedGame = (page: Page) => page.evaluate(() => {
  const { config, commands } = JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0];
  return { config, commands };
});

// Layout changes must keep the real commands and the route back to decisions intact.
test('the opening keeps customer identity visible and roster selection command-free', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await page.getByRole('button', { name: 'Skip the guide', exact: true }).click();
  await goPlace(page, 'Window');
  let first = page.locator('.focused-decision .ticket');
  await expect(first.locator('.ticket-biz')).toBeVisible();
  await expect(first).toBeInViewport();
  const before = await savedGame(page);
  const roster = page.locator('.roster-peek');
  if (await roster.getAttribute('open') === null) await roster.locator('summary').click();
  const nextCustomer = page.locator('.roster-peek [data-request-id]').nth(1);
  const requestId = await nextCustomer.getAttribute('data-request-id');
  await nextCustomer.click();
  first = page.locator(`#ticket-${requestId}`);
  await expect(first.locator('.ticket-biz')).toBeVisible();
  await expect(first).toBeInViewport();
  expect(await savedGame(page)).toEqual(before);
  await expect(first).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('the first sale keeps its command and Undo restores the editable window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await page.getByRole('button', { name: 'Skip the guide', exact: true }).click();
  await goPlace(page, 'Window');
  await takeFocused(page);
  const commands = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  expect(commands.at(-1).type).toBe('accept');
  await goPlace(page, 'Studio');
  await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await goPlace(page, 'Studio');
  await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeEnabled();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  expect(restored).toEqual(commands.slice(0, -1));
});

test('the next morning keeps the window in place', async ({ page }, info) => {
  await page.goto('/#play=main-street:release-layout');
  await goPlace(page, 'Window');
  const queue = page.locator('.queue[aria-busy="false"]');
  await expect(queue).toBeVisible();
  const original = (await queue.boundingBox())!.x;
  await page.getByRole('button', { name: /^Open the shop for Day 1/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Window');
  await expect(queue).toBeVisible();
  const next = (await queue.boundingBox())!.x;
  expect(next).toBe(original);
  if (info.project.name === 'desktop') {
    expect(next).toBeGreaterThanOrEqual(0);
  }
});


test('the unanswered news is visible inline without a game move', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'first-season' };
  const season = runPolicy(config, GHOSTS.bright);
  let days = 0;
  const cut = season.commands.findIndex(command => command.type === 'runDay' && ++days === 2) + 1;
  await page.addInitScript(saved => localStorage.setItem('lantern.runs.v1', JSON.stringify([saved])), {
    v: 1, rules: RULES.version, id: 'release-news', label: 'News review', savedAt: new Date().toISOString(), config, commands: season.commands.slice(0, cut),
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue News review', exact: true }).click();
  await goPlace(page, 'Window');
  const before = await savedGame(page);
  await expect(page.locator('.news:not(.news-done) h3')).toBeVisible();
  expect(await savedGame(page)).toEqual(before);
});
