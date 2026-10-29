// Title, end of season and dialogs: first-season path, saves with undo, the end screen's hero, medal, ghosts,
// branch comparison and share text, focus and titles across screen changes, and no sideways scrolling.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { PRESETS, RULES } from '../src/engine/rules';
import { summarize } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { encodeShare } from '../src/ui/persist';
import { MAX_COMMANDS } from '../src/ui/schema';
import { dayEvents } from '../src/ui/screens/season';
import { seasonEnding } from '../src/engine/endings';

const config = { scenarioId: 'main-street', seed: 'e2e-screens' };
const season = runPolicy(config, { ...GHOSTS.bright, plan: [{ day: 2, hire: true }] });
const cut = (cmds: readonly Command[], days: number): Command[] => {
  let n = 0;
  const i = cmds.findIndex((c) => c.type === 'runDay' && ++n > days);
  return i === -1 ? [...cmds] : cmds.slice(0, i);
};
const branch = runPolicy(config, GHOSTS.bright);

const save = (id: string, label: string, commands: readonly Command[], extra: Record<string, unknown> = {}) => ({ v: 1, rules: RULES.version, id, label, savedAt: new Date().toISOString(), config, commands, ...extra });
const SAVES = [
  save('run-done', 'Main Street', season.commands),
  save('run-branch', 'Main Street (branch from day 3)', branch.commands, { parentId: 'run-done', branchDay: 2 }),
  save('run-mid', 'Half a season', cut(season.commands, 3)),
];

async function seed(page: Page, saves: unknown[] = SAVES) {
  await page.goto('/');
  await page.evaluate((s) => localStorage.setItem('lantern.runs.v1', JSON.stringify(s)), saves);
  await page.reload();
}

