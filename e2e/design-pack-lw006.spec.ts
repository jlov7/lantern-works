import { expect, test, type Locator, type Page } from '@playwright/test';
import type { WorldTarget } from '../src/ui/game/worldProjection';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { meanLuminance } from './design-pack-luminance';

test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

async function preference(page: Page, view: 'miniature' | 'illustrated', motion: 'full' | 'reduce' = 'full') {
  await page.addInitScript(({ view, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: view, motion, sound: false }));
  }, { view, motion });
}
async function reachPress(page: Page, miniature: boolean) {
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
  const world = page.locator('.first-order-world');
  if (miniature) await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Book for 900 cr', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Ready for the press', exact: true })).toBeFocused();
  if (miniature) {
    await expect(world).toHaveAttribute('data-world-shot', 'press');
    await expect(world).toHaveAttribute('data-world-phase', 'idle', { timeout: 20_000 });
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
    expect(Number(await world.getAttribute('data-warmup-ms'))).toBeGreaterThan(0);
  }
  return world;
}

async function targetPoint(world: Locator) {
  const surface = world.locator('.first-order-world__stage');
  await surface.scrollIntoViewIfNeeded();
  const bounds = (await surface.boundingBox())!;
  const target = (JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[]).find(item => item.id === 'press')!;
  return { x: bounds.x + target.x + target.w / 2, y: bounds.y + target.y + target.h / 2,
    track: Number(await world.getAttribute('data-pull-track')), visual: target.visual, surface };
}

async function rememberPhases(world: Locator) {
  await world.evaluate(stage => {
    const phases: string[] = [];
    (window as Window & { __pressPhases?: string[] }).__pressPhases = phases;
    new MutationObserver(() => {
      const phase = stage.getAttribute('data-world-phase');
      if (phase && phases.at(-1) !== phase) phases.push(phase);
    }).observe(stage, { attributes: true, attributeFilter: ['data-world-phase'] });
  });
}
const trail = (page: Page) => page.evaluate(() => (window as Window & { __pressPhases?: string[] }).__pressPhases ?? []);
const lift = (page: Page) => page.getByRole('heading', { name: 'Fresh off the press', exact: true });
const loss = 'Finn, Sam, and Yara left without booking.';

for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop'] as const) {
  test(`the real press pulls and the three neighbours leave on ${viewport}`, async ({ page, browser, baseURL }) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await preference(page, 'miniature');
    const world = await reachPress(page, true);
    const press = await targetPoint(world);
    await shot(page, 'LW-006', `LW-006-${viewport}-press-idle`);
    await axe(page, '.first-order');
    if (viewport === 'iphone') {
      const start = Number(await world.getAttribute('data-world-ack'));
      const before = meanLuminance(await press.surface.screenshot(), press.visual);
      await page.mouse.move(press.x, press.y);
      await expect(world).toHaveAttribute('data-world-hover', 'press');
      await expect.poll(async () => Number(await world.getAttribute('data-world-ack'))).toBeGreaterThan(start);
      await expect.poll(async () => meanLuminance(await press.surface.screenshot(), press.visual) / before).toBeGreaterThanOrEqual(1.03);
      await page.mouse.down();
      await page.mouse.move(press.x, press.y + .5 * press.track, { steps: 30 });
      await page.waitForTimeout(90);
      await page.mouse.up();
      await expect(world).toHaveAttribute('data-pull', '0.00');
      await expect(page.getByRole('heading', { name: 'Ready for the press', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toBeEmpty();
    }
    await rememberPhases(world);
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x, press.y + .8 * press.track, { steps: 12 });
    await page.mouse.up();
    await expect(world).toHaveAttribute('data-world-phase', 'committing');
    await page.waitForTimeout(100);
    await shot(page, 'LW-006', `LW-006-${viewport}-press-mid`);
    await axe(page, '.first-order');
    await expect(world).toHaveAttribute('data-world-phase', 'leaving');
    await expect(page.getByRole('status')).toHaveText(loss);
    await expect(world.locator('.first-order-world__tag')).toHaveText(['Finn', 'Sam', 'Yara']);
    await page.waitForTimeout(740);
    await shot(page, 'LW-006', `LW-006-${viewport}-street-leaving`);
    await axe(page, '.first-order');
    await expect(lift(page)).toBeFocused({ timeout: 6000 });
    const phases = await trail(page);
    expect(phases).toEqual(expect.arrayContaining(['committing', 'moving', 'leaving']));
    expect(phases.indexOf('committing')).toBeLessThan(phases.indexOf('moving'));
    expect(phases.indexOf('moving')).toBeLessThan(phases.indexOf('leaving'));
    await shot(page, 'LW-006', `LW-006-${viewport}-lift`);
    await axe(page, '.first-order');

    const illustrated = await browser.newContext({ baseURL, viewport: VIEWPORTS[viewport], reducedMotion: 'no-preference', serviceWorkers: 'block' });
    try {
      const fallback = await illustrated.newPage();
      await preference(fallback, 'illustrated');
      await reachPress(fallback, false);
      await fallback.getByRole('button', { name: 'Pull the press handle', exact: true }).press('Enter');
      await fallback.waitForTimeout(140);
      await shot(fallback, 'LW-006', `LW-006-${viewport}-fallback-press-mid`);
      await axe(fallback, '.first-order');
      await expect(lift(fallback)).toBeFocused();
    } finally { await illustrated.close(); }
  });
}

