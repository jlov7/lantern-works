import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { goPlace, openComparison, reviewWindow, selectCustomer, takeAllFitting, takeFocused } from './workspace-helpers';
import { RULES } from '../src/engine/rules';
import { fits, forecast, reactionTo, summarize, windowRequests } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import { wouldPayMore } from '../src/ui/game/sameOrders';
import type { Command } from '../src/engine/types';

const STREET = '/#play=main-street:e2e-1';

const openBtn = (page: Page) => page.getByRole('button', { name: /^Open the shop for Day/ });
const endBtn = (page: Page) => page.getByRole('button', { name: 'See how the season went' });

/** Each morning's street news needs an answer before the shop opens: take the first option. */
async function answerNews(page: Page) {
  await reviewWindow(page);
  const option = page.locator('#pending-news .news-option').first();
  if (await option.count()) await option.click();
}

/** Neighbours who named their own price need an answer before the shop opens: turn them down. */
async function answerHagglers(page: Page) {
  for (let reply = 0; reply < 20; reply++) {
    const comparison = await openComparison(page);
    const row = comparison.locator('.hagglers .roster-row').first();
    if (!(await row.count())) { await comparison.getByRole('button', { name: /^Return to / }).click(); return; }
    await row.click();
    await page.locator('.focused-decision').getByRole('button', { name: 'Decline this request', exact: true }).click();
  }
  throw new Error('Negotiators did not settle after 20 replies');
}

async function openDay(page: Page) {
  await answerNews(page);
  await answerHagglers(page);
  await openBtn(page).click();
  // Reduced motion: the day resolves straight to the evening, which stays above the next morning, unless a call
  // stops it first; this player leaves calls be.
  await page.locator('.evening, .call').first().waitFor();
  if (await page.locator('.call').count()) await page.locator('.call').getByRole('button', { name: 'Leave it' }).click();
  await page.locator('.evening').waitFor();
  if (await endBtn(page).count()) await endBtn(page).click();
}

/** The studio's panels start closed: open one by its tab (a no-op on the first morning, when there are none). */
async function openTab(page: Page, name: 'Studio' | 'AI desk' | 'Street' | 'Promises') {
  await goPlace(page, 'Studio');
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.isVisible() && await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}
const openStudio = (page: Page) => openTab(page, 'Studio');

/** A player who has finished a season before: every system is open from Day 1. */
async function returning(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season'])));
}

async function savedCommands(page: Page): Promise<{ config: { scenarioId: string; seed: string }; commands: Command[] }> {
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'));
  return runs[0];
}

async function cash(page: Page): Promise<string> {
  return (await page.locator('.stat-cash strong .rolling > span').first().textContent()) ?? '';
}

const focusIsOnBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

