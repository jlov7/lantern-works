import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const headline = 'The last set is ours';
const shell = (page: Page) => page.locator('main.clem-commission');
const titleIn = (page: Page, region: string) => page.locator(`${region} .designed-artwork__title`);
const proofIn = (page: Page, region: string) => page.locator(`${region} svg.designed-artwork__print`);

async function printArtwork(page: Page, region: string) {
  return proofIn(page, region).evaluate(print => ({
    paper: print.getAttribute('style'),
    palette: print.getAttribute('data-palette'),
    layout: print.getAttribute('data-layout'),
    typeface: print.getAttribute('data-typeface'),
    treatment: print.getAttribute('data-treatment'),
    artwork: print.innerHTML.replace(/grain-[\w-]+/g, 'grain'),
  }));
}

test('a real anniversary commission takes the approved paper from proof to Clem’s glass', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Play Clem’s commission' }).click();
  await expect(page.getByRole('heading', { name: 'Ten years of Clem' })).toBeVisible();
  await page.getByRole('button', { name: 'Poppy & cream' }).click();
  await page.getByRole('textbox', { name: 'A line of your own' }).fill(headline);
  await expect(titleIn(page, '.clem-bench')).toContainText(headline);
  await page.getByRole('button', { name: 'Review the promise' }).click();
  await expect(page.getByRole('heading', { name: 'Make your promise' })).toBeFocused();
  await expect(shell(page).locator('.clem-terms')).toContainText('1,200 cr');
  await expect(shell(page).locator('.clem-terms')).toContainText('150 cr');
  await expect(shell(page).locator('.clem-terms')).toContainText('Day 5');
  await page.getByRole('button', { name: 'Book the commission' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'At the press' })).toBeVisible();
  await expect(titleIn(page, '.clem-bench')).toContainText(headline);
  await page.getByRole('button', { name: 'Run the press' }).click();
  const lift = page.getByRole('button', { name: 'Lift Clem’s print' });
  await expect(lift).toHaveAccessibleDescription(new RegExp(headline));
  await lift.focus();
  await page.keyboard.press('Enter');
  await expect(shell(page).locator('.print-lift')).toHaveAttribute('data-lifted', 'true');
  await expect(titleIn(page, '.print-lift__master')).toContainText(headline);
  await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
  const windowPrint = shell(page).locator('.clem-window-print');
  await expect(windowPrint.locator('svg.designed-artwork__print')).toHaveAttribute('data-palette', 'poppy');
  await expect(titleIn(page, '.clem-window-print')).toContainText(headline);
  await expect(shell(page)).toContainText('delivered Day 4');
  await page.reload();
  await expect(titleIn(page, '.clem-window-print')).toContainText(headline);
  await page.getByRole('button', { name: 'Make another version' }).click();
  await expect(page.getByRole('textbox', { name: 'A line of your own' })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('Clem’s photograph, edits and controls survive the Duo’s short and unfolded layouts', async ({ page }) => {
  await page.setViewportSize({ width: 382, height: 580 });
  await page.goto('/?commission=clem');
  await page.getByRole('radio', { name: /The first night/ }).check();
  await page.getByRole('textbox', { name: 'A line of your own' }).fill('The first night, again');
  await page.setViewportSize({ width: 951, height: 585 });
  await expect(page.getByRole('radio', { name: /The first night/ })).toBeChecked();
  await page.getByRole('button', { name: 'Review the promise' }).click();
  await expect(shell(page).locator('.clem-terms')).toContainText('0 cr');
  await expect(shell(page).locator('.clem-terms')).toContainText('120 min');
  await page.setViewportSize({ width: 594, height: 368 });
  await page.getByRole('button', { name: 'Book the commission' }).click();
  await page.setViewportSize({ width: 669, height: 867 });
  await page.getByRole('button', { name: 'Run the press' }).click();
  await page.setViewportSize({ width: 385, height: 571 });
  await page.getByRole('button', { name: 'Lift Clem’s print' }).click();
  await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
  await expect(titleIn(page, '.clem-window-print')).toContainText('The first night, again');
  await expect(shell(page).locator('.clem-window-print svg.designed-artwork__print'))
    .toHaveAccessibleName(/Anniversary photograph.*The first-night photograph/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(385);
});

test.describe('the storefront artwork on a cold connection', () => {
  test.use({ serviceWorkers: 'block' });

  test('booking starts the storefront image and delivery has a readable fallback before it decodes', async ({ page }) => {
    let releaseImage = () => {};
    const gate = new Promise<void>(resolve => { releaseImage = resolve; });
    await page.route('**/assets/jazz-*.webp', async route => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/?commission=clem');
      await page.getByRole('button', { name: 'Review the promise' }).click();
      const warm = page.waitForRequest('**/assets/jazz-*.webp');
      await page.getByRole('button', { name: 'Book the commission' }).click();
      await warm;
      await page.getByRole('button', { name: 'Run the press' }).click();
      await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
      const storefront = page.locator('.clem-window');
      await expect(storefront).toHaveAttribute('data-backdrop', 'pending');
      await expect(proofIn(page, '.clem-window-print')).toBeVisible();
      releaseImage();
      await expect(storefront).toHaveAttribute('data-backdrop', 'ready');
    } finally {
      releaseImage();
    }
  });
});

for (const route of [
  { name: 'first-night photograph', headline: 'The room where we began', artifact: /Anniversary photograph/, reaction: 'It still looks like us.' },
  { name: 'new-band poster', headline: 'The next set starts here', artifact: /Anniversary poster/, reaction: 'That’s where we start.' },
]) {
  test(`the ${route.name} survives offline reloads from booking to window`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 951, height: 585 });
    await page.goto('/?commission=clem');
    if (route.name === 'first-night photograph') {
      await page.getByRole('radio', { name: /The first night/ }).check();
    }
    await page.getByRole('button', { name: 'Poppy & cream' }).click();
    await page.getByRole('textbox', { name: 'A line of your own' }).fill(route.headline);
    await expect(titleIn(page, '.clem-proof')).toContainText(route.headline);
    const approvedPrint = await printArtwork(page, '.clem-proof');
    await page.getByRole('button', { name: 'Review the promise' }).click();
    await page.getByRole('button', { name: 'Book the commission' }).click();
    await expect(shell(page)).toHaveAttribute('data-step', 'press');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.setViewportSize({ width: 382, height: 580 });
    await page.reload();
    await expect(shell(page)).toHaveAttribute('data-step', 'press');
    expect(await printArtwork(page, '.clem-proof')).toEqual(approvedPrint);
    await page.getByRole('button', { name: 'Run the press' }).click();
    await expect(shell(page)).toHaveAttribute('data-step', 'lift');
    await page.setViewportSize({ width: 951, height: 585 });
    await page.reload();
    await page.getByRole('button', { name: 'Lift Clem’s print' }).tap();
    await expect(shell(page).locator('.print-lift')).toHaveAttribute('data-lifted', 'true');
    expect(await printArtwork(page, '.print-lift__master')).toEqual(approvedPrint);
    await page.getByRole('button', { name: 'Hang it in Clem’s window' }).click();
    await page.setViewportSize({ width: 382, height: 580 });
    await page.reload();
    await expect(shell(page)).toHaveAttribute('data-step', 'window');
    await expect(proofIn(page, '.clem-window-print')).toHaveAccessibleName(route.artifact);
    await expect(shell(page)).toContainText(route.reaction);
    await expect(shell(page)).toContainText('delivered Day 4');
    await expect.poll(() => page.locator('.clem-window img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await printArtwork(page, '.clem-window-print')).toEqual(approvedPrint);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(382);
    expect(errors).toEqual([]);
  });
}
