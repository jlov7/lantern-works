import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({
  reducedMotion: 'no-preference', serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

type MotionWindow = Window & {
  transitionCount?: number;
  transitionFilm?: Promise<Animation[]>;
  lastTransition?: ViewTransition;
  motionLongFrames?: object[];
};
const meet = (page: Page) => page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
const book = (page: Page) => page.getByRole('button', { name: 'Book for 900 cr', exact: true });
const view = (page: Page) => page.locator('.first-order-world');
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });

async function observeCameraMotion(page: Page) {
  await view(page).evaluate(node => {
    const movedShots = new Set<string>();
    node.setAttribute('data-lw022-moving-shots', '[]');
    const observer = new MutationObserver(() => {
      const shot = node.getAttribute('data-world-shot');
      if (!shot || node.getAttribute('data-world-phase') !== 'moving') return;
      movedShots.add(shot);
      node.setAttribute('data-lw022-moving-shots', JSON.stringify([...movedShots]));
    });
    observer.observe(node, { attributeFilter: ['data-world-shot', 'data-world-phase'] });
  });
}

async function setup(page: Page, studioView: 'miniature' | 'illustrated', film = false, reduce = false) {
  await page.addInitScript(({ studioView, film, reduce }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView, motion: reduce ? 'reduce' : 'full', sound: false }));
    const host = window as MotionWindow;
    host.transitionCount = 0;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = (options) => {
      const transition = start(options);
      host.transitionCount = (host.transitionCount ?? 0) + 1;
      host.lastTransition = transition;
      if (film) host.transitionFilm = transition.ready.then(() => {
        const animations = document.getAnimations().filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith('::view-transition'));
        for (const animation of animations) animation.pause();
        return animations;
      });
      return transition;
    };
  }, { studioView, film, reduce });
  await page.goto('/?opening=first-order');
  await expect(view(page)).toHaveAttribute('data-renderer-choice', studioView);
  if (studioView === 'miniature') await expect(view(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
}

async function film(page: Page, name: string, duration: number) {
  const result = await page.evaluate(async () => {
    const animations = await (window as MotionWindow).transitionFilm;
    return {
      count: animations?.length ?? 0,
      durations: animations?.map(animation => Number(animation.effect?.getTiming().duration)) ?? [],
      proof: animations?.some(animation => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.includes('first-order-proof')),
      root: animations?.some(animation => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.includes('(root)')),
    };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(Math.max(...result.durations)).toBe(duration);
  expect(result.proof).toBe(true);
  expect(result.root).toBe(false);
  const digests = new Set<string>();
  for (let index = 0; index < 10; index++) {
    await page.evaluate(async fraction => {
      const animations = await (window as MotionWindow).transitionFilm ?? [];
      for (const animation of animations) animation.currentTime = Number(animation.effect?.getTiming().duration) * fraction;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }, index / 10);
    const frame = await page.screenshot({ animations: 'allow', scale: 'css' });
    digests.add(createHash('sha256').update(frame).digest('hex'));
    await shot(page, 'LW-022', `${name}-frame-${String(index).padStart(2, '0')}`, frame);
    if (index === 5) await shot(page, 'LW-022', `${name}-mid`, frame);
  }
  expect(digests.size).toBeGreaterThanOrEqual(6);
  await page.evaluate(async () => {
    const animations = await (window as MotionWindow).transitionFilm ?? [];
    for (const animation of animations) animation.finish();
  });
}

for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop'] as const) {
  test(`illustrated motion keeps the proof through both transitions on ${viewport}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await setup(page, 'illustrated', true);
    await meet(page).press('Enter');
    await heading(page, 'The late set').waitFor();
    await film(page, `LW-022-${viewport}-street-to-design`, 520);
    await expect(heading(page, 'The late set')).toBeFocused();
    await expect(book(page)).toBeInViewport({ ratio: 1 });
    await axe(page, '.first-order');
    await book(page).press('Enter');
    await heading(page, 'Ready for the press').waitFor();
    await film(page, `LW-022-${viewport}-design-to-press`, 420);
    await expect(heading(page, 'Ready for the press')).toBeFocused();
    await axe(page, '.first-order');
  });
}

test('the full illustrated transition keeps within the frame budget', async ({ page }, info) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, 'illustrated');
  await page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) return;
    const host = window as MotionWindow;
    const frames: object[] = [];
    host.motionLongFrames = frames;
    new PerformanceObserver(list => frames.push(...list.getEntries().map(entry => entry.toJSON())))
      .observe({ type: 'long-animation-frame' });
  });
  const finish = () => page.evaluate(async () => {
    const transition = (window as MotionWindow).lastTransition;
    if (!transition) throw new Error('The illustrated view did not start a View Transition.');
    await transition.finished;
  });
  const frames = await frameDeltas(page, async () => {
    await meet(page).press('Enter');
    await heading(page, 'The late set').waitFor();
    await finish();
    await book(page).press('Enter');
    await heading(page, 'Ready for the press').waitFor();
    await finish();
  }, 700);
  await info.attach('opening-motion-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
  const longFrames = await page.evaluate(() => (window as MotionWindow).motionLongFrames ?? []);
  await info.attach('opening-motion-long-frames', { body: JSON.stringify(longFrames), contentType: 'application/json' });
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
  await expect(heading(page, 'Ready for the press')).toBeFocused();
});

test('miniature camera transitions never start a DOM View Transition', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, 'miniature');
  await observeCameraMotion(page);
  await meet(page).press('Enter');
  await expect(view(page)).toHaveAttribute('data-world-ready', 'true');
  await book(page).press('Enter');
  await expect(view(page)).toHaveAttribute('data-world-shot', 'press');
  await expect(view(page)).toHaveAttribute('data-lw022-moving-shots', '["choose","press"]');
  expect(await page.evaluate(() => (window as MotionWindow).transitionCount)).toBe(0);
});

test('reduced motion cuts while preserving both keyboard steps', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, 'illustrated', false, true);
  await meet(page).press('Enter');
  await expect(heading(page, 'The late set')).toBeFocused();
  await book(page).press('Enter');
  await expect(heading(page, 'Ready for the press')).toBeFocused();
  expect(await page.evaluate(() => (window as MotionWindow).transitionCount)).toBe(0);
});

test('the reduced miniature cuts directly to both camera positions', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await setup(page, 'miniature', false, true);
  await observeCameraMotion(page);
  await meet(page).press('Enter');
  await expect(view(page)).toHaveAttribute('data-world-shot', 'choose');
  await expect(heading(page, 'The late set')).toBeFocused();
  await book(page).press('Enter');
  await expect(view(page)).toHaveAttribute('data-world-shot', 'press');
  await expect(heading(page, 'Ready for the press')).toBeFocused();
  await expect(view(page)).toHaveAttribute('data-world-ready', 'true');
  await expect(view(page)).toHaveAttribute('data-lw022-moving-shots', '[]');
  expect(await page.evaluate(() => (window as MotionWindow).transitionCount)).toBe(0);
});

test('the illustrated proof still cuts when View Transitions are unavailable', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.addInitScript(() => Object.defineProperty(document, 'startViewTransition', { value: undefined }));
  await setup(page, 'illustrated');
  await meet(page).press('Enter');
  await expect(heading(page, 'The late set')).toBeFocused();
  await book(page).press('Enter');
  await expect(heading(page, 'Ready for the press')).toBeFocused();
});
