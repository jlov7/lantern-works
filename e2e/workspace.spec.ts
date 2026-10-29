import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { replay } from '../src/engine/sim';
import { reactionTo } from '../src/engine/selectors';
import { ordinaryBrief } from '../src/engine/ordinary';
import { FIRST_SEASON } from '../src/ui/screens/firstSeason';
import type { Command, RunConfig } from '../src/engine/types';
import late from '../src/ui/game/fixtures/late-phone-width.json' with { type: 'json' };

const recorded = JSON.parse(readFileSync('test-fixtures/replays/sign-tapes.json', 'utf8')).main as { config: RunConfig; commands: Command[] };
const handmade = JSON.parse(readFileSync('test-fixtures/replays/handmade-run.json', 'utf8')) as { config: RunConfig; commands: Command[] };
async function commandsOf(page: Page) {
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]?.commands);
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
}

async function load(page: Page, config: RunConfig, commands: Command[]) {
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: LEGACY_RULES_VERSION, id: 'workspace', label: 'Workspace', savedAt: new Date().toISOString(), config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Workspace', exact: true }).click();
}

function morning(config: RunConfig, commands: Command[], day: number) {
  for (let count = 1; count <= commands.length; count++) {
    const run = replay(config, commands.slice(0, count), LEGACY_RULES_VERSION);
    if (run.state.day === day && !run.state.call) return commands.slice(0, count);
  }
  throw new Error(`Recorded morning ${day + 1} is missing`);
}

async function choose(page: Page, name: string) {
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  await comparison.getByRole('button').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).first().click();
  await expect(page.locator('[data-customer-heading]')).toHaveText(name);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
}

for (const width of [320, 390]) test(`guided first sale keeps its decision clear of the dock at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  const before = await commandsOf(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#guide-step-1')).toBeFocused();
  const ticket = page.locator('.focused-decision .ticket');
  await expect(ticket).toContainText('One trio, after the doors open.');
  await expect(ticket).toContainText('900 cr');
  await expect(ticket).toContainText('due Day 3');
  const take = ticket.getByRole('button', { name: 'Take it', exact: true });
  expect(await commandsOf(page)).toEqual(before);
  const box = await take.boundingBox();
  const dock = await page.locator('.workspace-dock').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y);
  await take.click();
  await expect(page.locator('.reply-receipt')).toContainText('Clem has your answer');
  await expect(page.locator('.reply-receipt')).toBeFocused();
  const after = await commandsOf(page);
  const state = replay(FIRST_SEASON, before).state;
  const request = state.requests.find(request => request.id === 'd0-r0')!;
  const reaction = reactionTo(state, request);
  if (reaction.kind !== 'buy') throw new Error('The guided first request must buy.');
  expect(after).toEqual([...before, { type: 'accept', requestId: 'd0-r0', design: ordinaryBrief(request, reaction.offer)!.defaultDesign }]);
  await page.getByRole('button', { name: /^Next customer/ }).click();
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  expect(await commandsOf(page)).toEqual(after);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-customer-heading]')).toHaveText('Clem');
  expect(await commandsOf(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test('crowded comparison, Work and Studio preserve one named decision and command authority', async ({ page }, info) => {
  const commands = morning(recorded.config, recorded.commands, 4);
  await load(page, recorded.config, commands);
  await expect(page.locator('.focused-decision .ticket')).toHaveCount(1);
  for (const name of ['Mina', 'Finn', 'Lorna', 'Oscar']) await choose(page, name);
  expect(await commandsOf(page)).toEqual(commands);
  await choose(page, 'Mina');
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.getByText('Considering Mina. This is a preview; no order has been taken.', { exact: true })).toBeVisible();
  await expect(page.locator('.work-place .dayplan')).toContainText('Mina');
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByRole('radio', { name: 'Careful', exact: true }).check();
  await page.getByRole('button', { name: 'Return to Mina', exact: true }).click();
  await expect(page.locator('[data-customer-heading]')).toHaveText('Mina');
  expect(await commandsOf(page)).toEqual([...commands, { type: 'pace', pace: 'careful' }]);
  await page.screenshot({ path: `scratch/workspace/crowded-${info.project.name}.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.window-scene svg.lw-world')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Customer roster' }).getByRole('button').first()).toBeVisible();
  await expect(page.locator('.ticket-waiting')).toHaveCount(1);
  await expect(page.locator('[data-customer-heading]')).toHaveText('Mina');
});

