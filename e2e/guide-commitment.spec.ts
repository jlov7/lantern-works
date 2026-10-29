import { expect, test, type Page } from '@playwright/test';
import { goPlace, takeFocused } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

const coach = (page: Page) => page.getByRole('complementary', { name: /^Guide, step/ });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0] as { config: { scenarioId: string; seed: string }; commands: Command[] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await expect(coach(page)).toHaveAccessibleName('Guide, step 1 of 5');
});

test('the guide starts with a creative choice and keeps offer editing available before the first sale', async ({ page }, info) => {
  await expect(page.locator('.workspace-queue > .coach')).toContainText('Someone at your door');
  await expect(coach(page)).toContainText('give it a direction of your own');
  const initial = await saved(page);
  await page.locator('.first-proof').getByRole('button', { name: 'Put the musicians first', exact: true }).click();
  expect((await saved(page)).commands).toEqual(initial.commands);
  await coach(page).scrollIntoViewIfNeeded();
  const next = coach(page).getByRole('button', { name: 'Next' });
  await expect(next).toBeInViewport();
  expect(await next.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === el || el.contains(hit);
  })).toBe(true);
  await page.screenshot({ path: `scratch/guide-commitment-${info.project.name}.png` });
  await goPlace(page, 'Studio');
  await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeEnabled();
  await page.getByRole('button', { name: 'Redesign Bespoke Launch' }).click();
  const workshop = page.getByRole('dialog', { name: 'Offer workshop' });
  await workshop.getByLabel('Price for the whole offer').fill('890');
  await workshop.getByRole('button', { name: 'Put on the window' }).click();
  const edited = await saved(page);
  expect(edited.commands).toHaveLength(initial.commands.length + 1);
  expect(edited.commands.at(-1)?.type).toBe('setMenu');
  await goPlace(page, 'Window');
  await coach(page).getByRole('button', { name: 'Next' }).click();
  await expect(coach(page)).toHaveAccessibleName('Guide, step 2 of 5');
  await expect(coach(page)).toContainText('Your first promise');
  await expect(coach(page)).toContainText('The price, work and deadline are above the piece.');
  expect((await saved(page)).commands).toEqual(edited.commands);
  await takeFocused(page, 'Ada');
  await expect(coach(page)).toHaveAccessibleName('Guide, step 3 of 5');
  await expect(coach(page)).toContainText('Open the shop');
  const accepted = await saved(page);
  expect(accepted.commands.at(-1)?.type).toBe('accept');
  const native = replay(accepted.config, accepted.commands);
  expect(native.errors).toEqual([]);
  expect(native.state.requests.some(r => r.status === 'accepted')).toBe(true);
  await goPlace(page, 'Studio');
  await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeDisabled();
});

for (const answer of ['accept', 'decline'] as const) {
  test(`an immediate ${answer} skips the unavailable window step and Undo restores editing`, async ({ page }) => {
    const initial = await saved(page);
    await goPlace(page, 'Window');
    if (answer === 'accept') await takeFocused(page, 'Ada');
    else await page.locator('.ticket-waiting').getByRole('button', { name: 'Decline this request', exact: true }).first().click();
    await expect(coach(page)).toHaveAccessibleName('Guide, step 3 of 5');
    await goPlace(page, 'Studio');
    await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeDisabled();
    const answered = await saved(page);
    expect(answered.commands.at(-1)?.type).toBe(answer);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(coach(page)).toHaveAccessibleName('Guide, step 2 of 5');
    await goPlace(page, 'Studio');
    await expect(page.getByRole('button', { name: 'Redesign Bespoke Launch' })).toBeEnabled();
    expect((await saved(page)).commands).toEqual(initial.commands);
    expect(replay(answered.config, answered.commands).errors).toEqual([]);
  });
}

test('replaying the guide after a sale skips the locked window without adding a command', async ({ page }) => {
  await goPlace(page, 'Window');
  await takeFocused(page, 'Ada');
  const accepted = await saved(page);
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show the tutorial again' }).click();
  await expect(coach(page)).toHaveAccessibleName('Guide, step 3 of 5');
  await expect(coach(page)).toContainText('Open the shop');
  expect((await saved(page)).commands).toEqual(accepted.commands);
});
