import { expect, test } from '@playwright/test';
import savedDay from '../test-fixtures/replays/absent-gathering-save.json' with { type: 'json' };
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin'
    ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : undefined,
});

test('a worker settles into their idle pose and the studio stops drawing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set per case');
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.addInitScript(save => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'miniature', motion: 'full', sound: false }));
  }, { ...savedDay, id: 'figure-settling', label: 'Figure settling', commands: savedDay.commands.slice(0, 14) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue Figure settling', exact: true }).click();
  const places = page.getByRole('navigation', { name: 'Game places' });
  await places.getByRole('button', { name: 'Work', exact: true }).click();
  const room = page.locator('.work-place .miniature-world[data-rendered="true"][data-fallback="false"]');
  await room.waitFor({ timeout: 20_000 });
  await room.getByRole('button', { name: 'The studio', exact: true }).press('Enter');
  const openDay = page.getByRole('button', { name: /^Open .*Day 2/ });
  await expect(openDay).toBeEnabled();
  await openDay.press('Enter');
  // The recorded lesson opens the playback clock already paused.
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

  const clock = page.locator('.playbar .clock');
  const nextHour = page.getByRole('button', { name: 'Next hour', exact: true });
  for (let hour = 0; hour < 4; hour++) await nextHour.press('Enter');
  await expect(clock).toHaveText('1:00pm');
  await expect(room).toHaveAttribute('aria-label', /Noor briefing/);
  await room.locator('.miniature-world__stage').scrollIntoViewIfNeeded();
  const rendered = async () => Number(JSON.parse(await room.getAttribute('data-renderer-metrics') ?? '{}').frames);
  await page.waitForTimeout(800);
  const before = await rendered();
  await nextHour.press('Enter');
  await expect(clock).toHaveText('2:00pm');
  await expect(room).toHaveAttribute('aria-label', /Noor free/);
  await expect.poll(rendered).toBeGreaterThan(before + 1);
  await page.waitForTimeout(800);
  const settled = await rendered();
  const trace = await frameDeltas(page, async () => {}, 1000);
  expect(await rendered()).toBe(settled);
  await info.attach('figure-idle-frames', { body: JSON.stringify(trace), contentType: 'application/json' });
  assertFrameBudget(trace);
  expect(Math.max(...trace.deltas)).toBeLessThanOrEqual(33);
  await axe(page, '.work-place .miniature-world');
  await shot(page, 'LW-018', 'LW-018-iphone-noor-idle-settled');
});
