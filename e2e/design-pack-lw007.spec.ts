import { expect, test, type Page } from '@playwright/test';
import { signaturePose } from '../src/ui/game/signatureCamera';
import { BAYS } from '../src/ui/game/signatureTargets';
import { projectBox } from '../src/ui/game/worldProjection';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});

const viewports = ['iphone', 'duo-outer', 'ipad', 'desktop'] as const;
const windowFigure = (page: Page) => page.locator('.first-order-world .clem-window');
const windowStage = (page: Page) => windowFigure(page).locator('.clem-window__stage');
const windowHeading = (page: Page) => page.getByRole('heading', { name: 'In Clem’s window', exact: true });
const hang = (page: Page) => page.getByRole('button', { name: 'Hang it in Clem’s window', exact: true });

async function reachLift(page: Page, view: 'miniature' | 'illustrated', motion: 'full' | 'reduce' = 'full') {
  await page.addInitScript(({ view, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: view, motion, sound: false }));
  }, { view, motion });
  await page.goto('/?opening=first-order', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
  const world = page.locator('.first-order-world');
  if (view === 'miniature') await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await page.getByRole('button', { name: 'Book for 900 cr', exact: true }).press('Enter');
  if (view === 'miniature') await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  const canvas = view === 'miniature' ? await world.locator('canvas[data-miniature-renderer]').elementHandle() : null;
  await page.getByRole('button', { name: 'Run the press', exact: true }).press('Enter');
  if (view === 'miniature' && motion === 'full') {
    await expect(world).toHaveAttribute('data-world-phase', 'leaving');
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('heading', { name: 'Fresh off the press', exact: true })).toBeFocused();
  return { world, canvas };
}

async function printRatio(page: Page) {
  const figure = (await windowFigure(page).boundingBox())!;
  const print = (await windowFigure(page).locator('.clem-window-print').boundingBox())!;
  return print.width / figure.width;
}

async function showFraming(page: Page, read: boolean) {
  const [minimum, maximum] = read ? [.31, .37] : [.115, .145];
  await expect.poll(() => printRatio(page)).toBeGreaterThan(minimum);
  await expect.poll(() => printRatio(page)).toBeLessThan(maximum);
  await expect(windowStage(page)).toHaveAttribute('data-framing', read ? 'read' : 'window');
}

function budget(frames: Awaited<ReturnType<typeof frameDeltas>>) {
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
}

for (const viewport of viewports) {
  test(`the illustrated window pushes in and toggles on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize(VIEWPORTS[viewport]);
    await reachLift(page, 'illustrated');
    await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'ready');
    await hang(page).press('Enter');
    await expect(windowHeading(page)).toBeFocused();
    await expect(windowStage(page)).toHaveAttribute('data-framing', 'street');
    await shot(page, 'LW-007', `LW-007-${viewport}-window-start`);
    await axe(page, '.first-order');
    const read = VIEWPORTS[viewport].width <= 700;
    await expect(windowStage(page)).toHaveAttribute('data-framing', read ? 'read' : 'window');
    await windowStage(page).evaluate(stage => {
      for (const animation of stage.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 450;
      }
    });
    await shot(page, 'LW-007', `LW-007-${viewport}-window-mid`);
    await axe(page, '.first-order');
    await windowStage(page).evaluate(stage => {
      for (const animation of stage.getAnimations({ subtree: true })) animation.play();
    });
    await expect.poll(() => windowStage(page).evaluate(stage => stage.getAnimations({ subtree: true }).filter(animation => animation.playState !== 'finished').length)).toBe(0);
    await showFraming(page, read);
    await shot(page, 'LW-007', `LW-007-${viewport}-window-end`);
    await axe(page, '.first-order');

    const toggle = page.getByRole('button', { name: read ? 'See the whole window' : 'Look closer', exact: true });
    await toggle.press('Enter');
    await expect(toggle.or(page.getByRole('button', { name: read ? 'Look closer' : 'See the whole window', exact: true }))).toBeFocused();
    await expect.poll(() => windowStage(page).evaluate(stage => stage.getAnimations().length)).toBe(0);
    await showFraming(page, !read);
    await shot(page, 'LW-007', `LW-007-${viewport}-window-toggle`);
    await axe(page, '.first-order');
  });
}

for (const viewport of viewports) {
  test(`the same miniature pushes into the delivered bay on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize(VIEWPORTS[viewport]);
    const { world, canvas } = await reachLift(page, 'miniature');
    expect(canvas).not.toBeNull();
    await expect(world).toHaveAttribute('data-world-shot', 'street');
    await world.evaluate(root => {
      const trail: string[] = [];
      (window as Window & { lwWindowPhases?: string[] }).lwWindowPhases = trail;
      new MutationObserver(() => {
        const phase = root.getAttribute('data-world-phase');
        if (phase && trail.at(-1) !== phase) trail.push(phase);
      }).observe(root, { attributeFilter: ['data-world-phase'] });
    });
    const frames = await frameDeltas(page, async () => { await hang(page).press('Enter'); }, 1500);
    budget(frames);
    await expect(world).toHaveAttribute('data-world-shot', 'read');
    await expect(world).toHaveAttribute('data-world-phase', 'idle');
    await expect(world).toHaveAttribute('data-world-hung', /^delivered:room:/);
    await expect(windowHeading(page)).toBeFocused();
    const trail = await page.evaluate(() => (window as Window & { lwWindowPhases?: string[] }).lwWindowPhases ?? []);
    expect(trail.indexOf('moving')).toBeGreaterThanOrEqual(0);
    expect(trail.lastIndexOf('idle')).toBeGreaterThan(trail.indexOf('moving'));
    expect(await world.locator('canvas[data-miniature-renderer]').evaluate((element, same) => element === same, canvas)).toBe(true);
    await expect(windowFigure(page)).toHaveAttribute('data-world', 'true');
    await expect(windowFigure(page)).toHaveCSS('opacity', '0');
    await expect(page.locator('.clem-window-print svg.designed-artwork__print')).toHaveAccessibleName(/The late set/);

    const { width, height } = (await world.locator('.first-order-world__stage').boundingBox())!;
    const stage = { width, height, availWidth: width };
    const [x, y, z] = BAYS.room.centre;
    const compact = VIEWPORTS[viewport].width <= 700;
    const poster = projectBox({ min: [x - .36, y - .36, z - .08], max: [x + .36, y + .36, z - .08] }, signaturePose('read', stage, 'room', compact), stage);
    expect(Math.abs(poster.h / height - (compact ? .62 : .50))).toBeLessThan(.04);
    await page.waitForTimeout(480);
    await shot(page, 'LW-007', `LW-007-${viewport}-world-read`);
    await axe(page, '.first-order');

    await page.getByRole('button', { name: 'See the whole window', exact: true }).press('Enter');
    await expect(world).toHaveAttribute('data-world-shot', 'street');
    await expect(world).toHaveAttribute('data-world-phase', 'idle');
    const closer = page.getByRole('button', { name: 'Look closer', exact: true });
    await expect(closer).toBeFocused();
    if (viewport === 'iphone') {
      await closer.press('Enter');
      await expect(world).toHaveAttribute('data-world-phase', 'moving');
      await page.getByRole('button', { name: 'Compare the other edition', exact: true }).press('Enter');
      await expect(world).toHaveAttribute('data-world-shot', 'street');
      await expect(world).toHaveAttribute('data-world-phase', 'moving');
      await expect(world).toHaveAttribute('data-world-phase', 'leaving');
      await page.getByRole('button', { name: 'Close the comparison', exact: true }).press('Enter');
      await expect(world).toHaveAttribute('data-world-shot', 'read');
      await expect(world).toHaveAttribute('data-world-phase', 'idle');
    }
  });
}

