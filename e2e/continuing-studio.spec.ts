import { expect, test, type Page } from '@playwright/test';
import route from '../src/engine/fixtures/main-courtyard-5.0.0.json' with { type: 'json' };
import { buildContinuation } from '../src/engine/continuation';
import { patternReduction, patternSources } from '../src/engine/patterns';
import { projectBrief, projectRecords } from '../src/engine/projects';
import { PRESETS, RULES } from '../src/engine/rules';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { decodeShare, encodeShare } from '../src/ui/persist';
import type { SavedRun } from '../src/ui/schema';
import { authoredCommands } from './authored-helpers';
import { goPlace, selectCustomer, takeFocused } from './workspace-helpers';

// Preserve the authored continuation contract under its original rules. The career has separate coverage.
const rulesVersion = 'lantern-6.1.0';
const originalCommands = authoredCommands(route.config, route.commands as Command[], rulesVersion);
const original = replay(route.config, originalCommands, rulesVersion).state;
const sources = patternSources(original);
const nextConfig = buildContinuation(original, sources.map(source => source.id), 'continuing-browser');

function save(config: RunConfig, commands: Command[], id = 'browser-parent', label = 'Browser season'): SavedRun {
  expect(replay(config, commands, rulesVersion).errors).toEqual([]);
  return { v: 1, rules: rulesVersion, id, label, savedAt: '2026-10-26T12:00:00.000Z', config, commands };
}

async function saves(page: Page): Promise<SavedRun[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]'));
}

async function load(page: Page, run: SavedRun) {
  await page.goto('/');
  await page.evaluate(run => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([run]));
  }, run);
  await page.reload();
  const finished = replay(run.config, run.commands, run.rules).state.finished;
  await page.getByRole('button', { name: `${finished ? 'Look back at' : 'Continue'} ${run.label}`, exact: true }).click();
}

async function state(page: Page) {
  const run = (await saves(page))[0]!;
  const result = replay(run.config, run.commands, run.rules);
  expect(result.errors).toEqual([]);
  return result.state;
}