test('planning text stays clear of the miniature after scrolling to the studio', async ({ page }) => {
  await returning(page);
  await page.goto(STREET);
  await openStudio(page);
  const studio = page.locator('#studio');
  await studio.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('studio-scrolled.png') });
  for (const text of [studio.getByRole('heading', { name: 'The studio', exact: true }), studio.getByText('In today:', { exact: true }), studio.getByRole('button', { name: 'Hire Noor', exact: true })]) {
    await expect(text).toBeInViewport();
    expect(await text.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + Math.min(20, rect.width / 2), rect.top + rect.height / 2);
      return el === hit || el.contains(hit);
    })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a full season through the real UI matches a headless replay of the same moves', async ({ page }) => {
  await returning(page);
  await page.goto(STREET);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();

  // Day 1: take the first neighbour who will buy.
  await takeFocused(page);
  await expect(page.getByText(/^Sold:/).first()).toBeVisible();
  await openDay(page);

  // Day 2: invent a second offer from a starting template and put it on the window.
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Invent a second offer' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await expect(page.locator('.sign-title', { hasText: 'Launchlet' })).toBeVisible();
  await openTab(page, 'AI desk');
  await page.getByRole('radio', { name: /One AI desk/ }).check();

  // Take everyone the forecast says fits, every remaining day.
  for (let d = 2; d <= 12; d++) {
    await takeAllFitting(page);
    await openDay(page);
  }

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByText('Other ways this street could have gone', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Same street, four studios' })).toBeVisible();

  // The numbers on screen are the engine's numbers for exactly these moves.
  const saved = await savedCommands(page);
  const { state, errors } = replay(saved.config, saved.commands);
  expect(errors).toEqual([]);
  expect(state.finished).toBe(true);
  const sum = summarize(state);
  const you = page.locator('table.compare tr.you td');
  await expect(you.nth(0)).toHaveText(String(sum.served));
  await expect(you.nth(3)).toHaveText(new RegExp(`^${sum.cash < 0 ? '-' : ''}${Math.abs(sum.cash).toLocaleString('en-GB')} cr$`));
  expect(sum.served).toBeGreaterThan(0);
  // The debrief's suggestion is a challenge: a branch from the morning it is about.
  await page.getByText('The studio ledger: what happened and why', { exact: true }).click();
  await page.getByRole('button', { name: /^Try it: play again from Day \d+$/ }).click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
});

test('the window reacts live to a price change, and nothing is sold until you say so', async ({ page }) => {
  await page.goto(STREET);
  const verdicts = page.locator('.ticket .verdict');
  const before = await verdicts.allTextContents();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByLabel('Price for the whole offer').fill('300');
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await goPlace(page, 'Window');
  const after = await verdicts.allTextContents();
  expect(after).not.toEqual(before);
  const { commands } = await savedCommands(page);
  expect(commands.some((c) => c.type === 'accept')).toBe(false);
});

test('a price the window cannot take is flagged on the field and the last preview stays', async ({ page }) => {
  await page.goto(STREET);
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  const price = ws.getByLabel('Price for the whole offer');
  await price.fill('5');
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(ws.locator('#price-err')).toContainText('Price must be');
  await expect(ws.locator('.seg-list.is-stale')).toBeVisible();
  // Every kind of neighbour who won't buy says what would work.
  await price.fill('5000');
  const blocked = ws.locator('.seg-list li.no');
  expect(await blocked.count()).toBeGreaterThan(0);
  for (const li of await blocked.all()) await expect(li).toContainText('Wants:');
});

