import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { expect, test, type Page } from '@playwright/test';
import observed from '../test-fixtures/replays/early-workboard.json' with { type: 'json' };
import bookingRun from '../test-fixtures/replays/courier-session.json' with { type: 'json' };
import { selectCustomer } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { plannedWork } from '../src/ui/game/plannedWork';
import { hours } from '../src/ui/format';

const run = observed[0]!;
const commands = run.commands as Command[];
test.setTimeout(30_000);
const saved = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('lantern.runs.v1')!) as { id: string; commands: Command[] }[]).find(r => r.id === 'planned-work')!.commands);

async function restore(page: Page, prefix: number, tape = { config: run.config, commands }) {
  await page.goto('/');
  await page.evaluate(({ config, commands, rules }) => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'planned-work', label: 'Planned work', savedAt: new Date().toISOString(), config, commands }]));
  }, { config: tape.config, commands: tape.commands.slice(0, prefix), rules: LEGACY_RULES_VERSION });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Planned work', exact: true }).click();
}

async function ticket(page: Page, id: string) { return selectCustomer(page, id); }

test('the ordinary first-morning quote follows the kit schedule and Take remains one native command', async ({ page }, info) => {
  await restore(page, 3);
  const row = await ticket(page, 'd0-r1');
  await expect(row.locator('.verdict-buy')).toContainText('about 3 hours, due tonight');
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
  await page.locator('.compare-options > summary').click();
  await page.locator('.queue-notes > summary').click();
  await expect(page.locator('.work-assumption')).toContainText('without redos or later orders. Kit setup is separate.');
  await expect(page.locator('.work-assumption')).toBeVisible();
  await page.getByRole('button', { name: /^Return to / }).click();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('kit-quote.png') });
  await row.getByRole('button', { name: 'Take it', exact: true }).click();
  expect(await saved(page)).toEqual(commands.slice(0, 4));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saved(page)).toEqual(commands.slice(0, 3));
  await expect((await ticket(page, 'd0-r1')).locator('.verdict-buy')).toContainText('about 3 hours, due tonight');
});

test('a retained booking separates total work from tomorrow without changing the account', async ({ page }, info) => {
  await restore(page, 13, { config: bookingRun.config, commands: bookingRun.commands as Command[] });
  const row = await ticket(page, 'd2-r7');
  await expect(row.locator('.booking-line')).toContainText("About 14.5 hours of people's work in total. Tomorrow: about 7.5 hours of their 12 hours");
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('booking-work.png') });
  expect(await saved(page)).toEqual(bookingRun.commands.slice(0, 13));
});

test('the next ordinary morning includes fatigue, preserves maker choices and survives reload', async ({ page }, info) => {
  await restore(page, 7);
  const row = await ticket(page, 'd1-r2');
  await expect(row.locator('.verdict-buy')).toContainText('about 3.5 hours, due tonight');
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('fatigue-quote.png') });
  await row.getByRole('button', { name: 'Take it', exact: true }).click();
  expect(await saved(page)).toEqual(commands.slice(0, 8));
  const next = await ticket(page, 'd1-r4');
  await expect(next.locator('.verdict-buy')).toContainText('about 3 hours, due tonight');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Planned work', exact: true }).click();
  await expect((await ticket(page, 'd1-r4')).locator('.verdict-buy')).toContainText('about 3 hours, due tonight');
  const actual = replay(run.config, await saved(page), LEGACY_RULES_VERSION);
  expect(actual.errors).toEqual([]);
  expect(actual.state).toEqual(replay(run.config, commands.slice(0, 8), LEGACY_RULES_VERSION).state);
  await (await ticket(page, 'd1-r4')).getByRole('button', { name: 'Take it', exact: true }).click();
  const tomas = (await ticket(page, 'd1-r1')).getByRole('button', { name: 'Tomas makes it', exact: true });
  const minutes = plannedWork(replay(run.config, commands.slice(0, 9), LEGACY_RULES_VERSION).state, 'd1-r1', false, 'h2')!.first!;
  await expect(tomas.locator('.small').first()).toHaveText(`about ${hours(minutes)} work, 76% without redo`);
  await tomas.click();
  await page.getByRole('button', { name: 'Take with Tomas', exact: true }).click();
  for (const id of ['d1-r3', 'd1-r5']) await (await ticket(page, id)).getByRole('button', { name: 'Turn down', exact: true }).click();
  await page.getByRole('button', { name: /^Open the shop for Day/ }).click();
  await expect(page.locator('.evening h2')).toContainText('Day 2, evening');
  expect(await saved(page)).toEqual(commands);
  expect(replay(run.config, await saved(page), LEGACY_RULES_VERSION).state).toEqual(replay(run.config, commands, LEGACY_RULES_VERSION).state);
});
