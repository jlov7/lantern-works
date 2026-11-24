import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openDayTwo } from './day-two-helpers';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`the Day 2 queue reads clearly on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per case');
    await page.setViewportSize(VIEWPORTS[viewport]);
    await openDayTwo(page);
    const button = page.getByRole('button', { name: 'See all 7 neighbours', exact: true });
    await expect(button).toBeVisible();
    await expect(page.getByText(/fit together/)).toHaveCount(0);
    if (viewport === 'iphone') {
      expect(await button.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size;
      })).toBe(1);
    }
    await axe(page, 'main');
    await shot(page, 'LW-021', `LW-021-${viewport}-day2-first`);

    await button.press('Enter');
    const comparison = page.getByRole('dialog', { name: 'Compare all neighbours', exact: true });
    await expect(comparison.getByRole('heading', { name: 'Compare all neighbours' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();

    const { deltas, longFrames } = await frameDeltas(page, async () => {}, 1000);
    assertFrameBudget({ deltas, longFrames });
    expect(Math.max(...deltas)).toBeLessThanOrEqual(33);

    if (viewport === 'iphone') {
      await page.reload();
      await page.getByRole('button', { name: 'Continue the season' }).click();
      await expect(page.locator('.window-status p')).toHaveText('7 waiting, 2 fit in queue order');
      await expect(page.getByText(/fit together/)).toHaveCount(0);
    }
  });
}

const festival = JSON.parse(readFileSync('test-fixtures/replays/festival-season1.json', 'utf8'));

for (const [moves, day, label] of [[86, 9, '1 launch due tonight. See Work'], [107, 11, '2 launches due tonight. See Work']] as const) {
  test(`the due-work action reads ${label}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one actual saved morning per launch count');
    const saved = { ...festival, commands: festival.commands.slice(0, moves), v: 1, id: 'launch-grammar',
      label: 'Launch grammar', savedAt: '2026-10-27T04:00:00Z' };
    await page.addInitScript(run => {
      localStorage.setItem('lantern.guide.v1', 'seen');
      localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
    }, saved);
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue Launch grammar', exact: true }).click();
    await expect(page).toHaveTitle(`Day ${day} of 12, Festival Week - Lantern Works`);
    await page.getByRole('button', { name: label, exact: true }).press('Enter');
    await expect(page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'page');
  });
}