async function finishDay(page: Page, onPlaying?: () => Promise<void>) {
  const review = page.getByRole('button', { name: "Review tomorrow's window", exact: true });
  if (await review.isVisible()) await review.click();
  await goPlace(page, 'Window');
  const day = (await state(page)).day;
  for (let attempt = 0; attempt < 3 && (await state(page)).day === day; attempt++) {
    const option = page.locator('.news:not(.news-done) .news-option').first();
    if (await option.isVisible()) await option.click();
    await page.getByRole('button', { name: /^Open .*Day / }).click();
  }
  expect((await state(page)).day).toBe(day + 1);
  const skip = page.getByRole('button', { name: 'Skip to evening', exact: true });
  if (onPlaying) await onPlaying();
  if (await skip.isVisible()) await skip.click();
  const call = page.getByRole('alertdialog', { name: /^A call at/ });
  if (await call.count()) await call.getByRole('button', { name: 'Leave it', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
}

async function noOverflow(page: Page, phase: string) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll<HTMLElement>('body *')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      return rect.right > innerWidth + .5 ? [{ tag: element.tagName, className: String(element.className), right: rect.right, width: rect.width, text: element.textContent?.slice(0, 80) }] : [];
    }).slice(-20),
  }));
  expect(geometry.scroll, `${phase}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.width);
}

for (const width of [1280, 390, 320]) test(`continuation is writable and independent at ${width}px, reduced motion and 200% text`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await load(page, save(route.config, originalCommands));
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  const continueButton = page.getByRole('button', { name: 'Continue this studio', exact: true });
  await continueButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'A new season for your studio', exact: true });
  await expect(dialog.getByRole('heading')).toBeFocused();
  await expect(dialog.locator('.continuation-facts')).toContainText('7,530 cr');
  await expect(dialog.getByRole('checkbox')).toHaveCount(sources.length);
  await expect(dialog.locator('.designed-artwork__print')).toHaveCount(sources.length);
  for (const source of sources) {
    const artwork = dialog.getByRole('img', { name: new RegExp(source.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await expect(artwork).toHaveAttribute('data-layout', source.design.layout);
    await expect(artwork).toHaveAttribute('data-palette', source.design.palette);
    for (const copy of source.copy) expect(await artwork.getAttribute('aria-label')).toContain(copy.text);
  }
  const first = dialog.getByRole('checkbox').first();
  await first.focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('group', { name: /Keep in the studio/ })).toContainText('2 of 3');
  await page.keyboard.press('Space');
  await noOverflow(page, 'continuation dialog, 200% text');
  await dialog.screenshot({ path: info.outputPath(`continuation-${width}.png`) });
  await page.keyboard.press('Escape');
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('textbox', { name: 'Next season’s street seed' }).fill('continuing-browser');
  await dialog.getByRole('button', { name: 'Open season 2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Game places' })).toBeVisible();
  const stored = await saves(page);
  expect(stored).toHaveLength(2);
  const next = stored.find(run => run.id !== 'browser-parent')!;
  expect(next.commands).toEqual([]);
  // Dialog lists newest first; preserve that selected order in the exact snapshot.
  expect(next.config).toEqual(buildContinuation(original, [...sources].reverse().map(source => source.id), 'continuing-browser'));
  const opening = replay(next.config, [], next.rules).state;
  expect(opening.cash).toBe(original.cash);
  expect(opening.staffing).toEqual(original.staffing);
  expect(opening.upgrades).toEqual(original.upgrades);
  expect(opening.journal.filter(entry => entry.kind === 'capital')).toHaveLength(1);
  await page.evaluate(id => localStorage.setItem('lantern.runs.v1', JSON.stringify(JSON.parse(localStorage.getItem('lantern.runs.v1')!).filter((run: SavedRun) => run.id === id))), next.id);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${next.label}`, exact: true }).click();
  await goPlace(page, 'Studio');
  await page.getByLabel('Start from a delivered piece').selectOption(next.config.continuation!.pieces[0]!.id);
  await page.getByRole('button', { name: 'Prepare this pattern · 50 cr', exact: true }).click();
  expect((await saves(page))[0]!.id).toBe(next.id);
  expect((await saves(page))[0]!.commands).toEqual([{ type: 'preparePattern', sourceId: next.config.continuation!.pieces[0]!.id }]);
  expect((await state(page)).cash).toBe(original.cash - 50);
  await noOverflow(page, 'pattern shelf, 200% text');
  await page.locator('.pattern-shelf').screenshot({ path: info.outputPath(`shelf-${width}.png`) });
});

