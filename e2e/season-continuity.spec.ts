import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { summarize } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { openComparison, reviewWindow, takeFocused } from './workspace-helpers';

const recorded = JSON.parse(readFileSync('test-fixtures/replays/first-session.json', 'utf8')) as { config: RunConfig; commands: Command[] };
const prefix = recorded.commands.slice(0, 8);
const interrupted = replay(recorded.config, [...prefix, { type: 'runDay', calls: true }], LEGACY_RULES_VERSION);

async function takeFittingCustomers(page: Page) {
  for (let count = 0; count < 30; count++) {
    const bulk = page.getByRole('button', { name: /^Take everyone who fits/ });
    if (await bulk.count()) await bulk.click();
    else {
      const comparison = await openComparison(page);
      const row = comparison.locator('.roster-row:has(.roster-fit)').filter({ hasText: /Fits (on its own|with)/ }).first();
      if (!(await row.count())) {
        await comparison.getByRole('button', { name: /^Return to / }).click();
        return;
      }
      await row.click();
      await takeFocused(page);
    }
    const next = page.locator('.reply-receipt').getByRole('button', { name: /^Next customer/ });
    if (await next.isEnabled()) await next.click();
  }
  throw new Error('The morning did not settle after 30 replies');
}

async function saved(page: Page): Promise<{ config: RunConfig; commands: Command[]; rules: string }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
}

async function reachEvening(page: Page) {
  expect(interrupted.errors).toEqual([]);
  expect(interrupted.state.day).toBe(1);
  expect(interrupted.state.call?.jobId).toBe('c3-l1');
  await page.goto('/');
  await page.evaluate((save) => localStorage.setItem('lantern.runs.v1', JSON.stringify([save])), {
    v: 1, rules: LEGACY_RULES_VERSION, id: 'continuity', label: 'Continuity season', savedAt: '2026-10-24T10:00:00Z',
    config: recorded.config, commands: prefix,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Continuity season', exact: true }).click();
  await page.getByRole('button', { name: /^Open the shop for Day 2/ }).click();
  await expect(page.getByRole('alertdialog', { name: /^A call at/ })).toBeVisible();
  await page.getByRole('button', { name: 'Leave it', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
}

test('reloading after answering a call preserves the unseen evening and exact saved day', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reachEvening(page);
  const before = await saved(page);
  const expected = replay(before.config, before.commands, before.rules);
  expect(expected.errors).toEqual([]);
  expect(expected.state.call).toBeNull();
  expect(expected.state.day).toBe(2);
  const sentence = await page.locator('.evening-sentence').textContent();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Continuity season', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await expect(page.locator('.evening-sentence')).toHaveText(sentence!);
  const after = await saved(page);
  expect(after.commands).toEqual(before.commands);
  expect(replay(after.config, after.commands, after.rules).state).toEqual(expected.state);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `scratch/season-continuity/reloaded-${info.project.name}.png` });
});

test('the next morning cannot undo a call answer and rewind the completed day', async ({ page }, info) => {
  await reachEvening(page);
  await reviewWindow(page);
  const before = await saved(page);
  expect(before.commands.at(-1)).toEqual({ type: 'answer', option: 'ride' });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await reviewWindow(page);
  await page.locator('.news:not(.news-done) .news-option').first().click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect((await saved(page)).commands).toEqual(before.commands);
  await page.screenshot({ path: `scratch/season-continuity/undo-boundary-${info.project.name}.png` });
});

test('consecutive UI days retain their results and exact replay through reloads to the season end', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#play=main-street:e2e-1');
  const skipGuide = page.getByRole('button', { name: 'Skip the guide', exact: true });
  if (await skipGuide.isVisible()) await skipGuide.click();
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  const days = [];
  for (let day = 1; day <= RULES.days; day++) {
    await reviewWindow(page);
    const news = page.locator('.news:not(.news-done) .news-option').first();
    if (await news.count()) await news.click();
    await takeFittingCustomers(page);
    await page.getByRole('button', { name: new RegExp(`^Open the shop for Day ${day}\\b`) }).click();
    await expect(page.locator('.evening, .call').first()).toBeVisible();
    const call = page.getByRole('alertdialog', { name: /^A call at/ });
    const called = (await call.count()) > 0;
    if (called) await call.getByRole('button', { name: 'Leave it', exact: true }).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^Day ${day}, evening`) })).toBeVisible();
    const before = await saved(page);
    const native = replay(before.config, before.commands, before.rules);
    expect(native.errors).toEqual([]);
    const sentence = await page.locator('.evening-sentence').textContent();
    days.push({ day, called, commands: before.commands.length, sentence });
    if ([4, 8, 11, 12].includes(day)) await page.screenshot({ path: `scratch/season-continuity/day-${day}-${info.project.name}.png`, fullPage: true });
    if (day === RULES.days) {
      await page.getByRole('button', { name: 'See how the season went', exact: true }).click();
      const summary = summarize(native.state);
      await expect(page.locator('table.compare tr.you td').nth(0)).toHaveText(String(summary.served));
      await expect(page.locator('table.compare tr.you td').nth(3)).toHaveText(`${summary.cash.toLocaleString('en-GB')} cr`);
      expect(native.state.finished).toBe(true);
    }
    await page.reload();
    const current = await saved(page);
    expect(current.commands).toEqual(before.commands);
    expect(replay(current.config, current.commands, current.rules).state).toEqual(native.state);
    if (day < RULES.days) {
      await page.getByRole('button', { name: /^Continue / }).last().click();
      await expect(page.locator('.evening-sentence')).toHaveText(sentence!);
      await reviewWindow(page);
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    } else {
      await page.getByRole('button', { name: /^Look back at / }).last().click();
      await expect(page.getByRole('heading', { name: 'The season’s body of work' })).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
  writeFileSync(`scratch/season-continuity/season-${info.project.name}.json`, JSON.stringify({ days, save: await saved(page), errors }, null, 2) + '\n');
});
