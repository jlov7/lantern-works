import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { PRESETS, RULES } from '../src/engine/rules';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { portfolioAt } from '../src/ui/game/portfolio';
import { shareSchema } from '../src/ui/schema';

const tape = shareSchema.parse(JSON.parse(readFileSync('src/ui/game/fixtures/ordinary-order-intake.json', 'utf8')));
const season = replay(tape.config, tape.commands, LEGACY_RULES_VERSION).state;

async function openSeason(page: Page, session: { config: RunConfig; commands: readonly Command[] } = tape, rulesVersion = LEGACY_RULES_VERSION) {
  await page.goto('/');
  await page.evaluate(({ config, commands, rules }) => {
    localStorage.clear();
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, rules, id: 'portfolio', label: 'Portfolio season', savedAt: new Date().toISOString(), config, commands }]));
  }, { ...session, rules: rulesVersion });
  await page.reload();
  await page.getByRole('button', { name: 'Look back at Portfolio season', exact: true }).click();
  await expect(page.locator('.portfolio')).toBeVisible();
}

for (const width of [390, 320]) test(`the delivered portfolio is readable and keyboard selectable at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await openSeason(page);
  const gallery = page.locator('.portfolio');
  await expect(gallery.locator('.portfolio-count')).toContainText(`${portfolioAt(season).length} launches`);
  await gallery.locator('.portfolio-catalogue summary').focus();
  await page.keyboard.press('Enter');
  const clem = gallery.locator('.portfolio-choice').filter({ hasText: 'Ten years of Clem' }).filter({ hasText: 'Day 8' }).last();
  await clem.focus();
  await page.keyboard.press('Enter');
  await expect(clem).toHaveAttribute('aria-pressed', 'true');
  await expect(gallery.locator('.portfolio-selected .campaign-art')).toHaveAttribute('data-subject', 'saxophone');
  await expect(gallery.locator('.portfolio-record')).toContainText('Ten years of Clem');
  await expect(gallery.locator('.portfolio-record')).toContainText('Made by Tomas');
  await expect(gallery.locator('.portfolio-record')).toContainText('1,200 cr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.portfolio').analyze()).violations).toEqual([]);
  await gallery.locator('.portfolio-catalogue summary').click();
  await gallery.screenshot({ path: info.outputPath(`portfolio-clem-${width}.png`) });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(stored[0].commands).toEqual(tape.commands);
});

test('a delivered piece from a broken recurring order stays partial in the final portfolio', async ({ page }) => {
  const run = runPolicy({ scenarioId: 'festival-week', seed: 'portfolio' }, { ...GHOSTS.bright, menu: [PRESETS.club], accept: 'all', news: 'default' });
  const state = replay(run.config, run.commands).state;
  const contract = state.contracts.find(c => c.jobIds.map(id => state.jobs.find(j => j.id === id)!.status).join(',') === 'delivered,missed,refunded')!;
  await openSeason(page, run, RULES.version);
  const gallery = page.locator('.portfolio');
  await gallery.locator('.portfolio-catalogue summary').click();
  await gallery.locator(`[data-portfolio-job="${contract.jobIds[0]}"]`).click();
  await expect(gallery.locator('.portfolio-record')).toContainText('1 of 3 launches delivered.');
  await expect(gallery.locator('.portfolio-record')).toContainText('The whole order is not yet complete.');
  for (const jobId of contract.jobIds.slice(1)) await expect(gallery.locator(`[data-portfolio-job="${jobId}"]`)).toHaveCount(0);
});

test('the ending keeps people and work prominent while the record opens deliberately', async ({ page }, info) => {
  await openSeason(page);
  await expect(page.locator('.regular-portrait')).toHaveCount(3);
  for (const selector of ['.end-gazette', '.end-debrief', '.end-share']) await expect(page.locator(selector)).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('ending-portfolio.png'), fullPage: true });
  await page.getByText('The Gazette: how the street remembers it', { exact: true }).click();
  await expect(page.locator('.end-gazette')).toBeVisible();
  await page.getByText('The studio ledger: what happened and why', { exact: true }).click();
  await expect(page.locator('.end-debrief')).toBeVisible();
  await page.getByRole('button', { name: 'Try a branch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What if?', exact: true })).toBeFocused();
  await page.locator('.rewind-day').nth(5).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Day 6');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
  expect(stored.find((s: { id: string }) => s.id === 'portfolio').commands).toEqual(tape.commands);
});
