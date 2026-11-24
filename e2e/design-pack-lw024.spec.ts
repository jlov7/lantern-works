import { expect, test, type Locator, type Page } from '@playwright/test';
import type { WorldTarget } from '../src/ui/game/worldProjection';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({
  hasTouch: true, serviceWorkers: 'block', reducedMotion: 'no-preference',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

type HapticWindow = Window & { pulses?: number[] };
const pulses = (page: Page) => page.evaluate(() => (window as HapticWindow).pulses ?? []);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function setup(page: Page, miniature: boolean, mechanism: 'vibrate' | 'switch' | 'none' = 'vibrate', motion: 'reduce' | 'full' = 'reduce') {
  await page.addInitScript(({ miniature, mechanism, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: miniature ? 'miniature' : 'illustrated', motion, sound: false }));
    const host = window as HapticWindow;
    host.pulses = [];
    Object.defineProperty(navigator, 'vibrate', { value: mechanism === 'vibrate' ? (ms: number) => { host.pulses?.push(ms); return true; } : undefined });
    if (mechanism === 'switch') Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false });
  }, { miniature, mechanism, motion });
  await page.goto('/?opening=first-order');
  return page.locator('.first-order-world');
}

async function targetPoint(world: Locator, id: WorldTarget['id']) {
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  const stage = world.locator('.first-order-world__stage');
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  const areas = JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[];
  const area = areas.find(target => target.id === id)!;
  return { x: bounds.x + area.x + area.w / 2, y: bounds.y + area.y + area.h / 2 };
}

async function tapTarget(page: Page, world: Locator, id: WorldTarget['id']) {
  const { x, y } = await targetPoint(world, id);
  await page.touchscreen.tap(x, y);
}

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`the street keeps its accessible controls with tactile cues available on ${viewport}`, async ({ page }, info) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await setup(page, true);
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
    await shot(page, 'LW-024', `LW-024-${viewport}-street`);
    await axe(page, '.first-order');
    await button(page, 'Meet Clem at the jazz bar').press('Enter');
    const band = page.getByRole('radio', { name: /^The musicians/ });
    const bandPoint = await targetPoint(world, 'bay:band');
    const choose = () => page.touchscreen.tap(bandPoint.x, bandPoint.y);
    if (viewport === 'iphone') {
      const frames = await frameDeltas(page, choose, 1000);
      await info.attach('haptics-bay-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    } else await choose();
    await expect(band).toBeChecked();
    await tapTarget(page, world, 'bay:band');
    expect(await pulses(page)).toEqual([8]);
    await band.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: /^The room/ })).toBeChecked();
    expect(await pulses(page)).toEqual([8]);
  });
}

test('the optional iOS switch stays outside the tab order and accessibility tree', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await setup(page, true, 'switch');
  const initialSwitches = await page.getByRole('switch').count();
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  await tapTarget(page, world, 'bay:band');
  const cue = page.locator('label[aria-hidden=true] input[switch]');
  await expect(cue).toHaveCount(1);
  await expect(cue).toHaveAttribute('tabindex', '-1');
  await expect(cue).toBeChecked();
  await expect(page.getByRole('switch')).toHaveCount(initialSwitches);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await axe(page, 'body');
});

test('a direct press on the illustrated bench produces one thud', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, false);
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  await button(page, 'Book for 900 cr').press('Enter');
  await button(page, 'Pull the press handle').tap();
  await expect(page.getByRole('heading', { name: 'Fresh off the press' })).toBeFocused();
  expect(await pulses(page)).toEqual([18]);
});

test('a committed world drag produces one thud', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await setup(page, true);
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  await button(page, 'Book for 900 cr').press('Enter');
  const { x, y } = await targetPoint(world, 'press');
  const track = Number(await world.getAttribute('data-pull-track'));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + track * .82, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Fresh off the press' })).toBeFocused();
  expect(await pulses(page)).toEqual([18]);
});

test('lifting past halfway produces one tick after a silent keyboard press', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, false, 'vibrate', 'full');
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  await button(page, 'Book for 900 cr').press('Enter');
  await button(page, 'Run the press').press('Enter');
  const lift = button(page, 'Lift Clem’s print');
  await lift.scrollIntoViewIfNeeded();
  const bounds = (await lift.boundingBox())!;
  const x = bounds.x + bounds.width / 3;
  const y = bounds.y + bounds.height / 2;
  expect(await pulses(page)).toEqual([]);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y, { steps: 3 });
  expect(await pulses(page)).toEqual([]);
  await page.mouse.move(x + 80, y, { steps: 5 });
  await page.mouse.up();
  await expect(button(page, 'Lay Clem’s print down')).toBeVisible();
  expect(await pulses(page)).toEqual([8]);
});

test('a browser without a tactile mechanism can still choose the window', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await setup(page, true, 'none');
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  await tapTarget(page, world, 'bay:band');
  await expect(page.getByRole('radio', { name: /^The musicians/ })).toBeChecked();
  await expect(page.locator('input[switch]')).toHaveCount(0);
});
