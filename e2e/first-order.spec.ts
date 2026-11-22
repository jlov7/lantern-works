import { expect, test } from '@playwright/test';

test('the first-order opening keeps the approved print through comparison and the following morning', async ({ page }) => {
  await page.setViewportSize({ width: 382, height: 580 });
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar' }).click();
  await expect(page.getByRole('heading', { name: 'The late set' })).toBeFocused();
  await expect(page.getByRole('radio', { name: /The musicians/ })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Book for 900 cr' })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Poppy & cream' }).click();
  await page.getByText('Add a headline', { exact: true }).click();
  await page.getByRole('textbox', { name: 'A line of your own' }).fill('An hour of brass');
  await page.getByRole('button', { name: 'Book for 900 cr' }).click();
  await page.reload();
  await expect(page.getByText(/3 other buyers are waiting/)).toBeVisible();
  await page.getByRole('button', { name: 'Run the press' }).click();
  await page.getByRole('button', { name: 'Lift Clem’s print' }).click();
  await expect(page.locator('.print-lift')).toHaveAttribute('data-lifted', 'true');
  await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
  const poster = page.locator('.clem-window-print svg.designed-artwork__print');
  await expect(poster).toHaveAccessibleName(/An hour of brass/);
  await expect(poster).toHaveAttribute('data-layout', 'gallery');
  await page.getByRole('button', { name: 'Compare the other edition' }).click();
  await expect(page.getByRole('heading', { name: 'One morning, two editions' })).toBeFocused();
  await expect(page.getByText('Delivered 333 minutes into the day')).toBeVisible();
  await expect(page.getByText('Delivered 288 minutes into the day')).toBeVisible();
  await expect(page.getByText('Finn, Sam, and Yara left without booking either way.')).toBeVisible();
  await page.getByRole('button', { name: 'Hang the other edition' }).click();
  await expect(poster).toHaveAttribute('data-layout', 'headline');
  await expect(poster).toHaveAccessibleName(/An hour of brass/);
  await page.getByRole('button', { name: 'Open the next morning' }).click();
  await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
  await expect(page).toHaveURL(url => !url.searchParams.has('opening'));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]?.commands)).toMatchObject([
    { type: 'accept', maker: 'h2', intention: 'clem-band', design: { pieces: [{ headline: 'An hour of brass', palette: 'poppy' }] } },
    { type: 'runDay' },
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Continue the season' }).click();
  await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
  await page.goto('/?opening=first-order');
  await expect(page.getByRole('button', { name: 'Meet Clem at the jazz bar' })).toBeVisible();
});

test('booking then continuing at the counter keeps day one open', async ({ page }) => {
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar' }).click();
  await page.getByRole('radio', { name: /The musicians/ }).check();
  await page.getByRole('button', { name: 'Book for 900 cr' }).click();
  await page.getByRole('button', { name: 'Plan the rest of the morning' }).click();
  await expect(page).toHaveTitle('Day 1 of 12, Main Street - Lantern Works');
  await expect(page.getByRole('button', { name: /^Open the shop for Day 1/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]?.commands)).toMatchObject([
    { type: 'accept', intention: 'clem-band' },
  ]);
});
