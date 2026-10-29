import { expect, test } from '@playwright/test';
import recorded from '../src/engine/fixtures/main-courtyard-5.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

test.use({ reducedMotion: 'reduce' });

for (const textSize of [100, 200]) test(`opening discloses four actual lost regulars at 320px and ${textSize}% text`, async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const commands = recorded.commands.slice(0, 65) as Command[];
  const native = replay(recorded.config, commands, recorded.rules);
  expect(native.errors).toEqual([]);
  expect(native.state.day).toBe(10);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: recorded.rules, id: 'regular-loss', label: 'Regular loss', savedAt: new Date().toISOString(), config: recorded.config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Regular loss', exact: true }).click();
  if (textSize === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const warning = page.locator('#regulars-waiting');
  await expect(warning).toHaveText('Opening now loses 4 regulars over unanswered new orders: Oscar, Finn, Sam, Kofi. They will not return.');
  const open = page.getByRole('button', { name: /^Open the shop for Day 11/ });
  await expect(open).toHaveAccessibleDescription(/Opening now loses 4 regulars over unanswered new orders: Oscar, Finn, Sam, Kofi/);
  // The phone dock's Window destination is the route back to these customers.
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(warning).toBeVisible();
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  await expect(page.getByRole('region', { name: 'At the window', exact: true })).toBeVisible();
  await open.scrollIntoViewIfNeeded();
  const box = await open.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await open.click();
  await expect(page.locator('.evening')).toContainText('Oscar, Finn, Sam and Kofi came back today');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual([...commands, { type: 'runDay', calls: true }]);
  const actual = replay(recorded.config, saved.commands, recorded.rules);
  expect(actual.errors).toEqual([]);
  expect(actual.state.lostCast.filter(id => !native.state.lostCast.includes(id))).toEqual(['oscar', 'finn', 'sam', 'kofi']);
  const width = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll<HTMLElement>('body *')].filter(element => element instanceof HTMLElement && (element.getBoundingClientRect().right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1) && element.getBoundingClientRect().width > 0).map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right, scroll: element.scrollWidth, text: element.innerText.slice(0, 60) })) }));
  expect(width.page, JSON.stringify(width.overflow)).toBeLessThanOrEqual(width.viewport + 1);
  if (textSize === 200) {
    await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
    await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Work', exact: true }).click();
    for (const row of await page.locator('#promises .promise-list > li').all()) {
      const box = await row.boundingBox();
      const name = await row.locator('.p-who').boundingBox();
      expect(name!.width).toBeGreaterThan(box!.width * .75);
    }
    await page.locator('#promises').screenshot({ path: info.outputPath('large-text-promises.png') });
  }
});
