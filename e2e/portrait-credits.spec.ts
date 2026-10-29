import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

type Tape = { rules: string; config: RunConfig; commands: Command[] };
const courtyard = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as Tape;
const careful = JSON.parse(readFileSync('src/engine/fixtures/heartfelt-careful.json', 'utf8')) as Tape;
const hugoAt = courtyard.commands.findIndex(c => c.type === 'acceptProject' && c.projectId === 'hugo-handover');
const beforeHugo = courtyard.commands.slice(0, hugoAt);

function throughDay(tape: Tape, day: number) {
  let state = createRun(tape.config, tape.rules);
  const commands: Command[] = [];
  for (const command of tape.commands) {
    const next = applyCommand(state, command);
    expect(next.error).toBeUndefined();
    state = next.state;
    commands.push(command);
    if (state.day === day + 1 && !state.call) break;
  }
  return commands;
}

async function load(page: Page, tape: Tape, commands: Command[], eveningDay?: number) {
  const run = replay(tape.config, commands, tape.rules);
  expect(run.errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ tape, commands, eveningDay }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...tape, commands, v: 1, id: 'portrait', label: 'Portrait and credits', savedAt: '2026-10-26T23:04:05.618Z' }]));
    if (eveningDay !== undefined) localStorage.setItem('lantern.evening.v1', JSON.stringify({ runId: 'portrait', day: eveningDay }));
  }, { tape, commands, eveningDay });
  await page.reload();
  await page.getByRole('button', { name: `${run.state.finished ? 'Look back at' : 'Continue'} Portrait and credits`, exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}

async function expectPortrait(page: Page, selector: string) {
  const image = page.locator(selector).locator('image[data-illustration="hugo-at-bench"]');
  await expect(image).toHaveCount(1);
  const href = await image.getAttribute('href');
  expect(href).toMatch(/hugo-at-bench.*\.webp$/);
  expect(await page.evaluate(async href => {
    const image = new Image(); image.src = href!; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, href)).toEqual([768, 768]);
}

test('Hugo’s portrait is visible in the editable proof while the apprentice’s bench stays a drawing', async ({ page }, info) => {
  await load(page, courtyard, beforeHugo);
  await page.locator('.project-notice').click();
  const roster = page.locator('.project-roster');
  if (await roster.getAttribute('open') === null) await roster.locator('summary').click();
  await roster.getByRole('button').filter({ hasText: 'Hugo' }).click();
  await page.getByRole('button', { name: /^A quiet sendoff/ }).click();
  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  await expectPortrait(page, '.proof-desk__easel');
  await desk.getByRole('tab', { name: 'Illustrations', exact: true }).click();
  await expect(desk.getByRole('button', { name: 'Add Hugo at the bench', exact: true })).toBeVisible();
  await expect(desk.locator('.designed-artwork__print')).toHaveAttribute('aria-label', /For Ivo\. There is time to get it right\./);
  await desk.getByRole('tab', { name: 'Page', exact: true }).click();
  await desk.getByRole('button', { name: 'Poppy & cream', exact: true }).click();
  await desk.getByRole('tab', { name: 'Illustrations', exact: true }).click();
  await desk.getByRole('button', { name: 'Turn 90°', exact: true }).click();
  await expect(desk.locator('.designed-artwork__print')).toHaveAttribute('data-palette', 'poppy');
  await expect(desk.locator('.designed-artwork__illustrations > g')).toHaveAttribute('transform', 'translate(50 50) rotate(90)');
  await desk.screenshot({ path: info.outputPath('hugo-editable-portrait.png') });
  await page.getByRole('button', { name: 'Compare approaches', exact: true }).click();
  await page.getByRole('button', { name: /^Open the bench to the street/ }).click();
  await desk.getByRole('tab', { name: 'Illustrations', exact: true }).click();
  await desk.getByRole('button', { name: 'Add the watchmaker’s bench', exact: true }).click();
  await expect(desk.locator('.proof-desk__easel image[data-illustration="hugo-at-bench"]')).toHaveCount(0);
  await expect(desk.locator('.designed-artwork__illustrations > g')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(beforeHugo);
});

test('the actual portrait delivery and its exported keepsake retain the approved composition', async ({ page }, info) => {
  await load(page, courtyard, throughDay(courtyard, 7), 7);
  await expectPortrait(page, '.evening .payoff-milestone-art[data-payoff-piece="c13-l1"]');
  await expect(page.locator('.payoff-response').filter({ hasText: 'Hugo reads' })).toContainText('For Ivo. There is time to get it right.');
  await page.locator('.evening .commission-payoff').filter({ hasText: 'Hugo reads' }).screenshot({ path: info.outputPath('hugo-delivered-portrait.png') });
  await load(page, courtyard, courtyard.commands);
  await page.locator('.neighbourhood-nav button').filter({ hasText: 'Workshop portrait' }).click();
  await expectPortrait(page, '.neighbourhood-print');
  const authored = courtyard.commands[hugoAt];
  if (!authored || authored.type !== 'acceptProject') throw new Error('Native portrait command is missing.');
  const piece = authored.design!.pieces[0]!;
  const print = page.locator('.neighbourhood-print .designed-artwork__print');
  await expect(print).toHaveAttribute('data-layout', piece.layout);
  await expect(print).toHaveAttribute('data-palette', piece.palette);
  await expect(print).toHaveAttribute('data-typeface', piece.typeface);
  await expect(print).toHaveAttribute('data-treatment', piece.treatment);
  await expect(page.locator('.neighbourhood-credits')).toContainText('Commissioned by');
  await expect(page.locator('.neighbourhood-credits')).toContainText('Hugo');
  await expect(page.locator('.neighbourhood-scene .atelier-portrait-image')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.neighbourhood').analyze()).violations).toEqual([]);
  await page.locator('.neighbourhood').screenshot({ path: info.outputPath('hugo-installed-portrait.png') });
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await page.evaluate(() => {
    const texts: string[] = []; Object.assign(window, { portraitCardText: texts });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push(text);
      return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
    };
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save postcard', exact: true }).click();
  await (await download).saveAs(info.outputPath('hugo-portrait-postcard.png'));
  const text = await page.evaluate(() => (window as unknown as { portraitCardText: string[] }).portraitCardText);
  expect(text).toContain('Commissioned by: Hugo.');
  expect(text).not.toContain('The picture could not be included.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(courtyard.commands);
});

test('the Careful ending stages earned hosts and credits their work alongside later distance', async ({ page }, info) => {
  await load(page, careful, careful.commands);
  const scene = page.locator('.neighbourhood');
  await expect(scene.locator('.neighbourhood-credits')).toContainText('Featuring completed work for');
  expect(await scene.locator('.neighbourhood-credits [data-cast]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-cast')).sort())).toEqual(['clem', 'hugo']);
  expect(await scene.locator('[data-scene-host]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-scene-host')).sort())).toEqual(['clem', 'hugo']);
  await expect(page.locator('.end-regulars li').filter({ hasText: 'Hugo' })).toContainText('A missed delivery on Day 7 ended this relationship.');
  await expect(page.locator('.end-regulars li').filter({ hasText: 'Clem' })).toContainText('An unanswered request on Day 8 ended this relationship.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await scene.screenshot({ path: info.outputPath('careful-contribution-credits.png') });
});
