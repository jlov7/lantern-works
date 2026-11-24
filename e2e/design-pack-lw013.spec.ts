import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({ reducedMotion: 'no-preference', serviceWorkers: 'block' });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop'] as const) {
  test(`the edition choice shows print time and the delivery shows its real clock on ${viewport}`, async ({ page }, info) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await page.addInitScript((motion) => {
      localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated', sound: false, motion }));
    }, viewport === 'duo-outer' ? 'reduce' : 'full');
    await page.goto('/?opening=first-order');
    await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
    const heading = page.getByRole('heading', { name: 'The late set', exact: true });
    await expect(heading).toBeFocused();
    const group = page.locator('.first-order-editions');
    await expect(group.getByText('Ada, 198 min to print')).toBeVisible();
    await expect(group.getByText('Tomas, 153 min to print')).toBeVisible();
    const scales = await group.locator('.first-order-time').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node, '::before');
      return { ratio: new DOMMatrix(style.transform).a, height: style.height };
    }));
    expect(scales).toHaveLength(2);
    for (const [index, minutes] of [198, 153].entries()) {
      expect(scales[index]!.height).toBe('4px');
      expect(scales[index]!.ratio).toBeCloseTo(minutes / RULES.minutesPerDay, 2);
    }
    const book = page.getByRole('button', { name: 'Book for 900 cr', exact: true });
    await expect(book).toBeInViewport({ ratio: 1 });
    await expect(page.getByText(/^Hung at/)).toHaveCount(0);
    await shot(page, 'LW-013', `LW-013-${viewport}-design`);
    await axe(page, '.first-order');

    await page.keyboard.press('Tab');
    await expect(group.getByRole('radio', { name: /^The room/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: /^The musicians/ })).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(group.getByRole('radio', { name: /^The room/ })).toBeChecked();

    await book.press('Enter');
    await page.getByRole('button', { name: 'Run the press', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Lift Clem’s print', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Hang it in Clem’s window', exact: true }).press('Enter');
    await expect(page.getByText('Hung at 2:33pm', { exact: true })).toBeVisible();
    await expect(page.getByText('900 cr earned', { exact: true })).toBeVisible();
    await expect(page.getByText('2,980 cr in the till', { exact: true })).toBeVisible();
    const world = page.locator('.first-order-world');
    await expect(world.locator('.clem-window')).toHaveAttribute('data-backdrop', 'ready');
    await expect(world.locator('.clem-window-print')).toHaveCSS('opacity', '1');
    if (viewport === 'iphone') {
      const frames = await frameDeltas(page, async () => undefined, 1000);
      await info.attach('last-light-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    }
    await shot(page, 'LW-013', `LW-013-${viewport}-window-end`);
    await axe(page, '.first-order');
  });
}
