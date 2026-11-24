import { expect, type Locator, type Page } from '@playwright/test';
import type { WorldTarget } from '../src/ui/game/worldProjection';

export const meet = (page: Page) => page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
export const room = (page: Page) => page.getByRole('radio', { name: /^The room/ });
export const band = (page: Page) => page.getByRole('radio', { name: /^The musicians/ });
export const heading = (page: Page) => page.getByRole('heading', { name: 'The late set', exact: true });

export async function visit(page: Page, view: 'miniature' | 'illustrated', motion: 'full' | 'reduce' = 'full') {
  await page.addInitScript(({ view, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: view, motion, sound: false }));
  }, { view, motion });
  await page.goto('/?opening=first-order');
  return page.locator('.first-order-world');
}

export async function design(page: Page, world: Locator) {
  await meet(page).press('Enter');
  await expect(heading(page)).toBeFocused();
  await expect(world).toHaveAttribute('data-world-shot', 'choose');
  await expect(world).toHaveAttribute('data-world-phase', 'idle');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
}

export async function hitAreas(world: Locator) {
  const stage = world.locator('.first-order-world__stage');
  const bounds = (await stage.boundingBox())!;
  const targets = JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[];
  expect(targets.map(target => target.id)).toEqual(['bay:room', 'bay:band']);
  const centre = (target: WorldTarget, x = .5, y = .5) => ({
    x: bounds.x + target.x + x * target.w,
    y: bounds.y + target.y + y * target.h,
  });
  return { stage, bounds, room: targets[0]!, band: targets[1]!, centre };
}