test('pending news adds a focused order, then workshop save and cancel retain the context', async ({ page }) => {
  const commands = handmade.commands.slice(0, 11);
  await load(page, handmade.config, commands);
  await expect(page.locator('.pending-news')).toBeVisible();
  await page.getByRole('button', { name: 'Add the order to the window', exact: true }).click();
  await expect(page.locator('#ticket-d2-n')).toBeVisible();
  await expect(page.locator('#ticket-d2-n')).toContainText('Ten years of Clem');
  expect(await commandsOf(page)).toEqual([...commands, { type: 'choose', newsId: 'n2', option: 1 }]);
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Studio', exact: true }).click();
  const redesign = page.getByRole('button', { name: /^Redesign / }).first();
  await redesign.click();
  await expect(page.locator('.ws-mini')).toContainText('fit today in queue order');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(redesign).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  await redesign.click();
  await page.getByLabel('Price for the whole offer').fill('-1');
  await expect(page.getByRole('button', { name: 'Put on the window', exact: true })).toBeDisabled();
  await expect(page.locator('#price-err')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByLabel('Price for the whole offer')).toHaveValue('-1');
  await page.getByLabel('Price for the whole offer').fill('890');
  await page.getByRole('button', { name: 'Put on the window', exact: true }).click();
  await expect(redesign).toBeFocused();
  await page.getByRole('button', { name: 'Return to Clem', exact: true }).click();
  await expect(page.locator('#ticket-d2-n')).toBeVisible();
  const beforeEdit = replay(handmade.config, [...commands, { type: 'choose', newsId: 'n2', option: 1 }], LEGACY_RULES_VERSION).state;
  expect(await commandsOf(page)).toEqual([...commands, { type: 'choose', newsId: 'n2', option: 1 }, { type: 'setMenu', offers: beforeEdit.menu.map((offer, index) => index === 0 ? { ...offer, price: 890 } : offer) }]);
});

test('place navigation and resizing preserve the selected customer and deliberate comparison', async ({ page }) => {
  await load(page, recorded.config, morning(recorded.config, recorded.commands, 4));
  await choose(page, 'Mina');
  await page.locator('.morning-notes > summary').scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Window', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  await expect(page.locator('[data-customer-heading]')).toHaveText('Mina');
  const before = await commandsOf(page);
  const compare = page.getByRole('button', { name: /^Compare \/ All neighbours/ });
  await compare.click();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Compare all neighbours' })).toBeVisible();
  await expect(page.locator('.ticket-waiting').filter({ has: page.locator('[data-customer-heading]') })).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('dialog').getByRole('button', { name: 'Return to Mina', exact: true }).click();
  await expect(compare).toBeFocused();
  expect(await commandsOf(page)).toEqual(before);
});

test('the focused launch illustration uses the actual brief without taking the order', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await load(page, handmade.config, handmade.commands.slice(0, 11));
  await page.getByRole('button', { name: 'Add the order to the window', exact: true }).click();
  const before = await commandsOf(page);
  await page.locator('.brief-preview > summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.brief-artwork')).toContainText('Ten years of Clem');
  await expect(page.locator('.brief-artwork .campaign-art')).toHaveAttribute('data-subject', 'saxophone');
  expect(await commandsOf(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.keyboard.press('Enter');
  await expect(page.locator('.brief-artwork')).not.toBeVisible();
});

test('reviewing tomorrow puts the evening away and opens the actual next window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Take it', exact: true }).click();
  await page.getByRole('button', { name: /^Open .*Day 1/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  const before = await commandsOf(page);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Window', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.evening')).toHaveCount(0);
  await expect(page.locator('#window-h')).toBeFocused();
  expect(await commandsOf(page)).toEqual(before);
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.locator('#guide-step-4')).toBeVisible();
});

test('late warning and due work remain accessible at large text and short landscape', async ({ page }) => {
  await load(page, late.config, late.commands as Command[]);
  await choose(page, 'Sam');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await expect(page.locator('.ticket .fit-warn')).toContainText('a miss now would cost the medal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.locator('.work-place .due-next')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.workspace-dock')!).position)).toBe('static');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
