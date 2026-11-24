import { expect, test, type Locator, type Page } from '@playwright/test';
import type { WorldTarget } from '../src/ui/game/worldProjection';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const open = (page: Page) => button(page, 'Compare the other edition');
const comparison = (page: Page) => page.locator('.first-order-comparison');
const proof = (world: Locator) => world.locator('.clem-window-print svg.designed-artwork__print');
const targets = async (world: Locator) => JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[];

async function pointFor(world: Locator, id: WorldTarget['id']) {
  const stage = world.locator('.first-order-world__stage');
  await stage.scrollIntoViewIfNeeded();
  const bounds = (await stage.boundingBox())!;
  const hit = (await targets(world)).find(target => target.id === id)!;
  expect(hit.w).toBeGreaterThanOrEqual(44);
  expect(hit.h).toBeGreaterThanOrEqual(44);
  return { x: bounds.x + hit.x + hit.w / 2, y: bounds.y + hit.y + hit.h / 2 };
}

async function reachWindow(page: Page, view: 'world' | 'fallback', motion: 'full' | 'reduce' = 'full') {
  await page.addInitScript(({ view, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'miniature', sound: false, motion }));
    if (view === 'fallback') {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type.startsWith('webgl') ? null : Reflect.apply(getContext, this, [type, ...args]);
      } as typeof getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', { value: undefined });
    }
  }, { view, motion });
  await page.goto('/?opening=first-order');
  const world = page.locator('.first-order-world');
  if (view === 'world') await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  await button(page, 'Meet Clem at the jazz bar').press('Enter');
  if (view === 'world') {
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
    const band = await pointFor(world, 'bay:band');
    await page.mouse.click(band.x, band.y);
    await expect(world).toHaveAttribute('data-world-selected', 'band');
    const room = await pointFor(world, 'bay:room');
    await page.mouse.click(room.x, room.y);
    await expect(world).toHaveAttribute('data-world-selected', 'room');
  } else {
    await expect(world).toHaveAttribute('data-fallback', 'true');
    await expect(world.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  }
  await button(page, 'Book for 900 cr').press('Enter');
  if (view === 'world') {
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
    const press = await pointFor(world, 'press');
    const track = Number(await world.getAttribute('data-pull-track'));
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x, press.y + .82 * track, { steps: 10 });
    await page.mouse.up();
  } else await button(page, 'Run the press').press('Enter');
  await button(page, 'Lift Clem’s print').press('Enter');
  await button(page, 'Hang it in Clem’s window').press('Enter');
  if (view === 'world') {
    await expect(world).toHaveAttribute('data-world-shot', 'read', { timeout: 20_000 });
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  }
  return world;
}

