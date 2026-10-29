import { expect, test, type Page } from '@playwright/test';
import { buildContinuation } from '../src/engine/continuation';
import { ordinaryBrief, ordinaryRequestLine } from '../src/engine/ordinary';
import { compatiblePatterns, patternSources } from '../src/engine/patterns';
import { lendingSources, projectBrief } from '../src/engine/projects';
import { PRESETS } from '../src/engine/rules';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, CompanyState } from '../src/engine/types';
import opening from '../src/ui/game/fixtures/heartfelt-trail.json' with { type: 'json' };
import type { SavedRun } from '../src/ui/schema';
import { goPlace, selectCustomer, takeFocused } from './workspace-helpers';

function step(state: CompanyState, command: Command): CompanyState {
  const result = applyCommand(state, command);
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  return result.state;
}
function nextMorning(state: CompanyState): CompanyState {
  for (const news of state.news.filter(news => news.day === state.day && news.choice === null)) state = step(state, { type: 'choose', newsId: news.id, option: 0 });
  for (const request of state.requests.filter(request => request.day === state.day && request.status === 'waiting')) state = step(state, { type: 'decline', requestId: request.id });
  return step(state, { type: 'runDay' });
}
function legacy() {
  const parent = replay(opening.config, opening.commands as Command[]);
  expect(parent.errors).toEqual([]);
  const source = patternSources(parent.state).find(piece => piece.castId === 'clem' && piece.design.kind === 'poster')!;
  let practice = createRun(buildContinuation(parent.state, [source.id]));
  const retained = practice.config.continuation!.pieces[0]!;
  practice = step(practice, { type: 'preparePattern', sourceId: retained.id });
  while (!practice.finished) practice = nextMorning(practice);
  return createRun(buildContinuation(practice, [retained.id], 'evolving-proof'));
}
async function load(page: Page, state: CompanyState) {
  const run: SavedRun = { v: 1, rules: state.rulesVersion, id: 'evolving-work-browser', label: 'Evolving work', savedAt: '2026-10-28T15:00:00.000Z', config: state.config, commands: state.commands };
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
  }, run);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Evolving work', exact: true }).click();
}
async function current(page: Page): Promise<CompanyState> {
  const run = await page.evaluate(() => (JSON.parse(localStorage.getItem('lantern.runs.v1')!) as SavedRun[]).find(run => run.id === 'evolving-work-browser')!);
  const result = replay(run.config, run.commands, run.rules);
  expect(result.errors).toEqual([]);
  return result.state;
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
}

