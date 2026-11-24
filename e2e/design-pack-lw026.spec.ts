import { expect, test, type Locator, type Page } from '@playwright/test';
import { renderedFontPx } from '../src/ui/game/printScale';
import type { WorldTarget } from '../src/ui/game/worldProjection';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

const visit = '/?opening=first-order&worldDebug=1';
test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  // Qualify the 3D frame budget on the local Apple GPU. Software fallback is tested separately.
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport is set per case');
  await page.addInitScript(debug => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'miniature', motion: 'full', sound: false }));
    if (debug) Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
  }, process.env.LW_DEBUG_EVIDENCE === '1');
});

async function onDesign(page: Page) {
  await page.goto(visit);
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
  return page.locator('.first-order-world');
}

async function waitForShot(world: Locator, name: 'choose' | 'press') {
  await expect(world).toHaveAttribute('data-world-shot', name);
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  const targets = JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[];
  expect(targets).toHaveLength(name === 'choose' ? 2 : 1);
  expect(Number(await world.getAttribute('data-warmup-ms'))).toBeGreaterThan(0);
  expect(Number(await world.getAttribute('data-world-ack'))).toBeGreaterThanOrEqual(0);
  const stage = world.locator('.first-order-world__stage');
  await stage.scrollIntoViewIfNeeded();
  for (const target of targets) {
    expect(target.w).toBeGreaterThanOrEqual(44);
    expect(target.h).toBeGreaterThanOrEqual(44);
    expect(await stage.evaluate((surface, rect) => {
      const area = surface.getBoundingClientRect();
      const hit = document.elementFromPoint(area.x + rect.x + rect.w / 2, area.y + rect.y + rect.h / 2);
      return hit?.tagName === 'CANVAS' && surface.contains(hit);
    }, target)).toBe(true);
  }
  if (targets.length === 2) expect(targets[0]!.x + targets[0]!.w).toBeLessThanOrEqual(targets[1]!.x + .1);
  return targets;
}

for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop', 'duo-inner', 'ipad-landscape'] as const) {
  test(`signature cameras fit ${viewport} with the normal keyboard path`, async ({ page }, info) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await onDesign(page);
    const targets = await waitForShot(world, 'choose');
    if (process.env.LW_DEBUG_EVIDENCE) {
      await expect(world.locator('canvas')).not.toHaveAttribute('data-renderer-thread', 'worker');
      await expect(world.locator('.first-order-world__debug i')).toHaveCount(4);
    } else {
      await expect(world.locator('canvas')).toHaveAttribute('data-renderer-thread', 'worker');
      await expect(world.locator('.first-order-world__debug')).toHaveCount(0);
    }
    const radios = page.getByRole('radio');
    const book = page.getByRole('button', { name: 'Book for 900 cr', exact: true });
    await expect(book).toBeInViewport({ ratio: 1 });
    if (viewport === 'iphone' || viewport === 'duo-outer') {
      const editionCards = page.locator('.first-order-editions label');
      await expect(editionCards.first()).toBeInViewport({ ratio: 1 });
      await expect(editionCards.last()).toBeInViewport({ ratio: 1 });
      const fontPx = await page.locator('.clem-proof svg.designed-artwork__print').evaluate(svg => {
        const width = svg.getBoundingClientRect().width;
        const smallest = Math.min(...[...svg.querySelectorAll('text')].map(text => Number(text.getAttribute('font-size'))));
        return { width, smallest };
      });
      expect(renderedFontPx(fontPx.width, fontPx.smallest)).toBeGreaterThanOrEqual(viewport === 'iphone' ? 9 : 7);
    }
    const area = (await world.locator('.first-order-world__stage').boundingBox())!;
    const targetCentres = targets.map(target => ({ x: area.x + target.x + target.w / 2, y: area.y + target.y + target.h / 2 }));
    const priorAck = Number(await world.getAttribute('data-world-ack'));
    const frames = await frameDeltas(page, async () => {
      for (let i = 0; i < 8; i++) {
        const point = targetCentres[i % 2]!;
        await page.mouse.move(point.x, point.y, { steps: 3 });
        await page.waitForTimeout(210);
      }
    }, 160);
    if (!process.env.LW_DEBUG_EVIDENCE) {
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    }
    expect(frames.longFrames.some(ms => ms > 50)).toBe(false);
    await expect(world).toHaveAttribute('data-world-hover', 'band');
    await expect.poll(async () => Number(await world.getAttribute('data-world-ack'))).toBeGreaterThan(priorAck);
    await info.attach('pointer-timing', { body: JSON.stringify(frames), contentType: 'application/json' });
    await shot(page, 'LW-026', `LW-026-${viewport}-targets-choose`);
    await axe(page, '.first-order');
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(radios.last()).toBeChecked();
    await book.press('Enter');
    await waitForShot(world, 'press');
    if (viewport === 'iphone') {
      const stage = (await world.locator('.first-order-world__stage').boundingBox())!;
      expect(stage.width).toBeCloseTo(361, 0);
      expect(stage.height).toBeCloseTo(375, 0);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(VIEWPORTS.iphone.width);
    }
    if (process.env.LW_DEBUG_EVIDENCE) await expect(world.locator('.first-order-world__debug i')).toHaveCount(2);
    await expect(world).toHaveAttribute('data-world-selected', 'band');
    await shot(page, 'LW-026', `LW-026-${viewport}-targets-press`);
    await axe(page, '.first-order');
    await page.getByRole('button', { name: 'Run the press', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Lift Clem’s print', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Hang it in Clem’s window', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: 'Open the next morning', exact: true })).toBeVisible();
  });
}

test('without WebGL the normal keyboard flow and approved print still work', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(context, this, [type, ...args]);
    } as typeof context;
  });
  const world = await onDesign(page);
  await expect(world).toHaveAttribute('data-renderer-choice', 'illustrated');
  await expect(world).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('.clem-proof svg.designed-artwork__print')).toBeVisible();
  await page.getByRole('button', { name: 'Book for 900 cr', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Run the press', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Lift Clem’s print', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Hang it in Clem’s window', exact: true }).press('Enter');
  await expect(page.locator('.clem-window-print svg.designed-artwork__print')).toHaveAttribute('data-layout', 'gallery');
});

test('the main-thread miniature falls back to the same proof on context loss', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen'); });
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await onDesign(page);
  await waitForShot(world, 'choose');
  const canvas = world.locator('canvas');
  await expect(canvas).not.toHaveAttribute('data-renderer-thread', 'worker');
  await page.getByRole('radio', { name: /The musicians/ }).check();
  await canvas.evaluate(element => {
    const extension = (element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('The local renderer did not expose context-loss simulation.');
    extension.loseContext();
  });
  await expect(world).toHaveAttribute('data-fallback', 'true');
  await expect(page.getByRole('radio', { name: /The musicians/ })).toBeChecked();
  await expect(page.locator('.clem-proof svg.designed-artwork__print')).toHaveAttribute('data-layout', 'headline');
  await expect(page.getByRole('button', { name: 'Book for 900 cr', exact: true })).toBeInViewport({ ratio: 1 });
});
