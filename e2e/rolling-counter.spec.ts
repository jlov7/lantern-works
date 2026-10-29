import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { summarize } from '../src/engine/selectors';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { encodeShare } from '../src/ui/persist';

const recorded = JSON.parse(readFileSync('test-fixtures/replays/ai-route-continuity.json', 'utf8')) as { config: RunConfig; commands: Command[] };
let day = 0;
const opened = recorded.commands.findIndex(c => c.type === 'runDay' && ++day === 7);
const commands = recorded.commands.slice(0, opened);
const before = replay(recorded.config, commands, LEGACY_RULES_VERSION);
const after = replay(recorded.config, [...commands, { type: 'runDay', calls: true }], LEGACY_RULES_VERSION);

test.setTimeout(30_000);

async function morning(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  expect(opened).toBe(60);
  expect(before.errors).toEqual([]);
  expect(after.errors).toEqual([]);
  expect(after.state.call).toBeNull();
  expect(summarize(before.state).served).toBe(20);
  expect(summarize(after.state).served).toBe(28);
  await page.emulateMedia({ reducedMotion });
  await page.goto(`/#s=${await encodeShare(recorded.config, commands, 'Observed AI counter transition', LEGACY_RULES_VERSION)}`);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await page.waitForTimeout(450);
}

test('the observed AI day never rolls Served outside its real start and end counts', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await morning(page, 'no-preference');
  const served = page.locator('.stat-served .rolling > span').first();
  await expect(served).toHaveText('20');
  await page.evaluate(() => {
    const element = document.querySelector('.stat-served .rolling > span:first-child')!;
    const samples = [element.textContent];
    const observer = new MutationObserver(() => {
      if (samples.length < 2048) samples.push(element.textContent);
    });
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    Object.assign(window, { servedCapture: { samples, stop: () => observer.disconnect() } });
  });
  await page.getByRole('button', { name: /^Open the shop for Day 7/ }).click();
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await expect(served).toHaveText('28');
  const samples = await page.evaluate(() => {
    const capture = (window as unknown as { servedCapture: { samples: (string | null)[]; stop: () => void } }).servedCapture;
    capture.stop();
    return capture.samples;
  });
  await info.attach('actual-served-values', { body: JSON.stringify({ samples, errors }), contentType: 'application/json' });
  expect(samples.length).toBeGreaterThan(1);
  expect(samples.every(n => n !== null && Number(n) >= 20 && Number(n) <= 28), JSON.stringify(samples)).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced-motion hour stepping retains the exact Served range and final result', async ({ page }) => {
  await morning(page, 'reduce');
  const served = page.locator('.stat-served .rolling > span').first();
  await page.getByRole('button', { name: /^Open the shop for Day 7/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await expect(served).toHaveText('28');
  await page.locator('.evening details summary').click();
  await page.getByRole('button', { name: 'Step through the day hour by hour', exact: true }).click();
  await expect(served).toHaveText('20');
  for (let hour = 0; hour < 4; hour++) {
    await page.getByRole('button', { name: 'Next hour', exact: true }).click();
    const n = Number(await served.textContent());
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThanOrEqual(28);
  }
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(served).toHaveText('28');
});

test('the counter still displays a real operating loss after a day without sales', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#play=main-street:clock-e2e-1');
  await expect(page.getByRole('button', { name: /^Open the shop for Day 1/ })).toBeEnabled();
  await page.clock.install({ time: new Date('2026-10-27T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-27T10:00:01Z'));
  await page.getByRole('button', { name: /^Open the shop for Day 1/ }).click();
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
  // Exercise the complete 420ms roll without depending on concurrent software rendering.
  await page.clock.runFor(500);
  const native = replay({ scenarioId: 'main-street', seed: 'clock-e2e-1' }, [{ type: 'runDay', calls: true }], LEGACY_RULES_VERSION);
  expect(native.errors).toEqual([]);
  const profit = summarize(native.state).operatingResult;
  expect(profit).toBeLessThan(0);
  await expect(page.locator('.stat-profit .rolling > span').first()).toHaveText(`${profit.toLocaleString('en-GB')} cr`);
});
