import { expect, test, type Page } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import type { SavedRun } from '../src/ui/schema';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const events: string[] = [];
    (window as unknown as { replayedDialogCloses: string[] }).replayedDialogCloses = events;
    document.addEventListener('close', event => {
      if (event.target instanceof HTMLDialogElement && event.target.open) events.push(event.target.querySelector('h2')?.textContent ?? '');
    }, true);
  });
});

async function expectReplayedClose(page: Page, title: string) {
  // The development entry enables StrictMode's setup, cleanup, setup cycle.
  await expect(page.locator('script[src$="/@vite/client"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(title => (window as unknown as { replayedDialogCloses: string[] }).replayedDialogCloses.includes(title), title)).toBe(true);
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  return dialog;
}

test('the title handbook survives effect replay and restores focus for every close path', async ({ page }) => {
  await page.goto('/');
  await page.locator('.how > summary').click();
  const button = page.getByRole('button', { name: 'Studio handbook', exact: true });
  await button.focus();
  await button.press('Enter');
  const dialog = await expectReplayedClose(page, 'Studio handbook');
  await dialog.getByText('Playing offline', { exact: true }).click();
  await expect(dialog.getByText(/The in-game AI desk is simulated/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.press('Enter');
  await expectReplayedClose(page, 'Studio handbook');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.press('Enter');
  await expectReplayedClose(page, 'Studio handbook');
  await dialog.evaluate(element => (element as HTMLDialogElement).close());
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('Settings and its nested handbook survive effect replay without closing each other', async ({ page }) => {
  await page.goto('/#play=main-street:development-dialogs');
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible()) await more.click();
  const button = page.getByRole('button', { name: /^Settings/ });
  await button.click();
  const settings = await expectReplayedClose(page, 'Settings');
  const help = settings.getByRole('button', { name: 'Studio handbook', exact: true });
  await help.click();
  const handbook = await expectReplayedClose(page, 'Studio handbook');
  await page.keyboard.press('Escape');
  await expect(handbook).toHaveCount(0);
  await expect(help).toBeFocused();
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
});

test('the replay window stays open through effect replay and asynchronous link creation', async ({ page }) => {
  const run: SavedRun = { v: 1, rules: RULES.version, id: 'development-replay', label: 'Development replay', savedAt: '2026-10-29T12:00:00Z', config: { scenarioId: 'main-street', seed: 'development-dialogs' }, commands: [] };
  await page.addInitScript(run => localStorage.setItem('lantern.runs.v1', JSON.stringify([run])), run);
  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  const button = page.getByRole('button', { name: `Keep replay of ${run.label}`, exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press('Enter');
  const dialog = await expectReplayedClose(page, 'Keep a replay');
  await expect(dialog.getByRole('textbox', { name: 'Complete replay link' })).toHaveValue(/^http.*#s=/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.press('Enter');
  await expectReplayedClose(page, 'Keep a replay');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
});
