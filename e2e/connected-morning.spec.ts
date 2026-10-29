import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, callChoices, createRun, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { routineReplies, reviewReplies } from '../src/ui/game/morningReplies';
import { FIRST_SEASON } from '../src/ui/screens/firstSeason';
import { leverOptions, leverResult } from '../src/ui/game/studioHint';

interface NativeRun { config: RunConfig; commands: Command[]; rules: string }
const festival = JSON.parse(readFileSync('test-fixtures/replays/festival-season1.json', 'utf8')) as NativeRun;
const storage = JSON.parse(readFileSync('test-fixtures/replays/continuing-storage.json', 'utf8'));
const continuing = (JSON.parse(storage['lantern.runs.v1']) as NativeRun[]).find(run => run.config.continuation)!;
let crowded = createRun(continuing.config, continuing.rules);
for (const command of continuing.commands) {
  if (crowded.day === 9 && !crowded.call) break;
  const next = applyCommand(crowded, command);
  if (next.error) throw new Error(next.error);
  crowded = next.state;
}

async function load(page: Page, run: NativeRun, surface = '.focused-decision') {
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...save, v: 1, id: 'morning-test', label: 'Morning test', savedAt: new Date().toISOString() }]));
  }, run);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Morning test', exact: true }).click();
  await expect(page.locator(surface)).toBeVisible();
}

async function commands(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((run: { id: string }) => run.id === 'morning-test').commands);
}

test('a crowded continuing morning reviews all routine replies, preserves cancellation, and undoes individual commands', async ({ page }, info) => {
  await load(page, { config: crowded.config, commands: crowded.commands, rules: crowded.rulesVersion });
  const requests = routineReplies(crowded);
  expect(requests.length).toBeGreaterThanOrEqual(8);
  const opener = page.getByRole('button', { name: /^Reply to remaining/ });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Reply to remaining requests', exact: true });
  await expect(dialog.getByRole('checkbox')).toHaveCount(requests.length);
  await expect(dialog).toContainText('returning customer');
  await page.screenshot({ path: `scratch/whole-game-implementation/morning/group-review-${info.project.name}.png` });
  const review = reviewReplies(crowded, requests.map(request => request.id));
  await expect(dialog).toContainText(`Reputation cost: ${review.losses.reduce((total, loss) => total + loss.points, 0)} in total`);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(await commands(page)).toEqual(crowded.commands);
  await opener.click();
  await dialog.getByRole('checkbox').last().uncheck();
  await dialog.getByRole('button', { name: /^Decline selected requests/ }).click();
  const expected = [...crowded.commands, ...requests.slice(0, -1).map(request => ({ type: 'decline', requestId: request.id }))];
  await expect.poll(() => commands(page)).toEqual(expected);
  await expect(page.locator('.reply-receipt')).toBeFocused();
  await page.getByRole('button', { name: 'Undo reply', exact: true }).click();
  await expect.poll(() => commands(page)).toEqual(expected.slice(0, -1));
});

test('Festival temporary help names the buyer it gains and the work it displaces', async ({ page }, info) => {
  const prefix = festival.commands.slice(0, 108) as Command[];
  const native = replay(festival.config, prefix, festival.rules);
  expect(native.errors).toEqual([]);
  const option = leverOptions(native.state, { ai: true, pace: true }).find(option => option.id === 'temp')!;
  expect(option.n).toBe(0);
  expect(option.gained.length).toBeGreaterThan(0);
  expect(option.displaced.length).toBeGreaterThan(0);
  await load(page, { ...festival, commands: prefix });
  await page.locator('.decision-levers > summary').click();
  const row = page.locator('.decision-levers li').filter({ has: page.getByRole('button', { name: `${option.label} (${option.cost} cr)`, exact: true }) });
  await expect(row).toContainText(leverResult(native.state, option));
  await row.screenshot({ path: `scratch/whole-game-implementation/morning/festival-substitution-${info.project.name}.png` });
  expect(await commands(page)).toEqual(prefix);
  await row.getByRole('button').click();
  await expect.poll(() => commands(page)).toEqual([...prefix, ...option.commands]);
});

for (const option of ['late', 'cut', 'ring', 'ride'] as const) test(`Festival explains the shared booking closure before the ${option} call answer`, async ({ page }) => {
  const prefix = festival.commands.slice(0, 44) as Command[];
  await load(page, { ...festival, commands: prefix }, '.call');
  const call = page.locator('.call');
  await expect(call.locator('.call-gathering')).toContainText('Gathering bookings close on Day 6.');
  await expect(call.locator('.call-gathering')).toContainText('would not unlock either invitation by that morning with any available answer');
  expect(await commands(page)).toEqual(prefix);
  const name = option === 'late' ? /^Everyone stays/ : option === 'cut' ? 'Ship it without the change' : option === 'ring' ? /^Ring / : 'Leave it';
  const button = call.getByRole('button', { name });
  const choice = callChoices(replay(festival.config, prefix, festival.rules).state).find(choice => choice.option === option)!;
  if (choice.blocked) { await expect(button).toBeDisabled(); return; }
  await button.click();
  await expect.poll(() => commands(page)).toEqual([...prefix, { type: 'answer', option }]);
});

for (const width of [320, 390]) test(`proof and current choice survive review at ${width} and enlarged text`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await load(page, { config: FIRST_SEASON, commands: [], rules: 'lantern-6.1.0' });
  const ticket = page.locator('.focused-decision .ticket');
  await ticket.locator('.first-proof__own-line > summary').click();
  await ticket.getByRole('textbox', { name: /Your line/ }).fill('Music after the rain');
  const selected = await page.locator('[data-customer-heading]').textContent();
  const compare = page.getByRole('button', { name: /^Compare \/ All neighbours/ });
  await compare.click();
  await page.getByRole('dialog', { name: 'Compare all neighbours' }).getByRole('button', { name: /^Return to/ }).click();
  await expect(page.locator('[data-customer-heading]')).toHaveText(selected!);
  await expect(ticket.getByRole('textbox', { name: /Your line/ })).toHaveValue('Music after the rain');
  await ticket.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/whole-game-implementation/morning/proof-${width}-${info.project.name}.png` });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `scratch/whole-game-implementation/morning/proof-${width}-${info.project.name}-text200.png` });
  expect(await ticket.locator('.first-proof__table').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  await ticket.getByRole('button', { name: 'Inspect working proof', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your working proof' })).toContainText('Music after the rain');
  await page.keyboard.press('Escape');
  expect(await commands(page)).toEqual([]);
  await ticket.getByRole('button', { name: 'Take it', exact: true }).click();
  await expect.poll(() => commands(page)).toMatchObject([{ type: 'accept', design: { pieces: [{ headline: 'Music after the rain' }] } }]);
});
