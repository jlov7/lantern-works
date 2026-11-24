import { expect, test, type Page } from '@playwright/test';
import { openDayTwo } from './day-two-helpers';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

const neighbours = ['Mara', 'Amara', 'Yusuf', 'Tobias', 'Ines', 'Kofi', 'Yara'];

async function wordsAboveDock(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.game')!;
    const dock = document.querySelector('.workspace-dock')!;
    const fold = getComputedStyle(dock).position === 'fixed' ? dock.getBoundingClientRect().top : window.innerHeight;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let count = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest('.workspace-dock, .vh, .skip-link, svg, script, style, [aria-hidden="true"]')) continue;
      if (!parent.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
      for (const word of node.textContent!.matchAll(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        if (Array.from(range.getClientRects()).some(rect => rect.height > 0 && rect.bottom > 0
          && rect.top < fold && rect.right > 0 && rect.left < innerWidth)) count++;
      }
    }
    return count;
  });
}

for (const viewport of ['iphone', 'ipad', 'desktop', 'duo-outer'] as const) {
  test(`the Day 2 bridge keeps the full queue on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per case');
    await page.setViewportSize(VIEWPORTS[viewport]);
    await openDayTwo(page);

    const bridge = page.locator('.window-bridge');
    const summary = page.locator('.morning-more > summary');
    const forecast = page.getByText('Forecast assumes no redos or later changes.', { exact: false });
    const notice = page.locator('.window-neighbours > .project-notice');
    const roster = page.getByRole('list', { name: 'Customer roster', includeHidden: true });
    await expect(bridge).toHaveText('7 neighbours are waiting. 2 jobs fit today, in queue order.');
    await expect(page.getByText('Promised today:', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^0 launches due/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reply to remaining (7)', exact: true })).toBeVisible();
    await expect(roster.locator('strong')).toHaveText(neighbours);
    await expect(notice).toContainText('Lantern Night, Day 12');
    await expect(forecast).toBeHidden();
    const words = await wordsAboveDock(page);
    console.info('Day 2 viewport words', { viewport, words });
    if (viewport === 'iphone') expect(words).toBeLessThanOrEqual(120);
    await axe(page, 'main');
    await shot(page, 'LW-020', `LW-020-${viewport}-day2-first`);

    const heading = page.getByRole('heading', { name: 'At the window', exact: true });
    await heading.focus();
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    const focus = await summary.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      outline: getComputedStyle(element).outlineWidth,
    }));
    expect(focus.height).toBeGreaterThanOrEqual(44);
    expect(focus.outline).toBe('2px');
    const frames = await frameDeltas(page, () => page.keyboard.press('Enter'), 1000);
    assertFrameBudget(frames);
    expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    await expect(forecast).toBeVisible();
    await axe(page, 'main');
    await shot(page, 'LW-020', `LW-020-${viewport}-day2-details-open`);

    if (viewport === 'iphone') {
      const compare = page.getByRole('button', { name: 'See all 7 neighbours', exact: true });
      await compare.click();
      await expect(page.getByRole('button', { name: 'Take everyone who fits (2)', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(compare).toBeFocused();
      await expect.poll(() => page.evaluate(() => localStorage.getItem('lantern.day2-bridge.v1'))).toBe('seen');
      const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
      await page.reload();
      await page.getByRole('button', { name: 'Continue the season' }).click();
      await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
      await expect(forecast).toBeVisible();
      await expect(bridge).toHaveCount(0);
      await expect(page.locator('.window-tools .project-notice')).toContainText('Lantern Night, Day 12');
      const commands = (value: string | null) => JSON.parse(value ?? '[]').map((run: { commands: unknown[] }) => run.commands);
      expect(commands(await page.evaluate(() => localStorage.getItem('lantern.runs.v1')))).toEqual(commands(before));
    }
  });
}
