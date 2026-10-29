import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildContinuation } from '../src/engine/continuation';
import { PRESETS, RULES } from '../src/engine/rules';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, CompanyState, RunConfig } from '../src/engine/types';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { encodeShare } from '../src/ui/persist';
import { savedRunSchema, type SavedRun } from '../src/ui/schema';

function finish(rules: string): CompanyState {
  let state = createRun({ scenarioId: 'main-street', seed: 'recovery-finished' }, rules);
  for (let day = 0; day < RULES.days; day++) {
    for (const news of state.news.filter(news => news.choice === null)) state = applyCommand(state, { type: 'choose', newsId: news.id, option: 0 }).state;
    const result = applyCommand(state, { type: 'runDay' });
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  expect(state.finished).toBe(true);
  return state;
}

const completed = finish(RULES.version);
const continuation = buildContinuation(completed, [], 'recovery-continuation');
const originalSave = (state: CompanyState) => savedRunSchema.parse({
  v: 1, rules: state.rulesVersion, id: 'original-season', label: 'Season kept before recovery',
  savedAt: '2026-10-29T12:00:00Z', config: state.config, commands: state.commands,
});
const saves = (page: Page): Promise<SavedRun[]> => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'));
const snapshot = (page: Page) => page.evaluate(() => ['lantern.runs.v1', 'lantern.current.v1', 'lantern.stamps.v1'].map(key => localStorage.getItem(key)));

async function openReplay(page: Page, original: SavedRun) {
  await page.goto('/');
  await page.evaluate(original => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([original]));
    localStorage.setItem('lantern.current.v1', JSON.stringify(original.id));
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
    localStorage.setItem('lantern.guide.v1', 'seen');
  }, original);
  const before = await snapshot(page);
  await page.goto(`/#s=${await encodeShare(original.config, original.commands, original.label, original.rules)}`);
  await expect(page.getByRole('status').filter({ hasText: 'Replay preview.' })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  return before;
}

for (const [name, rules, config] of [
  ['current season', RULES.version, { scenarioId: 'main-street', seed: 'first-season' }],
  ['legacy season', LEGACY_RULES_VERSION, { scenarioId: 'main-street', seed: 'first-season' }],
  ['continuing studio', RULES.version, continuation],
] as const) test(`an unfinished ${name} only saves after an explicit copy and retains later moves`, async ({ page }, info) => {
  const commands: Command[] = [{ type: 'setMenu', offers: [{ ...PRESETS.bespoke, name: 'Recovered print' }] }];
  const result = replay(config, commands, rules);
  expect(result.errors).toEqual([]);
  const original = originalSave(result.state);
  const originalBytes = JSON.stringify(original);
  const before = await openReplay(page, original);
  const request = result.state.requests.find(request => request.status === 'waiting')!;
  await page.getByRole('button', { name: rules === LEGACY_RULES_VERSION ? 'Turn away' : 'Decline this request', exact: true }).click();
  await expect(page.getByText('You turned this one away.', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  const expected = [...commands, { type: 'decline', requestId: request.id } as const];
  const keep = page.getByRole('button', { name: 'Save a copy and continue', exact: true });
  expect((await new AxeBuilder({ page }).include('.banner-action').analyze()).violations).toEqual([]);
  expect((await keep.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('replay-preview.png') });
  await keep.focus();
  await keep.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Copy saved in this browser.' })).toBeVisible();
  const stored = await saves(page);
  expect(stored).toHaveLength(2);
  expect(JSON.stringify(stored.find(save => save.id === original.id))).toBe(originalBytes);
  const copy = stored.find(save => save.id !== original.id)!;
  expect(copy.id).toMatch(/^run-/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.current.v1')!))).toBe(copy.id);
  expect(copy.rules).toBe(rules);
  expect(copy.config).toEqual(config satisfies RunConfig);
  expect(copy.commands).toEqual(expected);
  expect(replay(copy.config, copy.commands, copy.rules)).toEqual(replay(config, expected, rules));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('recovered-copy.png') });
  await page.getByRole('button', { name: 'Undo reply', exact: true }).click();
  await expect.poll(async () => (await saves(page)).find(save => save.id === copy.id)?.commands).toEqual(commands);
  const afterUndo = (await saves(page)).find(save => save.id === copy.id)!;
  await page.reload();
  await page.getByRole('button', { name: `Continue ${copy.label}`, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Game places' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save a copy and continue', exact: true })).toHaveCount(0);
  expect((await saves(page)).find(save => save.id === copy.id)).toEqual(afterUndo);
  expect(JSON.stringify((await saves(page)).find(save => save.id === original.id))).toBe(originalBytes);
});

