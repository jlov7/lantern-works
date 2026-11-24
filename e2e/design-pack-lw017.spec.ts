import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Command, RunConfig } from '../src/engine/types';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { goPlace } from './workspace-helpers';

const tape = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as
  { rules: string; config: RunConfig; commands: Command[] };
const opening = tape.commands.flatMap((move, index) => move.type === 'runDay' ? [index] : [])[2]!;
const save = { ...tape, commands: tape.commands.slice(0, opening), v: 1, id: 'camera-review', label: 'Camera review',
  savedAt: '2026-10-27T04:00:00Z' };

test.use({
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});

async function work(page: Page) {
  await page.addInitScript(saved => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([saved]));
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'miniature', motion: 'reduce', sound: false }));
  }, save);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue Camera review', exact: true }).click();
  await goPlace(page, 'Work');
  const room = page.locator('.work-place .miniature-world');
  await expect(room).toHaveAttribute('data-rendered', 'true', { timeout: 20000 });
  await expect(room).toHaveAttribute('data-fallback', 'false');
  return room;
}

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`camera controls sit within the scene on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per case');
    await page.setViewportSize(VIEWPORTS[viewport]);
    const room = await work(page);
    const bar = room.locator('.miniature-world__scene').getByRole('navigation', { name: 'Studio camera', exact: true });
    const bench = bar.getByRole('button', { name: 'On the bench', exact: true });
    const overview = bar.getByRole('button', { name: 'The studio', exact: true });
    const fallback = room.getByRole('button', { name: 'Use illustrated studio', exact: true });
    const size = (await bar.boundingBox())!;
    expect(size.height).toBeLessThanOrEqual(48);
    expect((await bench.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(fallback).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Use illustrated studio', exact: true })).toHaveCount(0);

    await bench.press('Enter');
    await expect(bench).toBeFocused();
    await expect(bench).toHaveAttribute('aria-pressed', 'true');
    const styles = await bench.evaluate(button => {
      const css = getComputedStyle(button);
      const luminance = (color: string) => color.match(/\d+/g)!.map(Number).map(value => {
        const ratio = value / 255;
        return ratio <= .04045 ? ratio / 12.92 : ((ratio + .055) / 1.055) ** 2.4;
      }).reduce((result, value, i) => result + value * [.2126, .7152, .0722][i]!, 0);
      return { contrast: (luminance(css.color) + .05) / (luminance(css.backgroundColor) + .05),
        outline: css.outlineWidth, offset: css.outlineOffset };
    });
    expect(styles.contrast).toBeGreaterThanOrEqual(4.5);
    expect(styles.outline).toBe('2px');
    expect(styles.offset).toBe('2px');
    await axe(page, '.work-place .miniature-world');
    await shot(page, 'LW-017', `LW-017-${viewport}-studio-work`);

    const where = (await bench.boundingBox())!;
    await page.mouse.move(where.x + 12, where.y + 20);
    await page.mouse.down();
    await page.mouse.move(where.x + 32, where.y + 20, { steps: 3 });
    await page.mouse.up();
    await expect(room).toHaveAttribute('data-camera-pan', '0');

    await overview.press('Enter');
    await expect(overview).toBeFocused();
    await expect(room).toHaveAttribute('data-view', 'studio');
    const frames = await frameDeltas(page, async () => {}, 1000);
    assertFrameBudget(frames);
    expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    await axe(page, '.work-place .miniature-world');
    await shot(page, 'LW-017', `LW-017-${viewport}-studio-overview`);
    await info.attach('camera-layout', { body: JSON.stringify({ height: size.height, ...styles, frames }), contentType: 'application/json' });
  });
}

test('the short phone keeps the camera above the bench and offers both renderer choices', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per case');
  await page.setViewportSize(VIEWPORTS['duo-outer']);
  const room = await work(page);
  const stage = room.locator('.miniature-world__stage');
  const bar = room.locator('.miniature-world__scene').getByRole('navigation', { name: 'Studio camera', exact: true });
  await bar.getByRole('button', { name: 'On the bench', exact: true }).press('Enter');
  const barBox = (await bar.boundingBox())!;
  const stageBox = (await stage.boundingBox())!;
  expect(barBox.y - stageBox.y).toBeCloseTo(64, 0);
  await shot(page, 'LW-017', 'LW-017-duo-outer-studio-work');

  await room.getByRole('button', { name: 'Use illustrated studio', exact: true }).press('Enter');
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  await axe(page, '.work-place .lw-world');

  const more = page.locator('.topbar-more summary');
  if (await more.isVisible() && !(await more.evaluate(summary => (summary.parentElement as HTMLDetailsElement).open))) await more.click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('radio', { name: 'Illustrated studio', exact: true })).toBeChecked();
  await settings.getByRole('radio', { name: 'Miniature room', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(room).toHaveAttribute('data-renderer-choice', 'miniature');
  await expect(room.locator('canvas')).toBeVisible();
});
