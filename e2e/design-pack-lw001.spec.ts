import { expect, test } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test('first-order street and design fit the viewport without disabling zoom', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');

  for (const viewport of ['iphone', 'ipad', 'desktop', 'duo-outer'] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await page.goto('/?opening=first-order');
      const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(meta).toContain('viewport-fit=cover');
      expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/i);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1c342b');
      await expect(page.locator('.first-order')).toHaveCSS('padding-top', '0px');

      const meet = page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
      await expect(meet).toBeInViewport({ ratio: 1 });
      await page.locator('.first-order-street img').evaluate((image: HTMLImageElement) => image.decode());

      for (const state of ['street', 'design'] as const) {
        if (state === 'design') {
          await page.keyboard.press('Tab');
          await expect(page.getByRole('link', { name: 'Lantern Works', exact: true })).toBeFocused();
          await page.keyboard.press('Tab');
          await expect(page.getByLabel('Sound', { exact: true })).toBeFocused();
          await page.keyboard.press('Tab');
          await expect(meet).toBeFocused();
          await expect(meet).toHaveCSS('outline-width', '2px');
          await page.keyboard.press('Enter');
          await expect(page.getByRole('heading', { name: 'The late set' })).toBeFocused();
          await expect(page.getByRole('button', { name: 'Book for 900 cr', exact: true })).toBeInViewport({ ratio: 1 });
        }

        await shot(page, 'LW-001', `LW-001-${viewport}-${state}`);
        const frames = await frameDeltas(page, async () => {}, 1000);
        await testInfo.attach(`${viewport}-${state}-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
        assertFrameBudget(frames);
        expect(Math.max(...frames.deltas), `${viewport} ${state} maximum frame delta (ms)`).toBeLessThanOrEqual(33);
        await axe(page, '.first-order');
      }

      await page.evaluate(() => sessionStorage.removeItem('lantern.first-order.v1'));
    });
  }
});