for (const width of [1280, 390, 320]) test(`lending requires an explicit exact source and survives Undo at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const state = nextMorning(nextMorning(legacy()));
  const source = lendingSources(state, 'clem-ten', 'first-night')[0]!;
  await load(page, state);
  await page.locator('.project-notice').click();
  await page.getByRole('button', { name: /Lend a retained print/ }).click();
  const picker = page.getByRole('combobox', { name: 'Retained piece for the archive', exact: true });
  await expect(picker).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Approve proof & book', exact: true })).toHaveCount(0);
  expect((await current(page)).contracts.some(contract => contract.project?.id === 'clem-ten')).toBe(false);
  await picker.focus();
  // Native type-ahead also works in macOS headless Chromium, whose popup arrows are not dispatched.
  await page.keyboard.press(source.title[0]!);
  await page.keyboard.press('Tab');
  await expect(picker).toHaveValue(source.id);
  const retained = page.locator('.project-lending .designed-artwork__print');
  await expect(retained).toHaveAttribute('data-layout', source.design.layout);
  await expect(retained).toHaveAttribute('data-palette', source.design.palette);
  for (const copy of source.copy) expect(await retained.getAttribute('aria-label')).toContain(copy.text);
  const brief = projectBrief(state, 'clem-ten', 'first-night', source.id);
  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  for (const copy of brief.pieces[0]!.copy) expect(await desk.locator('.designed-artwork__print').getAttribute('aria-label')).toContain(copy.text);
  await noOverflow(page);
  await page.locator('.project-lending').screenshot({ path: info.outputPath(`lending-${width}.png`) });
  await desk.getByRole('button', { name: 'Review this proof', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Approve proof & book', exact: true }).focus();
  await page.keyboard.press('Enter');
  let saved = await current(page);
  expect(saved.contracts.at(-1)!.project!.lentPiece).toEqual(source);
  expect(saved.commands.at(-1)).toMatchObject({ type: 'acceptProject', projectId: 'clem-ten', sourceId: source.id });
  await page.getByRole('button', { name: 'Undo commission', exact: true }).click();
  await expect(picker).toHaveValue(source.id);
  expect((await current(page)).contracts.some(contract => contract.project?.id === 'clem-ten')).toBe(false);
  await desk.getByRole('button', { name: 'Review this proof', exact: true }).click();
  await page.getByRole('button', { name: 'Approve proof & book', exact: true }).click();
  saved = await current(page);
  expect(saved.contracts.at(-1)!.project!.lentPiece).toEqual(source);
  await noOverflow(page);
});

test('ordinary pattern reuse retains the recurring request and approved copy through delivery', async ({ page }, info) => {
  let state = legacy();
  state = step(state, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 300 }] });
  const request = state.requests.find(request => request.castId === 'clem')!;
  const brief = ordinaryBrief(request, state.menu[0]!)!;
  const pattern = compatiblePatterns(state, brief)[0]!;
  await load(page, state);
  const ticket = await selectCustomer(page, request.id);
  await expect(ticket.locator('.ticket-line')).toHaveText(ordinaryRequestLine(request)!);
  await expect(ticket.locator('.first-proof__patterns')).toContainText('15 briefing minutes');
  await ticket.getByRole('button', { name: `Use ${pattern.title}`, exact: true }).focus();
  await page.keyboard.press('Enter');
  const proof = ticket.locator('.first-proof__paper .designed-artwork__print');
  await expect(proof).toHaveAttribute('data-layout', pattern.design.pieces[0]!.layout);
  for (const copy of brief.pieces[0]!.copy) expect(await proof.getAttribute('aria-label')).toContain(copy.text);
  await noOverflow(page);
  await ticket.locator('.first-proof').screenshot({ path: info.outputPath('ordinary-pattern.png') });
  await takeFocused(page);
  state = await current(page);
  const contract = state.contracts.find(contract => contract.requestId === request.id)!;
  expect(contract.briefId).toBe(request.briefId);
  expect(contract.proof!.design).toEqual(pattern.design);
  expect(contract.proof!.pieces[0]!.copy).toEqual(brief.pieces[0]!.copy);
  await goPlace(page, 'Studio');
  await expect(page.locator('.pattern-records')).not.toContainText('Used on');
  // Exercise the delivered UI with the exact accepted native tape, without inventing task outcomes.
  for (let day = 0; day < 3 && !state.jobs.find(job => job.contractId === contract.id)?.deliveredAt; day++) state = nextMorning(state);
  expect(state.jobs.find(job => job.contractId === contract.id)!.status).toBe('delivered');
  expect(state.events.find(event => event.type === 'pattern_used' && event.patternId === pattern.id && contract.jobIds.includes(event.jobId!))).toMatchObject({ amount: 15 });
  await load(page, state);
  await goPlace(page, 'Studio');
  await expect(page.locator('.pattern-records')).toContainText('Used on 1 delivered print this season.');
  await goPlace(page, 'Work');
  const choose = page.locator(`[data-portfolio-job="${contract.jobIds[0]}"]`);
  if (await choose.count()) await choose.click();
  const delivered = page.locator('.portfolio-selected .designed-artwork__print');
  await expect(delivered).toHaveAttribute('data-layout', pattern.design.pieces[0]!.layout);
  for (const copy of brief.pieces[0]!.copy) expect(await delivered.getAttribute('aria-label')).toContain(copy.text);
  await noOverflow(page);
});
