import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

for (const locked of [false, true]) test(`the ${locked ? 'future' : 'open'} drawing table keeps the whole print and active tools above the game dock`, async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'first-season' };
  const commands: Command[] = [{ type: 'accept', requestId: 'd0-r0', maker: 'h1' }, { type: 'runDay' }, ...(locked ? [] : [{ type: 'runDay' } as const])];
  expect(replay(config, commands).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: RULES.version, id: 'table', label: 'Drawing table', savedAt: new Date().toISOString(), config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Drawing table', exact: true }).click();
  await page.locator('.project-notice').click();
  await page.getByRole('button', { name: /Give the new band the wall/ }).click();
  await page.evaluate(() => document.fonts.ready);
  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  await expect(desk).toHaveClass(/proof-desk--focused/);
  const geometry = () => page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const print = box('.proof-desk__sheet');
    const tools = box('.proof-desk__tools');
    const first = box('.proof-desk__tools [role=tabpanel]:not([hidden]) button');
    const bar = box('.workspace-dock');
    const top = box('.topbar');
    return { print: [print.top, print.bottom], tools: [tools.top, tools.bottom], first: [first.top, first.bottom], bounds: [top.bottom, bar.top] };
  });
  const fits = async () => {
    const { print, tools, first, bounds } = await geometry();
    return print[0]! >= bounds[0]! && print[1]! <= bounds[1]! && first[0]! >= bounds[0]! && first[1]! <= bounds[1]! && tools[1]! <= bounds[1]!;
  };
  await info.attach('page-geometry', { body: JSON.stringify(await geometry()), contentType: 'application/json' });
  await expect.poll(fits).toBe(true);
  await page.screenshot({ path: info.outputPath('drawing-table-page.png') });
  await desk.getByRole('tab', { name: 'Illustrations', exact: true }).click();
  await info.attach('illustration-geometry', { body: JSON.stringify(await geometry()), contentType: 'application/json' });
  await expect.poll(fits).toBe(true);
  await desk.getByRole('button', { name: 'Add star', exact: true }).click();
  await expect(desk.locator('.designed-artwork__illustrations > g')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('drawing-table-illustrations.png') });
  await desk.getByRole('region', { name: 'Illustrations tools', exact: true }).focus();
  await page.keyboard.press('End');
  await expect.poll(() => desk.locator('.proof-desk__tools').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(1);
  await desk.getByRole('tab', { name: 'Page', exact: true }).click();
  await expect.poll(() => desk.locator('.proof-desk__tools').evaluate(el => el.scrollTop)).toBe(0);
  await expect.poll(fits).toBe(true);
  expect((await new AxeBuilder({ page }).include('.project-board').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
