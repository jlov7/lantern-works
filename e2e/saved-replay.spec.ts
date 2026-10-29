import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ordinaryBrief } from '../src/engine/ordinary';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { PRESETS, RULES } from '../src/engine/rules';
import { reactionTo } from '../src/engine/selectors';
import { createRun, replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { decodeShare } from '../src/ui/persist';
import { MAX_COMMANDS, type SavedRun } from '../src/ui/schema';
import { FIRST_SEASON } from '../src/ui/screens/firstSeason';

const morning = createRun(FIRST_SEASON);
const request = morning.requests[0]!;
const reaction = reactionTo(morning, request);
if (reaction.kind !== 'buy') throw new Error('The first-season fixture must have a buyer.');
const brief = ordinaryBrief(request, reaction.offer)!;
const commands: Command[] = [{ type: 'accept', requestId: request.id, intention: 'clem-band', design: {
  ...brief.defaultDesign, pieces: brief.defaultDesign.pieces.map(piece => ({ ...piece, headline: 'Stay for the last note' })),
} }];
const completed = runPolicy({ scenarioId: 'main-street', seed: 'saved-replay' }, GHOSTS.bright, {}, LEGACY_RULES_VERSION);
const save = (id: string, label: string, commands: Command[], config = FIRST_SEASON, rules: string = RULES.version): SavedRun => ({
  v: 1, id, label, config, rules, commands, savedAt: '2026-10-29T12:00:00Z',
});
const pending = save('pending', 'A saved morning with my own words on the print', commands);
const finished = save('finished', 'Earlier completed season', completed.commands, completed.config, completed.rulesVersion);
const storage = (page: Page) => page.evaluate(() => [localStorage.getItem('lantern.runs.v1'), localStorage.getItem('lantern.current.v1'), localStorage.getItem('lantern.stamps.v1')]);
async function seed(page: Page, run: SavedRun, blocked = false) {
  await page.addInitScript(blocked => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => {
      if (blocked) throw new DOMException('Clipboard blocked', 'NotAllowedError');
      (window as unknown as { copied: string }).copied = value;
    } } });
  }, blocked);
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
    localStorage.setItem('lantern.current.v1', 'keep-this-pointer');
    localStorage.setItem('lantern.stamps.v1', '["first-season"]');
  }, run);
  await page.reload();
}

