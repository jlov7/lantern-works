import { expect, test } from '@playwright/test';
import recorded from '../src/engine/fixtures/call-future-promises-5.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { CallOption, Command } from '../src/engine/types';
import { reviewWindow } from './workspace-helpers';

for (const width of [320, 390]) for (const option of ['late', 'cut', 'ring', 'ride'] as CallOption[]) {
  test(`the held call discloses later promises and preserves ${option} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.evaluate(save => {
      localStorage.clear();
      localStorage.setItem('lantern.guide.v1', 'seen');
      localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
      localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    }, recorded);
    await page.reload();
    await page.getByRole('button', { name: 'Continue Careful Season', exact: true }).click();
    const call = page.getByRole('alertdialog', { name: /^A call at/ });
    await expect(call).toContainText('Forecast through existing deadlines');
    const ring = call.getByRole('button', { name: /^Ring Malik/ });
    await expect(ring).toHaveAccessibleDescription(/Also at risk with this answer: Agnes \(due Day 8\)/);
    const ringOutcome = call.locator(`#${await ring.getAttribute('aria-describedby')}`);
    await expect(ringOutcome).toBeVisible();
    await expect(ringOutcome).not.toHaveClass(/is-saved/);
    await expect(ringOutcome).toContainText('225 cr');
    await expect(ringOutcome).not.toContainText(/Finn|Lorna/);
    for (const other of ['cut', 'ride']) await expect(call.locator(`#call-${other}`)).not.toContainText('Agnes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const labels = { late: 'Everyone stays until 5pm', cut: 'Ship it without the change', ring: 'Ring Malik:', ride: 'Leave it' };
    await call.getByRole('button', { name: new RegExp(`^${labels[option]}`) }).click();
    await expect(call).toHaveCount(0);
    await expect(page.locator('.evening')).toBeVisible();
    const commands = [...recorded.commands, { type: 'answer', option }] as Command[];
    const savedCommands = () => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
    expect(await savedCommands()).toEqual(commands);
    const expected = replay(recorded.config, commands, recorded.rules);
    expect(expected.errors).toEqual([]);
    await page.reload();
    await page.getByRole('button', { name: 'Continue Careful Season', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lantern Works, Careful Season, Day 7', exact: true })).toBeVisible();
    expect(await savedCommands()).toEqual(commands);
    // Continue this native command history to its ending without taking new work.
    for (let day = expected.state.day; day < 12; day++) {
      await reviewWindow(page);
      const news = page.locator('#pending-news .news-option').first();
      if (await news.count()) await news.click();
      await page.getByRole('button', { name: /^Open the shop for Day/ }).click();
      await page.locator('.evening, .call').first().waitFor();
      if (await call.count()) await call.getByRole('button', { name: 'Leave it', exact: true }).click();
      await expect(page.locator('.evening')).toBeVisible();
    }
    await page.getByRole('button', { name: 'See how the season went', exact: true }).click();
    const finalCommands = await savedCommands() as Command[];
    const finished = replay(recorded.config, finalCommands, recorded.rules);
    expect(finished.errors).toEqual([]);
    expect(finished.state.finished).toBe(true);
    expect(finalCommands.slice(0, commands.length)).toEqual(commands);
    await expect(page.locator('.end-picture')).toBeVisible();
  });
}
