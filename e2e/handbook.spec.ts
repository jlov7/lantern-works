import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';

test('the title handbook supports keyboard reading and returns focus', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.how > summary').click();
  const button = page.getByRole('button', { name: 'Studio handbook', exact: true });
  await button.focus();
  await button.press('Enter');
  const handbook = page.getByRole('dialog', { name: 'Studio handbook', exact: true });
  await expect(handbook.getByRole('heading', { name: 'Studio handbook', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(handbook.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  const saves = handbook.locator('summary').filter({ hasText: 'Keeping your seasons' });
  await saves.focus();
  await saves.press('Enter');
  await expect(handbook.getByText(/Storage can fill up or be blocked/)).toBeVisible();
  await expect(handbook.getByText(/A postcard is a picture, not a replay backup/)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.handbook').analyze()).violations).toEqual([]);
  expect(await handbook.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `scratch/handbook/after-title-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(handbook).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.getByRole('button', { name: 'First season: Main Street (guided)' })).toBeVisible();
});

test('Settings keeps the season and both focus return paths while reading help', async ({ page }, info) => {
  await page.goto('/#play=main-street:handbook-check');
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible()) await more.click();
  const settingsButton = page.getByRole('button', { name: /^Settings/ });
  await settingsButton.click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const button = settings.getByRole('button', { name: 'Studio handbook', exact: true });
  await button.click();
  const handbook = page.getByRole('dialog', { name: 'Studio handbook', exact: true });
  await expect(handbook).toBeVisible();
  await handbook.getByText('Playing offline', { exact: true }).click();
  await expect(handbook.getByText(/The in-game AI desk is simulated/)).toBeVisible();
  await expect(handbook.getByText(/never required to play/)).toBeVisible();
  await handbook.getByText('A quieter, lighter studio', { exact: true }).click();
  await expect(handbook.getByText(/Both views show the same season and choices/)).toBeVisible();
  await handbook.locator('.handbook-colophon').scrollIntoViewIfNeeded();
  await expect(handbook.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  expect(await handbook.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await handbook.evaluate(el => getComputedStyle(el).animationDuration)).toBe('0s');
  await page.screenshot({ path: `scratch/handbook/after-settings-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(handbook).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(settings).toBeVisible();
  await button.click();
  await handbook.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(button).toBeFocused();
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settingsButton).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
});

test.describe('handbook loading', () => {
  test.use({ serviceWorkers: 'block' });
  test('a missing help chunk leaves saves intact and recovers in a fresh browser tab', async ({ page, context }, info) => {
    await context.route(/\/assets\/StudioHandbook-.*\.js$/, route => route.fulfill({ status: 503, contentType: 'text/javascript', headers: { 'cache-control': 'no-store' }, body: 'Temporarily unavailable' }));
    await page.goto('/');
    await page.evaluate(rules => localStorage.setItem('lantern.runs.v1', JSON.stringify([{
      v: 1, rules, id: 'handbook-recovery', label: 'Handbook recovery season', savedAt: '2026-10-29T12:00:00Z', config: { scenarioId: 'main-street', seed: 'handbook-recovery' }, commands: [{ type: 'pace', pace: 'careful' }],
    }])), RULES.version);
    await page.reload();
    const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
    await page.locator('.how > summary').click();
    const button = page.getByRole('button', { name: 'Studio handbook', exact: true });
    await button.click();
    await expect(page.getByRole('status')).toHaveText('The handbook could not load. Reconnect, then open a fresh tab using your browser’s controls and paste this address. It opens the title with this browser’s saved seasons. Only saved moves carry over.');
    await expect(page.getByRole('button', { name: 'Continue Handbook recovery season', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.screenshot({ path: `scratch/handbook/reload-recovery-${info.project.name}.png` });
    await context.unroute(/\/assets\/StudioHandbook-.*\.js$/);
    const address = page.getByRole('textbox', { name: 'Game address', exact: true });
    await address.focus();
    expect(await address.evaluate(input => { const field = input as HTMLInputElement; return field.readOnly && field.selectionStart === 0 && field.selectionEnd === field.value.length; })).toBe(true);
    const reopened = await context.newPage();
    await reopened.goto(await address.inputValue());
    await reopened.locator('.how > summary').click();
    await reopened.getByRole('button', { name: 'Studio handbook', exact: true }).click();
    await expect(reopened.getByRole('dialog', { name: 'Studio handbook', exact: true })).toBeVisible();
    expect(await reopened.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
  });
});