test('drag and commit stay in budget, and a keyboard stroke can skip the beat', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await preference(page, 'miniature');
  const world = await reachPress(page, true);
  const press = await targetPoint(world);
  await page.mouse.move(press.x, press.y);
  await rememberPhases(world);
  // Observe the game's focus event without running locator queries during the measured frames.
  await page.evaluate(() => {
    const host = window as Window & { __pressLift?: Promise<boolean> };
    host.__pressLift = new Promise(resolve => {
      const heading = document.getElementById('first-order-heading')!;
      const timeout = AbortSignal.timeout(6500);
      const observer = new MutationObserver(check);
      function check() {
        if (document.activeElement === heading && heading.textContent === 'Fresh off the press') {
          observer.disconnect();
          resolve(true);
        }
      }
      observer.observe(heading, { childList: true, characterData: true, subtree: true });
      document.addEventListener('focusin', check, { signal: timeout });
      timeout.addEventListener('abort', () => observer.disconnect(), { once: true });
    });
  });
  const frames = await frameDeltas(page, async () => {
    await page.mouse.down();
    await page.mouse.move(press.x, press.y + .8 * press.track, { steps: 12 });
    await page.mouse.up();
    expect(await page.evaluate(() => Promise.race([
      (window as Window & { __pressLift?: Promise<boolean> }).__pressLift,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 6000)),
    ]))).toBe(true);
  }, 100);
  await expect(lift(page)).toBeFocused();
  expect(await trail(page)).toContain('committing');
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
  expect(frames.longFrames.some(ms => ms > 50)).toBe(false);
  await page.evaluate(() => sessionStorage.removeItem('lantern.first-order.v1'));
  await reachPress(page, true);
  await page.getByRole('button', { name: 'Run the press' }).press('Enter');
  await expect(world).toHaveAttribute('data-world-phase', 'leaving');
  await world.locator('.first-order-world__stage').click({ position: { x: 20, y: 30 } });
  await expect(lift(page)).toBeFocused({ timeout: 400 });
});

for (const input of ['mouse', 'keyboard'] as const) {
  test(`the ${input} panel keeps the press in budget after the mouse reaches it`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.iphone);
    await preference(page, 'miniature');
    await reachPress(page, true);
    const panel = page.getByRole('button', { name: 'Run the press', exact: true });
    await panel.hover();
    const frames = await frameDeltas(page, async () => {
      if (input === 'mouse') await panel.click();
      else await panel.press('Enter');
      await expect(lift(page)).toBeFocused({ timeout: 6000 });
    }, 100);
    assertFrameBudget(frames);
    expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    expect(Math.max(0, ...frames.longFrames)).toBeLessThanOrEqual(50);
  });
}

test('reduced motion cuts directly and settles the press scene quickly', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await preference(page, 'miniature', 'reduce');
  const world = await reachPress(page, true);
  const target = await targetPoint(world);
  await rememberPhases(world);
  await page.mouse.click(target.x, target.y);
  await expect(lift(page)).toBeFocused({ timeout: 2000 });
  const phases = await trail(page);
  expect(phases).not.toContain('moving');
  expect(phases).toContain('leaving');
});

