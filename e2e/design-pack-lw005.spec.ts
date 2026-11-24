import { expect, test, type Page } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

const portraitUrl = /\/assets\/clem-[^/]+\.webp$/;
const portrait = (page: Page) => page.locator('.first-order-client img');

async function openProof(page: Page) {
  await page.goto('/?opening=first-order');
  const meet = page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
  await expect(meet).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Lantern Works', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Sound', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(meet).toBeFocused();
  await expect(meet).toHaveCSS('outline-width', '2px');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'The late set', exact: true })).toBeFocused();
}

test.use({ serviceWorkers: 'block' });

test('Clem appears beside his brief at each review viewport', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');
  const response = await request.get('/asset-manifest.json');
  const { files } = await response.json() as { files: string[] };
  expect(files.filter(file => portraitUrl.test(`/${file}`))).toHaveLength(1);

  for (const [viewport, size] of [['iphone', 56], ['ipad', 72], ['desktop', 72], ['duo-outer', 44]] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await openProof(page);
      const image = portrait(page);
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('alt', '');
      await image.evaluate((node: HTMLImageElement) => node.decode());
      await expect(image).toHaveCSS('width', `${size}px`);
      await expect(image).toHaveCSS('height', `${size}px`);
      await expect(image).toHaveCSS('object-position', '50% 22%');
      await expect(page.locator('.first-order-client figcaption')).toHaveText('“One trio, after the doors open.” Clem');
      await expect(page.getByRole('button', { name: 'Book for 900 cr', exact: true })).toBeInViewport({ ratio: 1 });
      if (viewport === 'duo-outer') {
        const options = page.locator('.first-order-editions label');
        await expect(options).toHaveCount(2);
        for (const option of await options.all()) await expect(option).toBeInViewport({ ratio: 1 });
      }
      await shot(page, 'LW-005', `LW-005-${viewport}-design`);
      const frames = await frameDeltas(page, async () => {}, 1000);
      await testInfo.attach(`${viewport}-design-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
      await axe(page, '.first-order');
      await page.evaluate(() => sessionStorage.removeItem('lantern.first-order.v1'));
    });
  }
});

type LayoutShift = PerformanceEntry & { value: number; sources: { node: Node | null }[] };
type PortraitMetrics = Window & { __portraitShifts?: () => number };

test('decoding Clem’s portrait leaves its reserved space in place', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');
  await page.setViewportSize(VIEWPORTS.iphone);
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(portraitUrl, async route => {
    await pending;
    await route.continue();
  });

  try {
    await openProof(page);
    await page.evaluate(() => document.fonts.ready);
    const image = portrait(page);
    const client = page.locator('.first-order-client');
    const before = await client.boundingBox();
    expect(before).not.toBeNull();
    await expect(image).toHaveJSProperty('complete', false);
    await client.evaluate(element => {
      let shift = 0;
      const record = (entries: PerformanceEntry[]) => {
        for (const entry of entries as LayoutShift[]) {
          if (entry.sources.some(({ node }) => node && element.contains(node))) shift += entry.value;
        }
      };
      const observer = new PerformanceObserver(list => record(list.getEntries()));
      observer.observe({ type: 'layout-shift' });
      (window as PortraitMetrics).__portraitShifts = () => {
        record(observer.takeRecords());
        observer.disconnect();
        return shift;
      };
    });
    release();
    await image.evaluate((node: HTMLImageElement) => node.decode());
    await expect.poll(() => client.boundingBox()).toEqual(before);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => (window as PortraitMetrics).__portraitShifts?.())).toBe(0);
  } finally {
    release();
  }
});

test('the brief remains when Clem’s portrait fails to load', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');
  await page.route(portraitUrl, route => route.abort());
  await openProof(page);
  await expect(portrait(page)).toHaveAttribute('hidden', '');
  await expect(page.locator('.first-order-client figcaption')).toHaveText('“One trio, after the doors open.” Clem');
  await expect(page.getByRole('button', { name: 'Book for 900 cr', exact: true })).toBeVisible();
});