for (const rules of [RULES.version, LEGACY_RULES_VERSION]) test(`a finished replay keeps its exact ${rules} history as a separate copy`, async ({ page }, info) => {
  const state = rules === RULES.version ? completed : finish(rules);
  const original = originalSave(state);
  const originalBytes = JSON.stringify(original);
  await openReplay(page, original);
  expect((await new AxeBuilder({ page }).include('.shared-banner').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copy saved in this browser.' })).toBeVisible();
  const stored = await saves(page);
  expect(stored).toHaveLength(2);
  const copy = stored.find(save => save.id !== original.id)!;
  expect(JSON.stringify(stored.find(save => save.id === original.id))).toBe(originalBytes);
  expect(copy.id).toMatch(/^run-/);
  expect(copy.config).toEqual(original.config);
  expect(copy.rules).toBe(original.rules);
  expect(copy.commands).toEqual(original.commands);
  expect(replay(copy.config, copy.commands, copy.rules).state).toEqual(state);
  await page.screenshot({ path: info.outputPath('finished-copy.png') });
  await page.getByRole('button', { name: 'Try a branch', exact: true }).click();
  await page.locator('.rewind-day').first().click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  const branched = await saves(page);
  const branch = branched.find(save => save.id !== original.id && save.id !== copy.id)!;
  expect(branch.parentId).toBe(copy.id);
  expect(branch.branchDay).toBe(0);
  expect(branch.config).toEqual(copy.config);
  expect(branch.rules).toBe(copy.rules);
  expect(branched.find(save => save.id === copy.id)).toEqual(copy);
  expect(JSON.stringify(branched.find(save => save.id === original.id))).toBe(originalBytes);
  await page.reload();
  await page.getByRole('button', { name: `Look back at ${copy.label}`, exact: true }).click();
  await expect(page).toHaveTitle('Season over - Lantern Works');
  await expect(page.getByRole('button', { name: 'Keep a copy', exact: true })).toHaveCount(0);
  expect((await saves(page)).find(save => save.id === copy.id)).toEqual(copy);
});

for (const keepCopy of [false, true]) test(`a maximum-length replay name branches and reloads from ${keepCopy ? 'its saved copy' : 'the shared preview'}`, async ({ page }) => {
  const name = 'A season with forty letters in its title';
  expect(name).toHaveLength(40);
  const original = { ...originalSave(completed), label: name };
  await openReplay(page, original);
  let copy: SavedRun | undefined;
  if (keepCopy) {
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
    copy = (await saves(page)).find(save => save.id !== original.id)!;
    expect(copy.label).toBe(`Copy: ${name}`);
  }
  await page.getByRole('button', { name: keepCopy ? 'Try a branch' : 'Try a branch from their season', exact: true }).click();
  await page.locator('.rewind-day').last().click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  await expect.poll(async () => (await saves(page)).find(save => save.branchDay === RULES.days - 1)).toBeDefined();
  const stored = await saves(page);
  const branch = stored.find(save => save.branchDay === RULES.days - 1)!;
  expect(branch.label).toHaveLength(60);
  expect(branch.label).toMatch(/ \(branch from day 12\)$/);
  expect(branch.label.startsWith(keepCopy ? 'Copy: ' : 'Shared: ')).toBe(true);
  expect(branch.parentId).toEqual(copy?.id ?? expect.stringMatching(/^shared-/));
  expect(stored.find(save => save.id === original.id)).toEqual(original);
  if (copy) expect(stored.find(save => save.id === copy.id)).toEqual(copy);
  const native = replay(branch.config, branch.commands, branch.rules);
  expect(native.errors).toEqual([]);
  expect(native.state.day).toBe(RULES.days - 1);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${branch.label}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  expect((await saves(page)).find(save => save.id === branch.id)).toEqual(branch);
  await expect(page.getByRole('status').filter({ hasText: 'could not save your latest moves' })).toHaveCount(0);
});

test('failed recovery leaves the replay unsaved and can retry without losing its current moves', async ({ page }) => {
  const state = createRun({ scenarioId: 'main-street', seed: 'first-season' });
  const original = originalSave(state);
  const before = await openReplay(page, original);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lantern.runs.v1') throw new DOMException('Storage full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
    (window as unknown as { restoreWrites: () => void }).restoreWrites = () => { Storage.prototype.setItem = set; };
  });
  await page.getByRole('button', { name: 'Save a copy and continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'could not save your latest moves' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save a copy and continue', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Copy saved in this browser.' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Decline this request', exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(() => (window as unknown as { restoreWrites: () => void }).restoreWrites());
  await page.getByRole('button', { name: 'Save a copy and continue', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copy saved in this browser.' })).toBeVisible();
  const stored = await saves(page);
  expect(stored).toHaveLength(2);
  expect(stored.find(save => save.id === original.id)).toEqual(original);
  expect(stored.find(save => save.id !== original.id)!.commands).toEqual([{ type: 'decline', requestId: state.requests[0]!.id }]);
});