for (const run of [pending, finished]) test(`keep a ${run.id} season as an exact replay without changing storage`, async ({ page }, info) => {
  const original = replay(run.config, run.commands, run.rules);
  expect(original.errors).toEqual([]);
  expect(original.state.finished).toBe(run.id === 'finished');
  await seed(page, run);
  const before = await storage(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const button = page.getByRole('button', { name: `Keep replay of ${run.label}`, exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Keep a replay', exact: true });
  await expect(dialog.getByRole('heading')).toBeFocused();
  const field = dialog.getByRole('textbox', { name: 'Complete replay link' });
  await expect(field).toHaveValue(/^http.*#s=/);
  const url = await field.inputValue();
  const decoded = await decodeShare(url.split('#s=')[1]!);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.reason);
  expect(decoded.payload).toEqual({ v: 1, rules: run.rules, config: run.config, commands: run.commands, name: run.label.slice(0, 40) });
  expect(decoded.state).toEqual(original.state);
  await dialog.getByRole('button', { name: 'Copy replay link', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Replay link copied. Keep the complete link somewhere safe.');
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(url);
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await dialog.evaluate(element => getComputedStyle(element).animationDuration)).toBe('0s');
  await page.screenshot({ path: `scratch/saved-replay/${run.id}-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  if (run.id === 'pending') await page.screenshot({ path: `scratch/saved-replay/title-${info.project.name}.png`, fullPage: true });
  expect(await storage(page)).toEqual(before);
  const origin = new URL(page.url()).origin;
  expect(requests.every(url => new URL(url).origin === origin)).toBe(true);
});

for (const cancel of [false, true]) test(`saved-season details wait for a pointer gesture to ${cancel ? 'cancel' : 'open Continue'}`, async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      override postMessage(message: unknown) {
        if ((message as { kind?: string }).kind === 'facts') {
          this.addEventListener('message', () => Object.assign(window, { saveFactsArrived: true }), { once: true });
          Object.assign(window, { releaseSaveFacts: () => super.postMessage(message) });
        } else super.postMessage(message);
      }
    };
  });
  await seed(page, pending);
  const before = await storage(page);
  const button = page.getByRole('button', { name: `Continue ${pending.label}`, exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => (window as unknown as { releaseSaveFacts: () => void }).releaseSaveFacts());
  await expect.poll(() => page.evaluate(() => (window as unknown as { saveFactsArrived?: boolean }).saveFactsArrived)).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await button.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
  if (cancel) await page.mouse.move(0, 0);
  await page.mouse.up();
  if (cancel) {
    await expect(page.getByRole('button', { name: `Keep replay of ${pending.label}`, exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Make something for your neighbours.', exact: true })).toBeVisible();
  } else await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  expect((await storage(page))[0]).toEqual(before[0]);
});

test('blocked clipboard leaves a complete selectable replay link', async ({ page }) => {
  await seed(page, pending, true);
  const before = await storage(page);
  await page.getByRole('button', { name: `Keep replay of ${pending.label}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keep a replay', exact: true });
  const field = dialog.getByRole('textbox', { name: 'Complete replay link' });
  await expect(field).toHaveValue(/^http.*#s=/);
  await dialog.getByRole('button', { name: 'Copy replay link', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Copying is blocked here.');
  await field.focus();
  expect(await field.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    return field.readOnly && field.selectionStart === 0 && field.selectionEnd === field.value.length;
  })).toBe(true);
  expect(await storage(page)).toEqual(before);
});

test('a legal history beyond the replay limit stays saved and explains the limit', async ({ page }) => {
  const edits: Command[] = Array.from({ length: MAX_COMMANDS + 1 }, (_, index) => ({ type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 500 + index % 2 * 10 }] }));
  const run = save('long-history', 'Many morning edits', edits);
  expect(replay(run.config, run.commands, run.rules).errors).toEqual([]);
  await seed(page, run);
  const before = await storage(page);
  const button = page.getByRole('button', { name: `Keep replay of ${run.label}`, exact: true });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Keep a replay', exact: true });
  await expect(dialog.getByRole('status')).toHaveText('This season could not be made into a replay link. Long histories can exceed the link limits. Your saved season has not been changed.');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Copy replay link', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  expect(await storage(page)).toEqual(before);
  await expect(page.getByRole('button', { name: `Continue ${run.label}`, exact: true })).toBeEnabled();
});

test.describe('replay window loading', () => {
  test.use({ serviceWorkers: 'block' });
  test('a missing replay chunk leaves the save intact and recovers in a fresh browser tab', async ({ page, context }, info) => {
    await context.route(/\/assets\/ReplayBackup-.*\.js$/, route => route.fulfill({ status: 503, contentType: 'text/javascript', headers: { 'cache-control': 'no-store' }, body: 'Temporarily unavailable' }));
    await seed(page, pending);
    const before = await storage(page);
    const button = page.getByRole('button', { name: `Keep replay of ${pending.label}`, exact: true });
    await button.click();
    await expect(page.locator('.saved [role="status"]')).toHaveText('The replay window could not load. Reconnect, then open a fresh tab using your browser’s controls and paste this address. It opens the title with this browser’s saved seasons. Only saved moves carry over.');
    await expect(page.getByRole('button', { name: `Continue ${pending.label}`, exact: true })).toBeEnabled();
    expect(await storage(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.screenshot({ path: `scratch/saved-replay/reload-recovery-${info.project.name}.png` });
    await context.unroute(/\/assets\/ReplayBackup-.*\.js$/);
    const address = page.getByRole('textbox', { name: 'Game address', exact: true });
    await address.focus();
    expect(await address.evaluate(input => { const field = input as HTMLInputElement; return field.readOnly && field.selectionStart === 0 && field.selectionEnd === field.value.length; })).toBe(true);
    const reopened = await context.newPage();
    await reopened.goto(await address.inputValue());
    await reopened.getByRole('button', { name: `Keep replay of ${pending.label}`, exact: true }).click();
    await expect(reopened.getByRole('dialog', { name: 'Keep a replay', exact: true })).toBeVisible();
    expect(await storage(reopened)).toEqual(before);
    expect(await storage(page)).toEqual(before);
  });
});
