import { expect, test } from '@playwright/test';
import { axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { meanLuminance } from './design-pack-luminance';
import { band, design, heading, hitAreas, meet, room, visit } from './design-pack-lw009-helpers';

test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});

const viewports = ['iphone', 'duo-outer', 'ipad', 'desktop'] as const;
for (const viewport of viewports) {
  test(`the two windows select their live edition on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await visit(page, 'miniature');
    await expect(world).toHaveAttribute('data-world-shot', 'street');
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
    await expect(world).toHaveAttribute('data-world-targets', '[]');
    await expect(page.locator('.first-order-street')).toHaveAttribute('data-world', 'true');
    const canvas = await world.locator('canvas[data-miniature-renderer]').elementHandle();
    await shot(page, 'LW-009', `LW-009-${viewport}-street`);
    await axe(page, '.first-order');

    await design(page, world);
    expect(Number(await world.getAttribute('data-warmup-ms'))).toBeGreaterThan(0);
    expect(await world.locator('canvas[data-miniature-renderer]').evaluate((element, same) => element === same, canvas)).toBe(true);
    await expect(room(page)).toBeChecked();
    await expect(band(page)).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Book for 900 cr', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('status')).toBeEmpty();
    const area = await hitAreas(world);
    for (const target of [area.room, area.band]) {
      expect(target.w).toBeGreaterThanOrEqual(44);
      expect(target.h).toBeGreaterThanOrEqual(44);
    }
    expect(area.room.x + area.room.w).toBeLessThanOrEqual(area.band.x + .1);
    await shot(page, 'LW-009', `LW-009-${viewport}-choose-room`);
    await axe(page, '.first-order');

    const centre = area.centre(area.band);
    const brightness = async () => meanLuminance(await area.stage.screenshot(), area.band.visual);
    const original = viewport === 'iphone' ? await brightness() : 0;
    const beforeHover = Number(await world.getAttribute('data-world-ack'));
    await page.mouse.move(centre.x, centre.y);
    await expect(world).toHaveAttribute('data-world-hover', 'band');
    await expect.poll(async () => Number(await world.getAttribute('data-world-ack'))).toBeGreaterThan(beforeHover);
    if (original) await expect.poll(async () => (await brightness()) / original).toBeGreaterThanOrEqual(1.04);
    await shot(page, 'LW-009', `LW-009-${viewport}-choose-hover-band`);
    await axe(page, '.first-order');

    const beforeSelect = Number(await world.getAttribute('data-world-ack'));
    await page.mouse.click(centre.x, centre.y);
    await expect(band(page)).toBeChecked();
    await expect(world).toHaveAttribute('data-world-selected', 'band');
    await expect(heading(page)).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Chosen: The musicians, 153 min to print.');
    await expect.poll(async () => Number(await world.getAttribute('data-world-ack'))).toBeGreaterThan(beforeSelect);
    if (original) await expect.poll(async () => (await brightness()) / original).toBeGreaterThanOrEqual(1.04);
    await shot(page, 'LW-009', `LW-009-${viewport}-choose-band`);
    await axe(page, '.first-order');

    const left = area.centre(area.room);
    await page.mouse.click(left.x, left.y);
    await expect(room(page)).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('Chosen: The room, 198 min to print.');
  });

  test(`the illustrated design keeps its plain edition control on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await visit(page, 'illustrated');
    await expect(page.locator('.first-order-street img')).toBeVisible();
    await meet(page).press('Enter');
    await expect(heading(page)).toBeFocused();
    await expect(world).toHaveAttribute('data-fallback', 'true');
    await band(page).check();
    await expect(band(page)).toBeChecked();
    await expect(page.getByRole('status')).toBeEmpty();
    await shot(page, 'LW-009', `LW-009-${viewport}-fallback-design`);
    await axe(page, '.first-order');
  });
}

test('keyboard focus mirrors the radio and the bay edges and gap are distinct', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await visit(page, 'miniature', 'reduce');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await design(page, world);
  await page.keyboard.press('Tab');
  await expect(room(page)).toBeFocused();
  await expect(world).toHaveAttribute('data-world-focus', 'room');
  await page.keyboard.press('ArrowRight');
  await expect(band(page)).toBeChecked();
  await expect(world).toHaveAttribute('data-world-selected', 'band');
  await expect(world).toHaveAttribute('data-world-focus', 'band');
  await expect(page.getByRole('status')).toBeEmpty();

  const area = await hitAreas(world);
  const gap = (area.room.x + area.room.w + area.band.x) / 2;
  await page.mouse.click(area.bounds.x + gap, area.bounds.y + area.band.y + area.band.h / 2);
  await expect(band(page)).toBeChecked();
  const x = 1 / area.band.w;
  const y = 1 / area.band.h;
  for (const [relativeX, relativeY] of [[x, .5], [1 - x, .5], [.5, y], [.5, 1 - y]] as const) {
    await room(page).check();
    await expect(world).toHaveAttribute('data-world-selected', 'room');
    const point = area.centre(area.band, relativeX, relativeY);
    await page.mouse.click(point.x, point.y);
    await expect(band(page)).toBeChecked();
  }
});

