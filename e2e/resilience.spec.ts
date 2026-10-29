import { expect, test, type Page } from '@playwright/test';

const STREET = '/#play=main-street:e2e-1';

async function captureClipboard(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { copied: string }).copied = '';
    navigator.clipboard.writeText = async (t: string) => {
      (window as unknown as { copied: string }).copied = t;
    };
  });
}

test('a render error shows the recovery screen, and the report copies locally', async ({ page }) => {
  // The title screen formats today's date while rendering; make that throw.
  await page.addInitScript(() => {
    Date.prototype.toLocaleDateString = () => {
      throw new TypeError('forced render failure');
    };
  });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Something broke.' })).toBeVisible();
  await expect(page.getByText('Reload, or copy a diagnostic report.')).toBeVisible();
  await expect(page.getByText(/If saving failed, reloading may lose recent moves/)).toBeVisible();

  await captureClipboard(page);
  const before = requests.length;
  await page.getByRole('button', { name: 'Copy diagnostic report' }).click();
  await expect(page.getByRole('status')).toContainText('Report copied');
  const report = JSON.parse(await page.evaluate(() => (window as unknown as { copied: string }).copied));
  expect(report).toMatchObject({ rulesVersion: expect.stringMatching(/^lantern-/), message: 'TypeError: forced render failure' });
  expect(Object.keys(report).sort()).toEqual(['message', 'rulesVersion', 'stack', 'tapeVersion', 'time', 'userAgent']);
  expect(requests.length).toBe(before);
});

test('an error thrown outside React also reaches the recovery screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('late failure');
    });
  });
  await expect(page.getByRole('heading', { name: 'Something broke.' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
});

test('the Back button returns to the title, and the run is still there to resume', async ({ page }) => {
  await page.goto('/');
  await page.goto(STREET);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await page.getByRole('button', { name: 'Take it' }).first().click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]').length);
  expect(saved).toBe(1);
});