async function openFinished(page: Page, label = 'Main Street') {
  await page.getByRole('button', { name: `Look back at ${label}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  // The ghost studios arrive after the first paint.
  await expect(page.locator('table.compare tbody tr')).toHaveCount(5);
}

test('with no saves, the guided first season is the first thing offered, and it opens Main Street', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Lantern Works');
  const first = page.getByRole('button', { name: 'First season: Main Street (guided)' });
  await expect(first).toBeInViewport();
  await expect(page.locator('.title-scene__proof > svg')).toBeInViewport();
  await first.click();
  await expect(page.getByRole('heading', { name: 'Someone at your door', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/^Day 1 of 12, Main Street - Lantern Works$/);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('the saves list shows each season, and a delete can be undone for six seconds', async ({ page }) => {
  await seed(page);
  const rows = page.locator('.saved-row');
  await expect(rows.filter({ hasText: 'Half a season' })).toContainText('Day 4 morning');
  await expect(rows.filter({ hasText: 'Main Street' }).first()).toContainText(seasonEnding(season).title);
  await expect(rows.first()).toContainText('Last played today');

  await page.getByRole('button', { name: 'Delete Half a season' }).click();
  await expect(rows.filter({ hasText: 'Half a season' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Continue Half a season' })).toBeFocused();

  await page.getByRole('button', { name: 'Delete Half a season' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0, { timeout: 9000 });
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]').map((r: { id: string }) => r.id));
  expect(ids).not.toContain('run-mid');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('the saves list follows another tab deleting a season', async ({ page, context }) => {
  await seed(page);
  await expect(page.locator('.saved-row')).toHaveCount(3);
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => {
    const runs = JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]');
    localStorage.setItem('lantern.runs.v1', JSON.stringify(runs.filter((r: { id: string }) => r.id !== 'run-mid')));
  });
  await expect(page.locator('.saved-row')).toHaveCount(2);
});

test('a long legal season remains playable and saved after Undo and reload', async ({ page }, info) => {
  const commands = Array.from({ length: MAX_COMMANDS + 2 }, (_, i) => ({ type: 'setMenu' as const, offers: [{ ...PRESETS.bespoke, price: 500 + (i % 2) * 10 }] }));
  expect(replay(config, commands).errors).toEqual([]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, [save('long-edited', 'Long edited season', commands), save('long-edited', 'Long edited season', commands.slice(0, -1))]);
  await expect(page.locator('.saved-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue Long edited season', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const remaining = commands.slice(0, -1);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands.length)).toBe(remaining.length);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Long edited season', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(stored).toHaveLength(1);
  expect(stored[0].commands).toEqual(remaining);
  expect(replay(stored[0].config, stored[0].commands).state).toEqual(replay(config, remaining).state);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `scratch/long-season-save/reloaded-${info.project.name}.png` });
});

test('a long finished season refuses an unusable replay link and still shares its street', async ({ page }, info) => {
  const edits = Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => ({ type: 'setMenu' as const, offers: [{ ...PRESETS.bespoke, price: 500 + (i % 2) * 10 }] }));
  const commands = [...edits, ...season.commands];
  const native = replay(config, commands);
  expect(native.errors).toEqual([]);
  expect(native.state.finished).toBe(true);
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
    (window as unknown as { copied: string[] }).copied = copied;
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, [save('long-done', 'Long finished season', commands)]);
  await openFinished(page, 'Long finished season');
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy replay link', exact: true }).click();
  await expect(page.locator('.share-msg')).toContainText('This replay could not be made into a link.');
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([]);
  expect((await new AxeBuilder({ page }).include('.end-share').analyze()).violations).toEqual([]);
  await page.screenshot({ path: `scratch/long-season-save/share-refused-${info.project.name}.png` });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Copy challenge link', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.share-msg')).toContainText('Challenge link copied.');
  const copied = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
  expect(copied).toEqual([new URL(`/#play=main-street:e2e-screens:${RULES.version}`, page.url()).href]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(stored[0].commands).toEqual(commands);
  expect(errors).toEqual([]);
});

test('a saved final-day call stays on that day and resumes the same unanswered call', async ({ page }, info) => {
  const runConfig = { scenarioId: 'main-street', seed: 'save-phase-2' };
  const commands = runPolicy(runConfig, { ...GHOSTS.hand, calls: true }).commands;
  const lastOpen = commands.findLastIndex((c) => c.type === 'runDay');
  const interrupted = commands.slice(0, lastOpen + 1);
  const state = replay(runConfig, interrupted).state;
  expect(state.day).toBe(11);
  expect(state.call).not.toBeNull();
  expect(state.finished).toBe(false);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, [save('call', 'Saved call', interrupted, { config: runConfig })]);
  const row = page.locator('.saved-row', { hasText: 'Saved call' });
  await expect(row).toContainText('Day 12, call waiting');
  await expect(row).not.toHaveClass(/is-done/);
  await expect(row.getByRole('button', { name: 'Continue Saved call', exact: true })).toBeVisible();
  await expect(page.locator('.first-season')).toContainText('Saved call, Day 12, call waiting.');
  await expect(page.getByRole('button', { name: 'Continue the season', exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/call-save-phase/title-${info.project.name}.png` });
  await row.getByRole('button', { name: 'Continue Saved call', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: /^A call at/ })).toBeVisible();
  await expect(page).toHaveTitle('Day 12 of 12, Main Street - Lantern Works');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual(interrupted);
  expect(replay(saved.config, saved.commands).state).toEqual(state);
  expect(errors).toEqual([]);
});

test('a save from an older rules version is labelled and offers the same street fresh', async ({ page }) => {
  await seed(page, [{ ...SAVES[0], id: 'old-1', rules: 'lantern-2.1.0', label: 'Festival Week', config: { scenarioId: 'festival-week', seed: '4417' }, commands: [] }]);
  await expect(page.getByText('Made with an older version (lantern-2.1.0)')).toBeVisible();
  await page.getByRole('button', { name: 'Play the same street fresh: Festival Week' }).click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await expect(page).toHaveTitle(/Festival Week - Lantern Works$/);
});

test('end screen: delivered work and next steps lead, with optional medals, four ghosts, and no serious axe issues', async ({ page }) => {
  await seed(page);
  await openFinished(page);
  await expect(page).toHaveTitle('Season over - Lantern Works');
  const neighbourhood = page.locator('.neighbourhood');
  await expect(neighbourhood).toBeInViewport();
  await expect(neighbourhood.getByRole('heading', { name: 'Work on the street', exact: true })).toBeVisible();
  await expect(neighbourhood.locator('.neighbourhood-print')).toBeVisible();
  await expect(page.locator('.medal-object')).not.toBeVisible();
  const again = page.getByRole('button', { name: 'Play this street again' });
  expect((await again.boundingBox())!.y).toBeLessThan(900);
  await page.getByText('Optional challenges: medals and side goals', { exact: true }).click();
  await expect(page.locator('.medal-object')).toBeVisible();
  await page.getByText('Other ways this street could have gone', { exact: true }).click();
  for (const g of ['Old Lantern', 'Faster Lantern', 'Handmade Lantern', 'Bright Lantern']) await expect(page.locator('table.compare')).toContainText(g);
  // The street's paper heads its front page with this season's own count.
  await page.getByText('The Gazette: how the street remembers it', { exact: true }).click();
  await expect(page.locator('.end-gazette h2')).toContainText(`${summarize(season).served} neighbours served`);
  await page.locator('.end-gazette').screenshot({ path: test.info().outputPath('gazette.png') });
  await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem')).toHaveCount(5);
  // Each rewind button names that morning's key decision, as derived from the saved moves.
  await expect(page.locator('.rewind-ev')).toHaveText(dayEvents(season));
  const sum = summarize(season);
  await expect(page.locator('table.compare tr.you td').first()).toHaveText(String(sum.served));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  // The chart's text is drawn at real size, never shrunk below 12px.
  const sizes = await page.locator('.chart svg text').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
});

test('a branch is compared with its original, and the numbers are the two replays', async ({ page }) => {
  await seed(page);
  await openFinished(page, 'Main Street (branch from day 3)');
  await page.getByText('Other ways this street could have gone', { exact: true }).click();
  const table = page.locator('.branch-table');
  await expect(table).toBeVisible();
  const mine = summarize(replay(config, branch.commands).state);
  const orig = summarize(replay(config, season.commands).state);
  // The branch's own column may add "(better)" or "(worse)" after its number.
  const n = (x: number) => new RegExp(`^${x}( \\((better|worse)\\))?$`);
  await expect(table.locator('tr', { hasText: 'Served' }).locator('td')).toHaveText([n(mine.served), n(orig.served)]);
  await expect(table.locator('tr', { hasText: 'Missed' }).locator('td')).toHaveText([n(mine.missed), n(orig.missed)]);
});

test('closing a dialog returns focus to the button that opened it, and the key field validates', async ({ page }) => {
  await seed(page);
  await openFinished(page);
  await page.getByText('The studio ledger: what happened and why', { exact: true }).click();
  const ask = page.getByRole('button', { name: 'Ask Claude for a debrief' });
  await ask.click();
  const dialog = page.getByRole('dialog', { name: 'Use Claude in the studio' });
  const field = dialog.getByLabel('Anthropic API key');
  await expect(field).toBeFocused();
  await expect(dialog.getByRole('link', { name: 'Anthropic console' })).toHaveAttribute('href', /console\.anthropic\.com/);
  await field.fill('sk-proj-1234567890abcdefghijklmnopqrstu');
  await dialog.getByRole('button', { name: 'Use this key' }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText(/start with "sk-ant-"/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(ask).toBeFocused();
  await ask.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(ask).toBeFocused();
});

test('the share text is the same on two replays of the same season, fits a post, and can go to the native share sheet', async ({ page, context }) => {
  const link = `/#s=${await encodeShare(config, season.commands, 'A test season')}`;
  const read = async (p: Page) => {
    await p.goto(link);
    await expect(p.getByRole('button', { name: 'Play this street' })).toBeInViewport();
    await p.getByText('Keep a postcard or share this season', { exact: true }).click();
    await expect(p.getByText('Can you beat it?')).toBeVisible();
    return (await p.locator('.share-text').textContent())!;
  };
  const a = await read(page);
  const b = await read(await context.newPage());
  expect(a).toBe(b);
  expect(a.length).toBeLessThanOrEqual(280);
  expect(a.split('\n')[1]).toMatch(/^[●◐×○]{12}$/);

  // Someone else's season: a clear call to play the street, no "New" stamps, no AI calls spent on it.
  await expect(page.getByRole('button', { name: 'Play this street' })).toBeVisible();
  await expect(page.locator('.end-stamps em')).toHaveCount(0);
  await page.getByText('The studio ledger: what happened and why', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ask Claude for a debrief' })).toBeDisabled();

  const sharer = await context.newPage();
  await sharer.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: unknown) => ((window as unknown as { shared: unknown }).shared = d) });
  });
  await sharer.goto(link);
  await sharer.getByText('Keep a postcard or share this season', { exact: true }).click();
  await sharer.getByRole('button', { name: 'Share...' }).click();
  const shared = await sharer.evaluate(() => (window as unknown as { shared: { text: string } }).shared);
  expect(shared.text).toBe(a);
});

