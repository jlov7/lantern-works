import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { selectCustomer } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

const fixture = JSON.parse(readFileSync('src/ui/game/fixtures/late-phone-width.json', 'utf8')) as { config: RunConfig; commands: Command[] };
test.setTimeout(30_000);

test('the recorded late-season evening and next morning fit without sideways scrolling', async ({ page }, info) => {
  const native = replay(fixture.config, fixture.commands, LEGACY_RULES_VERSION);
  expect(native.errors).toEqual([]);
  expect(native.state.day).toBe(11);
  expect(native.state.finished).toBe(false);
  await page.goto('/');
  await page.evaluate((save) => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    localStorage.setItem('lantern.evening.v1', JSON.stringify({ runId: save.id, day: 10 }));
  }, { ...fixture, v: 1, rules: LEGACY_RULES_VERSION, id: 'late-width', label: 'Late phone width', savedAt: '2026-10-24T10:00:00Z' });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Late phone width', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Day 11, evening', exact: true })).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('main *')].flatMap((element) => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 ? [{ tag: element.tagName, class: element.className.toString(), text: element.textContent?.slice(0, 100), left: r.left, right: r.right, width: r.width, whiteSpace: getComputedStyle(element).whiteSpace, minWidth: getComputedStyle(element).minWidth }] : [];
    }).slice(-40),
  }));
  mkdirSync('scratch/late-phone-width', { recursive: true });
  writeFileSync(`scratch/late-phone-width/layout-${info.project.name}.json`, JSON.stringify(layout, null, 2) + '\n');
  await page.screenshot({ path: `scratch/late-phone-width/recorded-${info.project.name}.png`, fullPage: true });
  expect(layout.document, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(layout.viewport);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await selectCustomer(page, 'd11-r1');
  const warning = page.locator('.ticket .fit-warn');
  await expect(warning).toHaveText(' Fits, with redo risk; a miss now would cost the medal.');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    const warningLines = await warning.evaluate((element) => [...element.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right })));
    expect(warningLines.every((rect) => rect.left >= 0 && rect.right <= width), JSON.stringify(warningLines)).toBe(true);
    await expect(warning).toHaveText(' Fits, with redo risk; a miss now would cost the medal.');
    await page.evaluate(() => document.documentElement.style.fontSize = '');
  }
  const ticket = page.locator('.ticket').filter({ has: page.getByText('Sam', { exact: true }) });
  await ticket.screenshot({ path: `scratch/late-phone-width/warning-${info.project.name}.png` });
  await expect(ticket.locator('[data-customer-heading]')).toBeFocused();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual(fixture.commands);
  expect(replay(saved.config, saved.commands, LEGACY_RULES_VERSION).state).toEqual(native.state);
});
