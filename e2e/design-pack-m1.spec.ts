import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { changedPixels, readScreenshot } from './design-pack-luminance';

test.describe.configure({ mode: 'default' });
test.use({
  reducedMotion: 'no-preference',
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});

const viewports = ['iphone', 'ipad', 'desktop'] as const;
type Renderer = 'miniature' | 'illustrated';
type EventTimes = Partial<Record<'pull' | 'push' | 'leave', number>>;
type RecordedFrame = { at: number; data: string };

const world = (page: Page) => page.locator('.first-order-world');
const pull = (page: Page) => page.getByRole('button', { name: 'Run the press', exact: true });
const lift = (page: Page) => page.getByRole('heading', { name: 'Fresh off the press', exact: true });
const hang = (page: Page) => page.getByRole('button', { name: 'Hang it in Clem’s window', exact: true });
const windowHeading = (page: Page) => page.getByRole('heading', { name: 'In Clem’s window', exact: true });

async function reachPress(page: Page, view: Renderer, motion: 'full' | 'reduce') {
  await page.addInitScript(({ view, motion }) => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: view, motion, sound: false }));
  }, { view, motion });
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
  if (view === 'miniature') await expect(world(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await page.getByRole('button', { name: 'Book for 900 cr', exact: true }).press('Enter');
  if (view === 'miniature') await expect(world(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 20000 });
  await pull(page).focus();
  await expect(pull(page)).toBeFocused();
}

async function timeline(page: Page, miniature: boolean) {
  await page.evaluate(miniature => {
    const marks: EventTimes = {};
    (window as Window & { lwM1Marks?: EventTimes }).lwM1Marks = marks;
    const now = () => performance.timeOrigin + performance.now();
    const root = document.querySelector('.first-order')!;
    const observe = new MutationObserver(() => {
      const phase = root.querySelector('.first-order-world')?.getAttribute('data-world-phase');
      const fallbackPhase = root.querySelector('.press-pull')?.getAttribute('data-press-phase');
      if (miniature ? phase === 'committing' : fallbackPhase === 'bite') marks.pull ??= now();
      if (phase === 'leaving') marks.leave ??= now();
    });
    observe.observe(root, { attributes: true, subtree: true, attributeFilter: ['data-world-phase', 'data-press-phase'] });
    root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest('button');
      if (button?.textContent?.trim() === 'Hang it in Clem’s window') marks.push ??= now();
    }, true);
  }, miniature);
}

