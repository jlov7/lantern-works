import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { selectCustomer, takeFocused } from './workspace-helpers';

test.use({ serviceWorkers: 'block' });

function assertAxe(page: Page) {
  return new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    .then(result => expect(result.violations).toEqual([]));
}

async function playEvening(page: Page, buyers: string[], expectedCount: number, hireTemp = true) {
  await page.getByRole('link', { name: 'Play the morning', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Festival Week, Day 11/ })).toBeVisible();
  const saveCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]').length);
  expect(await saveCount()).toBe(expectedCount);
  await page.getByRole('button', { name: 'Save a copy and continue', exact: true }).click();
  await expect.poll(saveCount).toBe(expectedCount + 1);
  if (hireTemp) {
    await page.locator('.decision-levers > summary').click();
    await page.locator('.decision-levers').getByRole('button', { name: /temp/i }).click();
  }
  for (const buyer of buyers) {
    const ticket = await selectCustomer(page, buyer);
    await takeFocused(page);
    const confirm = ticket.getByRole('button', { name: /^Yes, take .* anyway$/ });
    if (await confirm.isVisible()) await confirm.click();
  }
  await page.getByRole('button', { name: /^Open (the shop for )?Day 11/ }).click();
  const skip = page.getByRole('button', { name: 'Skip to evening' });
  const review = page.getByRole('button', { name: "Review tomorrow's window" });
  await expect(skip.or(review).first()).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(review).toBeVisible();

  await page.getByRole('button', { name: 'Lantern Works: back to the street map' }).click();
  await page.getByRole('link', { name: 'Decision practice', exact: true }).click();
}

test('compare player-made endings at all three difficulties from the same Festival Week morning', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set in this case');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ sound: false, motion: 'reduce' }));
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Decision practice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What will you protect?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wren and Bea' })).toBeVisible();
  await expect(page.getByText('Both bookings fit in the forecast.')).toHaveCount(2);
  await assertAxe(page);

  await page.getByLabel('Difficulty').selectOption('standard');
  await page.getByLabel('Studio principle').selectOption('cash');
  await page.getByRole('button', { name: 'Show challenge' }).click();
  await expect(page.getByRole('heading', { name: /Would you pay for that change/ })).toBeVisible();
  await expect(page.getByText(/Keep the current crew/)).toBeVisible();

  await page.getByLabel('Difficulty').selectOption('hard');
  await page.getByLabel('Studio principle').selectOption('promises');
  await page.getByRole('checkbox', { name: 'Show forecast hints' }).uncheck();
  await page.getByRole('button', { name: 'Show challenge' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Lorna and Wren' })).toBeVisible();
  await expect(page.getByText(/^Forecast risk:/)).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await assertAxe(page);
  await page.screenshot({ path: 'test-results/decision-practice/festival-hard.png', fullPage: true });
  const compare = page.getByRole('button', { name: 'Check saved evenings', exact: true });
  await compare.click();
  await expect(page.getByText('0 of 2 finished plans found.')).toBeVisible();

  await playEvening(page, ['d10-r2', 'd10-r4'], 0);
  await expect(page.getByLabel('Difficulty')).toHaveValue('hard');
  await expect(page.getByRole('checkbox', { name: 'Show forecast hints' })).not.toBeChecked();
  await compare.click();
  await expect(page.getByText('1 of 2 finished plans found.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await playEvening(page, ['d10-r2', 'd10-r0'], 1);
  await compare.click();
  const table = page.getByRole('table', { name: 'Recorded evenings' });
  await expect(table.getByRole('row', { name: /Cash in the till 12,807 cr 13,367 cr/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Earned today 3,615 cr 3,275 cr/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Held for work still owed 2,700 cr 3,600 cr/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Deliveries today 7 6/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Missed today 0 0/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Neighbours lost today None Bea/ })).toBeVisible();
  await assertAxe(page);
  await page.screenshot({ path: 'test-results/decision-practice/festival-recorded-evenings.png', fullPage: true });

  await page.getByLabel('Difficulty').selectOption('standard');
  await page.getByLabel('Studio principle').selectOption('cash');
  await page.getByRole('button', { name: 'Show challenge' }).click();
  await compare.click();
  await expect(page.getByText('1 of 2 finished plans found.')).toBeVisible();
  await playEvening(page, ['d10-r4', 'd10-r5'], 2, false);
  await compare.click();
  await expect(table.getByRole('row', { name: /Cash in the till 12,597 cr 12,807 cr/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Deliveries today 6 7/ })).toBeVisible();

  await page.getByLabel('Difficulty').selectOption('guided');
  await page.getByLabel('Studio principle').selectOption('relationships');
  await page.getByRole('button', { name: 'Show challenge' }).click();
  await compare.click();
  await expect(page.getByText('1 of 2 finished plans found.')).toBeVisible();
  await playEvening(page, ['d10-r0', 'd10-r4'], 3);
  await compare.click();
  await expect(table.getByRole('row', { name: /Cash in the till 12,807 cr 12,807 cr/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Deliveries today 7 7/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Neighbours lost today Lorna None/ })).toBeVisible();
  const played = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  expect(played).not.toBeNull();
  await writeFile('test-results/decision-practice/played-branches.json', played!, 'utf8');
});

test('the rehearsal links stay on this origin from a double-slash path', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the links are identical across viewports');
  const origin = new URL(baseURL!).origin;
  await page.goto(`${origin}//studio?practice=decision`);
  const play = page.getByRole('link', { name: 'Play the morning', exact: true });
  const home = page.getByRole('link', { name: 'Back to Lantern Works', exact: true });
  await expect(play).toBeVisible();
  const destination = new URL((await play.getAttribute('href'))!, page.url());
  expect(destination.origin).toBe(origin);
  expect(destination.hash).toMatch(/^#s=/);
  expect(new URL((await home.getAttribute('href'))!, page.url()).origin).toBe(origin);
});
