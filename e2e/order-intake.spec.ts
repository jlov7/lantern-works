import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { expect, test, type Page } from '@playwright/test';
import { selectCustomer } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import { shareSchema } from '../src/ui/schema';
import ordinary from '../src/ui/game/fixtures/ordinary-order-intake.json' with { type: 'json' };

const tape = shareSchema.parse(ordinary);

async function openPrefix(page: Page, count: number) {
  const save = { v: 1, rules: LEGACY_RULES_VERSION, id: 'original-order-intake', label: 'Original ordinary orders', savedAt: new Date().toISOString(), config: tape.config, commands: tape.commands.slice(0, count) };
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Original ordinary orders', exact: true }).click();
  await expect(page.locator('#window-h')).toBeVisible();
}

async function savedCommands(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'original-order-intake').commands);
}

test('news discloses the queue action and regular-loss risk before the choice', async ({ page }, info) => {
  await openPrefix(page, 23);
  const news = page.locator('.news').filter({ hasText: 'Clem Jazz Bar turns ten' });
  const add = news.getByRole('button', { name: 'Add the order to the window', exact: true });
  await expect(add).toBeVisible();
  await expect(news).toContainText('Turn this order away or leave it unanswered, and Clem will not return.');
  await expect(news.getByRole('button', { name: 'Send a card instead', exact: true })).toBeVisible();
  expect(await savedCommands(page)).toEqual(tape.commands.slice(0, 23));
  if (await page.locator('.morning-notes').count() && !await page.locator('.morning-notes').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.morning-notes > summary').click();
  await news.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `scratch/story-order-intent-${info.project.name}.png` });
  await add.click();
  await expect(news).toContainText('Ten years of Clem: not taken yet.');
  await page.locator('#ticket-d5-n').getByRole('button', { name: 'Turn away for good', exact: true }).click();
  const commands = await savedCommands(page);
  expect(commands).toEqual([...tape.commands.slice(0, 23), { type: 'choose', newsId: 'n5', option: 1 }, { type: 'decline', requestId: 'd5-n' }]);
  expect(replay(tape.config, commands, LEGACY_RULES_VERSION).state.lostCast).toContain('clem');
});

test('separate customer orders stay explicit before and after taking the anniversary', async ({ page }, info) => {
  await openPrefix(page, 27);
  const news = page.locator('.news-done');
  await expect(news).toContainText('Ten years of Clem: not taken yet.');
  const extra = await selectCustomer(page, 'd5-r5');
  await expect(extra).toContainText('Another order from Clem is at the window today.');
  await selectCustomer(page, 'd5-n');
  await page.locator('#ticket-d5-n').getByRole('button', { name: 'Tomas makes it', exact: true }).click();
  await page.locator('#ticket-d5-n').getByRole('button', { name: 'Take with Tomas', exact: true }).click();
  await expect(news).toContainText('Ten years of Clem: taken at the window.');
  await expect(news).toContainText('Another order from Clem is still waiting at the window. Leave that order unanswered and Clem will not return.');
  await selectCustomer(page, 'd5-r5');
  await expect(extra).toContainText('Ten years of Clem is already taken. This is another order.');
  expect(await savedCommands(page)).toEqual(tape.commands.slice(0, 28));
  if (await page.locator('.morning-notes').count() && !await page.locator('.morning-notes').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.morning-notes > summary').click();
  await news.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `scratch/order-intake-${info.project.name}.png` });
});

test('the original evening distinguishes the unanswered order and preserves its exact native state', async ({ page }, info) => {
  await openPrefix(page, 31);
  await page.getByRole('button', { name: /^Open the shop for Day 6\b/ }).click();
  const skip = page.getByRole('button', { name: 'Skip to evening', exact: true });
  if (await skip.isVisible()) await skip.click();
  const note = page.locator('.evening > .evening-note').filter({ hasText: 'You took Ten years of Clem for Clem' });
  await expect(note).toBeVisible();
  await expect(note).toContainText('but left another order waiting when you opened. Clem will not return.');
  await expect(note).toContainText('Sam came back today and was left waiting');
  const commands = await savedCommands(page);
  expect(commands).toEqual(tape.commands.slice(0, 32));
  expect(replay(tape.config, commands, LEGACY_RULES_VERSION)).toEqual(replay(tape.config, tape.commands.slice(0, 32), LEGACY_RULES_VERSION));
  await note.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `scratch/order-intake-evening-${info.project.name}.png` });
});
