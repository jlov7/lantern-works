import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';

const tape = JSON.parse(readFileSync('src/ui/game/fixtures/festival-courtyard-payoff.json', 'utf8')) as { rules: string; config: { scenarioId: string; seed: string }; commands: Command[] };
function throughDay(day: number): Command[] {
  let state = createRun(tape.config, tape.rules);
  const commands: Command[] = [];
  for (const command of tape.commands) {
    const next = applyCommand(state, command);
    expect(next.error).toBeUndefined();
    state = next.state;
    commands.push(command);
    if (state.day === day && !state.call) break;
  }
  return commands;
}
const milestone = throughDay(5);
const ending = [...tape.commands];
for (let day = 8; day < 12; day++) ending.push({ type: 'runDay' });

async function load(page: Page, commands: Command[], eveningDay?: number) {
  const state = replay(tape.config, commands, tape.rules);
  expect(state.errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ save, eveningDay }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    if (eveningDay !== undefined) localStorage.setItem('lantern.evening.v1', JSON.stringify({ runId: save.id, day: eveningDay }));
  }, { save: { ...tape, commands, v: 1, id: 'payoff', label: 'Festival payoff', savedAt: new Date().toISOString() }, eveningDay });
  await page.reload();
  await page.getByRole('button', { name: `${state.state.finished ? 'Look back at' : 'Continue'} Festival payoff`, exact: true }).click();
}

for (const width of [320, 390, 1280]) test(`the native Festival evening foregrounds the courtyard payoff at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await load(page, tape.commands, 7);
  const payoff = page.locator('.evening .commission-payoff');
  await expect(payoff).toHaveAttribute('data-payoff-phase', 'delivered');
  await expect(payoff.getByRole('heading')).toHaveText('The lantern walk, one courtyard');
  await expect(payoff).toContainText('Day 8 deadline');
  await expect(payoff).toContainText('Clem’s anniversary photograph');
  await expect(payoff.locator('[data-payoff-scene="courtyard"]')).toBeInViewport();
  await expect.poll(async () => {
    const picture = await payoff.locator('.payoff-vignette').boundingBox();
    const dock = await page.locator('.workspace-dock').boundingBox();
    return picture !== null && (dock === null || picture.y + picture.height <= dock.y);
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.commission-payoff').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`native-evening-${width}.png`) });
  await payoff.screenshot({ path: info.outputPath(`courtyard-payoff-${width}.png`) });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual(tape.commands);
});

test('the native archive completion gets its artifact and earned consequence on Day 5', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, milestone, 4);
  const payoff = page.locator('.evening .commission-payoff');
  await expect(payoff).toHaveAttribute('data-payoff-kind', 'milestone');
  await expect(payoff).toContainText('Clem’s anniversary photograph');
  await expect(payoff).toContainText('60 fewer finishing minutes');
  await expect(payoff.getByRole('heading')).toBeInViewport();
  await payoff.screenshot({ path: info.outputPath('native-archive-day5.png') });
});

for (const width of [320, 390, 1280]) test(`the actual season ending keeps the native courtyard in the foreground at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await load(page, ending);
  const payoff = page.locator('.end-picture .commission-payoff');
  await expect(payoff).toHaveAttribute('data-payoff-phase', 'delivered');
  await expect(payoff.locator('[data-payoff-scene="courtyard"]')).toBeInViewport();
  await expect(payoff).toContainText('The lantern walk, one courtyard');
  expect((await payoff.locator('.payoff-vignette').boundingBox())!.width).toBeGreaterThan(240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.end-picture').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`native-ending-${width}.png`) });
  if (width === 390) {
    await page.getByText('Keep a postcard or share this season', { exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save postcard', exact: true }).click();
    await (await download).saveAs(info.outputPath('courtyard-postcard.png'));
    await expect(page.locator('.share-msg')).toContainText('Postcard saved');
  }
});