test('the illustrated camera stays in budget', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  await reachLift(page, 'illustrated');
  await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'ready');
  const frames = await frameDeltas(page, async () => { await hang(page).press('Enter'); }, 1500);
  budget(frames);
  await showFraming(page, true);
});

test('reduced motion cuts to the readable window and toggles instantly', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  await reachLift(page, 'illustrated', 'reduce');
  await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'ready');
  await hang(page).press('Enter');
  await showFraming(page, true);
  await page.getByRole('button', { name: 'See the whole window', exact: true }).press('Enter');
  await showFraming(page, false);
  expect(await windowStage(page).evaluate(stage => stage.getAnimations().length)).toBe(0);
});

for (const backdrop of ['late', 'failed'] as const) {
  test(`the print stays readable with a ${backdrop} backdrop`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per test');
    await page.setViewportSize(VIEWPORTS.iphone);
    let open = () => {};
    const unblocked = new Promise<void>(resolve => { open = resolve; });
    await page.route('**/assets/jazz-*.webp', async route => {
      if (backdrop === 'failed') await route.abort();
      else { await unblocked; await route.continue(); }
    });
    try {
      await reachLift(page, 'illustrated');
      await hang(page).press('Enter');
      await expect(windowHeading(page)).toBeFocused();
      await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'pending');
      await expect(windowStage(page)).toHaveAttribute('data-framing', 'street');
      expect(await printRatio(page)).toBeGreaterThan(.50);
      if (backdrop === 'late') {
        await page.waitForTimeout(1570);
        open();
        await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'ready');
        await showFraming(page, true);
        expect(await windowStage(page).evaluate(stage => stage.getAnimations().length)).toBe(0);
      }
    } finally { open(); }
  });
}

test('comparison holds the illustrated view until it closes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  await reachLift(page, 'illustrated');
  await expect(windowFigure(page)).toHaveAttribute('data-backdrop', 'ready');
  await hang(page).press('Enter');
  await expect(windowStage(page)).toHaveAttribute('data-framing', 'read');
  await page.getByRole('button', { name: 'Compare the other edition', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'One morning, two editions', exact: true })).toBeFocused();
  const position = () => windowStage(page).evaluate(stage => getComputedStyle(stage).transform);
  const frozen = await position();
  await page.waitForTimeout(200);
  expect(await position()).toBe(frozen);
  await page.getByRole('button', { name: 'Close the comparison', exact: true }).press('Enter');
  await expect(windowHeading(page)).toBeFocused();
  await showFraming(page, true);
});
