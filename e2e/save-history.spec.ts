import { expect, test, type Page } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { encodeShare } from '../src/ui/persist';
import type { SavedRun } from '../src/ui/schema';

const KEY = 'lantern.runs.v1';
const histories: SavedRun[] = Array.from({ length: 20 }, (_, n) => ({
  v: 1, rules: n === 19 ? LEGACY_RULES_VERSION : RULES.version,
  id: `history-${n}`, label: `Saved history ${n}`, savedAt: '2026-10-28T00:00:00Z',
  config: { scenarioId: 'main-street', seed: `history-${n}` }, commands: [{ type: 'pace', pace: 'careful' }],
}));
const unsupported = { ...histories[0], id: 'unsupported', label: 'Future season', rules: 'future-rules', extra: { untouched: true } };
const unreadable = { rules: RULES.version, commands: 'unreadable' };
const finished: SavedRun = { ...histories[0]!, commands: Array.from({ length: RULES.days }, () => ({ type: 'runDay' })) };
const stored = (page: Page): Promise<unknown[]> => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), KEY);
const saves = async (page: Page) => (await stored(page)).filter((value): value is SavedRun => !!value && typeof value === 'object' && 'id' in value && value.id !== 'unsupported');

async function seed(page: Page, runs: unknown[] = [...histories, unsupported, unreadable]) {
  await page.goto('/');
  await page.evaluate(runs => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify(runs));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
  }, runs);
  await page.reload();
}

async function reveal(page: Page, label: string) {
  const button = page.getByRole('button', { name: `Continue ${label}`, exact: true });
  for (let n = 0; n < 4 && !await button.count(); n++) await page.getByRole('button', { name: /^Show more seasons/ }).click();
  await expect(button).toBeVisible();
  return button;
}

test('the twenty-first history is retained and every saved history reopens through paged rows', async ({ page }, info) => {
  await seed(page);
  await expect(page.locator('.saved-row:not(.is-older)')).toHaveCount(8);
  const more = page.getByRole('button', { name: 'Show more seasons (12 remaining)', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: `Continue ${histories[8]!.label}`, exact: true })).toBeFocused();
  await expect(page.locator('.saved-row:not(.is-older)')).toHaveCount(16);
  await page.goto('/#play=main-street:twenty-first');
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  await expect.poll(async () => (await saves(page)).length).toBe(21);
  const created = (await saves(page)).find(run => run.config.seed === 'twenty-first')!;
  const expected = [...histories, created];
  await page.reload();
  for (const history of expected) {
    await (await reveal(page, history.label)).click();
    await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
    const actual = (await saves(page)).find(run => run.id === history.id)!;
    expect(actual.config).toEqual(history.config);
    expect(actual.commands).toEqual(history.commands);
    expect(actual.rules).toBe(history.rules);
    expect(replay(actual.config, actual.commands, actual.rules).errors).toEqual([]);
    await page.getByRole('button', { name: 'Lantern Works: back to the street map', exact: true }).click();
  }
  const raw = await stored(page);
  expect(raw).toHaveLength(23);
  expect(raw).toContainEqual(unsupported);
  expect(raw).toContainEqual(unreadable);
  await (await reveal(page, histories[19]!.label)).focus();
  await page.locator('.saved').screenshot({ path: info.outputPath('all-retained-seasons.png') });
});

