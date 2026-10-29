import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeShare } from '../src/ui/persist';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { savedRunSchema, type SavedRun } from '../src/ui/schema';

const courtyard = JSON.parse(readFileSync('src/engine/fixtures/main-courtyard-5.0.0.json', 'utf8')) as { rules: string; config: RunConfig; commands: Command[] };
const calls = savedRunSchema.parse(JSON.parse(readFileSync('src/engine/fixtures/call-future-promises-5.0.0.json', 'utf8')));

const save = savedRunSchema.parse({ v: 1, id: 'worker-resume', label: 'Worker season', savedAt: '2026-10-26T00:00:00Z', rules: courtyard.rules, config: courtyard.config, commands: courtyard.commands.slice(0, 62) });

async function seed(page: Page, run = save) {
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.clear();
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
  }, run);
  await page.reload();
  await expect(page.getByRole('button', { name: `Continue ${run.label}`, exact: true })).toBeVisible();
}

async function delayResume(page: Page) {
  await page.addInitScript(() => {
    const Original = window.Worker;
    Object.assign(window, { resumeWorkers: 0, resumeTerminations: 0 });
    window.Worker = class extends Original {
      resume = false;
      override postMessage(message: unknown) {
        if ((message as { kind?: string }).kind === 'resume') {
          this.resume = true;
          (window as unknown as { resumeWorkers: number }).resumeWorkers++;
          setTimeout(() => super.postMessage(message), 500);
        } else super.postMessage(message);
      }
      override terminate() {
        if (this.resume) (window as unknown as { resumeTerminations: number }).resumeTerminations++;
        super.terminate();
      }
    };
  });
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]') as SavedRun[]);
const reading = (page: Page) => page.getByRole('heading', { name: 'Reading your season', exact: true });
const title = (page: Page) => page.getByRole('heading', { name: 'Make something for your neighbours.' });
const workerStarted = (page: Page) => expect.poll(() => page.evaluate(() => (window as unknown as { resumeWorkers: number }).resumeWorkers)).toBe(1);

test('saved-season reconstruction runs in a worker without changing its command log', async ({ page }) => {
  await delayResume(page);
  await seed(page);
  const expected = replay(save.config, save.commands, save.rules);
  expect(expected.errors).toEqual([]);
  await page.getByRole('button', { name: 'Continue Worker season', exact: true }).click();
  await expect(reading(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Opening Worker season.');
  await workerStarted(page);
  await expect(page.locator('main.workspace-stage')).toBeVisible();
  expect((await stored(page))[0]!.commands).toEqual(save.commands);
  await expect.poll(() => page.evaluate(() => (window as unknown as { resumeTerminations: number }).resumeTerminations)).toBe(1);
  expect(await page.title()).toContain(`Day ${Math.min(expected.state.day, 11) + 1} of 12`);
});

for (const leave of ['cancel', 'back', 'challenge', 'hash'] as const) test(`${leave} cancels a pending resume and rejects its late result`, async ({ page }) => {
  await delayResume(page);
  await seed(page);
  await page.getByRole('button', { name: 'Continue Worker season', exact: true }).click();
  await expect(reading(page)).toBeVisible();
  await workerStarted(page);
  if (leave === 'cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  else if (leave === 'back') await page.goBack();
  else await page.evaluate(hash => { location.hash = hash; }, leave === 'challenge' ? '#play=main-street:replacement' : '#elsewhere');
  if (leave === 'challenge') await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  else await expect(title(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { resumeTerminations: number }).resumeTerminations)).toBe(1);
  // Wait beyond the controlled worker delay, so a late result would have arrived.
  await page.waitForTimeout(650);
  if (leave === 'challenge') expect(await page.title()).toContain('Day 1 of 12');
  else await expect(title(page)).toBeVisible();
  expect((await stored(page)).find(r => r.id === save.id)!.commands).toEqual(save.commands);
});

for (const replacement of ['same-length', 'delete'] as const) test(`resume rejects a ${replacement} save change before activation`, async ({ page }) => {
  await delayResume(page);
  await seed(page);
  await page.getByRole('button', { name: 'Continue Worker season', exact: true }).click();
  await workerStarted(page);
  const next = { ...save, config: { ...save.config, seed: 'changed-same-length' } };
  await page.evaluate(({ next, replacement }) => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify(replacement === 'delete' ? [] : [next]));
  }, { next, replacement });
  await expect(title(page)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('changed or was removed');
  expect(await stored(page)).toEqual(replacement === 'delete' ? [] : [next]);
});

test('the no-Worker fallback preserves a held call and its commands', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'Worker', { configurable: true, value: undefined }); });
  const answer = calls.commands.findIndex(c => c.type === 'answer');
  expect(answer).toBeGreaterThan(0);
  const held = savedRunSchema.parse({ ...calls, id: save.id, label: save.label, commands: calls.commands.slice(0, answer) });
  await seed(page, held);
  await page.getByRole('button', { name: 'Continue Worker season', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: /^A call at / })).toBeVisible();
  expect((await stored(page))[0]!.commands).toEqual(held.commands);
});

test('save facts are replaced when an equal-length tape changes', async ({ page }) => {
  const first = { ...save, commands: [{ type: 'pace', pace: 'steady' }] as Command[] };
  await seed(page, first);
  const row = page.locator('[data-run="worker-resume"]');
  await expect(row.locator('.saved-meta')).toContainText('Day 1 morning');
  const next = { ...first, commands: [{ type: 'runDay' }] as Command[] };
  await page.evaluate(run => {
    const oldValue = localStorage.getItem('lantern.runs.v1');
    const newValue = JSON.stringify([run]);
    localStorage.setItem('lantern.runs.v1', newValue);
    window.dispatchEvent(new StorageEvent('storage', { key: 'lantern.runs.v1', oldValue, newValue }));
  }, next);
  await expect(row.locator('.saved-meta')).toContainText('Day 2 morning');
  expect((await stored(page))[0]!.commands).toEqual(next.commands);
});

test('a slow share decode cannot replace a newer challenge navigation', async ({ page }) => {
  const shared = await encodeShare(save.config, [], 'Slow shared season', save.rules);
  await page.addInitScript(() => {
    const Original = window.DecompressionStream;
    Object.assign(window, { shareDecodeStarted: false });
    window.DecompressionStream = class extends Original {
      override get readable() {
        return super.readable.pipeThrough(new TransformStream({
          async transform(chunk, controller) {
            (window as unknown as { shareDecodeStarted: boolean }).shareDecodeStarted = true;
            await new Promise(resolve => setTimeout(resolve, 600));
            controller.enqueue(chunk);
          },
        }));
      }
    };
  });
  await page.goto(`/#s=${shared}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { shareDecodeStarted: boolean }).shareDecodeStarted)).toBe(true);
  await page.evaluate(() => { location.hash = '#play=main-street:newer-challenge'; });
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  await page.waitForTimeout(800);
  expect((await stored(page))[0]!.config.seed).toBe('newer-challenge');
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
});
