import { expect, test } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test('the install metadata and first-order street are available at each review viewport', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ name: 'Lantern Works', short_name: 'Lantern Works', display: 'standalone' });
  const icon = await request.get('/apple-touch-icon.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toBe('image/png');

  for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await page.goto('/?opening=first-order');
      // The compiled app uses a relative base so these links also work when installed from a subpath.
      const manifestLink = page.locator('link[rel="manifest"]');
      expect(await manifestLink.evaluate((link: HTMLLinkElement) => new URL(link.href).pathname)).toBe('/manifest.webmanifest');
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Lantern Works');

      const meet = page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
      await expect(meet).toBeVisible();
      await page.locator('.first-order-street img').evaluate((image: HTMLImageElement) => image.decode());
      await shot(page, 'LW-002', `LW-002-${viewport}-street`);

      const frames = await frameDeltas(page, async () => {}, 1000);
      await testInfo.attach(`${viewport}-street-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas), `${viewport} street maximum frame delta (ms)`).toBeLessThanOrEqual(33);
      await axe(page, '.first-order');

      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Lantern Works', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Sound', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(meet).toBeFocused();
      await expect(meet).toHaveCSS('outline-width', '2px');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'The late set' })).toBeFocused();
      await page.evaluate(() => sessionStorage.removeItem('lantern.first-order.v1'));
    });
  }
});