test('paid patterns occupy Tomas, teach Noor for the next morning, and retain the new customer copy', async ({ page }, info) => {
  await load(page, save(nextConfig, []));
  await goPlace(page, 'Studio');
  await page.getByLabel('Start from a delivered piece').selectOption('carried-1');
  await page.getByRole('button', { name: 'Prepare this pattern · 50 cr', exact: true }).click();
  await expect(page.locator('.pattern-records')).toContainText('60 preparation minutes left with Tomas');
  // Reply explicitly to the returning regular rather than losing him by opening unanswered.
  const clem = (await state(page)).requests.find(request => request.castId === 'clem')!;
  const ticket = await selectCustomer(page, clem.id);
  await ticket.getByRole('button', { name: 'Decline this request', exact: true }).click();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Hire Noor', exact: true }).click();
  await finishDay(page);
  let current = await state(page);
  const ready = current.events.find(event => event.type === 'pattern_ready')!;
  expect(ready).toMatchObject({ minute: 60, resourceId: 'h2' });
  expect(current.resources.find(resource => resource.id === 'h2')!.busyMinutes).toBe(60);
  expect(current.journal.filter(entry => entry.kind === 'pattern')).toMatchObject([{ cash: -50 }]);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Teach this pattern to Noor', exact: true }).click();
  await expect(page.locator('.pattern-records')).toContainText('lesson booked for Day 2');
  current = await state(page);
  expect(current.patternTeaching![0]).toMatchObject({ day: 1, completedAt: null });
  await finishDay(page);
  current = await state(page);
  expect(current.lostCast).not.toContain('clem');
  expect(current.events.find(event => event.type === 'pattern_teaching_start')).toMatchObject({ minute: 480, resourceId: 'j1', mentorId: 'h2', amount: 60 });
  expect(current.events.find(event => event.type === 'pattern_teaching_done')).toMatchObject({ minute: 540 });
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Studio');
  await expect(page.locator('.pattern-records')).toContainText('Noor knows this pattern too.');
  await goPlace(page, 'Window');
  await page.locator('.project-notice').click();
  await page.getByRole('button', { name: /Grow the archive wall/ }).click();
  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  const newBrief = projectBrief(current, 'clem-ten', 'first-night');
  await desk.getByRole('button', { name: 'Big headline', exact: true }).click();
  await desk.getByRole('button', { name: 'Use Anniversary photograph', exact: true }).click();
  const print = desk.locator('.designed-artwork__print');
  await expect(print).toHaveAttribute('data-layout', sources[0]!.design.layout);
  await expect(print).toHaveAttribute('data-palette', sources[0]!.design.palette);
  for (const copy of newBrief.pieces[0]!.copy) expect(await print.getAttribute('aria-label')).toContain(copy.text);
  expect(await print.getAttribute('aria-label')).not.toContain('Ten years. One room. All those nights.');
  await desk.getByRole('button', { name: 'Review this proof', exact: true }).click();
  await page.getByRole('button', { name: 'Approve proof & book', exact: true }).click();
  current = await state(page);
  const contract = current.contracts.find(contract => contract.project?.id === 'clem-ten')!;
  const job = current.jobs.find(job => job.contractId === contract.id)!;
  const noor = current.resources.find(resource => resource.id === 'j1')!;
  expect(patternReduction(current, job, noor, 1)).toBe(0);
  expect(patternReduction(current, job, noor, 2)).toBe(15);
  expect(contract.project!.proof!.design.pieces[0]!.copy).toEqual(newBrief.defaultDesign.pieces[0]!.copy);
  await goPlace(page, 'Work');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.miniature-world')).toBeVisible();
  await expect(page.locator('.miniature-world')).not.toHaveAttribute('data-renderer-choice', 'checking');
  const tryMiniature = page.getByRole('button', { name: 'Try miniature room', exact: true });
  if (await tryMiniature.isVisible()) await tryMiniature.click();
  await expect(page.locator('.miniature-world')).toHaveAttribute('data-rendered', 'true', { timeout: 15_000 });
  await expect(page.locator('.miniature-art-sources[data-art-ready=true]')).toHaveCount(1);
  await finishDay(page, async () => {
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const inspect = page.locator(`button[data-inspect-job="${job.id}"]`);
    await expect(inspect).toBeVisible();
    await inspect.click();
    const live = page.locator(`[data-work-job="${job.id}"] .designed-artwork__print`).first();
    await expect(live).toBeVisible();
    await expect(live).toHaveAttribute('data-layout', sources[0]!.design.layout);
    await expect(live).toHaveAttribute('data-palette', sources[0]!.design.palette);
    const printed = (await live.locator('tspan').allTextContents()).join(' ');
    for (const copy of newBrief.pieces[0]!.copy) expect(printed).toContain(copy.text);
    await page.locator('.world-wrap').screenshot({ path: info.outputPath('pattern-live-production.png') });
  });
  await goPlace(page, 'Work');
  current = await state(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let extraDay = 0; extraDay < 2 && current.jobs.find(item => item.id === job.id)!.status !== 'delivered'; extraDay++) {
    await finishDay(page);
    current = await state(page);
  }
  await goPlace(page, 'Work');
  expect(current.jobs.find(item => item.id === job.id)!.status).toBe('delivered');
  const choice = page.locator(`[data-portfolio-job="${job.id}"]`);
  if (await choice.count()) await choice.click();
  for (const copy of newBrief.pieces[0]!.copy) expect(await page.locator('.portfolio-selected .designed-artwork__print').getAttribute('aria-label')).toContain(copy.text);
  await page.locator('.portfolio-selected').screenshot({ path: info.outputPath('pattern-new-copy-delivered.png') });
});

