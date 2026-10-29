import { expect, test, type Page } from '@playwright/test';
import oldSix from '../src/engine/fixtures/legacy-6.0.0.json' with { type: 'json' };
import oldSixOne from '../test-fixtures/replays/phone-compromised.json' with { type: 'json' };
import { adaptCareerContinuation, buildContinuation, deliveredPieces } from '../src/engine/continuation';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, CompanyState } from '../src/engine/types';
import { configSchema, type SavedRun } from '../src/ui/schema';
import { encodeShare } from '../src/ui/persist';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { projectBrief } from '../src/engine/projects';

const oldTape = oldSix.tapes[0]!;
const oldRuns = [
  { ...oldTape, rules: oldSix.rules },
  oldSixOne,
].map(tape => {
  const result = replay(configSchema.parse(tape.config), tape.commands as Command[], tape.rules);
  if (result.errors.length) throw new Error(result.errors.join('; '));
  return result.state;
});
const original = oldRuns[0]!;
const originals = deliveredPieces(original).slice(0, 3);
const practice = adaptCareerContinuation(original, originals.map(piece => piece.id), 'career-browser');

function finish(state: CompanyState): CompanyState {
  for (let turn = 0; turn < 40 && !state.finished; turn++) {
    const command: Command = state.call ? { type: 'answer', option: 'ring' } : state.news.some(item => item.choice === null) ? { type: 'choose', newsId: state.news.find(item => item.choice === null)!.id, option: 0 } : { type: 'runDay' };
    const result = applyCommand(state, command);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  if (!state.finished) throw new Error('Career fixture did not finish within 40 commands.');
  return state;
}

const finishedPractice = finish(createRun(practice, 'lantern-7.0.0'));

function finishedLoan(): CompanyState {
  const workingPractice = runPolicy(practice, GHOSTS.old);
  let state = createRun(buildContinuation(workingPractice, workingPractice.config.continuation!.pieces.map(piece => piece.id)), 'lantern-7.0.0');
  const step = (command: Command) => {
    const result = applyCommand(state, command);
    if (result.error) throw new Error(result.error);
    state = result.state;
  };
  for (let turn = 0; turn < 20 && state.day < 2; turn++) {
    if (state.call) { step({ type: 'answer', option: 'ring' }); continue; }
    const news = state.news.find(item => item.choice === null);
    if (news) { step({ type: 'choose', newsId: news.id, option: 0 }); continue; }
    for (const request of state.requests.filter(request => request.status === 'waiting')) step({ type: 'decline', requestId: request.id });
    step({ type: 'runDay' });
  }
  step({ type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', sourceId: 'carried-1', design: projectBrief(state, 'clem-ten', 'first-night', 'carried-1').defaultDesign });
  return finish(state);
}

function saved(state: CompanyState, id = 'career-browser'): SavedRun {
  return { v: 1, id, label: id, savedAt: '2026-10-28T12:00:00.000Z', rules: state.rulesVersion, config: state.config, commands: state.commands };
}
async function stored(page: Page): Promise<SavedRun[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'));
}
async function open(page: Page, state: CompanyState, id = 'career-browser') {
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.clear();
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated' }));
  }, saved(state, id));
  await page.reload();
  await page.getByRole('button', { name: `Look back at ${id}`, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

for (const old of oldRuns) test(`explicit ${old.rulesVersion} career adaptation discloses reset and keeps the original save`, async ({ page }) => {
  await open(page, old, 'original-studio');
  await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new season for your studio' });
  await expect(dialog).toContainText('The offer menu resets');
  await expect(dialog.getByRole('radio', { name: 'Continue under the original rules' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Enter the career: practice' }).check();
  await expect(dialog).toContainText('historical outcomes are marked unknown');
  await dialog.getByRole('button', { name: 'Open season 2', exact: true }).click();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Studio career' })).toContainText('A practice of your own');
  const runs = await stored(page);
  const child = runs.find(run => run.id !== 'original-studio')!;
  const kept = deliveredPieces(old).toReversed().slice(0, 3).map(piece => piece.id);
  expect(child.rules).toBe('lantern-7.0.0');
  expect(child.config).toEqual(adaptCareerContinuation(old, kept));
  expect(child.commands).toEqual([]);
  expect(child.config.continuation!.cash).toBe(old.cash);
  expect(runs.find(run => run.id === 'original-studio')!.commands).toEqual(old.commands);
  await page.evaluate(id => localStorage.setItem('lantern.runs.v1', JSON.stringify(JSON.parse(localStorage.getItem('lantern.runs.v1')!).filter((run: SavedRun) => run.id === id))), child.id);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${child.label}`, exact: true }).click();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Studio career' })).toContainText('A practice of your own');
});

test('continuing an old studio under its original rules stays explicit', async ({ page }) => {
  await open(page, original);
  await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open season 2', exact: true }).click();
  const child = (await stored(page)).find(run => run.id !== 'career-browser')!;
  expect(child.rules).toBe(original.rulesVersion);
  expect(child.config).toEqual(buildContinuation(original, deliveredPieces(original).toReversed().slice(0, 3).map(piece => piece.id)));
  await expect(page.getByRole('region', { name: 'Studio career' })).toHaveCount(0);
});

for (const width of [1280, 390, 320]) test(`finished curation uses keyboard, persists and undoes without reopening the season at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await open(page, finishedPractice);
  expect((await stored(page))[0]).toEqual(saved(finishedPractice));
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  const curation = page.getByRole('region', { name: 'Featured work', exact: true });
  await curation.getByText('Choose featured work · 0 of 3', { exact: true }).click();
  const checkbox = curation.getByRole('checkbox').first();
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  let run = (await stored(page))[0]!;
  expect(run.commands.at(-1)).toEqual({ type: 'featurePieces', pieceIds: ['carried-1'] });
  const current = replay(run.config, run.commands, run.rules);
  expect(current.errors).toEqual([]);
  expect(current.state.finished).toBe(true);
  expect(current.state.cash).toBe(finishedPractice.cash);
  const displayed = page.locator('.neighbourhood-print .designed-artwork__print');
  await expect(displayed).toHaveAttribute('data-layout', originals[0]!.design.layout);
  await expect(displayed).toHaveAttribute('data-palette', originals[0]!.design.palette);
  for (const copy of originals[0]!.copy) expect(await displayed.getAttribute('aria-label')).toContain(copy.text);
  await expect(page.locator('[data-scene-host]')).toHaveCount(0);
  await noOverflow(page);
  await curation.screenshot({ path: info.outputPath(`career-curation-${width}.png`) });
  await page.reload();
  await page.getByRole('button', { name: 'Look back at career-browser', exact: true }).click();
  await curation.getByText('Choose featured work · 1 of 3', { exact: true }).click();
  await expect(curation.getByRole('checkbox').first()).toBeChecked();
  await curation.getByRole('button', { name: 'Undo featured-work change', exact: true }).click();
  run = (await stored(page))[0]!;
  expect(run.commands).toEqual(finishedPractice.commands);
  expect(replay(run.config, run.commands, run.rules).state.finished).toBe(true);
  await expect(curation.getByRole('button', { name: 'Undo featured-work change', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Look back at career-browser', exact: true }).click();
  expect((await stored(page))[0]!.commands).toEqual(finishedPractice.commands);
  await page.getByRole('button', { name: 'Continue this studio', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Featured-work choices start empty');
  await page.getByRole('dialog').getByRole('button', { name: 'Open season 3', exact: true }).click();
  await expect.poll(async () => (await stored(page)).some(run => run.id !== 'career-browser')).toBe(true);
  const child = (await stored(page)).find(run => run.id !== 'career-browser')!;
  expect(replay(child.config, child.commands, child.rules).state.featuredPieceIds).toEqual([]);
  expect(child.config.continuation!.pieces).toHaveLength(3);
});

test('finished curation preserves quota and stale-tab protections and shared replays remain read-only', async ({ page }) => {
  await open(page, finishedPractice);
  const curation = page.getByRole('region', { name: 'Featured work', exact: true });
  await curation.getByText('Choose featured work · 0 of 3', { exact: true }).click();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lantern.runs.v1') throw new DOMException('Quota reached', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await curation.getByRole('checkbox').first().check();
  await expect(page.getByRole('status')).toContainText('could not save your latest moves');
  expect((await stored(page))[0]!.commands).toEqual(finishedPractice.commands);
  await page.reload();
  await page.getByRole('button', { name: 'Look back at career-browser', exact: true }).click();
  await curation.getByText('Choose featured work · 0 of 3', { exact: true }).click();
  const other = applyCommand(finishedPractice, { type: 'featurePieces', pieceIds: ['carried-2'] }).state;
  await page.evaluate(run => localStorage.setItem('lantern.runs.v1', JSON.stringify([run])), saved(other));
  await curation.getByRole('checkbox').first().check();
  await expect(page.getByRole('status')).toContainText('continued in another tab');
  expect((await stored(page))[0]!.commands).toEqual(other.commands);
  await expect(curation.getByRole('checkbox').first()).toBeDisabled();
  const share = await encodeShare(other.config, other.commands, 'Shared curation', other.rulesVersion);
  await page.goto(`/#s=${share}`);
  await expect(page.getByRole('region', { name: 'Featured work', exact: true })).toHaveCount(0);
  expect((await stored(page))[0]!.commands).toEqual(other.commands);
});

test('the authored career ends before the optional recurring studio', async ({ page }) => {
  const legacy = finish(createRun(buildContinuation(finishedPractice, []), 'lantern-7.0.0'));
  await open(page, legacy);
  await expect(page.getByRole('region', { name: 'Studio career' })).toContainText('The authored career is complete');
  await page.getByRole('button', { name: 'Continue in open studio', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('without more story chapters');
  await dialog.getByRole('button', { name: 'Continue in open studio', exact: true }).click();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Studio career' })).toContainText('Open studio');
  await expect(page.getByRole('region', { name: 'Studio career' })).toContainText('recurring');
});

test('a delivered caption keeps its exact retained loan and provenance visible without any parent save', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const loan = finishedLoan();
  const terms = loan.contracts.find(contract => contract.project?.id === 'clem-ten')!.project!;
  const source = terms.lentPiece!;
  await open(page, loan);
  expect(await stored(page)).toHaveLength(1);
  const retained = page.getByRole('complementary', { name: 'Retained artwork on loan' });
  await expect(retained).toContainText('Originally commissioned by Clem in Season 1');
  const artwork = retained.locator('.designed-artwork__print');
  await expect(artwork).toHaveAttribute('data-layout', source.design.layout);
  await expect(artwork).toHaveAttribute('data-palette', source.design.palette);
  for (const copy of source.copy) expect(await artwork.getAttribute('aria-label')).toContain(copy.text);
  const caption = page.locator('.portfolio-selected .designed-artwork__print');
  for (const copy of terms.proof!.pieces[0]!.copy) expect(await caption.getAttribute('aria-label')).toContain(copy.text);
  expect(await caption.getAttribute('aria-label')).not.toContain('Ten years. One room. All those nights.');
  await page.getByRole('navigation', { name: 'View the work' }).getByRole('button', { name: /Clem’s archive/ }).click();
  for (const copy of source.copy) expect(await page.locator('.neighbourhood-print .designed-artwork__print').getAttribute('aria-label')).toContain(copy.text);
  await expect(page.locator('[data-scene-host]')).toHaveCount(0);
  await noOverflow(page);
  await retained.screenshot({ path: info.outputPath('exact-retained-loan.png') });
});
