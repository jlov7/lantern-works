import { expect, type Page } from '@playwright/test';

export async function openDayTwo(page: Page, edition: 'room' | 'band' = 'band') {
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar' }).click();
  await page.getByRole('button', { name: 'Poppy & cream' }).click();
  await page.getByText('Add a headline', { exact: true }).click();
  await page.getByRole('textbox', { name: 'A line of your own' }).fill('An hour of brass');
  await page.getByRole('button', { name: 'Book for 900 cr' }).click();
  await page.getByRole('button', { name: 'Run the press' }).click();
  await page.getByRole('button', { name: 'Lift Clem’s print' }).click();
  await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
  await page.getByRole('button', { name: 'Compare the other edition' }).click();
  await page.getByRole('button', { name: edition === 'band' ? 'Hang the other edition' : 'Keep this edition' }).click();
  await page.getByRole('button', { name: 'Open the next morning' }).click();
  await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo({ top: 0, behavior: 'instant' });
  });
}