async function recordFrames(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const frames: RecordedFrame[] = [];
  cdp.on('Page.screencastFrame', ({ sessionId, metadata, data }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
    if (metadata.timestamp !== undefined) frames.push({ at: metadata.timestamp * 1000, data });
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await expect.poll(() => frames.length).toBeGreaterThan(0);
  return { frames, async stop() { await cdp.send('Page.stopScreencast'); await cdp.detach(); } };
}

async function sequence(page: Page, frames: RecordedFrame[], at: number, interval: number, name: string, rect?: { x: number; y: number; width: number; height: number }) {
  const elapsed: number[] = [];
  const full: number[] = [];
  const stage: number[] = [];
  let previous: ReturnType<typeof readScreenshot> | undefined;
  for (let index = 0; index < 10; index++) {
    const time = at + index * interval;
    const visible = frames.findLast(frame => frame.at <= time);
    if (!visible) throw new Error(`Missing frame for ${name} at ${index * interval} ms`);
    const image = Buffer.from(visible.data, 'base64');
    await shot(page, 'LW-008', `${name}-${index}`, image);
    elapsed.push(Math.round(visible.at - at));
    const raster = readScreenshot(image);
    if (previous) {
      full.push(changedPixels(previous, raster));
      if (rect) stage.push(changedPixels(previous, raster, { x: rect.x, y: rect.y, w: rect.width, h: rect.height }));
    }
    previous = raster;
  }
  return { interval, elapsed, full, stage, rect };
}

for (const viewport of viewports) for (const view of ['miniature', 'illustrated'] as const) {
  test(`capture the ${view} opening in motion on ${viewport}`, async ({ page, browserName }, info) => {
    test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'Chromium viewport set per test');
    await page.setViewportSize(VIEWPORTS[viewport]);
    const miniature = view === 'miniature';
    const label = `LW-008-${viewport}${miniature ? '' : '-fallback'}`;
    await reachPress(page, view, 'full');
    await axe(page, '.first-order');
    await timeline(page, miniature);
    const pressStage = (await page.locator(miniature ? '.first-order-world__stage' : '.press-pull').boundingBox())!;
    const pressRecord = await recordFrames(page);
    try {
      await pull(page).press('Enter');
      await expect(page.getByRole('status')).toHaveText('Finn, Sam, and Yara left without booking.');
      if (miniature) {
        const tags = world(page).locator('.first-order-world__tag');
        await expect(tags).toHaveText(['Finn', 'Sam', 'Yara']);
        await expect.poll(() => tags.evaluateAll(nodes => nodes.every(node => Number(getComputedStyle(node).opacity) >= .7))).toBe(true);
      }
      await expect(lift(page)).toBeFocused({ timeout: 6000 });
      // The departure strip extends beyond the last walking frame to the lift.
      if (miniature) await page.waitForTimeout(800);
    } finally { await pressRecord.stop(); }

    await expect(page.locator('.clem-window')).toHaveAttribute('data-backdrop', 'ready');
    await axe(page, '.first-order');
    await hang(page).focus();
    const windowRecord = await recordFrames(page);
    try {
      await hang(page).press('Enter');
      await expect(windowHeading(page)).toBeFocused();
      await page.waitForTimeout(1500);
    } finally { await windowRecord.stop(); }

    const marks = await page.evaluate(() => (window as Window & { lwM1Marks?: EventTimes }).lwM1Marks);
    expect(marks?.pull).toBeDefined();
    expect(marks?.push).toBeDefined();
    if (miniature) expect(marks?.leave).toBeDefined();
    const turn = await sequence(page, pressRecord.frames, marks!.pull!, 70, `${label}-pull`, pressStage);
    const windowStage = (await page.locator(miniature ? '.first-order-world__stage' : '.clem-window').boundingBox())!;
    const approach = await sequence(page, windowRecord.frames, marks!.push!, 100, `${label}-push`, windowStage);
    const departures = miniature ? await sequence(page, pressRecord.frames, marks!.leave!, 300, `${label}-leave`, pressStage) : undefined;
    const frames = await frameDeltas(page, async () => {}, 1000);
    assertFrameBudget(frames);
    expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    await axe(page, '.first-order');
    const receipt = JSON.stringify({ viewport, view, turn, approach, departures, frames });
    await writeFile(`test-results/design-pack/LW-008/${label}-timeline.json`, receipt + '\n');
    await info.attach('motion-sequences', { body: receipt, contentType: 'application/json' });
    console.info('M1 comparison', { viewport, view, turn, approach });
    // Compare the visible stage across each strip. Keep the full viewport
    // counts in the receipt for comparison with the original captures.
    expect.soft(turn.stage.filter(ratio => ratio > .02).length, 'Adjacent Pull frames with >2% changed stage pixels').toBeGreaterThanOrEqual(6);
    expect.soft(approach.stage.filter(ratio => ratio > .02).length, 'Distinct adjacent push-in frames').toBeGreaterThanOrEqual(7);
  });
}

for (const view of ['miniature', 'illustrated'] as const) {
  test(`capture the reduced-motion ${view} opening on iPhone`, async ({ page, browserName }, info) => {
    test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'Chromium viewport set per test');
    await page.setViewportSize(VIEWPORTS.iphone);
    await reachPress(page, view, 'reduce');
    const label = `LW-008-iphone-${view}-reduced`;
    await pull(page).press('Enter');
    await expect(lift(page)).toBeFocused({ timeout: 2000 });
    await shot(page, 'LW-008', `${label}-lift`);
    await axe(page, '.first-order');
    await hang(page).press('Enter');
    await expect(windowHeading(page)).toBeFocused();
    if (view === 'miniature') {
      await expect(world(page)).toHaveAttribute('data-world-shot', 'read');
      await expect(world(page)).toHaveAttribute('data-world-hung', /^delivered:/);
      await expect(world(page)).toHaveAttribute('data-world-phase', 'idle');
    } else {
      await expect(page.locator('.clem-window__stage')).toHaveAttribute('data-framing', 'read');
    }
    await shot(page, 'LW-008', `${label}-window`);
    await axe(page, '.first-order');
  });
}