for (const path of ['continuation', 'branch', 'challenge import', 'shared replay'] as const) test(`${path} preserves twenty existing histories`, async ({ page }) => {
  await seed(page, [finished, ...histories.slice(1), unsupported, unreadable]);
  if (path === 'challenge import') {
    const code = await encodeShare({ scenarioId: 'main-street', seed: 'imported-studio' }, [], 'Imported studio');
    await page.goto(`/#start=${code}`);
  } else if (path === 'shared replay') {
    await page.goto(`/#s=${await encodeShare(finished.config, finished.commands, 'Imported replay')}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/./);
    await page.getByRole('button', { name: 'Try a branch from their season', exact: true }).click();
    expect(await saves(page)).toHaveLength(20);
    await page.locator('.rewind-day').first().click();
  } else {
    await page.getByRole('button', { name: `Look back at ${finished.label}`, exact: true }).click();
    if (path === 'continuation') {
      await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'A new season for your studio', exact: true });
      await dialog.getByRole('button', { name: 'Open season 2', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Try a branch', exact: true }).click();
      await page.locator('.rewind-day').first().click();
    }
  }
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  await expect.poll(async () => (await saves(page)).length).toBe(21);
  const raw = await stored(page);
  for (const history of [finished, ...histories.slice(1), unsupported, unreadable]) expect(raw).toContainEqual(history);
  const next = (await saves(page)).find(run => !histories.some(history => history.id === run.id))!;
  expect(replay(next.config, next.commands, next.rules).errors).toEqual([]);
  await page.reload();
  await (await reveal(page, next.label)).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
});

test('delete Undo preserves a later row and a failed delete reports the retained save', async ({ page }) => {
  await seed(page);
  const target = histories[19]!;
  await reveal(page, target.label);
  const before = await stored(page);
  await page.getByRole('button', { name: `Delete ${target.label}`, exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: `Continue ${target.label}`, exact: true })).toBeFocused();
  expect(await stored(page)).toEqual(before);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lantern.runs.v1') throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: `Delete ${target.label}`, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(`Could not delete ${target.label}. The saved season is still in this browser.`, { timeout: 9000 });
  expect(await stored(page)).toEqual(before);
  await expect(page.getByRole('button', { name: `Continue ${target.label}`, exact: true })).toBeVisible();
});

test('quota failure on a new history keeps all twenty previous histories intact', async ({ page }) => {
  await seed(page);
  const before = await stored(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lantern.runs.v1') throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.goto('/#play=main-street:quota');
  await expect(page.getByText('This browser could not save your latest moves. Previously saved seasons remain stored.', { exact: false })).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await page.reload();
  await (await reveal(page, histories[19]!.label)).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
});

test('another tab saving during delete Undo keeps its newer history', async ({ page, context }) => {
  await seed(page);
  await page.getByRole('button', { name: `Delete ${histories[0]!.label}`, exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
  const next = { ...histories[0]!, commands: [...histories[0]!.commands, { type: 'pace' as const, pace: 'steady' as const }] };
  await other.evaluate(next => {
    const runs = JSON.parse(localStorage.getItem('lantern.runs.v1')!);
    localStorage.setItem('lantern.runs.v1', JSON.stringify([next, ...runs.filter((run: { id: string }) => run.id !== next.id)]));
  }, next);
  await expect(page.getByRole('alert')).toContainText('It may have changed in another tab', { timeout: 9000 });
  expect(await stored(page)).toContainEqual(next);
  expect(await saves(page)).toHaveLength(20);
  await other.close();
});

test('every retained older-version row is reachable without deleting newer seasons', async ({ page }) => {
  const older = Array.from({ length: 10 }, (_, n) => ({ ...unsupported, id: `older-${n}`, label: `Older history ${n}` }));
  await seed(page, [...histories, ...older, unreadable]);
  await expect(page.locator('.saved-row.is-older')).toHaveCount(8);
  await page.getByRole('button', { name: 'Show more older seasons (2 remaining)', exact: true }).click();
  await expect(page.locator('.saved-row.is-older')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Play the same street fresh: Older history 8', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play the same street fresh: Older history 9', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual([...histories, ...older, unreadable]);
});

test('a failed storage read during deletion still displays why the season was kept', async ({ page }) => {
  await seed(page, histories);
  const before = await stored(page);
  await page.getByRole('button', { name: `Delete ${histories[0]!.label}`, exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'lantern.runs.v1') throw new DOMException('blocked', 'SecurityError');
      return original.call(this, key);
    };
  });
  await expect(page.getByRole('alert')).toContainText('The saved season is still in this browser.', { timeout: 9000 });
  await page.reload();
  expect(await stored(page)).toEqual(before);
});
