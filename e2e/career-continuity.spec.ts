import { expect, test, type Page } from '@playwright/test';
import careers from '../src/engine/fixtures/career-7.0.0.json' with { type: 'json' };
import { applyCommand, createRun } from '../src/engine/sim';
import type { CareerStage, Command, CompanyState, NewsCardId, RunConfig } from '../src/engine/types';
import { laterRequestCopy, newsPresentation } from '../src/ui/game/careerContinuity';

const seasons = careers.routes.find(r => r.id === 'prosperous')!.seasons;
function prefix(stage: CareerStage, card: NewsCardId): CompanyState {
  const tape = seasons.find(s => s.stage === stage)!;
  let state = createRun(tape.config as RunConfig);
  for (const command of tape.commands as Command[]) {
    if (state.news.some(n => n.card === card && n.day === state.day && n.choice === null)) return state;
    const result = applyCommand(state, command);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  throw new Error('Native news prefix not found.');
}
async function open(page: Page, state: CompanyState) {
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated' }));
  }, { v: 1, id: 'continuity-check', label: 'Continuity check', savedAt: '2026-10-28T21:00:00Z', rules: state.rulesVersion, config: state.config, commands: state.commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Continuity check', exact: true }).click();
}

for (const [stage, card] of [['practice', 'oscarRescue'], ['legacy', 'poach'], ['open', 'blackout'], ['legacy', 'lastOffer']] as const) test(`${stage} shows its current ${card} incident without changing the native choice`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  let state = prefix(stage, card);
  const news = state.news.find(n => n.card === card && n.day === state.day)!;
  const copy = newsPresentation(state, news);
  await open(page, state);
  await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible();
  await expect(page.locator('.news-text')).toHaveText(copy.text);
  if (card === 'oscarRescue') {
    await page.getByRole('button', { name: 'Add the order to the window', exact: true }).click();
    state = applyCommand(state, { type: 'choose', newsId: news.id, option: 1 }).state;
    const order = state.requests.find(r => r.day === state.day && r.source === 'news' && r.castId === 'oscar')!;
    const roster = page.getByLabel('Customer roster');
    const rosterDetails = page.locator('.roster-peek');
    if (await rosterDetails.getAttribute('open') === null) await rosterDetails.locator('summary').click();
    await roster.locator(`[data-request-id="${order.id}"]`).click();
    await expect(page.locator('.ticket-line')).toHaveText(laterRequestCopy(state, order, order.offer)!.request);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!));
    expect(stored[0].commands).toEqual(state.commands);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await page.screenshot({ path: info.outputPath(`${stage}-${card}.png`), fullPage: true });
  expect(errors).toEqual([]);
});
