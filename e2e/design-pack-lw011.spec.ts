import { expect, test, type Locator, type Page } from '@playwright/test';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

const viewports = { ...VIEWPORTS, 'sim-17': { width: 402, height: 714 } };
const capture = new Set(['iphone', 'duo-outer', 'ipad', 'desktop']);
const headline = 'The Thursday Night Ellington Repertory plays one final encore now'.slice(0, 64);

const action = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function reach(page: Page, primary: Locator, required: boolean) {
  await expect(primary).toBeVisible();
  const viewport = await primary.evaluate(control => {
    const rect = control.getBoundingClientRect();
    return rect.top + scrollY >= -.5 && rect.bottom + scrollY <= innerHeight + .5 && rect.left >= -.5 && rect.right <= innerWidth + .5;
  });
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (required) {
    expect(viewport, 'The primary action fits from the top of the page').toBe(true);
    await expect(primary).toBeInViewport({ ratio: 1 });
  }
  return viewport;
}

for (const [name, size] of Object.entries(viewports)) {
  test(`the opening keeps its main actions within ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per case');
    await page.setViewportSize(size);
    await page.addInitScript(() => localStorage.setItem('lantern.prefs.v1',
      JSON.stringify({ studioView: 'illustrated', motion: 'reduce', sound: false })));
    await page.goto('/?opening=first-order');
    const report: Record<string, boolean> = {};
    const ordinary = name !== 'duo-outer';
    const meet = action(page, 'Meet Clem at the jazz bar');
    report.street = await reach(page, meet, ordinary);
    await meet.press('Enter');

    const book = action(page, 'Book for 900 cr');
    await expect(page.getByRole('heading', { name: 'The late set' })).toBeFocused();
    report.design = await reach(page, book, true);
    await page.getByText('Add a headline', { exact: true }).press('Enter');
    const input = page.getByRole('textbox', { name: 'A line of your own', exact: true });
    await input.fill(headline);
    await expect(input).toHaveValue(headline);
    await page.getByText('Add a headline', { exact: true }).press('Enter');
    report.designLongHeadline = await reach(page, book, true);
    const proof = page.locator('.clem-proof .designed-artwork__print');
    const overflowing = await proof.evaluate((node: SVGSVGElement) => {
      const box = node.viewBox.baseVal;
      return [...node.querySelectorAll('text')].filter(text => {
        const bounds = text.getBBox();
        return bounds.x < box.x || bounds.x + bounds.width > box.x + box.width;
      }).map(text => text.textContent);
    });
    expect(overflowing).toEqual([]);
    if (capture.has(name)) {
      await axe(page, '.first-order');
      await shot(page, 'LW-011', `LW-011-${name}-design-long-headline`);
    }

    await book.press('Enter');
    const press = action(page, 'Run the press');
    report.press = await reach(page, press, ordinary);
    if (size.width <= 700 && size.height >= 760) {
      const height = (await page.locator('.clem-bench').boundingBox())!.height;
      expect(height).toBeCloseTo(Math.min(416, Math.max(224, size.height * .44)), 0);
    }
    if (capture.has(name)) {
      const frames = await frameDeltas(page, async () => {}, 1000);
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
      await info.attach('layout-frame-timing', { body: JSON.stringify(frames), contentType: 'application/json' });
      await axe(page, '.first-order');
      await shot(page, 'LW-011', `LW-011-${name}-press`);
    }

    await press.press('Enter');
    const lift = action(page, 'Lift Clem’s print');
    report.liftControl = await reach(page, lift, ordinary);
    await lift.press('Enter');
    const hang = action(page, 'Hang it in Clem’s window');
    report.lift = await reach(page, hang, ordinary);
    if (capture.has(name)) {
      await axe(page, '.first-order');
      await shot(page, 'LW-011', `LW-011-${name}-lift`);
    }
    await hang.press('Enter');
    report.window = await reach(page, action(page, 'Open the next morning'), ordinary);
    await info.attach('viewport-actions', { body: JSON.stringify(report), contentType: 'application/json' });
  });
}
