import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { hours } from '../src/ui/format';
import observed from '../src/ui/game/fixtures/careful-maker-day.json' with { type: 'json' };
import { plannedWork } from '../src/ui/game/plannedWork';
import { authoredCommands } from './authored-helpers';
import { selectCustomer } from './workspace-helpers';

test('Agnes’s maker choice quotes the actual tomorrow rate without changing today’s pace', async ({ page }, info) => {
  const commands = authoredCommands(observed.config, observed.commands as Command[]);
  const before = replay(observed.config, commands);
  expect(before.errors).toEqual([]);
  const work = plannedWork(before.state, observed.requestId, false, 'h2')!;
  expect(work.production[0]!.day).toBe(before.state.day + 1);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
  }, { v: 1, rules: RULES.version, id: 'maker-day', label: 'Careful maker day', savedAt: new Date().toISOString(), config: observed.config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Careful maker day', exact: true }).click();
  const ticket = await selectCustomer(page, observed.requestId);
  await expect(ticket.locator('[data-customer-heading]')).toHaveText('Agnes');
  const tomas = ticket.getByRole('button', { name: 'Tomas makes it', exact: true });
  await expect(tomas).toHaveAccessibleDescription(new RegExp(`about ${hours(work.first!)} work, 76% without redo`));
  await tomas.click();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect((await saved()).commands).toEqual(commands);
  await page.screenshot({ path: `scratch/entry/agnes-rate-${info.project.name}.png` });
  await ticket.getByRole('button', { name: 'Take with Tomas', exact: true }).click();
  await expect(page.locator('.reply-receipt')).toBeFocused();
  const actual = await saved();
  expect(actual.rules).toBe(RULES.version);
  expect(actual.commands).toEqual([...commands, { type: 'accept', requestId: observed.requestId, maker: 'h2' }]);
});
