import { expect, test } from '@playwright/test';
import morning from './fixtures/header-morning.json' with { type: 'json' };
import { RULES } from '../src/engine/rules';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import courtyard from '../src/engine/fixtures/main-courtyard-5.0.0.json' with { type: 'json' };
import { authoredCommands } from './authored-helpers';

for (const run of [
  { ...morning, rules: LEGACY_RULES_VERSION },
  { config: courtyard.config, commands: authoredCommands(courtyard.config, courtyard.commands.slice(0, 65) as Command[]), rules: RULES.version },
]) test(`${run.rules} header values and controls fit at normal and doubled text size`, async ({ page }, info) => {
  expect(replay(run.config, run.commands as Command[], run.rules).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ config, commands, rules }) => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'header', label: 'Header check', savedAt: new Date().toISOString(), config, commands }]));
  }, run);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Header check', exact: true }).click();
  for (const size of ['100%', '200%']) {
    await page.evaluate((fontSize) => { document.documentElement.style.fontSize = fontSize; }, size);
    const header = page.locator('.topbar-wrap');
    await expect.poll(() => header.evaluate((element) => Math.abs(parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) - element.getBoundingClientRect().height - 12) <= 1)).toBe(true);
    const boxes = await header.locator('.brand, .topbar-day, .stat, .topbar-tools button, .topbar-more summary').evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
      const r = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return { text: element.textContent, left: Math.min(r.left, text.left), right: Math.max(r.right, text.right), top: Math.min(r.top, text.top), bottom: Math.max(r.bottom, text.bottom) };
    }));
    const bounds = await header.boundingBox();
    expect(bounds).not.toBeNull();
    const width = page.viewportSize()!.width;
    for (const box of boxes) {
      expect(box.left, box.text ?? '').toBeGreaterThanOrEqual(0);
      expect(box.right, box.text ?? '').toBeLessThanOrEqual(width + 1);
      expect(box.bottom, box.text ?? '').toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      expect(overlap, `${a.text} overlaps ${b.text}`).toBeLessThanOrEqual(1);
    }
    if (size === '100%') expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `scratch/header-text-reflow/${info.project.name}-${size === '100%' ? 'normal' : 'doubled'}.png` });
    const more = header.locator('.topbar-more');
    if (await more.isVisible()) {
      await more.locator('summary').click();
      const panel = await more.locator('.more-panel').boundingBox();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(width + 1);
    }
    await header.getByRole('button', { name: /^Settings/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (await more.isVisible() && await more.evaluate((element) => (element as HTMLDetailsElement).open)) await more.locator('summary').click();
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((run: { id: string }) => run.id === 'header'));
  expect(saved.commands).toEqual(run.commands);
  expect(saved.rules).toBe(run.rules);
});
