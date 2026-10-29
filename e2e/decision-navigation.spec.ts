import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PRESETS } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { selectCustomer } from './workspace-helpers';
import { savedRunSchema } from '../src/ui/schema';

const tape = savedRunSchema.parse(JSON.parse(readFileSync('test-fixtures/replays/handmade-run.json', 'utf8')));

async function openPrefix(page: Page, count: number, source = tape.commands) {
  const commands = source.slice(0, count);
  expect(replay(tape.config, commands, LEGACY_RULES_VERSION).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { ...tape, rules: LEGACY_RULES_VERSION, id: 'navigation', label: 'Decision navigation', commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Decision navigation', exact: true }).click();
  return commands;
}

const commandsOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);

async function exposed(locator: Locator) {
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(locator).toBeInViewport({ ratio: 1 });
  await expect.poll(() => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
}

test('showing a buyer keeps the plan beside its decision without changing commands', async ({ page }, info) => {
  const commands = await openPrefix(page, 17);
  const ticket = await selectCustomer(page, 'd3-r1');
  await ticket.locator('.decision-plan > summary').click();
  await page.screenshot({ path: `scratch/decision-navigation/plan-${info.project.name}.png` });
  const explanation = page.locator('.dayplan-free').filter({ hasText: 'With Ash:' });
  await explanation.scrollIntoViewIfNeeded();
  await exposed(explanation);
  await expect(ticket.locator('.dayplan')).toContainText('With Ash:');
  const take = ticket.getByRole('button', { name: /^Take it/ });
  await take.scrollIntoViewIfNeeded();
  await exposed(take);
  await expect(ticket.locator('.verdict')).toContainText(/cr.*due/);
  expect(await commandsOf(page)).toEqual(commands);
});

test('the observed returning Yusuf keeps his timing explanation and action in view', async ({ page }, info) => {
  const observed: Command[] = [
    { type: 'accept', requestId: 'd0-r0', maker: 'h1' },
    { type: 'accept', requestId: 'd0-r2', maker: 'h2' },
    { type: 'accept', requestId: 'd0-r4' }, { type: 'runDay', calls: true },
    { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] },
    { type: 'accept', requestId: 'd1-r2' }, { type: 'accept', requestId: 'd1-r3' },
    { type: 'runDay', calls: true }, { type: 'answer', option: 'ring' },
    { type: 'choose', newsId: 'n2', option: 1 }, { type: 'accept', requestId: 'd2-n', maker: 'h1' },
    { type: 'accept', requestId: 'd2-r1' }, { type: 'hire' },
    { type: 'runDay', calls: true }, { type: 'answer', option: 'late' },
    { type: 'choose', newsId: 'n3', option: 3 },
  ];
  const commands = await openPrefix(page, observed.length, observed);
  const ticket = await selectCustomer(page, 'd3-r8');
  await ticket.locator('.decision-plan > summary').click();
  await exposed(ticket.locator('.dayplan-free'));
  await expect(ticket.locator('.dayplan-free')).toContainText('With Yusuf:');
  await ticket.getByRole('button', { name: 'Take it', exact: true }).scrollIntoViewIfNeeded();
  await exposed(ticket.getByRole('button', { name: 'Take it', exact: true }));
  await expect(ticket.locator('.verdict')).toContainText('340 cr');
  expect(await commandsOf(page)).toEqual(commands);
  await page.screenshot({ path: `scratch/decision-navigation/yusuf-${info.project.name}.png` });
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`adding a news order reveals and focuses the new request without taking it (${reducedMotion})`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion });
  const commands = await openPrefix(page, 11);
  await page.getByRole('button', { name: 'Add the order to the window', exact: true }).click();
  const ticket = page.locator('#ticket-d2-n');
  await expect(ticket).toHaveClass(/is-selected/);
  await expect(ticket.locator('[data-customer-heading]')).toBeFocused();
  await exposed(ticket.getByRole('button', { name: 'Ada makes it', exact: true }));
  await expect(ticket).toContainText('Ten years of Clem');
  await expect(ticket).toContainText(/work, .*without redo/);
  await expect(ticket.locator('.dayplan')).toHaveCount(0);
  expect(await commandsOf(page)).toEqual([...commands, { type: 'choose', newsId: 'n2', option: 1 }]);
  await page.screenshot({ path: `scratch/decision-navigation/news-${reducedMotion}-${info.project.name}.png` });
});
