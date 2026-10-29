import { expect, test, type Page } from '@playwright/test';
import { encodeShare } from '../src/ui/persist';

const config = { scenarioId: 'main-street', seed: 'entry-origin' };

async function openEntry(page: Page, baseURL: string, path: string, hash: string) {
  const entry = new URL(baseURL);
  entry.pathname = path;
  entry.search = '?entry=local';
  entry.hash = hash;
  await page.goto(entry.href);
  await expect(page.getByRole('heading', { name: /^Lantern Works, Main Street, Day 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open the shop for Day 1/ })).toBeVisible();
  const clean = new URL(page.url());
  expect(clean.origin).toBe(entry.origin);
  expect(clean.pathname).toBe(path);
  expect(clean.search).toBe(entry.search);
  expect(clean.hash).toBe('');
}

for (const path of ['/', '//']) {
  test(`a challenge at ${path} keeps its origin and query while clearing the hash`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openEntry(page, baseURL!, path, `#play=${config.scenarioId}:${config.seed}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
    expect(saved.config).toEqual(config);
    expect(saved.commands).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`a shared replay at ${path} keeps its origin and query while clearing the hash`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openEntry(page, baseURL!, path, `#s=${await encodeShare(config, [], 'Entry replay')}`);
    expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBeNull();
    expect(errors).toEqual([]);
  });
}
