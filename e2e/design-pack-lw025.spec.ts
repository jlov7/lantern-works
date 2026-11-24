import { expect, test } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({ reducedMotion: 'no-preference', serviceWorkers: 'block' });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`the first-order copy tells the player what the press commits on ${viewport}`, async ({ page }, info) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await page.addInitScript(() => {
      localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated', motion: 'reduce', sound: false }));
    });
    await page.goto('/?opening=first-order');
    const press = (name: string) => page.getByRole('button', { name, exact: true }).press('Enter');
    await press('Meet Clem at the jazz bar');
    await press('Book for 900 cr');
    await expect(page.getByText('3 other buyers are waiting. Run the press to make Clem’s print and leave their orders unanswered today.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ready for the press', exact: true })).toBeFocused();
    await shot(page, 'LW-025', `LW-025-${viewport}-press-idle`);
    await axe(page, '.first-order');
    if (viewport === 'iphone') {
      const frames = await frameDeltas(page, async () => undefined, 1000);
      await info.attach('press-copy-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    }
    await press('Run the press');
    await expect(page.getByText('Lift the sheet to see the ink catch the light.', { exact: true })).toBeVisible();
    await press('Lift Clem’s print');
    await press('Hang it in Clem’s window');
    await expect(page.getByText('Hung at 2:33pm', { exact: true })).toBeVisible();
    await expect(page.getByText('900 cr earned', { exact: true })).toBeVisible();
    await expect(page.getByText('2,980 cr in the till', { exact: true })).toBeVisible();
    await expect(page.locator('.clem-window:visible')).toHaveAttribute('data-backdrop', 'ready');
    await shot(page, 'LW-025', `LW-025-${viewport}-window-end`);
    await axe(page, '.first-order');
  });
}
