import { expect, test } from '@playwright/test';
import { PRESETS, RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { selectCustomer } from './workspace-helpers';

test('AI making has a named lane in the ordinary window plan', async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'm1' };
  const commands: Command[] = [
    { type: 'setStaff', staffing: { aiTier: 'duo', routing: 'all' } },
    { type: 'setMenu', offers: [PRESETS.launchlet] },
  ];
  expect(replay(config, commands).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ commands, rules, config }) => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'ai-plan', label: 'AI planning', savedAt: '2026-10-22T15:00:00.000Z', config, commands }]));
    sessionStorage.clear();
  }, { commands, rules: RULES.version, config });
  await page.reload();
  await page.getByRole('button', { name: 'Continue AI planning', exact: true }).click();
  const ticket = await selectCustomer(page, 'd0-r0');
  const selectedPlan = ticket.locator('.decision-plan');
  await selectedPlan.locator(':scope > summary').click();
  await expect(selectedPlan.locator('.lane-ai .dayplan-name')).toHaveText(['AI desk 1', 'AI desk 2']);
  await expect(selectedPlan.locator('.dayplan-free')).toContainText(/make .*\(AI desk 1\)/);
  await expect(selectedPlan.locator('.lane-ai .stage-produce')).not.toHaveCount(0);
  await selectedPlan.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('ai-window-hours.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'ai-plan').commands);
  expect(saved).toEqual(commands);
});