test('with no WebGL the handle covers the proof and the gesture reaches lift', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await preference(page, 'miniature');
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen');
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(context, this, [type, ...args]);
    } as typeof context;
  });
  const world = await reachPress(page, false);
  await expect(world).toHaveAttribute('data-fallback', 'true');
  const handle = page.getByRole('button', { name: 'Pull the press handle' });
  await axe(page, '.first-order');
  const handleBox = (await handle.boundingBox())!;
  const bench = (await page.locator('.press-pull').boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 22);
  const frames = await frameDeltas(page, async () => {
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 22 + .8 * Math.max(120, Math.round(bench.height * .68)), { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(145);
    expect(await page.locator('.press-pull__tympan').evaluate(tympan => {
      const cover = tympan.getBoundingClientRect();
      const paper = tympan.parentElement!.querySelector('.clem-proof')!.getBoundingClientRect();
      return Math.max(0, Math.min(cover.bottom, paper.bottom) - Math.max(cover.top, paper.top)) / paper.height;
    })).toBeGreaterThanOrEqual(.9);
    await expect(page.getByRole('status')).toHaveText(loss);
    await expect(lift(page)).toBeFocused();
  }, 100);
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a tap starts one stroke', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preference(page, 'miniature', 'reduce');
    const world = await reachPress(page, true);
    const target = await targetPoint(world);
    await page.touchscreen.tap(target.x, target.y);
    await expect(lift(page)).toBeFocused({ timeout: 2000 });
  });
});

test('the warmed programs cover both bays, the press and the walking figures', async ({ page }, info) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await preference(page, 'miniature');
  function countShaderPrograms() {
    const state = { programs: 0 };
    (globalThis as unknown as { cameraPrograms: typeof state }).cameraPrograms = state;
    const create = WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram = function () { state.programs++; return create.call(this); };
  }
  await page.context().route('**/assets/room.worker-*.js', async route => {
    const script = await route.fetch();
    await route.fulfill({ response: script, body: '(' + countShaderPrograms.toString() + ')();\n' + await script.text() });
  });
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar' }).press('Enter');
  const world = page.locator('.first-order-world');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  const worker = page.workers().find(item => item.url().includes('/room.worker-'))!;
  const count = () => worker.evaluate(() => (globalThis as unknown as { cameraPrograms: { programs: number } }).cameraPrograms.programs);
  const before = await count();
  expect(before).toBeGreaterThan(0);
  const bounds = (await world.locator('.first-order-world__stage').boundingBox())!;
  const bays = JSON.parse(await world.getAttribute('data-world-targets') ?? '[]') as WorldTarget[];
  expect(bays).toHaveLength(2);
  for (const bay of bays) {
    await page.mouse.move(bounds.x + bay.x + bay.w / 2, bounds.y + bay.y + bay.h / 2);
    await expect(world).toHaveAttribute('data-world-hover', bay.id.slice(4));
  }
  await page.getByRole('radio', { name: /The musicians/ }).check();
  await page.getByRole('button', { name: 'Book for 900 cr' }).press('Enter');
  await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
  const target = await targetPoint(world);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y + target.track / 2, { steps: 30 });
  await page.waitForTimeout(90);
  await page.mouse.up();
  await expect(world).toHaveAttribute('data-pull', '0.00');
  await page.mouse.click(target.x, target.y);
  await expect(world).toHaveAttribute('data-world-phase', 'leaving');
  await page.waitForTimeout(420);
  const after = await count();
  expect(after).toBe(before);
  console.info('Signature shader programs', { before, after });
  await info.attach('signature-programs', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  await expect(lift(page)).toBeFocused();
});

test('loading the miniature module cannot strand a committed illustrated stroke', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await preference(page, 'miniature');
  let release: () => void = () => undefined;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/FirstOrderWorld-*.js', async route => {
    await hold;
    await route.continue();
  });
  await reachPress(page, false);
  await page.getByRole('button', { name: 'Pull the press handle' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText(loss);
  release();
  await expect(lift(page)).toBeFocused({ timeout: 2000 });
});
