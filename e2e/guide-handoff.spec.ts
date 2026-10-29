import { expect, test, type Locator, type Page } from '@playwright/test';
import { takeFocused } from './workspace-helpers';

const coach = (page: Page) => page.getByRole('complementary', { name: /^Guide, step/ });
const commands = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0].commands);

async function clearOfBars(target: Locator, page: Page) {
  const box = await target.boundingBox();
  const top = await page.locator('.topbar-wrap').boundingBox();
  const bottom = await page.locator('.actionbar-row').boundingBox();
  expect(box).not.toBeNull();
  expect(top).not.toBeNull();
  expect(bottom).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
  expect(box!.y + box!.height).toBeLessThanOrEqual(bottom!.y);
  expect(await target.evaluate(el => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return hit === el || el.contains(hit);
  })).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await expect(coach(page)).toHaveAccessibleName('Guide, step 1 of 5');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]?.config.seed)).toBe('first-season');
});

test('manual Next reveals the customer lesson and its real first action to keyboard players', async ({ page }, info) => {
  const before = await commands(page);
  await coach(page).getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  const heading = coach(page).getByRole('heading', { name: 'Your first promise' });
  await expect(heading).toBeFocused();
  await clearOfBars(coach(page), page);
  const first = page.getByRole('button', { name: 'Take it', exact: true });
  await clearOfBars(first, page);
  expect(await commands(page)).toEqual(before);
  await page.screenshot({ path: `scratch/guide-control-handoff/customer-${info.project.name}.png` });
  await page.keyboard.press('Tab');
  await expect(coach(page).getByRole('button', { name: 'Skip the guide' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(coach(page)).toHaveAccessibleName('Guide, step 3 of 5');
  expect((await commands(page)).slice(0, -1)).toEqual(before);
  expect((await commands(page)).at(-1).type).toBe('accept');
});

test('manual evening Next and final Done retain focus without making a game move', async ({ page }, info) => {
  await coach(page).getByRole('button', { name: 'Next', exact: true }).click();
  await takeFocused(page, 'Ada');
  await page.getByRole('button', { name: /Open the shop for Day 1/ }).click();
  await expect(coach(page)).toHaveAccessibleName('Guide, step 4 of 5');
  const before = await commands(page);
  await coach(page).getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(coach(page).getByRole('heading', { name: 'Your studio' })).toBeFocused();
  await clearOfBars(coach(page), page);
  expect(await commands(page)).toEqual(before);
  await page.screenshot({ path: `scratch/guide-control-handoff/studio-${info.project.name}.png` });
  await coach(page).getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(coach(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Studio', exact: true })).toBeFocused();
  expect(await commands(page)).toEqual(before);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`the first evening brings its print into view with ${reducedMotion} motion`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion });
  await coach(page).getByRole('button', { name: 'Next', exact: true }).click();
  await takeFocused(page, 'Ada');
  await page.getByRole('button', { name: /Open the shop for Day 1/ }).click();
  if (reducedMotion === 'no-preference') await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(page.getByRole('button', { name: "Review tomorrow's window", exact: true })).toBeEnabled();
  const heading = page.locator('#evening-h');
  await expect(heading).toBeFocused();
  await clearOfBars(heading, page);
  await expect(page.locator('.commission-payoff .campaign-art')).toBeInViewport({ ratio: .95 });
  await page.screenshot({ path: info.outputPath(`first-evening-${reducedMotion}.png`) });
});

for (const step of [0, 1, 2, 3, 4]) {
  test(`skipping guide step ${step + 1} returns to its existing controls`, async ({ page }) => {
    if (step >= 1) await coach(page).getByRole('button', { name: 'Next', exact: true }).click();
    if (step >= 2) await takeFocused(page, 'Ada');
    if (step >= 3) {
      await page.getByRole('button', { name: /Open the shop for Day 1/ }).click();
      await expect(coach(page)).toHaveAccessibleName('Guide, step 4 of 5');
    }
    if (step === 4) await coach(page).getByRole('button', { name: 'Next', exact: true }).click();
    const before = await commands(page);
    await coach(page).getByRole('button', { name: step === 4 ? 'Close the guide' : 'Skip the guide', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(coach(page)).toHaveCount(0);
    const target = step === 0 ? page.locator('[data-customer-heading]')
      : step === 1 ? page.locator('[data-customer-heading]')
      : step === 2 ? page.getByRole('button', { name: /Open the shop for Day 1/ })
      : step === 3 ? page.locator('#evening-h')
      : page.getByRole('tab', { name: 'Studio', exact: true });
    await expect(target).toBeFocused();
    if (step !== 2) await clearOfBars(target, page);
    expect(await commands(page)).toEqual(before);
  });
}