test('undo takes back a morning decision; after the day runs it cannot', async ({ page }) => {
  await page.goto(STREET);
  await page.getByRole('button', { name: 'Decline this request', exact: true }).first().click();
  await expect(page.getByText('You turned this one away.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('You turned this one away.')).toHaveCount(0);
  await openDay(page);
  await reviewWindow(page);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('a damaged share link is refused with an explanation and nothing loads', async ({ page }) => {
  await page.goto('/#s=not-a-real-season');
  await expect(page.getByRole('status')).toContainText(/damaged|does not describe/);
  await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
});

test('a replay link rebuilds the same season for someone else', async ({ page, context }) => {
  await page.goto(STREET);
  for (let d = 1; d <= 12; d++) {
    await takeAllFitting(page);
    await openDay(page);
  }
  const served = await page.locator('table.compare tr.you td').first().textContent();
  // Headless clipboards read back empty, so capture what the page writes.
  await page.evaluate(() => {
    (window as unknown as { copied: string }).copied = '';
    navigator.clipboard.writeText = async (t: string) => {
      (window as unknown as { copied: string }).copied = t;
    };
  });
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy replay link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Replay link copied' })).toBeVisible();
  const url = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(url).toMatch(/#s=[A-Za-z0-9_-]+$/);
  expect(url).not.toMatch(/sk-ant/);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('table.compare tr.you td').first()).toHaveText(served!);
});

test('keyboard only: a whole day, and focus never falls back to the page', async ({ page }) => {
  await page.goto(STREET);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const tabTo = async (target: ReturnType<Page['locator']>) => {
    await expect(target).toBeVisible();
    for (let key = 0; key < 200; key++) {
      if (await target.evaluateAll(elements => elements.some(element => element === document.activeElement))) return;
      await page.keyboard.press('Tab');
      expect(await focusIsOnBody(page)).toBe(false);
    }
    throw new Error('The required control was not keyboard reachable');
  };
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to the current workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-heading')).toBeFocused();
  const first = page.locator('.focused-decision .btn-maker:enabled, .focused-decision .btn-take:enabled').first();
  await tabTo(first);
  await page.keyboard.press('Enter');
  const confirmation = page.getByRole('button', { name: /^Take with / });
  if (await confirmation.count()) { await tabTo(confirmation); await page.keyboard.press('Enter'); }
  await expect(page.locator('.reply-receipt')).toBeFocused();
  await expect(page.getByText(/^Sold:/)).toBeVisible();
  await tabTo(page.getByRole('button', { name: /^Next customer/ }));
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await tabTo(page.locator('.focused-decision').getByRole('button', { name: 'Decline this request', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.reply-receipt')).toBeFocused();
  await tabTo(openBtn(page));
  await page.keyboard.press('Enter');
  await expect(page.locator('#evening-h')).toBeFocused();
  await expect(page.getByRole('button', { name: "Review tomorrow's window", exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await focusIsOnBody(page)).toBe(false);
});

test('focus returns to the control that opened the workshop, however it closes', async ({ page }) => {
  await page.goto(STREET);
  await goPlace(page, 'Studio');
  const redesign = page.getByRole('button', { name: /^Redesign/ });
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await redesign.click();
  await expect(ws).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(redesign).toBeFocused();
  await redesign.click();
  await ws.getByRole('button', { name: 'Cancel' }).click();
  await expect(redesign).toBeFocused();
  await redesign.click();
  await ws.getByRole('button', { name: 'Launch Club' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  expect(await focusIsOnBody(page)).toBe(false);
});

test("an evening's redesign button after the sign is up says so, and never opens a workshop that cannot save", async ({ page }) => {
  await page.goto(STREET);
  const redesign = page.locator('.evening').getByRole('button', { name: /^(Redesign the window|Design an offer)$/ });
  for (let d = 0; d < 10 && !(await redesign.isVisible()); d++) await openDay(page);
  await expect(redesign).toBeVisible();
  // This morning's small shops need a quicker offer before any of them will buy.
  await redesign.click();
  const workshop = page.getByRole('dialog', { name: 'Offer workshop' });
  await workshop.getByRole('button', { name: 'Launchlet', exact: true }).click();
  await workshop.getByRole('button', { name: 'Put on the window', exact: true }).click();
  await goPlace(page, 'Window');
  await takeFocused(page);
  expect((await savedCommands(page)).commands.at(-1)?.type).toBe('accept');
  await goPlace(page, 'Work');
  await redesign.click();
  await expect(page.getByText("Redesign tomorrow morning, or undo this morning's answers first.", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Offer workshop' })).toHaveCount(0);
});

test('putting an unchanged offer back on the window just closes the workshop', async ({ page }) => {
  await page.goto(STREET);
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).first().click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await expect(ws).toHaveCount(0);
});

test('shortcuts: W opens the workshop, Space opens the shop each morning; never while typing', async ({ page }) => {
  await page.goto(STREET);
  // The game screen loads after the title's first paint: wait for it before pressing keys or checking menus.
  await page.getByRole('heading', { name: 'At the window' }).waitFor();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('w');
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await expect(ws).toBeVisible();
  await ws.getByLabel('Name on the window').fill('Wide window');
  await expect(ws.getByLabel('Name on the window')).toHaveValue('Wide window');
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press(' ');
  await expect(page.getByRole('heading', { name: 'Day 1, evening' })).toBeVisible();
  const beforeReview = await savedCommands(page);
  await page.keyboard.press(' ');
  expect(await savedCommands(page)).toEqual(beforeReview);
  await page.keyboard.press('Enter');
  await expect(openBtn(page)).toHaveText(/Day 2/);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press(' ');
  await expect(page.getByRole('heading', { name: 'Day 2, evening' })).toBeVisible();
});

test('no horizontal scrolling at 320, 390 and 1280', async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', STREET]) {
      await page.goto(path);
      await expect(page.locator('h1, h2').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
    }
    await openBtn(page).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `evening at ${width}`).toBeLessThanOrEqual(0);
  }
});

test('accessibility: title, morning, news, evening, workshop and end screen have no serious axe violations', async ({ page }) => {
  const check = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), label).toEqual([]);
  };
  await page.goto('/');
  await check('title');
  await page.goto(STREET);
  await check('game');
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).click();
  // The workshop's code loads on demand: wait for it, or Escape lands before it opens and it opens after.
  await expect(page.getByRole('dialog', { name: 'Offer workshop' })).toBeVisible();
  await check('workshop');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Offer workshop' })).toBeHidden();
  await openBtn(page).click();
  await check('evening');
  await openDay(page);
  await goPlace(page, 'Window');
  await expect(page.locator('.news')).toBeVisible();
  await check('news');
  for (let d = 3; d <= 12; d++) await openDay(page);
  await check('end');
});

test('a malformed challenge link shows the invalid-link notice instead of breaking', async ({ page }) => {
  await page.goto('/#play=main-street:%');
  await expect(page.getByRole('status')).toContainText('not a street this build knows');
});

test('the top bar does not give away the day before the clock gets there, then ticks with it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Oscar's first order delivers at minute 333. The ordinary e2e-1 first order needs rework, so it carries on tomorrow.
  await page.goto('/#play=main-street:clock-e2e-1');
  await takeFocused(page);
  const served = page.locator('.stat-served strong .rolling > span').first();
  const owed = page.locator('.stat-owed strong .rolling > span').first();
  // Let the receipt's number finish rolling before observing a later delivery change.
  await expect(owed).toHaveText('900 cr');
  const before = await served.textContent();
  const owedBefore = await owed.textContent();
  await page.clock.install({ time: new Date('2026-10-27T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-27T10:00:01Z'));
  await openBtn(page).click();
  await expect(page.getByRole('button', { name: 'Skip to evening' })).toBeVisible();
  await expect(served).toHaveText(before!);
  // Observe both sides of minute 333 without racing the eight-second playback.
  await page.clock.runFor(5200);
  await expect(owed).toHaveText(owedBefore!);
  await expect(served).toHaveText(before!);
  await page.clock.runFor(1000);
  await expect(owed).not.toHaveText(owedBefore!);
  await expect(served).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Skip to evening' })).toBeVisible();
});

test('with a full window, designing for the walkers asks which offer to replace and keeps the other', async ({ page }) => {
  // Careful Season with two simple-only offers: most careful neighbours walk.
  await page.goto('/#play=bespoke-rush:e2e-3');
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).click();
  let ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launch Club' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Invent a second offer' }).click();
  ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await expect(ws.getByRole('group', { name: 'Replaces' })).toBeVisible();
  await ws.getByRole('button', { name: 'Bespoke Launch' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await page.getByRole('dialog', { name: 'Compare all neighbours' }).getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Studio');
  const now = await page.locator('.sign-title').allTextContents();
  expect(now).toHaveLength(2);
  expect(now).toContain('Bespoke Launch');
  expect(now.filter((n) => n === 'Launch Club' || n === 'Launchlet')).toHaveLength(1);
});

test('each evening shows how all four ghost studios are doing so far', async ({ page }) => {
  await page.goto(STREET);
  await openBtn(page).click();
  await expect(page.getByText(/Neighbours served so far on this street: you \d+, Old Lantern \d+, Faster Lantern \d+, Handmade Lantern \d+, Bright Lantern \d+\./)).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.race-bars li')).toHaveCount(5);
});

test('the desktop window keeps the first creative choice, the shop and named roster in view', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await page.goto(STREET);
  const answer = page.locator('.focused-decision .first-proof__directions > button').first();
  await expect(answer).toBeInViewport();
  await expect(page.locator('.window-scene > .atelier-window')).toBeInViewport();
  await expect(page.locator('.window-scene > .atelier-window')).toHaveAccessibleName(/.+ at the studio window/);
  await expect(page.getByRole('list', { name: 'Customer roster' })).toBeVisible();
  await expect(openBtn(page)).toBeInViewport();
  const comparison = await openComparison(page);
  await expect(comparison.getByText(/won't buy what's on the window/)).toBeVisible();
  await expect(comparison.getByRole('button', { name: 'Design an offer for them' })).toBeVisible();
  await expect(comparison.getByRole('button', { name: /^Take everyone who fits/ })).toHaveCount(0);
});

test('street news: the shop waits for an answer, a choice folds the card, and the choice is saved', async ({ page }) => {
  await page.goto(STREET);
  await openDay(page);
  await openDay(page);
  await goPlace(page, 'Window');
  const news = page.locator('.news');
  await expect(news).toContainText('Street news');
  await expect(news).toContainText('Choose one before you open the shop.');
  await expect(page.locator('.news-waiting')).toContainText('Answer the street news first');
  await openBtn(page).click();
  await expect(page.getByText('Street news first: choose an answer on the card, then open the shop.')).toBeAttached();
  await expect(openBtn(page)).toBeVisible();
  const option = news.locator('.news-option').nth(1);
  const label = (await option.textContent())!;
  await option.click();
  await expect(page.locator('.news-done')).toContainText(label);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  const { commands } = await savedCommands(page);
  expect(commands.at(-1)).toMatchObject({ type: 'choose', option: 1 });
});

test('studio levers through the UI change the books exactly as the engine says', async ({ page }) => {
  await returning(page);
  await page.goto(STREET);
  await openStudio(page);
  const studio = page.locator('#studio');
  const start = await cash(page);
  await studio.getByRole('button', { name: 'Hire Noor' }).click();
  await expect(studio).toContainText(/Starting soon: Noor, Day 2/);
  expect(await cash(page)).toBe(start);
  await studio.getByRole('button', { name: 'Book a temp' }).click();
  await expect(studio.getByRole('button', { name: 'Book a temp' })).toBeDisabled();
  await expect(studio).toContainText('A temp is already booked for today.');
  await studio.getByRole('button', { name: 'Book overtime' }).click();
  await expect(studio).toContainText(/Overtime booked/);
  await studio.getByRole('button', { name: 'Buy the brief library' }).click();
  await expect(studio).toContainText('Bought');
  await studio.getByLabel('Flyers for').selectOption('careful');
  await studio.getByRole('button', { name: 'Hand out flyers' }).click();
  await expect(studio).toContainText('Flyers already went out today.');

  const saved = await savedCommands(page);
  expect(saved.commands.map((c) => c.type)).toEqual(['hire', 'temp', 'overtime', 'buy', 'flyers']);
  const { state } = replay(saved.config, saved.commands);
  expect(state.cash).toBe(RULES.initialCash - RULES.staff.temp.cost - RULES.upgrades.library.cost - RULES.flyers.cost);
  await expect.poll(() => cash(page)).toBe(`${state.cash.toLocaleString('en-GB')} cr`);
  // Overtime is charged when the shop opens, for everyone in that day.
  await openBtn(page).click();
  const after = replay(saved.config, [...saved.commands, { type: 'runDay' }]).state;
  expect(after.journal.some((e) => e.note.startsWith('Overtime'))).toBe(true);
});

test('the guided first day: five coachmarks with a deliberate maker confirmation, never shown again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  const coach = page.getByRole('complementary', { name: /^Guide, step/ });
  await expect(coach).toHaveAccessibleName('Guide, step 1 of 5');
  await expect(coach).toContainText('Someone at your door');
  await coach.getByRole('button', { name: 'Next' }).click(); // 1
  await expect(coach).toHaveAccessibleName('Guide, step 2 of 5');
  await expect(coach).toContainText('Your first promise');
  await takeFocused(page); // 2
  await expect(coach).toHaveAccessibleName('Guide, step 3 of 5');
  await openBtn(page).click(); // 3
  await expect(coach).toHaveAccessibleName('Guide, step 4 of 5');
  await coach.getByRole('button', { name: 'Next' }).click(); // 4
  await expect(coach).toHaveAccessibleName('Guide, step 5 of 5');
  await coach.getByRole('button', { name: 'Done' }).click(); // 5
  await expect(coach).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lantern.guide.v1'))).toBe('seen');
  await page.goto('/');
  await page.locator('.streets > summary').click();
  await page.getByRole('button', { name: 'Open the studio' }).first().click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await expect(coach).toHaveCount(0);
});

test('the guide can be skipped, and never appears on a challenge link', async ({ page }) => {
  await page.goto(STREET);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await expect(page.locator('.coach')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await page.getByRole('button', { name: 'Skip the guide' }).click();
  await expect(page.locator('.coach')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lantern.guide.v1'))).toBe('seen');
});

test('settings open from the top bar and the speed and sound choices stick', async ({ page }) => {
  await page.goto(STREET);
  // The game screen loads after the title's first paint: wait for it before pressing keys or checking menus.
  await page.getByRole('heading', { name: 'At the window' }).waitFor();
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2x/ }).check();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.prefs.v1')!).speed)).toBe(2);
  await expect(page.getByRole('button', { name: /^Settings/ })).toContainText('2x');
});

test('a reload in the evening shows that evening again', async ({ page }) => {
  await page.goto(STREET);
  await takeFocused(page);
  await openBtn(page).click();
  await expect(page.getByRole('heading', { name: 'Day 1, evening' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /^Continue/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Day 1, evening' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Review tomorrow's window", exact: true })).toBeVisible();
  await reviewWindow(page);
  await expect(openBtn(page)).toHaveText(/Day 2/);
});

test('the live region speaks the evening, and messages stay in an always-present status region', async ({ page }) => {
  await page.goto(STREET);
  const live = page.locator('[aria-live="polite"].vh');
  await expect(live).toBeAttached();
  await expect(page.locator('.toast-region[role="status"]')).toBeAttached();
  await openBtn(page).click();
  await expect(live).toContainText(/Evening/);
});

test('when another tab moves the season on, this tab says so and stops saving over it', async ({ page }) => {
  await page.goto(STREET);
  await takeFocused(page);
  await page.evaluate(() => {
    const runs = JSON.parse(localStorage.getItem('lantern.runs.v1')!);
    runs[0].commands = [{ type: 'runDay' }, { type: 'runDay' }];
    localStorage.setItem('lantern.runs.v1', JSON.stringify(runs));
  });
  await page.getByRole('button', { name: /^Next customer/ }).click();
  await page.getByRole('button', { name: 'Decline this request', exact: true }).first().click();
  await expect(page.getByText('This season continued in another tab.', { exact: false })).toBeVisible();
  const { commands } = await savedCommands(page);
  expect(commands).toEqual([{ type: 'runDay' }, { type: 'runDay' }]);
});

test('a buyer who picks the cheaper offer says what they would have paid for the other', async ({ page }) => {
  await page.goto(STREET);
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Invent a second offer' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  await openComparison(page, true);
  await expect(page.locator('.cannibal-sum')).toHaveText(/would have paid 900 cr for Bespoke Launch but takes? the cheaper offer\./);
  const saved = await savedCommands(page);
  const state = replay(saved.config, saved.commands).state;
  const buyer = windowRequests(state).find(request => wouldPayMore(state, request))!;
  await page.getByRole('dialog').getByRole('button', { name: /^Return to / }).click();
  await selectCustomer(page, buyer.id);
  await expect(page.locator('.ticket-waiting .cannibal').first()).toHaveText('Would have paid 900 cr for Bespoke Launch.');
});

test('a buyer who would make a launch late takes two clicks, and the ticket names the lever that would fit them', async ({ page }) => {
  // Main Street, panel-1: with a same-day Launchlet on day 1 only the first buyer fits (no template kit yet).
  await page.goto('/#play=main-street:panel-1');
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await expect(ws.getByText(/^Today's hours fit 1 of them/)).toBeVisible();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  if (await comparison.isVisible()) await comparison.getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Window');
  await takeFocused(page);
  const saved = await savedCommands(page);
  const state = replay(saved.config, saved.commands).state;
  const risky = windowRequests(state).find(request => request.status === 'waiting' && reactionTo(state, request).kind === 'buy' && !fits(forecast(state, request.id)))!;
  const next = await selectCustomer(page, risky.id);
  await expect(next.getByText(/^Fits with overtime/)).toBeVisible();
  await next.getByRole('button', { name: 'Take it anyway' }).click();
  await expect(next.getByRole('button', { name: 'Yes, take it anyway' })).toBeVisible();
  expect(replay(saved.config, (await savedCommands(page)).commands).state.contracts).toHaveLength(1);
  await next.getByRole('button', { name: 'Yes, take it anyway' }).click();
  expect(replay(saved.config, (await savedCommands(page)).commands).state.contracts).toHaveLength(2);
});

test('a neighbour put off only by price names their own, and taking it books that price', async ({ page }) => {
  // Main Street, panel-1, with Launchlet beside Bespoke: one small shop would pay 300 for the 340 Launchlet.
  await page.goto('/#play=main-street:panel-1');
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  await expect(comparison.locator('.hagglers .roster-row').filter({ hasText: 'Offers 300 cr' })).toHaveCount(1);
  await expect(page.locator('.hagglers-head')).toContainText(`expect by ${RULES.counter.wtpDropPercent}% for ${RULES.counter.days} days`);
  await comparison.locator('.hagglers .roster-row').filter({ hasText: 'Offers 300 cr' }).click();
  await page.locator('.focused-decision').getByRole('button', { name: /^Take at 300 cr/ }).click();
  await expect(page.getByText('Sold: Launchlet, 300 cr paid up front.')).toBeVisible();
});

test('when hours hold buyers back, the window offers the lever, priced against what they would pay', async ({ page }) => {
  // Main Street, panel-1, same-day Launchlet: after the first take, overtime makes room for two more.
  await page.goto('/#play=main-street:panel-1');
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  if (await comparison.isVisible()) await comparison.getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Window');
  await takeFocused(page);
  await page.getByRole('button', { name: /^Next customer/ }).click();
  const beforeOptions = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  await expect(page.locator('.decision-levers .levers button')).toHaveCount(0);
  await page.locator('.decision-levers > summary').click();
  const overtime = page.locator('.decision-levers .levers li').filter({ has: page.getByRole('button', { name: 'Book overtime (240 cr)' }) });
  await expect(overtime).toContainText('+2 buyers in queue order. Fits Juno, Mara. +680 cr in orders');
  await page.locator('.decision-levers > summary').click();
  await expect(page.locator('.decision-levers .levers button')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(beforeOptions);
  await page.locator('.decision-levers > summary').click();
  await expect(overtime).toContainText('+2 buyers in queue order. Fits Juno, Mara. +680 cr in orders');
  await expect(page.getByRole('button', { name: /^Take everyone who fits/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Book overtime (240 cr)' }).click();
  // The comparison distinguishes individual fit from the two who fit together.
  await openComparison(page, true);
  await expect(page.getByText(/^3 fit on their own, but only 2 together\. Choose who gets the hours: the rest update as you take them\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take everyone who fits (2)', exact: true })).toBeVisible();
});

test('an evening that lost buyers to hours offers Noor before tomorrow, and the morning shows her coming', async ({ page }) => {
  await page.goto('/#play=main-street:panel-1');
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  if (await comparison.isVisible()) await comparison.getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Window');
  await takeFocused(page);
  await answerHagglers(page);
  await openBtn(page).click();
  // A mid-day call can hold the day; leaving it keeps the day's hours as they were.
  await page.locator('.evening, .call').first().waitFor({ timeout: 60_000 });
  const call = page.getByRole('alertdialog', { name: /^A call at/ });
  if (await call.count()) await call.getByRole('button', { name: /^Leave it/ }).click();
  await page.locator('.evening').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Hire Noor (250 cr a day)', exact: true }).click();
  await openStudio(page);
  await expect(page.locator('#studio')).toContainText(/Starting soon: Noor, Day 3/);
});

test('a first season opens the street, flyers, the AI desk, then upgrades over the first mornings', async ({ page }) => {
  await page.goto(STREET);
  // The first morning is the window alone: the studio's panels come the next day.
  await expect(page.getByRole('region', { name: 'Plan the studio' })).toHaveCount(0);
  await openDay(page);
  await goPlace(page, 'Studio');
  await expect(page.locator('.new-today')).toContainText('the street panel');
  await openTab(page, 'AI desk');
  await expect(page.locator('#desk')).toContainText('An AI desk can join from Day 4.');
  await expect(page.getByRole('radio', { name: /One AI desk/ })).toHaveCount(0);
  await openTab(page, 'Studio');
  await expect(page.locator('#studio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hand out flyers' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Upgrades, bought once' })).toHaveCount(0);
  await openDay(page);
  await goPlace(page, 'Studio');
  await expect(page.locator('.new-today')).toContainText('flyers');
  await openTab(page, 'Studio');
  await expect(page.getByRole('button', { name: 'Hand out flyers' })).toBeVisible();
  await openDay(page);
  await goPlace(page, 'Studio');
  await expect(page.locator('.new-today')).toContainText('the AI desk');
  await openTab(page, 'AI desk');
  await expect(page.getByRole('radio', { name: /One AI desk/ })).toHaveCount(1);
  await openTab(page, 'Studio');
  await expect(page.getByRole('heading', { name: 'Upgrades, bought once' })).toHaveCount(0);
  await openDay(page);
  await goPlace(page, 'Studio');
  await expect(page.locator('.new-today')).toHaveCount(0);
  await openDay(page);
  await goPlace(page, 'Studio');
  await expect(page.locator('.new-today')).toContainText('upgrades');
  await openTab(page, 'Studio');
  await expect(page.getByRole('heading', { name: 'Upgrades, bought once' })).toBeVisible();
});

test('neighbours who name their own price get an answer: opening turns down any not taken, and says so', async ({ page }) => {
  await page.goto('/#play=main-street:panel-1');
  await openComparison(page);
  await page.getByRole('button', { name: 'Design an offer for them' }).click();
  const ws = page.getByRole('dialog', { name: 'Offer workshop' });
  await ws.getByRole('button', { name: 'Launchlet' }).click();
  await ws.getByRole('button', { name: 'Put on the window' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  const hagglers = comparison.locator('.hagglers .roster-row');
  await expect(hagglers.first()).toBeVisible();
  await expect(page.locator('#haggle-waiting')).toContainText('opening the shop turns the rest down');
  await expect(openBtn(page)).toHaveText(/, turning down \d+ price offers?$/);
  await comparison.getByRole('button', { name: /^Return to / }).click();
  await openBtn(page).click();
  await page.locator('.evening').waitFor({ timeout: 60_000 });
  const { commands } = await savedCommands(page);
  expect(commands.filter((c) => c.type === 'decline').length).toBeGreaterThan(0);
});
