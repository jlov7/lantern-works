import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

type Tape = { rules: string; config: RunConfig; commands: unknown[] };
const courtyard = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as Tape;
const trail = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-trail.json', 'utf8')) as Tape;
const careful = JSON.parse(readFileSync('src/engine/fixtures/heartfelt-careful.json', 'utf8')) as Tape;
const festival = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-festival.json', 'utf8')) as Tape;
function throughDay(tape: Tape, day: number): Command[] {
  let state = createRun(tape.config, tape.rules);
  const commands: Command[] = [];
  for (const command of tape.commands as Command[]) {
    const next = applyCommand(state, command);
    expect(next.error).toBeUndefined();
    state = next.state;
    commands.push(command);
    if (state.day === day + 1 && !state.call) break;
  }
  return commands;
}

async function load(page: Page, tape: Tape, commands: Command[], day?: number) {
  const run = replay(tape.config, commands, tape.rules);
  expect(run.errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ tape, commands, day }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...tape, commands, v: 1, id: 'heartfelt', label: 'Delivery study', savedAt: '2026-10-26T23:04:05.618Z' }]));
    if (day !== undefined) localStorage.setItem('lantern.evening.v1', JSON.stringify({ runId: 'heartfelt', day }));
  }, { tape, commands, day });
  await page.reload();
  await page.getByRole('button', { name: `${run.state.finished ? 'Look back at' : 'Continue'} Delivery study`, exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}

const moments = [
  { tape: courtyard, day: 3, approach: 'first-night', piece: 'c5-l1', response: 'Leave that just as it is.' },
  { tape: courtyard, day: 7, approach: 'quiet-sendoff', piece: 'c13-l1', response: 'For Ivo. There is time to get it right.' },
  { tape: trail, day: 4, approach: 'weekly-rhythm', piece: 'c13-l1', response: 'There. We’ve started.' },
  { tape: trail, day: 6, approach: 'weekly-rhythm', piece: 'c13-l2', response: 'Keep that one up too.' },
  { tape: trail, day: 8, approach: 'weekly-rhythm', piece: 'c13-l3', response: 'I can keep this going.' },
];

for (const moment of moments) test(`native Day ${moment.day + 1} ${moment.approach} answers the delivered print`, async ({ page }, info) => {
  const commands = throughDay(moment.tape, moment.day);
  await load(page, moment.tape, commands, moment.day);
  const payoff = page.locator('.evening .commission-payoff').filter({ has: page.locator(`[data-payoff-piece="${moment.piece}"]`) });
  await expect(payoff.locator('.payoff-response')).toContainText(moment.response);
  await expect(payoff.locator('.payoff-line')).toContainText('delivered');
  await expect(payoff.locator(`.campaign-art[data-approach="${moment.approach}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.commission-payoff').analyze()).violations).toEqual([]);
  await payoff.screenshot({ path: info.outputPath(`day-${moment.day + 1}-${moment.approach}.png`) });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(saved.commands).toEqual(commands);
});

test('native Careful ending remembers the work and the later distance together', async ({ page }, info) => {
  await load(page, careful, careful.commands as Command[]);
  const regulars = page.locator('.end-regulars');
  await expect(regulars).toContainText('apprentice’s name is on the workshop sign');
  await expect(regulars.locator('li').filter({ hasText: 'Hugo' })).toContainText('A missed delivery on Day 7 ended this relationship.');
  await expect(regulars.locator('li').filter({ hasText: 'Clem' })).toContainText('An unanswered request on Day 8 ended this relationship. That request never became an agreed job.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await regulars.screenshot({ path: info.outputPath('careful-work-and-distance.png') });
});

test('the Festival aftermath opens the real pattern shelf without making a new promise', async ({ page }) => {
  const commands = throughDay(festival, 8);
  await load(page, festival, commands, 8);
  await expect(page.locator('.evening-aftermath')).toContainText('The lantern walk is behind you.');
  await page.getByRole('button', { name: 'Visit the pattern shelf', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The pattern shelf', exact: true })).toBeFocused();
  await expect(page.locator('.pattern-shelf')).toContainText('50 cr');
  await expect(page.locator('.pattern-shelf .designed-artwork__print')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
});
