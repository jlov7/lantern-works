import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import type { Command } from '../src/engine/types';

const commands: Command[] = [{ type: 'accept', requestId: 'd0-r0', maker: 'h1' }, { type: 'runDay' }, { type: 'runDay' }];

for (const width of [320, 390, 1280]) test(`brief conversations reveal intent without booking and preserve the proof workflow at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: RULES.version, id: 'conversation', label: 'Conversation', savedAt: '2026-10-26T12:00:00.000Z', config: { scenarioId: 'main-street', seed: 'first-season' }, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Conversation', exact: true }).click();
  await page.locator('.project-notice').click();
  await expect(page.locator('#project-board-h')).toBeFocused();
  const conversation = page.getByRole('region', { name: 'At the table with Clem', exact: true });
  await expect(conversation).toContainText('The photograph is a little faded.');
  if (width === 320) await page.evaluate(async () => { document.documentElement.style.fontSize = '200%'; await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await conversation.getByRole('button', { name: 'What should people notice first?', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(conversation).toContainText('let their name lead');
  await expect(conversation.getByRole('button', { name: 'What should people notice first?', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await conversation.getByRole('button', { name: 'What would you keep?', exact: true }).click();
  await expect(conversation).toContainText('The bar’s name must be easy to find.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({ page }).include('.commission-conversation').analyze()).violations).toEqual([]);
  await conversation.screenshot({ path: info.outputPath(`conversation-${width}.png`) });
  await page.getByRole('button', { name: /The first-night photograph/ }).click();
  await page.getByRole('button', { name: 'Review this proof', exact: true }).click();
  const approve = page.getByRole('button', { name: 'Approve proof & book', exact: true });
  await approve.focus();
  const button = await approve.boundingBox();
  const dock = await page.locator('.workspace-dock').boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(dock!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