test.describe('touch selection', () => {
  test.use({ hasTouch: true });
  test('a tap selects and a cancelled vertical swipe keeps the edition', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize({ width: 390, height: 844 });
    const world = await visit(page, 'miniature', 'reduce');
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
    await design(page, world);
    const area = await hitAreas(world);
    const right = area.centre(area.band);
    await page.touchscreen.tap(right.x, right.y);
    await expect(band(page)).toBeChecked();
    const left = area.centre(area.room);
    await area.stage.evaluate((stage, { x, y }) => {
      for (const type of ['pointerdown', 'pointermove', 'pointercancel']) {
        stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 80, pointerType: 'touch',
          isPrimary: true, clientX: x, clientY: type === 'pointerdown' ? y : y + 40, button: 0 }));
      }
    }, left);
    await expect(world).toHaveAttribute('data-world-pressed', '');
    await expect(band(page)).toBeChecked();
  });
});

test('reduced motion cuts from the street to the edition choice', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await visit(page, 'miniature', 'reduce');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await expect(world).toHaveAttribute('data-world-shot', 'street');
  const phases = await world.evaluateHandle(node => {
    const result: (string | null)[] = [node.getAttribute('data-world-phase')];
    const observer = new MutationObserver(records => {
      for (const record of records) result.push(record.oldValue);
      result.push(node.getAttribute('data-world-phase'));
    });
    observer.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ['data-world-phase'] });
    return result;
  });
  await design(page, world);
  expect(await phases.jsonValue()).toEqual(['idle']);
});

test('both bay pictures rebuild after the last draft edit', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await visit(page, 'miniature', 'reduce');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await design(page, world);
  const keys = () => world.locator('[data-print-key^="edition:"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-print-key')));
  const before = await keys();
  expect(before).toHaveLength(2);
  const headline = page.getByRole('textbox', { name: 'A line of your own', exact: true });
  await page.getByText('Add a headline', { exact: true }).press('Enter');
  await headline.evaluate(input => {
    const scope = document.querySelector('.first-order-world')!;
    const original = Array.from(scope.querySelectorAll('[data-print-key^="edition:"]'), node => node.getAttribute('data-print-key')).join(',');
    const timing = { input: 0, change: 0 };
    (window as Window & { lwBayTiming?: typeof timing }).lwBayTiming = timing;
    input.addEventListener('input', () => { timing.input = performance.now(); });
    const observer = new MutationObserver(() => {
      const current = Array.from(scope.querySelectorAll('[data-print-key^="edition:"]'), node => node.getAttribute('data-print-key')).join(',');
      if (current !== original) { timing.change = performance.now(); observer.disconnect(); }
    });
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-print-key'] });
  });
  const rebuild = await frameDeltas(page, async () => {
    await headline.fill('An evening');
    await headline.fill('An evening of brass');
    await expect.poll(keys).not.toEqual(before);
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  }, 150);
  await info.attach('texture-rebuild-timing', { body: JSON.stringify(rebuild), contentType: 'application/json' });
  expect(rebuild.longFrames.length).toBeLessThanOrEqual(1);
  for (const duration of rebuild.longFrames) expect(duration).toBeLessThanOrEqual(80);
  const elapsed = await page.evaluate(() => {
    const timing = (window as Window & { lwBayTiming?: { input: number; change: number } }).lwBayTiming!;
    return timing.change - timing.input;
  });
  expect(elapsed).toBeGreaterThanOrEqual(240);
  const after = await keys();
  expect(after).toHaveLength(2);
  expect(after.every(key => !before.includes(key))).toBe(true);
  await band(page).check();
  await expect(world).toHaveAttribute('data-world-selected', 'band');
  await expect(page.locator('.clem-proof svg.designed-artwork__print')).toHaveAccessibleName(/An evening of brass/);
  expect(await keys()).toEqual(after);
});

test('a missing WebGL context keeps the street plate and radios available', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
    const create = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(create, this, [type, ...args]);
    } as typeof create;
  });
  const world = await visit(page, 'miniature', 'reduce');
  await expect(world).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('.first-order-street img')).toBeVisible();
  await meet(page).press('Enter');
  await expect(heading(page)).toBeFocused();
  await band(page).check();
  await expect(band(page)).toBeChecked();
  await expect(page.getByRole('status')).toBeEmpty();
});
