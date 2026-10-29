import { LEGACY_RULES_VERSION, STUDIO_RULES_VERSION } from '../src/engine/versions';
import { expect, test, type Page } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { PRESETS, RULES } from '../src/engine/rules';
import { reactionTo, summarize, takeableInTurn, tonight, windowRequests } from '../src/engine/selectors';
import { applyCommand, createRun, isRegular, replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { credits, signed } from '../src/ui/format';
import { eveningFacts, missReasons, prepFor, regularLoss } from '../src/ui/game/eveningFacts';

const config = { scenarioId: 'main-street', seed: 'panel-1' };

function lostRegularMorning(): Command[] {
  let s = applyCommand(createRun(config, STUDIO_RULES_VERSION), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
  while (!s.finished) {
    for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
    const regular = windowRequests(s).find((r) => r.status === 'waiting' && isRegular(s, r.castId) && reactionTo(s, r).kind === 'buy');
    if (regular) {
      const before = applyCommand(s, { type: 'decline', requestId: regular.id }).state;
      const after = applyCommand(before, { type: 'runDay' }).state;
      if (prepFor(before, after, before.day).length) return before.commands;
    }
    for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
  }
  throw new Error('no lost regular with a prep suggestion');
}

async function openSavedMorning(page: Page, commands: Command[], runConfig = config, duringPlayback?: () => Promise<void>, rulesVersion: string = RULES.version) {
  expect(replay(runConfig, commands, rulesVersion).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ commands, config, rules }) => {
    localStorage.clear();
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'audit', label: 'Evening audit', savedAt: new Date().toISOString(), config, commands }]));
  }, { commands, config: runConfig, rules: rulesVersion });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Evening audit', exact: true }).click();
  await expect(page.locator('.evening')).toHaveCount(0);
  await page.getByRole('button', { name: /^Open the shop for Day/ }).click();
  await duringPlayback?.();
  await page.locator('.evening, .call').first().waitFor();
  if (await page.locator('.call').count()) {
    await page.locator('.call').getByRole('button', { name: /^Leave it/ }).click();
    await duringPlayback?.();
  }
  await expect(page.locator('.evening')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  const result = replay(saved.config, saved.commands, saved.rules);
  expect(result.errors).toEqual([]);
  return result.state;
}

