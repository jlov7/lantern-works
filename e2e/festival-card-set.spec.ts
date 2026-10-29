import { expect, test } from '@playwright/test';
import recorded from '../src/engine/fixtures/festival-mara-5.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

for (const width of [320, 1280]) test(`Festival bakery cards quote their actual shared dates and artifact at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const route = recorded.routes[0]!;
  const commands = route.commands as Command[];
  const index = commands.findIndex(command => command.type === 'acceptProject');
  const prefix = commands.slice(0, index);
  expect(replay(route.config, prefix, recorded.rules).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: recorded.rules, id: 'festival-cards', label: 'Festival bakery', savedAt: new Date().toISOString(), config: route.config, commands: prefix });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Festival bakery', exact: true }).click();
  await page.locator('.project-notice').click();
  await page.locator('.project-row').filter({ hasText: 'Mara' }).click();
  await page.getByRole('button', { name: /^Three cards for festival week/ }).click();
  const quote = page.locator('.project-quote');
  await expect(quote).toContainText('Three launches released together. All three have a two-day deadline.');
  await expect(quote.locator('.quote-dates li')).toHaveCount(3);
  for (const row of await quote.locator('.quote-dates li').all()) await expect(row).toContainText('starts Day 4, due Day 5');
  await quote.getByRole('button', { name: 'Book this commission', exact: true }).click();
  await expect(page.locator('.project-receipt')).toContainText('Booked: Three cards for festival week');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual(commands.slice(0, index + 1));
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.locator('.project-progress')).toContainText('Three cards for festival week');
  if (width === 320) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`bakery-${width}.png`) });
});
