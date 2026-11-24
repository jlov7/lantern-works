import { expect, test } from '@playwright/test';
import { assertFrameBudget, frameDeltas, VIEWPORTS } from './design-pack-helpers';
import { design, hitAreas, room, visit } from './design-pack-lw009-helpers';

// Measure the phone's native touch path. Mouse and keyboard behavior are
// covered by the window-choice spec.
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  ...(process.platform === 'darwin' ? {
    headless: false,
    channel: 'chromium',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] },
  } : {}),
});

test('the camera and two selections stay in budget', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await visit(page, 'miniature');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  const frames = await frameDeltas(page, async () => {
    await design(page, world);
    const area = await hitAreas(world);
    for (const [id, target] of [['band', area.band], ['room', area.room]] as const) {
      const point = area.centre(target);
      await page.touchscreen.tap(point.x, point.y);
      await expect(world).toHaveAttribute('data-world-selected', id);
    }
  }, 2500);
  await info.attach('bay-frame-timing', { body: JSON.stringify(frames), contentType: 'application/json' });
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
  await expect(room(page)).toBeChecked();
});