test('challenge copies the whole continuing config, starts writable and clean, and replay stays exact and read-only', async ({ page }, info) => {
  let finished = createRun(nextConfig, rulesVersion);
  for (let day = 0; day < RULES.days && !finished.finished; day++) {
    for (const news of finished.news.filter(news => news.choice === null)) finished = applyCommand(finished, { type: 'choose', newsId: news.id, option: 0 }).state;
    const result = applyCommand(finished, { type: 'runDay' });
    expect(result.error).toBeUndefined();
    finished = result.state;
  }
  expect(finished.finished).toBe(true);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await load(page, save(nextConfig, finished.commands));
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy challenge link', exact: true }).click();
  await expect(page.getByText('Studio challenge copied. It starts with the same cash, work and relationships.', { exact: true })).toBeVisible();
  const challenge = await page.evaluate(() => navigator.clipboard.readText());
  expect(challenge).toContain('#start=');
  const decoded = await decodeShare(challenge.split('#start=')[1]!);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.reason);
  expect(decoded.payload.config).toEqual(nextConfig);
  expect(decoded.payload.commands).toEqual([]);
  await page.getByRole('button', { name: 'Copy replay link', exact: true }).click();
  await expect(page.getByText('Replay link copied. It rebuilds your season move by move.', { exact: true })).toBeVisible();
  const replayUrl = await page.evaluate(() => navigator.clipboard.readText());
  const copiedReplay = await decodeShare(replayUrl.split('#s=')[1]!);
  expect(copiedReplay.ok).toBe(true);
  if (!copiedReplay.ok) throw new Error(copiedReplay.reason);
  expect(copiedReplay.payload.config).toEqual(nextConfig);
  expect(copiedReplay.payload.commands).toEqual(finished.commands);
  await page.evaluate(() => localStorage.removeItem('lantern.runs.v1'));
  await page.goto(challenge);
  await expect(page.getByRole('navigation', { name: 'Game places' })).toBeVisible();
  expect((await saves(page))[0]!.config).toEqual(nextConfig);
  expect((await saves(page))[0]!.commands).toEqual([]);
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Prepare this pattern · 50 cr', exact: true }).click();
  const beforeReplay = await saves(page);
  expect(beforeReplay[0]!.commands).toHaveLength(1);
  await page.goto(replayUrl);
  await page.getByText('Keep a postcard or share this season', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy replay link', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue this studio', exact: true })).toHaveCount(0);
  expect(await saves(page)).toEqual(beforeReplay);
  await page.screenshot({ path: info.outputPath('continuing-replay.png') });
  const malformed = await encodeShare(nextConfig, [{ type: 'preparePattern', sourceId: 'not-delivered' }], undefined, rulesVersion);
  await page.goto(`/#start=${malformed}`);
  await expect(page.getByText('The moves in this link do not replay on this street.', { exact: true })).toBeVisible();
  expect(await saves(page)).toEqual(beforeReplay);
  const nonempty = await encodeShare(nextConfig, [{ type: 'preparePattern', sourceId: 'carried-1' }], undefined, rulesVersion);
  await page.goto(`/#start=${nonempty}`);
  await expect(page.getByText('A studio challenge must start before any moves have been made.', { exact: true })).toBeVisible();
  expect(await saves(page)).toEqual(beforeReplay);
});

