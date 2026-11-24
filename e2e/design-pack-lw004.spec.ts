import { expect, test, type Page } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { goPlace } from './workspace-helpers';

const labels = '.first-kicker, .street-kicker, .title-scene__note span, .news-kicker, .stamp, .coach-step, '
  + '.portfolio-eyebrow, .payoff-eyebrow, .neighbourhood-detail-label, .neighbourhood-scene-label span';

async function checkLabels(page: Page) {
  const trackedCaps = await page.locator(labels).evaluateAll(elements => elements.filter(element => {
    const style = getComputedStyle(element);
    return style.textTransform !== 'none' || style.letterSpacing !== 'normal';
  }).map(element => element.textContent));
  expect(trackedCaps).toEqual([]);
}

test('title and the next morning keep sentence case and clear actions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');

  for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
      await expect(page.locator('.title-scene__note span')).toHaveCSS('font-size', '12px');

      for (const state of ['title', 'day2'] as const) {
        if (state === 'day2') {
          await page.goto('/?opening=first-order');
          for (const name of ['Meet Clem at the jazz bar', 'Book for 900 cr', 'Run the press', 'Lift Clem’s print', 'Hang it in Clem’s window', 'Open the next morning']) {
            await page.getByRole('button', { name, exact: true }).press('Enter');
          }
          await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
          await expect(page.locator('main.stage')).toBeVisible();
          const meet = page.locator('main.stage').getByRole('button', { name: /^Meet / });
          await expect(meet).toHaveText(/^Meet [^↗]+$/);
        }

        await checkLabels(page);
        await shot(page, 'LW-004', `LW-004-${viewport}-${state}`);
        const frames = await frameDeltas(page, async () => {}, 1000);
        await testInfo.attach(`${viewport}-${state}-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
        assertFrameBudget(frames);
        expect(Math.max(...frames.deltas), `${viewport} ${state} maximum frame delta (ms)`).toBeLessThanOrEqual(33);
        await axe(page, 'main');
      }

      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    });
  }
});

test.describe('fill transitions', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('capacity and race fills transition by transform and settle immediately with reduced motion', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');
    await page.addInitScript(() => localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season'])));
    await page.goto('/#play=main-street:e2e-1');
    await goPlace(page, 'Studio');
    await page.getByRole('tab', { name: 'AI desk', exact: true }).click();
    const gauge = page.locator('.gauge-fill');
    await expect(gauge).toHaveCSS('transition-property', 'transform');
    await expect(gauge).toHaveCSS('transition-duration', '0.22s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(gauge).toHaveCSS('transition-property', 'none');
    await expect(gauge).toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');

    await goPlace(page, 'Window');
    await page.getByRole('button', { name: /^Open the shop for Day 1/ }).click();
    await page.getByText('The day in full: the money, the street race, the log', { exact: true }).click();
    const bars = page.locator('.race-bar');
    await expect(bars).toHaveCount(5);
    await expect(bars.first()).toHaveCSS('transition-property', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(bars.first()).toHaveCSS('transition-property', 'transform');
    await expect(bars.first()).toHaveCSS('transition-duration', '0.42s');
  });
});
