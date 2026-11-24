import { expect, test, type Locator } from '@playwright/test';
import { renderedFontPx } from '../src/ui/game/printScale';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

const headline = 'The late set brings a little more brass to Main Street this year';

async function smallestPrintedText(proof: Locator): Promise<number> {
  const { width, sizes } = await proof.evaluate((svg: SVGSVGElement) => ({
    width: svg.getBoundingClientRect().width,
    sizes: [...svg.querySelectorAll('text')]
      .filter(text => text.ownerSVGElement === svg)
      .map(text => Number(text.getAttribute('font-size'))),
  }));
  expect(sizes.length).toBeGreaterThan(0);
  return Math.min(...sizes.map(size => renderedFontPx(width, size)));
}

test('the editable proof is legible and keeps booking reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport set per test');

  for (const viewport of ['iphone', 'duo-outer', 'ipad', 'desktop'] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await page.goto('/?opening=first-order');
      await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
      await expect(page.getByRole('heading', { name: 'The late set', exact: true })).toBeFocused();
      const book = page.getByRole('button', { name: 'Book for 900 cr', exact: true });
      const proof = page.locator('.clem-proof svg.designed-artwork__print');
      const min = viewport === 'duo-outer' ? 7 : viewport === 'iphone' ? 9 : undefined;
      await expect(book).toBeInViewport({ ratio: 1 });

      for (const state of ['design', 'design-long-headline'] as const) {
        if (state === 'design-long-headline') {
          const headlineEditor = page.getByText('Add a headline', { exact: true });
          await headlineEditor.press('Enter');
          await expect(headlineEditor).toBeFocused();
          await expect(headlineEditor).toHaveCSS('outline-width', '2px');
          await page.keyboard.press('Tab');
          const input = page.getByRole('textbox', { name: 'A line of your own' });
          await expect(input).toBeFocused();
          await page.keyboard.insertText(headline);
          await expect(input).toHaveValue(headline);
          await expect(proof).toHaveAccessibleName(new RegExp(headline));
        }

        await page.evaluate(() => document.fonts.ready);
        if (min !== undefined) {
          const font = await smallestPrintedText(proof);
          expect(font, `${viewport} ${state} smallest printed type (CSS px)`).toBeGreaterThanOrEqual(min);
          await testInfo.attach(`${viewport}-${state}-type`, { body: String(font), contentType: 'text/plain' });
          await expect(proof).toBeInViewport({ ratio: 1 });
          await expect(book).toBeInViewport({ ratio: 1 });
        }
        const fitsBench = await proof.evaluate(svg => {
          const paper = svg.getBoundingClientRect();
          const bench = svg.closest('.clem-bench')!.getBoundingClientRect();
          return paper.top >= bench.top - 1 && paper.bottom <= bench.bottom + 1;
        });
        expect(fitsBench).toBe(true);

        await shot(page, 'LW-003', `LW-003-${viewport}-${state}`);
        const frames = await frameDeltas(page, async () => {}, 1000);
        await testInfo.attach(`${viewport}-${state}-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
        assertFrameBudget(frames);
        expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
        await axe(page, '.first-order');
      }

      await page.evaluate(() => sessionStorage.removeItem('lantern.first-order.v1'));
    });
  }
});
