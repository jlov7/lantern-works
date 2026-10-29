import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { encodeShare } from '../src/ui/persist';
import { FIRST_SEASON } from '../src/ui/screens/firstSeason';

test.describe('the illustration follows the usable entry', () => {
  test.use({ serviceWorkers: 'block' });

  for (const width of [320, 390, 1280]) test(`the deferred illustration retains its frame and focus at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    if (width === 1280) await page.emulateMedia({ reducedMotion: 'no-preference' });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/assets/TitleScene-*.js', async route => { await gate; await route.continue(); });
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const first = page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true });
      await expect(first).toBeInViewport();
      await expect(page.locator('.title-illustration-placeholder')).toBeVisible();
      if (width === 320) {
        await page.evaluate(() => document.documentElement.style.fontSize = '200%');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await first.focus();
      const frame = await page.locator('.title-miniature').boundingBox();
      const choice = await first.boundingBox();
      await page.screenshot({ path: `scratch/initial-load/placeholder-${width}-${info.project.name}.png` });
      release();
      await expect(page.locator('.title-scene__proof > svg')).toBeVisible();
      await expect(page.locator('.title-scene__proof > svg')).toHaveAttribute('data-layout', 'gallery');
      const ready = await page.locator('.title-miniature').boundingBox();
      const readyChoice = await first.boundingBox();
      expect(Math.abs(ready!.height - frame!.height)).toBeLessThan(1);
      expect(Math.abs(readyChoice!.y - choice!.y)).toBeLessThan(1);
      await expect(first).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `scratch/initial-load/ready-${width}-${info.project.name}.png` });
    } finally { release(); }
  });

  test('a failed optional illustration leaves the native guided start usable', async ({ page }) => {
    await page.route('**/assets/TitleScene-*.js', route => route.abort());
    await page.goto('/');
    await expect(page.locator('.title-illustration-placeholder')).toBeVisible();
    await page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true }).click();
    await expect(page.locator('#guide-step-0')).toBeFocused();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]').length)).toBe(1);
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
    expect(run.config).toEqual(FIRST_SEASON);
    expect(run.rules).toBe(RULES.version);
    expect(run.commands).toEqual([]);
  });

  for (const rules of [RULES.version, LEGACY_RULES_VERSION]) test(`a cold replay link preserves ${rules} without waiting for the title illustration`, async ({ page }) => {
    await page.route('**/assets/TitleScene-*.js', route => route.abort());
    const commands: Command[] = [{ type: 'accept', requestId: 'd0-r0' }, { type: 'runDay' }];
    expect(replay(FIRST_SEASON, commands, rules).errors).toEqual([]);
    const encoded = await encodeShare(FIRST_SEASON, commands, 'Cold replay', rules);
    await page.goto(`/#s=${encoded}`);
    await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'))).toEqual([]);
  });
});