test('Ivo earns an ordinary order after Hugo’s actual handover and books his own sign', async ({ page }, info) => {
  let before = createRun(nextConfig, rulesVersion);
  const step = (command: Command) => {
    const result = applyCommand(before, command);
    expect(result.error).toBeUndefined();
    before = result.state;
  };
  step({ type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 300 }] });
  for (let day = 0; day < 2; day++) {
    for (const news of before.news.filter(news => news.choice === null)) step({ type: 'choose', newsId: news.id, option: 0 });
    step({ type: 'runDay' });
  }
  expect(before.day).toBe(2);
  expect(projectRecords(original).find(record => record.contract.castId === 'hugo')!.status).toBe('delivered');
  await load(page, save(nextConfig, before.commands));
  await page.locator('.project-notice').click();
  await page.getByRole('button', { name: /Ivo’s own workshop/ }).click();
  await expect(page.locator('.project-prerequisite')).toContainText('Ordinary orders delivered for Ivo: 0/1');
  await expect(page.locator('.project-prerequisite')).not.toContainText('Hugo');
  await page.getByRole('button', { name: 'Return to Ivo', exact: true }).click();
  const request = before.requests.find(request => request.day === 2 && request.castId === 'ivo')!;
  expect(request).toBeDefined();
  await selectCustomer(page, request.id);
  await takeFocused(page);
  await finishDay(page);
  let current = await state(page);
  const ordinary = current.contracts.find(contract => contract.requestId === request.id)!;
  for (let extraDay = 0; extraDay < 2 && !ordinary.jobIds.every(id => current.jobs.find(job => job.id === id)!.status === 'delivered'); extraDay++) {
    await finishDay(page);
    current = await state(page);
  }
  expect(ordinary.jobIds.every(id => current.jobs.find(job => job.id === id)!.status === 'delivered')).toBe(true);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await page.locator('.project-notice').click();
  await page.getByRole('button', { name: /Ivo’s own workshop/ }).click();
  await expect(page.locator('.project-prerequisite')).toContainText('Ordinary orders delivered for Ivo: 1/1');
  await page.getByRole('button', { name: /Ivo’s name above the door/ }).click();
  const desk = page.getByRole('region', { name: 'Creative proof desk' });
  await expect(desk.locator('.designed-artwork__print')).toHaveAttribute('aria-label', /independent sign/);
  expect(await desk.locator('.designed-artwork__print').getAttribute('aria-label')).toContain('IVO WATCH WORKSHOP');
  expect(await desk.locator('.designed-artwork__print').getAttribute('aria-label')).not.toContain('Hugo at the bench');
  await desk.getByRole('button', { name: 'Review this proof', exact: true }).click();
  await page.getByRole('button', { name: 'Approve proof & book', exact: true }).click();
  current = await state(page);
  const sign = current.contracts.find(contract => contract.project?.id === 'hugo-handover')!;
  expect(sign.castId).toBe('ivo');
  await finishDay(page);
  await goPlace(page, 'Work');
  current = await state(page);
  for (let extraDay = 0; extraDay < 2 && current.jobs.find(job => job.id === sign.jobIds[0])!.status !== 'delivered'; extraDay++) {
    await finishDay(page);
    current = await state(page);
  }
  await goPlace(page, 'Work');
  expect(current.jobs.find(job => job.id === sign.jobIds[0])!.status).toBe('delivered');
  const choice = page.locator(`[data-portfolio-job="${sign.jobIds[0]}"]`);
  if (await choice.count()) await choice.click();
  expect(await page.locator('.portfolio-selected .designed-artwork__print').getAttribute('aria-label')).toContain('IVO WATCH WORKSHOP');
  await page.locator('.portfolio-selected').screenshot({ path: info.outputPath('ivo-sign-delivered.png') });
});
