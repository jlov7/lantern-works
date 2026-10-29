import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import route from '../src/engine/fixtures/main-courtyard-5.0.0.json' with { type: 'json' };
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { authoredCommands } from './authored-helpers';

const commands = authoredCommands(route.config, route.commands as Command[]);
const state = replay(route.config, commands).state;
const archive = state.contracts.find(c => c.project?.id === 'clem-ten')!.project!.proof!.pieces[0]!.title;

async function loadEnding(page: Page) {
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: RULES.version, id: 'postcard-art', label: 'Postcard art', savedAt: '2026-10-26T12:00:00.000Z', config: route.config, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Look back at Postcard art', exact: true }).click();
  await page.locator('.neighbourhood-nav button').filter({ hasText: archive }).click();
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function downloadCard(page: Page, path: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save postcard', exact: true }).click();
  await (await download).saveAs(path);
  await expect(page.getByRole('status').filter({ hasText: 'Postcard saved to your downloads.' })).toBeVisible();
}

test('the downloaded postcard preserves the selected photograph, caption and credit while the player visits another place', async ({ page }, info) => {
  await loadEnding(page);
  await expect(page.locator('.neighbourhood-print image')).toHaveCount(1);
  await page.evaluate(() => {
    const texts: { text: string; x: number; y: number; width: number }[] = [];
    Object.assign(window, { postcardTexts: texts });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push({ text, x, y, width: this.measureText(text).width });
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
  });
  const baselinePath = info.outputPath('postcard-selected-archive.png');
  await downloadCard(page, baselinePath);
  const text = await page.evaluate(() => (window as unknown as { postcardTexts: { text: string; x: number; y: number; width: number }[] }).postcardTexts);
  const caption = text.filter(item => item.x === 60 && item.y >= 620 && item.y < 940);
  expect(caption.length).toBeGreaterThan(2);
  expect(caption.every(item => item.x + item.width <= 1021 && item.y < 920)).toBe(true);
  expect(text.some(item => item.text.includes('could not be included'))).toBe(false);
  expect(text.some(item => item.text.includes(RULES.version))).toBe(true);

  await page.evaluate(() => {
    const NativeImage = window.Image;
    window.Image = class extends NativeImage {
      set src(value: string) { setTimeout(() => { super.src = value; }, 300); }
      get src() { return super.src; }
    };
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save postcard', exact: true }).click();
  await page.locator('.neighbourhood-nav button').first().click();
  const racedPath = info.outputPath('postcard-after-location-change.png');
  await (await pending).saveAs(racedPath);
  expect(await readFile(racedPath)).toEqual(await readFile(baselinePath));
  await page.locator('.neighbourhood').screenshot({ path: info.outputPath('selected-place-after-export.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
});

test('a missing picture leaves a readable postcard with an explicit picture warning', async ({ page }, info) => {
  await loadEnding(page);
  await page.evaluate(() => {
    const texts: string[] = [];
    Object.assign(window, { postcardTexts: texts });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push(text);
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
    const NativeImage = window.Image;
    window.Image = class extends NativeImage {
      set src(_value: string) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); }
      get src() { return super.src; }
    };
  });
  await downloadCard(page, info.outputPath('postcard-picture-unavailable.png'));
  const text = await page.evaluate(() => (window as unknown as { postcardTexts: string[] }).postcardTexts);
  expect(text).toContain('The picture could not be included.');
  expect(text).toContain('neighbours served');
  expect(text).toContain('cash at close');
});

test('a gathering postcard credits completed work without inventing attendance', async ({ page }, info) => {
  await loadEnding(page);
  await page.locator('.neighbourhood-nav button').first().click();
  await expect(page.locator('.neighbourhood-scene [data-scene-host="clem"]')).toHaveCount(1);
  await expect(page.locator('.neighbourhood-scene [data-scene-host="hugo"]')).toHaveCount(0);
  const people = page.locator('.neighbourhood-credits [data-cast]');
  expect(await people.evaluateAll(elements => elements.map(element => element.getAttribute('data-cast')).sort())).toEqual(['clem', 'hugo']);
  await expect(page.locator('.neighbourhood-credits')).toContainText('Featuring completed work for');
  await page.evaluate(() => {
    const texts: string[] = [];
    Object.assign(window, { postcardCredits: texts });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push(text);
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
  });
  await downloadCard(page, info.outputPath('postcard-earned-gathering.png'));
  const drawn = await page.evaluate(() => (window as unknown as { postcardCredits: string[] }).postcardCredits);
  expect(drawn).toContain('Featuring completed work for: Clem and Hugo.');
  await page.locator('.end-hero').screenshot({ path: info.outputPath('ending-earned-gathering.png') });
});
