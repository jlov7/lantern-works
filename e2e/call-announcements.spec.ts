import { expect, test } from '@playwright/test';
import recorded from '../src/engine/fixtures/call-announcements-5.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { eveningFacts } from '../src/ui/game/eveningFacts';

test.use({ reducedMotion: 'reduce' });

for (const answerIndex of recorded.answerIndices) test(`a resumed call announces its completed evening at command ${answerIndex}`, async ({ page }) => {
  const commands = recorded.commands as Command[];
  const prefix = commands.slice(0, answerIndex);
  const opened = prefix.findLastIndex(command => command.type === 'runDay');
  const before = replay(recorded.config, prefix.slice(0, opened), recorded.rules);
  const held = replay(recorded.config, prefix, recorded.rules);
  const completed = replay(recorded.config, commands.slice(0, answerIndex + 1), recorded.rules);
  expect([...before.errors, ...held.errors, ...completed.errors]).toEqual([]);
  expect(held.state.call).not.toBeNull();
  const sentence = eveningFacts({ before: before.state, after: completed.state }).sentence;
  expect(sentence).not.toBe(eveningFacts({ before: before.state, after: held.state }).sentence);
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, { v: 1, rules: recorded.rules, id: 'call-announcement', label: 'Call announcement', savedAt: new Date().toISOString(), config: recorded.config, commands: prefix });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Call announcement', exact: true }).click();
  const call = page.getByRole('alertdialog', { name: /^A call at/ });
  await call.getByRole('button', { name: /^Ring / }).click();
  await expect(call).toHaveCount(0);
  await expect(page.locator('.evening')).toContainText(sentence);
  await expect(page.locator('.vh[aria-live="polite"]')).toContainText(`${sentence} Evening.`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands.slice(0, answerIndex + 1));
});
