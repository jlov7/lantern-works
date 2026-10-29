import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { nightCalendar } from '../src/engine/projects';
import { RULES, SCENARIOS } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { dayLabel } from '../src/ui/format';
import { dailyConfig } from '../src/ui/persist';
import { FIRST_SEASON } from '../src/ui/screens/firstSeason';

const saves = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'));

for (const width of [320, 390, 1280]) test(`the first choice and street calendars stay usable at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  if (width === 1280) await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const first = page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true });
  await expect(first).toBeInViewport();
  await page.locator('.streets > summary').focus();
  await page.keyboard.press('Enter');
  for (const scenario of SCENARIOS) {
    const street = page.locator('.street:not(.street-daily)').filter({ has: page.getByRole('heading', { name: scenario.name, exact: true }) });
    const calendar = nightCalendar({ config: { ...FIRST_SEASON, scenarioId: scenario.id } });
    await expect(street.locator('.street-event')).toHaveText(`${calendar.name} · ${dayLabel(calendar.day)}`);
    expect(await street.locator('.street-challenges').evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
    await expect(street.getByText(/^Gold:/)).not.toBeVisible();
  }
  if (width === 390) expect((await new AxeBuilder({ page }).include('.title').analyze()).violations).toEqual([]);
  await page.screenshot({ path: `scratch/entry/fresh-${width}-${info.project.name}.png` });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await first.focus();
  await expect(first).toBeInViewport();
  await page.screenshot({ path: `scratch/entry/large-${width}-${info.project.name}.png` });
  await page.keyboard.press('Enter');
  await expect(page.locator('#guide-step-0')).toBeFocused();
  await expect.poll(async () => (await saves(page)).length).toBe(1);
  const [run] = await saves(page);
  expect(run.config).toEqual(FIRST_SEASON);
  expect(run.rules).toBe(RULES.version);
  expect(run.commands).toEqual([]);
  expect(replay(run.config, run.commands, run.rules).errors).toEqual([]);
});

for (const width of [320, 390, 1280]) test(`saved seasons retain their continue and look-back routes at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const commands: Command[] = [{ type: 'accept', requestId: 'd0-r0' }, { type: 'runDay' }];
  const current = { v: 1, rules: RULES.version, id: 'entry-current', label: 'Main Street, workshop mornings', savedAt: '2026-10-26T12:00:00Z', config: FIRST_SEASON, commands };
  const legacy = { ...current, id: 'entry-legacy', label: 'Earlier rules, same studio', rules: LEGACY_RULES_VERSION, savedAt: '2026-10-25T12:00:00Z', commands: [{ type: 'runDay' }] };
  const finished = { ...current, id: 'entry-finished', label: 'A finished season', savedAt: '2026-10-24T12:00:00Z', commands: Array.from({ length: RULES.days }, (): Command => ({ type: 'runDay' })) };
  await page.goto('/');
  await page.evaluate(runs => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify(runs));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
  }, [current, legacy, finished]);
  await page.reload();
  const resume = page.getByRole('button', { name: 'Continue the season', exact: true });
  await expect(resume).toBeInViewport();
  await expect(page.locator('.first-season')).toContainText(current.label);
  await expect(page.getByRole('button', { name: `Continue ${legacy.label}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Look back at ${finished.label}`, exact: true })).toBeVisible();
  await page.screenshot({ path: `scratch/entry/saved-${width}-${info.project.name}.png` });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.locator('.saved').screenshot({ path: `scratch/entry/seasons-large-${width}-${info.project.name}.png` });
  await resume.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  expect((await saves(page)).find((run: { id: string }) => run.id === current.id).commands).toEqual(commands);
  await page.goBack();
  await page.getByRole('button', { name: `Continue ${legacy.label}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  const older = (await saves(page)).find((run: { id: string }) => run.id === legacy.id);
  expect(older.rules).toBe(LEGACY_RULES_VERSION);
  expect(older.commands).toEqual(legacy.commands);
});

test('street starts keep native random seeds and optional challenges do not start a run', async ({ page }) => {
  await page.goto('/');
  for (const scenario of SCENARIOS) {
    await page.locator('.streets > summary').click();
    const street = page.locator('.street:not(.street-daily)').filter({ has: page.getByRole('heading', { name: scenario.name, exact: true }) });
    await street.locator('.street-challenges > summary').focus();
    await page.keyboard.press('Enter');
    await expect(street.getByText(/^Gold:/)).toBeVisible();
    expect(await saves(page)).toHaveLength(SCENARIOS.indexOf(scenario));
    await street.getByRole('button', { name: `Play ${scenario.name}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
    await expect.poll(async () => (await saves(page)).length).toBe(SCENARIOS.indexOf(scenario) + 1);
    const run = (await saves(page)).find((run: { config: { scenarioId: string } }) => run.config.scenarioId === scenario.id);
    expect(run.config.seed).toMatch(/^\d{1,5}$/);
    expect(run.rules).toBe(RULES.version);
    expect(run.commands).toEqual([]);
    expect(replay(run.config, run.commands, run.rules).errors).toEqual([]);
    await page.goBack();
  }
  const daily = dailyConfig();
  await page.locator('.streets > summary').click();
  await page.locator('.street-daily').getByRole('button', { name: 'Open the studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  await expect.poll(async () => (await saves(page)).length).toBe(SCENARIOS.length + 1);
  const run = (await saves(page)).find((run: { config: { seed: string } }) => run.config.seed === daily.config.seed);
  expect(run.config).toEqual(daily.config);
  expect(run.rules).toBe(RULES.version);
  expect(run.commands).toEqual([]);
});
