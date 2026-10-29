import { reviewWindow, takeAllFitting } from './workspace-helpers';
import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('a change rung in mid-day stops the day; an available keyboard answer lets the day play on', async ({ page }) => {
  // Main Street, panel-1, Bespoke only, taking whoever fits, until someone rings with a change.
  await page.goto('/#play=main-street:panel-1');
  const open = page.getByRole('button', { name: /^Open the shop for Day/ });
  for (let d = 1; d <= 12 && !(await page.locator('.call').count()); d++) {
    await reviewWindow(page);
    const news = page.locator('#pending-news button').first();
    if (await news.count()) await news.click();
    await takeAllFitting(page);
    await open.click();
    await page.locator('.evening, .call').first().waitFor();
  }
  const call = page.getByRole('alertdialog', { name: /^A call at/ });
  await expect(call).toContainText(/\w+ rang with a change/);
  await expect(page.getByText('The day waits for your answer.')).toBeVisible();
  const blocked = call.locator('button:disabled');
  for (let i = 0; i < await blocked.count(); i++) {
    await expect(blocked.nth(i)).toContainText('(unavailable)');
    await expect(call.locator(`#${await blocked.nth(i).getAttribute('aria-describedby')}`)).not.toHaveClass(/is-saved/);
  }
  const answer = call.locator('button:enabled').first();
  await answer.focus();
  await expect(answer).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(call).toHaveCount(0);
  await expect(page.locator('.evening')).toBeVisible();
});