test('missed launches show observed unfinished work in the evening and the saved ending', async ({ page }, info) => {
  const missConfig = { ...config, seed: 'bright-repin-candidate-152' };
  const season = runPolicy(missConfig, GHOSTS.bright, undefined, LEGACY_RULES_VERSION);
  const runDays = season.commands.flatMap((c, i) => c.type === 'runDay' ? [i] : []);
  const commands = season.commands.slice(0, runDays[11]!);
  expect(replay(missConfig, commands, LEGACY_RULES_VERSION).state.day).toBe(11);
  const after = await openSavedMorning(page, commands, missConfig, undefined, LEGACY_RULES_VERSION);
  expect(missReasons(after, 11)).toEqual([
    "Hugo's was still being redone at closing",
    "Florence's was still being finished at closing",
    "Idris's was waiting to be finished at closing",
    "Agnes's was waiting to be finished at closing; a change was asked for",
  ]);
  const evening = page.locator('.evening');
  for (const reason of missReasons(after, 11)) await expect(evening.locator('.evening-sentence')).toContainText(reason);
  await evening.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/miss-attribution-facts/evening-${info.project.name}.png` });

  await page.evaluate(({ commands, config, rules }) => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'audit', label: 'Miss audit', savedAt: new Date().toISOString(), config, commands }]));
  }, { commands: season.commands, config: missConfig, rules: LEGACY_RULES_VERSION });
  await page.reload();
  await page.getByRole('button', { name: 'Look back at Miss audit', exact: true }).click();
  const misses = page.locator('.medal-words');
  await expect(misses).toContainText(/Missed: .* at closing/);
  await expect(misses).not.toContainText(/lost time to everyone|was short of hands|ran out of time; redo on|was waiting on the AI desk/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(replay(saved.config, saved.commands, saved.rules).state).toEqual(season);
  await page.screenshot({ path: `scratch/miss-attribution-facts/end-${info.project.name}.png` });
});

test('Open keeps the evening audit visible beside prep suggestions, with compact sample evenings', async ({ page }, info) => {
  const lossCommands = lostRegularMorning();
  // Before v6, declining a regular ended the relationship. Preserve that saved-season audit.
  const before = replay(config, lossCommands, STUDIO_RULES_VERSION).state;
  const after = await openSavedMorning(page, lossCommands, config, undefined, STUDIO_RULES_VERSION);
  const evening = page.locator('.evening');
  const lost = regularLoss(after, before.day);
  expect(lost).not.toBeNull();
  await expect(evening.locator(':scope > .evening-note')).toHaveText(lost!);
  await expect(evening.locator('.prep')).toBeVisible();
  await expect(evening.locator('.evening-more')).not.toHaveAttribute('open');
  const running = -after.journal.filter((e) => e.day === before.day && ['wages', 'shop', 'ai'].includes(e.kind)).reduce((a, e) => a + e.cash, 0);
  const figures = evening.locator(':scope > .evening-stats');
  await expect(figures.locator('div').nth(0)).toHaveText(`Earned today${credits(eveningFacts({ before, after }).earned)}`);
  await expect(figures.locator('div').nth(1)).toHaveText(`Running costs today${credits(running)}`);
  await expect(figures.locator('div').nth(2)).toHaveText(`Profit so far${signed(summarize(after).operatingResult)}`);
  expect(summarize(after).operatingResult).not.toBe(eveningFacts({ before, after }).earned - running);
  await evening.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `scratch/evening-audit/lost-regular-${info.project.name}.png` });
  await evening.getByRole('button', { name: 'Hire Noor (250 cr a day)', exact: true }).click();
  await expect(evening.locator('.prep')).toContainText('Done: Hire Noor');

  const season = runPolicy(config, GHOSTS.hand);
  const runDays = season.commands.flatMap((c, i) => c.type === 'runDay' ? [i] : []);
  for (const day of [2, 4, 8]) {
    const commands = season.commands.slice(0, runDays[day - 1]!);
    const morning = replay(config, commands).state;
    const closed = await openSavedMorning(page, commands);
    const facts = eveningFacts({ before: morning, after: closed });
    const plan = tonight(morning).delivered;
    await expect(evening.locator('.evening-sentence')).toHaveText(facts.sentence);
    if (plan !== facts.delivered) await expect(evening.locator('.evening-sentence')).toContainText(`The morning plan was ${plan} out if no redos or changes.`);
    await expect(evening.locator(':scope > .evening-stats')).toBeVisible();
    await expect(evening.locator('.evening-more')).not.toHaveAttribute('open');
    await evening.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await evening.evaluate((card) => {
      const rect = card.getBoundingClientRect();
      const columns = Array.from(card.querySelectorAll(':scope > .evening-stats > div')).map((column) => {
        const range = document.createRange();
        range.selectNodeContents(column.querySelector('dd')!);
        return { column: column.getBoundingClientRect().toJSON(), value: range.getBoundingClientRect().toJSON() };
      });
      return { card: rect.toJSON(), viewport: innerWidth, overflow: card.scrollWidth - card.clientWidth, height: rect.height, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, columns };
    });
    expect(bounds.card.left).toBeGreaterThanOrEqual(0);
    expect(bounds.card.right).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.overflow).toBeLessThanOrEqual(0);
    for (const { column, value } of bounds.columns) {
      expect(value.left).toBeGreaterThanOrEqual(column.left);
      expect(value.right).toBeLessThanOrEqual(column.right);
    }
    await info.attach(`day-${day}-bounds`, { body: JSON.stringify(bounds), contentType: 'application/json' });
    await page.screenshot({ path: `scratch/evening-audit/day-${day}-${info.project.name}.png` });
  }
});

test('the final evening names the closed season and points to its heading', async ({ page }, info) => {
  const runConfig = { ...config, seed: 'season-boundary' };
  const commands = runPolicy(runConfig, GHOSTS.bright).commands;
  const firstRun = commands.findIndex((c) => c.type === 'runDay');
  const lastRun = commands.findLastIndex((c) => c.type === 'runDay');
  await openSavedMorning(page, commands.slice(0, firstRun), runConfig);
  await expect(page.locator('#evening-h')).toHaveText('Day 1, evening');
  await expect(page.locator('.skip-link')).toHaveText('Skip to the current workspace');
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#workspace-heading');

  const before = replay(runConfig, commands.slice(0, lastRun)).state;
  expect(before.day).toBe(RULES.days - 1);
  let expected = applyCommand(before, { type: 'runDay', calls: true }).state;
  if (expected.call) expected = applyCommand(expected, { type: 'answer', option: 'ride' }).state;
  expect(expected.finished).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const final = await openSavedMorning(page, commands.slice(0, lastRun), runConfig, async () => {
    await expect(page.locator('#evening-h')).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip to evening' }).click();
  });
  expect(final).toEqual(expected);
  await expect(page.locator('#evening-h')).toHaveText(`Day ${RULES.days}, evening, season over`);
  const skip = page.locator('.skip-link');
  await expect(skip).toHaveText('Skip to the current workspace');
  await expect(skip).toHaveAttribute('href', '#workspace-heading');
  await page.locator('main.stage > h1').focus();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-heading')).toBeFocused();
  await expect(page.getByRole('button', { name: 'See how the season went' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
  expect(replay(saved.config, saved.commands).state).toEqual(final);
  await page.screenshot({ path: `scratch/season-boundary-truth/final-${info.project.name}.png` });
  await page.getByRole('button', { name: 'See how the season went' }).click();
  await expect(page.locator('main#main.end')).toBeVisible();
});

test('the final evening names a closing refund beside the delivery result', async ({ page }, info) => {
  const runConfig = { scenarioId: 'main-street', seed: 'e2e-1' };
  let morning = createRun(runConfig, LEGACY_RULES_VERSION);
  runPolicy(runConfig, GHOSTS.hand, { onMorning: (s) => { if (s.day === 11) morning = structuredClone(s); } }, LEGACY_RULES_VERSION);
  for (const n of morning.news) if (n.day === morning.day && n.choice === null) morning = applyCommand(morning, { type: 'choose', newsId: n.id, option: 0 }).state;
  const menu = applyCommand(morning, { type: 'setMenu', offers: [PRESETS.bespoke] });
  expect(menu.error).toBeUndefined();
  const taken = applyCommand(menu.state, { type: 'accept', requestId: 'd11-r1' });
  expect(taken.error).toBeUndefined();
  const declined = applyCommand(taken.state, { type: 'decline', requestId: 'd11-r2' });
  expect(declined.error).toBeUndefined();
  let expected = applyCommand(declined.state, { type: 'runDay', calls: true }).state;
  if (expected.call) expected = applyCommand(expected, { type: 'answer', option: 'ride' }).state;
  const after = await openSavedMorning(page, declined.state.commands, runConfig, undefined, LEGACY_RULES_VERSION);
  expect(after).toEqual(expected);
  const sentence = page.locator('.evening-sentence');
  await expect(sentence).toContainText("When the season ended, 1 unfinished launch was refunded: Clem's was still being made at closing.");
  await expect(sentence).not.toContainText('Nothing was missed');
  await page.locator('.evening').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('closing-refund-evening.png') });
});
