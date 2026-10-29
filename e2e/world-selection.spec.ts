import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goPlace } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import { savedRunSchema } from '../src/ui/schema';

const tape = savedRunSchema.parse(JSON.parse(readFileSync('test-fixtures/replays/sign-tapes.json', 'utf8')).main);
const firstOpen = tape.commands.findIndex(c => c.type === 'runDay');

test.use({ hasTouch: true });

async function loadPrefix(page: Page, count = firstOpen + 1) {
  const commands = tape.commands.slice(0, count);
  expect(replay(tape.config, commands, LEGACY_RULES_VERSION).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ commands, config, rules }) => {
    localStorage.clear();
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'world', label: 'World selection', savedAt: new Date().toISOString(), config, commands }]));
  }, { commands, config: tape.config, rules: LEGACY_RULES_VERSION });
  await page.reload();
  await page.getByRole('button', { name: 'Continue World selection', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Day ${replay(tape.config, commands, LEGACY_RULES_VERSION).state.day + 1}`);
  await goPlace(page, 'Work');
  return commands;
}

const world = (page: Page) => page.locator('main.stage .lw-world:visible');
const oscar = (page: Page) => world(page).getByRole('button', { name: /^Oscar, Oscar Brewing:/ });
const commandsOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);

test('customer controls remain available after the ordinary first evening', async ({ page }, info) => {
  await loadPrefix(page, firstOpen);
  await page.getByRole('button', { name: /^Open the shop for Day 1/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await expect(world(page)).toBeVisible();
  await expect(oscar(page)).toHaveCount(0);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Work');
  await expect(oscar(page)).toHaveCount(1);
  await oscar(page).click();
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await expect(page.locator('#ticket-d1-r0')).toContainText('Oscar Brewing');
  await page.locator('#ticket-d1-r0 .decision-plan > summary').click();
  await expect(page.locator('#ticket-d1-r0 .dayplan-free')).toContainText('With Oscar:');
  expect(await commandsOf(page)).toEqual(tape.commands.slice(0, firstOpen + 1));
  await goPlace(page, 'Work');
  await world(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/compact-world-selection/after-evening-${info.project.name}.png` });
});

test('touching a compact neighbour selects the existing ticket without selling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await loadPrefix(page);
  await expect(world(page)).toHaveClass(/lw-phone/);
  await oscar(page).tap();
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await goPlace(page, 'Work');
  await expect(oscar(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await commandsOf(page)).toEqual(commands);
});

test('dragging from a neighbour pans without selecting, then a tap still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await loadPrefix(page);
  await expect(world(page)).toHaveClass(/lw-phone/);
  await world(page).scrollIntoViewIfNeeded();
  const before = await world(page).getAttribute('viewBox');
  const selection = await oscar(page).getAttribute('aria-pressed');
  const hit = await oscar(page).locator('.lw-hit').boundingBox();
  expect(hit).not.toBeNull();
  const x = hit!.x + hit!.width / 2, y = hit!.y + hit!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 25, y, { steps: 5 });
  await page.mouse.up();
  await expect(world(page)).not.toHaveAttribute('viewBox', before!);
  await expect(oscar(page)).toHaveAttribute('aria-pressed', selection!);
  await expect(page.locator('.ticket.is-selected')).toHaveCount(0);
  await oscar(page).focus();
  await oscar(page).press('Enter');
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await goPlace(page, 'Work');
  await oscar(page).press('Space');
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await goPlace(page, 'Work');
  await oscar(page).tap();
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  expect(await commandsOf(page)).toEqual(commands);
});

test('keyboard selection works after reload without changing the four-day tape', async ({ page }, info) => {
  await loadPrefix(page, tape.commands.length);
  await page.reload();
  await page.getByRole('button', { name: 'Continue World selection', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Day 5');
  await goPlace(page, 'Work');
  const mina = world(page).getByRole('button', { name: /^Mina, / });
  await expect(world(page)).toBeVisible();
  await mina.focus();
  await mina.press('Enter');
  await expect(page.locator('#ticket-d4-r2')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await expect(page.locator('#ticket-d4-r2')).toContainText('Mina');
  expect(await commandsOf(page)).toEqual(tape.commands);
  const native = replay(tape.config, await commandsOf(page), LEGACY_RULES_VERSION);
  expect(native.errors).toEqual([]);
  expect(native.state).toEqual(replay(tape.config, tape.commands, LEGACY_RULES_VERSION).state);
  await page.screenshot({ path: `scratch/compact-world-selection/later-morning-${info.project.name}.png` });
});

test('vertical page scrolling over the compact workshop leaves its pan and selection unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await loadPrefix(page);
  await expect(world(page)).toHaveClass(/lw-phone/);
  await world(page).scrollIntoViewIfNeeded();
  const before = await world(page).getAttribute('viewBox');
  const top = await page.evaluate(() => scrollY);
  const bounds = await world(page).boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(top);
  await expect(world(page)).toHaveAttribute('viewBox', before!);
  await expect(page.locator('.ticket.is-selected')).toHaveCount(0);
  expect(await commandsOf(page)).toEqual(commands);
});

test('vertical pointer escape and cancellation stop panning, then a touch still selects', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await loadPrefix(page);
  await expect(world(page)).toHaveClass(/lw-phone/);
  const before = await world(page).getAttribute('viewBox');
  const pointer = { pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 1 };
  await world(page).dispatchEvent('pointerdown', { ...pointer, clientX: 150, clientY: 150 });
  await world(page).dispatchEvent('pointermove', { ...pointer, clientX: 148, clientY: 190 });
  await world(page).dispatchEvent('pointermove', { ...pointer, clientX: 90, clientY: 150 });
  await expect(world(page)).toHaveAttribute('viewBox', before!);

  await world(page).dispatchEvent('pointerdown', { ...pointer, clientX: 150, clientY: 150 });
  await world(page).dispatchEvent('pointermove', { ...pointer, clientX: 125, clientY: 150 });
  await expect(world(page)).not.toHaveAttribute('viewBox', before!);
  const panned = await world(page).getAttribute('viewBox');
  await world(page).dispatchEvent('pointercancel', { ...pointer, buttons: 0 });
  await world(page).dispatchEvent('pointermove', { ...pointer, clientX: 90, clientY: 150 });
  await expect(world(page)).toHaveAttribute('viewBox', panned!);
  await expect(page.locator('.ticket.is-selected')).toHaveCount(0);
  await oscar(page).tap();
  await expect(page.locator('#ticket-d1-r0')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  expect(await commandsOf(page)).toEqual(commands);
});

test('a compact drag followed by a wide resize does not consume the next selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await loadPrefix(page, firstOpen);
  await expect(world(page)).toHaveClass(/lw-phone/);
  const pointer = { pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 1 };
  await world(page).dispatchEvent('pointerdown', { ...pointer, clientX: 150, clientY: 150 });
  await world(page).dispatchEvent('pointermove', { ...pointer, clientX: 125, clientY: 150 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(world(page)).not.toHaveClass(/lw-phone/);
  await world(page).dispatchEvent('pointerup', { ...pointer, buttons: 0 });
  await world(page).getByRole('button', { name: /^Malik, / }).click();
  await expect(page.locator('#ticket-d0-r4')).toHaveClass(/is-selected/);
  expect(await commandsOf(page)).toEqual(commands);
});
