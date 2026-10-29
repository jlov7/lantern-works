import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

test.use({ reducedMotion: 'no-preference' });

const tape = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as { rules: string; config: RunConfig; commands: Command[] };
const commands: Command[] = [];
let state = createRun(tape.config, tape.rules);
for (const command of tape.commands) {
  const next = applyCommand(state, command);
  if (next.error) throw new Error(next.error);
  state = next.state;
  commands.push(command);
  if (state.day === 4 && !state.call) break;
}

async function load(page: Page) {
  expect(replay(tape.config, commands, tape.rules).errors).toEqual([]);
  await page.goto('/');
  await page.evaluate(({ tape, commands }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...tape, commands, v: 1, id: 'scene', label: 'Scene', savedAt: '2026-10-26T23:04:05.618Z' }]));
    localStorage.setItem('lantern.evening.v1', JSON.stringify({ runId: 'scene', day: 3 }));
  }, { tape, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Scene', exact: true }).click();
}

test('the delivered print can replay and skip placement with the keyboard', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  const payoff = page.locator('.evening .commission-payoff').filter({ has: page.locator('[data-payoff-piece="c5-l1"]') });
  await expect(payoff.locator('.payoff-response')).toContainText('Leave that just as it is.');
  const replayButton = payoff.getByRole('button', { name: 'Replay placement' });
  await expect(replayButton).toBeVisible();
  await replayButton.focus();
  await page.keyboard.press('Enter');
  await expect(payoff).toHaveAttribute('data-scene-motion', 'true');
  await page.keyboard.press('Enter');
  await expect(payoff).not.toHaveAttribute('data-scene-motion');
  await expect(payoff.getByRole('button', { name: 'Replay placement' })).toBeFocused();
  await expect(payoff.locator('.campaign-art[data-approach="first-night"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await payoff.screenshot({ path: info.outputPath('clem-delivery-phone.png') });
});

test('reduced motion presents the same print and response without placement motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  const payoff = page.locator('.evening .commission-payoff').filter({ has: page.locator('[data-payoff-piece="c5-l1"]') });
  await expect(payoff).not.toHaveAttribute('data-scene-motion');
  await expect(payoff.getByRole('button', { name: /placement/ })).toHaveCount(0);
  await expect(payoff.locator('.campaign-art[data-approach="first-night"]')).toBeVisible();
  await expect(payoff.locator('.payoff-response')).toContainText('Leave that just as it is.');
});


const branches = [
  { file: 'historical-trail-save.json', status: 'full', hosts: ['clem', 'mara'] },
  { file: 'deliberate-overcommit-4-save.json', status: 'partial', hosts: [] },
  { file: 'deliberate-overcommit-30-save.json', status: 'failed', hosts: [] },
  { file: 'absent-gathering-save.json', status: 'absent', hosts: [] },
] as const;
for (const branch of branches) test(`native ${branch.status} scene shows only permitted hosts`, async ({ page }, info) => {
  const save = JSON.parse(readFileSync(`test-fixtures/replays/${branch.file}`, 'utf8')) as typeof tape;
  const run = replay(save.config, save.commands, save.rules);
  expect(run.errors).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...save, v: 1, id: 'branch', label: 'Branch', savedAt: '2026-10-26T23:04:05.618Z' }]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: `${run.state.finished ? 'Look back at' : 'Continue'} Branch`, exact: true }).click();
  const scene = page.locator('.neighbourhood');
  await expect(scene).toBeVisible();
  expect(await scene.locator('[data-scene-host]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-scene-host')).sort())).toEqual([...branch.hosts].sort());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await scene.screenshot({ path: info.outputPath(`${branch.status}-320.png`), animations: 'disabled' });
});

test('host scene remains usable at 200 percent text size', async ({ page }) => {
  const save = JSON.parse(readFileSync('test-fixtures/replays/historical-trail-save.json', 'utf8'));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...save, id: 'large', label: 'Large' }]));
  }, save);
  await page.reload();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.getByRole('button', { name: 'Look back at Large', exact: true }).click();
  const scene = page.locator('.neighbourhood');
  await expect(scene.locator('[data-scene-host="clem"]')).toBeVisible();
  await expect(scene.locator('.neighbourhood-print')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the played refused-change gathering keeps the original programme complete across the ending', async ({ page }, info) => {
  const save = JSON.parse(readFileSync('test-fixtures/replays/phone-compromised.json', 'utf8'));
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...save, id: 'compromised', label: 'Original programme' }]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: 'Look back at Original programme', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A courtyard full of your work', exact: true })).toBeVisible();
  const scene = page.locator('.neighbourhood');
  await expect(scene).toHaveAttribute('data-mode', 'courtyard');
  await expect(scene).toContainText('The original programme was delivered. The extra change was declined.');
  await expect(scene).not.toContainText('unfinished');
  await expect(scene.locator('[data-scene-host="clem"]')).toBeVisible();
  await expect(scene.locator('.neighbourhood-print')).toContainText('Come as you are.');
  await scene.screenshot({ path: info.outputPath('original-programme-complete.png'), animations: 'disabled' });
});
