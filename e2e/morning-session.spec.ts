import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { PRESETS } from '../src/engine/rules';
import { fits, forecast } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { MAX_COMMANDS, savedRunSchema } from '../src/ui/schema';
import { goPlace } from './workspace-helpers';

test.use({ hasTouch: true });

const longHistory = (commands: Command[]): Command[] => [
  ...Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({ type: 'setMenu' as const, offers: [{ ...PRESETS.bespoke, price: 500 + (i % 2) * 10 }] })),
  ...commands,
];

async function loadLong(page: Page, config: RunConfig, commands: Command[]) {
  expect(replay(config, commands, LEGACY_RULES_VERSION).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ config, commands, rules }) => {
    const saved = { v: 1, rules, id: 'integrated', label: 'Integrated morning', savedAt: '2026-10-23T00:00:00Z', config, commands };
    localStorage.setItem('lantern.runs.v1', JSON.stringify([saved, { ...saved, commands: commands.slice(0, -1) }]));
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    sessionStorage.clear();
  }, { config, commands, rules: LEGACY_RULES_VERSION });
  await page.reload();
  await expect(page.locator('.saved-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue Integrated morning', exact: true }).click();
}

const savedCommands = (page: Page): Promise<Command[]> => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);

test('a recovered long history keeps compact customer selection command-free', async ({ page }, info) => {
  const tape = savedRunSchema.parse(JSON.parse(readFileSync('test-fixtures/replays/sign-tapes.json', 'utf8')).main);
  const commands = longHistory(tape.commands);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadLong(page, tape.config, commands);
  const roster = page.locator('.roster-peek');
  if (await roster.getAttribute('open') === null) await roster.locator('summary').click();
  const mina = roster.locator('[data-request-id]').filter({ hasText: 'Mina' });
  await mina.focus();
  await mina.press('Enter');
  const selected = page.locator('#ticket-d4-r2');
  await expect(selected).toHaveClass(/is-selected/);
  expect(await savedCommands(page)).toEqual(commands);
  expect(replay(tape.config, await savedCommands(page), LEGACY_RULES_VERSION).state).toEqual(replay(tape.config, commands, LEGACY_RULES_VERSION).state);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `scratch/morning-session-candidate/selection-${info.project.name}.png` });
});

test('a recovered long history keeps the individual overtime rescue actionable and saved', async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'm2' };
  const commands = longHistory(runPolicy(config, GHOSTS.hand, undefined, LEGACY_RULES_VERSION).commands.slice(0, 45));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadLong(page, config, commands);
  await goPlace(page, 'Studio');
  const studio = page.locator('#studio');
  await expect(studio.locator('.studio-hint')).toHaveText("With overtime, Rory's order would fit. Book it, then choose who gets the hours.");
  await studio.getByRole('button', { name: 'Book overtime', exact: true }).click();
  const expected: Command[] = [...commands, { type: 'overtime' }];
  expect(await savedCommands(page)).toEqual(expected);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Integrated morning', exact: true }).click();
  expect(await savedCommands(page)).toEqual(expected);
  const after = replay(config, await savedCommands(page), LEGACY_RULES_VERSION);
  expect(after.errors).toEqual([]);
  expect(fits(forecast(after.state, 'd4-r10'))).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `scratch/morning-session-candidate/rescue-${info.project.name}.png` });
});
