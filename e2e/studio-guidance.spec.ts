import { expect, test } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { RULES } from '../src/engine/rules';
import { fits, forecast, takeableInTurn } from '../src/engine/selectors';
import { applyCommand, replay } from '../src/engine/sim';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { goPlace } from './workspace-helpers';

for (const { rules, name, requestId } of [
  { rules: LEGACY_RULES_VERSION, name: 'Rory', requestId: 'd4-r10' },
  { rules: RULES.version, name: 'Yara', requestId: 'd4-r4' },
]) test(`${rules} keeps an overtime rescue available when the buyer count stays flat`, async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'm2' };
  const commands = runPolicy(config, GHOSTS.hand, {}, rules).commands.slice(0, 45);
  const before = replay(config, commands, rules);
  expect(before.errors).toEqual([]);
  expect(fits(forecast(before.state, requestId))).toBe(false);
  expect(takeableInTurn(applyCommand(before.state, { type: 'overtime' }).state).length).toBe(takeableInTurn(before.state).length);
  await page.goto('/');
  await page.evaluate(({ config, commands, rules }) => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'guidance-choice', label: 'Guidance choice', savedAt: '2026-10-23T13:00:00.000Z', config, commands }]));
    sessionStorage.clear();
  }, { config, commands, rules });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Guidance choice', exact: true }).click();
  await goPlace(page, 'Studio');
  const studio = page.locator('#studio');
  await expect(studio.locator('.studio-hint')).toHaveText(`With overtime, ${name}'s order would fit. Book it, then choose who gets the hours.`);
  await studio.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('individual-rescue.png') });
  await studio.getByRole('button', { name: 'Book overtime', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'guidance-choice').commands);
  expect(saved).toEqual([...commands, { type: 'overtime' }]);
  const after = replay(config, saved, rules);
  expect(after.errors).toEqual([]);
  expect(fits(forecast(after.state, requestId))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
