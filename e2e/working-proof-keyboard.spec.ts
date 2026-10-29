import { expect, test, webkit } from '@playwright/test';

test('WebKit scrolls the enlarged working proof with the keyboard and retains the draft', async ({ baseURL }, info) => {
  const browser = await webkit.launch();
  try {
    const phone = info.project.name === 'phone';
    const context = await browser.newContext({ baseURL, viewport: info.project.use.viewport, reducedMotion: 'reduce', isMobile: phone, hasTouch: phone });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true }).click();
    const first = page.locator('.first-proof');
    await first.locator('summary').click();
    await first.getByRole('textbox').fill('The last tune is for the room');
    const saved = () => page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
    const before = await saved();
    const opener = first.getByRole('button', { name: 'Inspect working proof', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Your working proof', exact: true });
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const region = dialog.getByRole('region', { name: 'Working proof', exact: true });
    await region.focus();
    await expect(region).toBeFocused();
    await region.press('ArrowDown');
    await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await region.press('ArrowRight');
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await region.press('Home');
    await expect.poll(() => region.evaluate(element => element.scrollTop)).toBe(0);
    await region.press('End');
    const bottom = await region.evaluate(element => element.scrollTop);
    expect(bottom).toBeGreaterThan(0);
    await region.press('PageUp');
    await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeLessThan(bottom);
    await region.press('PageDown');
    await expect.poll(() => region.evaluate(element => element.scrollTop)).toBe(bottom);
    await dialog.screenshot({ path: info.outputPath('webkit-keyboard-proof.png') });
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await expect(first.getByRole('textbox')).toHaveValue('The last tune is for the room');
    expect(await saved()).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await browser.close();
  }
});