async function inspectComparison(page: Page, beforePanel: boolean) {
  const panel = comparison(page);
  await expect(panel.getByRole('heading', { name: 'One morning, two editions' })).toBeFocused();
  await expect(panel.getByText('Delivered 333 minutes into the day')).toBeVisible();
  await expect(panel.getByText('Delivered 288 minutes into the day')).toBeVisible();
  await expect(panel.locator('mark.first-order-diff').filter({ hasText: /^Delivered/ })).toHaveText(['Delivered 333 minutes into the day', 'Delivered 288 minutes into the day']);
  await expect(panel.getByText('Same takings either way.')).toBeVisible();
  await expect(panel.getByText('Finn and Sam left without booking either way.')).toBeVisible();
  expect(await panel.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.clem-panel')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(beforePanel);
}

for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop'] as const) {
  test(`the two delivered prints share one street on ${viewport}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await reachWindow(page, 'world');
    const canvas = await world.locator('canvas[data-miniature-renderer]').elementHandle();
    await world.evaluate(node => {
      const observer = new MutationObserver(() => {
        if (node.getAttribute('data-world-phase') !== 'leaving') return;
        const tags = [...node.querySelectorAll('.first-order-world__tag')].map(tag => tag.textContent);
        if (!tags.length) return;
        node.setAttribute('data-lw012-tags', JSON.stringify(tags));
        node.setAttribute('data-lw012-leaving-at', String(performance.now()));
        observer.disconnect();
      });
      observer.observe(node, { attributes: true, attributeFilter: ['data-world-phase'], childList: true, subtree: true });
    });
    await open(page).press('Enter');
    await inspectComparison(page, true);
    await expect(world).toHaveAttribute('data-world-shot', 'street');
    await expect(world).toHaveAttribute('data-world-ready', 'true');
    await shot(page, 'LW-012', `LW-012-${viewport}-compare-street`);
    await expect(world).toHaveAttribute('data-lw012-tags', JSON.stringify(['Finn', 'Sam', 'Yara']));
    await world.evaluate(node => {
      const elapsed = performance.now() - Number(node.getAttribute('data-lw012-leaving-at'));
      return new Promise(resolve => setTimeout(resolve, Math.max(0, 700 - elapsed)));
    });
    await shot(page, 'LW-012', `LW-012-${viewport}-compare-leaving`);
    await axe(page, '.first-order');
    expect((await targets(world)).map(target => target.id)).toEqual(['bay:band']);
    const band = await pointFor(world, 'bay:band');
    await page.mouse.click(band.x, band.y);
    await expect(comparison(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'In Clem’s window' })).toBeFocused();
    await expect(proof(world)).toHaveAttribute('data-layout', 'headline');
    await expect(world).toHaveAttribute('data-world-shot', 'read');
    expect(await world.locator('canvas[data-miniature-renderer]').evaluate((element, same) => element === same, canvas)).toBe(true);
  });

  test(`the illustrated comparison keeps both windows and keyboard actions on ${viewport}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    const world = await reachWindow(page, 'fallback', 'reduce');
    await open(page).press('Enter');
    await inspectComparison(page, false);
    await expect(comparison(page).locator('.clem-window')).toHaveCount(2);
    await comparison(page).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await shot(page, 'LW-012', `LW-012-${viewport}-compare-fallback`);
    await axe(page, '.first-order');
    await page.keyboard.press('Tab');
    const hang = button(page, 'Hang the other edition');
    await expect(hang).toBeFocused();
    expect(await hang.evaluate(node => getComputedStyle(node).outlineWidth)).toBe('2px');
    await page.keyboard.press('Enter');
    await expect(proof(world)).toHaveAttribute('data-layout', 'headline');
    await expect(comparison(page)).toHaveCount(0);
  });
}

test('reduced motion holds named departures without moving the camera', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await reachWindow(page, 'world', 'reduce');
  await world.evaluate(node => {
    const start = performance.now();
    const phases: string[] = [];
    new MutationObserver(() => {
      const phase = node.getAttribute('data-world-phase') ?? '';
      if (!phases.includes(phase)) phases.push(phase);
      node.setAttribute('data-comparison-observed', JSON.stringify({ phases, elapsed: performance.now() - start }));
    }).observe(node, { attributes: true, attributeFilter: ['data-world-phase'] });
  });
  await open(page).press('Enter');
  await expect(world.locator('.first-order-world__tag')).toHaveText(['Finn', 'Sam', 'Yara']);
  await expect(world.locator('.first-order-world__tag')).toHaveCount(0, { timeout: 1500 });
  const observed = JSON.parse(await world.getAttribute('data-comparison-observed') ?? '{}');
  expect(observed.phases).toEqual(['leaving', 'idle']);
  expect(observed.elapsed).toBeLessThanOrEqual(1500);
  await button(page, 'Keep this edition').press('Enter');
  await expect(proof(world)).toHaveAttribute('data-layout', 'gallery');
});

test('the 3.2 second comparison stays in budget with both prints already made', async ({ page }, info) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  const world = await reachWindow(page, 'world');
  const frames = await frameDeltas(page, () => open(page).press('Enter'), 3200);
  await info.attach('comparison-frame-timing', { body: JSON.stringify(frames), contentType: 'application/json' });
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
  await inspectComparison(page, true);
  await expect(world).toHaveAttribute('data-world-phase', 'idle');
});
