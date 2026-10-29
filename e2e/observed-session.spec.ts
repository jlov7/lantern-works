import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { expect, test, type Page } from '@playwright/test';
import observed from '../test-fixtures/replays/courier-session.json' with { type: 'json' };
import closing from '../test-fixtures/replays/ordinary-loop.json' with { type: 'json' };
import { goPlace } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

test.use({ reducedMotion: 'no-preference' });
const commands = observed.commands as Command[];

async function restore(page: Page, prefix: number, tape = { config: observed.config, commands }) {
  const saved = tape.commands.slice(0, prefix);
  const result = replay(tape.config, saved, LEGACY_RULES_VERSION);
  expect(result.errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ saved, config, rules }) => {
    localStorage.clear();
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'observed', label: 'Observed season', savedAt: new Date().toISOString(), config, commands: saved }]));
  }, { saved, config: tape.config, rules: LEGACY_RULES_VERSION });
  await page.reload();
  await page.getByRole('button', { name: `${result.state.finished ? 'Look back at' : 'Continue'} Observed season`, exact: true }).click();
}

test('an observed batch starts on its actual release morning', async ({ page }) => {
  await restore(page, 37);
  const state = replay(observed.config, commands.slice(0, 37), LEGACY_RULES_VERSION).state;
  expect(state.day).toBe(5);
  expect(state.jobs.find(j => j.id === 'c16-l1')).toMatchObject({ status: 'scheduled', releaseDay: 5 });
  await goPlace(page, 'Work');
  {
    const row = page.locator('.due-next li').nth(2);
    await expect(row).toContainText('Odile');
    await expect(row.locator('span').first()).toHaveText('starts today');
  }
  await expect(page.locator('.promise-list li').filter({ hasText: 'Odile' }).locator('.p-state').first()).toHaveText('starts Day 6');
  await page.screenshot({ path: test.info().outputPath('release-morning.png'), fullPage: true });
});

test('the observed final call keeps the day title until playback finishes and reports all 51 served', async ({ page }) => {
  await restore(page, commands.length - 1);
  await expect(page.locator('.call')).toContainText('Rory');
  await page.locator('.call').getByRole('button', { name: 'Leave it', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Skip to evening', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Day 12 of 12, Main Street - Lantern Works');
  await page.screenshot({ path: test.info().outputPath('final-call-playback.png') });
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(page.locator('.evening h2')).toHaveText('Day 12, evening, season over');
  await expect(page).toHaveTitle('Season over, Main Street - Lantern Works');
  await expect(page.locator('.evening-first')).toHaveText('51 neighbours served this season.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'observed'));
  expect(saved.commands).toEqual(commands);
  expect(replay(saved.config, saved.commands, LEGACY_RULES_VERSION)).toEqual(replay(observed.config, commands, LEGACY_RULES_VERSION));
  await page.screenshot({ path: test.info().outputPath('final-evening.png'), fullPage: true });
});

test('a closing refund is reported without claiming every promise was kept', async ({ page }) => {
  await restore(page, closing.commands.length, { config: closing.config, commands: closing.commands as Command[] });
  await page.getByText('The Gazette: how the street remembers it', { exact: true }).click();
  await expect(page.locator('.end-gazette')).toContainText('37 neighbours served');
  await expect(page.locator('.end-gazette')).toContainText('1 unfinished launch was refunded.');
  await expect(page.locator('.end-gazette')).not.toContainText('every promise kept');
  await expect(page.locator('.end-gazette')).not.toContainText('kept every promise');
  await page.locator('.end-gazette').screenshot({ path: test.info().outputPath('closing-paper.png') });
});
