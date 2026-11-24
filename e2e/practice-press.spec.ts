import { expect, test, type Page } from '@playwright/test';
import fixture from '../src/engine/fixtures/career-7.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { CAREER_RULES_VERSION, PRESS_CHOICE_RULES_VERSION } from '../src/engine/versions';

const route = fixture.routes.find(item => item.id === 'prosperous')!;
const practice = route.seasons[1]!;
const commands = practice.commands.slice(0, 24) as Command[];
const run = { v: 1, id: 'shared-press', label: 'Shared press', savedAt: '2026-11-21T12:00:00.000Z', rules: PRESS_CHOICE_RULES_VERSION, config: practice.config as RunConfig, commands };

async function open(page: Page, save = run) {
  await page.goto('/');
  await page.evaluate(value => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated' }));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([value]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${save.label}`, exact: true }).click();
}

for (const [winner, other, approach] of [
  ['Clem', 'Mara', 'A Thursday residency'],
  ['Mara', 'Clem', 'The counter and menu set'],
] as const) test(`${winner} can reserve the same practice press slot, leaving ${other} waiting`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('.project-notice').click();
  const options = page.locator('.project-press-choice');
  await expect(options).toContainText('One press booking for Clem or Mara');
  await expect(options.locator('button')).toHaveCount(2);
  await expect(options).toContainText('Clem');
  await expect(options).toContainText('Mara');
  await expect(options).toContainText('1,400 cr');
  await expect(options).toContainText('1,440 cr');
  await expect(options).toContainText('due Day');
  await options.getByRole('button', { name: new RegExp(`See ${winner}’s approaches`) }).click();
  await expect(page.locator('.project-board')).toContainText(`Booking ${winner} closes ${other}’s commission`);
  await page.getByRole('button', { name: new RegExp(approach) }).click();
  await expect(page.locator('.project-board')).toContainText(`${other}’s commission cannot be booked this season`);
  await page.getByRole('region', { name: 'Day controls' }).getByRole('button', { name: 'Review proof & promise', exact: true }).click();
  await expect(page.locator('.project-payment')).toBeVisible();
  await expect(page.locator('.quote-dates')).toBeVisible();
  await page.getByRole('region', { name: 'Day controls' }).getByRole('button', { name: 'Book this proof', exact: true }).click();
  await expect(page.locator('.project-receipt')).toContainText('Booked');
  if (!(await page.locator('.project-roster').evaluate(element => (element as HTMLDetailsElement).open))) await page.locator('.project-roster > summary').click();
  await page.locator('.project-roster .project-row').filter({ hasText: other }).click();
  await expect(page.locator('.project-board')).toContainText(`${winner} booked the shared press. No press booking remains for ${other} this season`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  const replayed = replay(saved.config, saved.commands, saved.rules);
  expect(replayed.errors).toEqual([]);
  expect(replayed.state.contracts.find(contract => contract.project?.id === (winner === 'Clem' ? 'clem-ten' : 'mara-regular'))).toBeDefined();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Shared press', exact: true }).click();
  await page.locator('.project-notice').click();
  await expect(page.locator('.project-board')).toContainText(`${winner} booked the shared press. No press booking remains for ${other} this season`);
});

test('a finished 7.0 opening studio can choose the new press rule for season two', async ({ page }) => {
  const opening = route.seasons[0]!;
  const old = { ...run, id: 'original', label: 'Original studio', rules: CAREER_RULES_VERSION, config: opening.config as RunConfig, commands: opening.commands as Command[] };
  await open(page, old);
  await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new season for your studio' });
  await expect(dialog.getByRole('radio', { name: 'Continue under the original rules' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'One shared press booking for Clem or Mara' }).check();
  await dialog.getByRole('button', { name: 'Open season 2', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Game places' })).toBeVisible();
  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(saves.find((save: typeof run) => save.id === 'original')?.rules).toBe(CAREER_RULES_VERSION);
  expect(saves.find((save: typeof run) => save.id !== 'original')?.rules).toBe(PRESS_CHOICE_RULES_VERSION);
});

test('desktop shows both press options beside the commission roster', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.locator('.project-notice').click();
  const roster = await page.locator('.project-roster').boundingBox();
  const options = await page.locator('.project-press-choice').boundingBox();
  expect(options!.x).toBeGreaterThanOrEqual(roster!.x + roster!.width);
  await expect(page.locator('.project-press-choice button')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test('a proof and the shared press adapt from the narrow outer display to the unfolded display', async ({ page }) => {
  // Safari 27.1 viewport sizes for the Duo outer, inner, and split-window layouts.
  await page.setViewportSize({ width: 382, height: 618 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.setViewportSize({ width: 594, height: 368 });
  const places = page.getByRole('navigation', { name: 'Game places' });
  await places.getByRole('button', { name: 'Work', exact: true }).click();
  await expect(places).toHaveCSS('position', 'fixed');
  await expect(places).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 385, height: 571 });
  await expect(places).toBeInViewport({ ratio: 1 });
  await places.getByRole('button', { name: 'Window', exact: true }).click();
  await page.setViewportSize({ width: 382, height: 618 });

  await page.locator('.project-notice').click();
  const cards = page.locator('.project-press-choice .project-approach');
  const outer = await cards.nth(0).boundingBox();
  const next = await cards.nth(1).boundingBox();
  expect(next!.y).toBeGreaterThan(outer!.y);
  await page.setViewportSize({ width: 669, height: 867 });
  expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThanOrEqual(72);
  await expect.poll(async () => (await cards.nth(1).boundingBox())!.x - (await cards.nth(0).boundingBox())!.x).toBeGreaterThan(200);
  await cards.nth(1).click();
  await page.getByRole('button', { name: /The counter and menu set/ }).click();

  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  const headline = desk.getByRole('textbox');
  await headline.fill('Mara’s Saturday Market');
  const dock = page.getByRole('region', { name: 'Day controls' });
  const review = dock.getByRole('button', { name: 'Review proof & promise', exact: true });
  const original = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));

  const layouts = [[594, 368, 'static', 'visible'], [951, 585, 'fixed', 'visible'], [385, 609, 'fixed', 'visible'],
    [669, 867, 'fixed', 'auto'], [382, 580, 'static', 'visible'], [382, 618, 'fixed', 'visible']] as const;
  for (const [width, height, position, toolsOverflow] of layouts) {
    await page.setViewportSize({ width, height });
    await expect(dock).toHaveCSS('position', position);
    await expect(desk.locator('.proof-desk__tools')).toHaveCSS('overflow-y', toolsOverflow);
    await expect(headline).toHaveValue('Mara’s Saturday Market');
    await expect(review).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(original);
  await review.click();
  await dock.getByRole('button', { name: 'Book this proof', exact: true }).click();
  await expect(page.locator('.project-approved-pieces .designed-artwork__print').first()).toHaveAccessibleName(/Mara’s Saturday Market/);
  expect(errors).toEqual([]);
});