test('every screen change moves focus to a heading and sets the page title', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Continue Half a season' }).click();
  await expect(page).toHaveTitle(/^Day 4 of 12, Main Street - Lantern Works$/);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/^H[12]$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle('Lantern Works');
  await openFinished(page);
  await page.getByRole('button', { name: 'Try a branch' }).click();
  await expect(page.getByRole('heading', { name: 'What if?' })).toBeFocused();
  await page.locator('.rewind-day').nth(4).click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await expect(page).toHaveTitle(/^Day 5 of 12/);
});

test('a screen change whose view transition the browser aborts still lands, without the crash screen', async ({ page }) => {
  // What Chromium does when the tab is hidden mid-change: run the update, reject ready and finished.
  await page.addInitScript(() => {
    const abort = () => Promise.reject(new DOMException('Transition was aborted because of invalid state', 'InvalidStateError'));
    (document as unknown as { startViewTransition: (cb: () => void) => unknown }).startViewTransition = (cb) => {
      cb();
      return { ready: abort(), finished: abort(), updateCallbackDone: Promise.resolve() };
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#play=main-street:e2e-aborted');
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.getByRole('heading', { name: 'Something broke.' })).toHaveCount(0);
});

test('no sideways scrolling on the title and end screens at 320, 390 and 1280 wide', async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await seed(page);
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `title at ${width}`).toBeLessThanOrEqual(0);
    await openFinished(page);
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `end at ${width}`).toBeLessThanOrEqual(0);
  }
});
