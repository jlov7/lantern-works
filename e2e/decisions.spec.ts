import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { expect, test, type Page } from '@playwright/test';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { PRESETS } from '../src/engine/rules';
import { dayPlan, fits, forecast, summarize, takeableInTurn } from '../src/engine/selectors';
import { applyCommand, replay, simulateDay } from '../src/engine/sim';
import { makerChoices } from '../src/ui/game/makers';
import type { Command, RunConfig } from '../src/engine/types';
import { castName } from '../src/ui/format';
import { goPlace, openComparison, selectCustomer } from './workspace-helpers';

async function openSaved(page: Page, config: RunConfig, commands: Command[], label: string) {
  const save = { v: 1, rules: LEGACY_RULES_VERSION, id: 'forecast-truth', label, savedAt: new Date().toISOString(), config, commands };
  await page.goto('/');
  await page.evaluate((save) => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: `Continue ${label}`, exact: true }).click();
  await goPlace(page, 'Window');
}

test('a selected same-day launch does not promise work beyond a missed deadline', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'panel-1' };
  let commands: Command[] | undefined;
  runPolicy(config, GHOSTS.hand, { onBuyer: (s, id, fit) => {
    if (s.day === 6 && id === 'd6-r1' && !fit) commands = [...s.commands];
  } }, LEGACY_RULES_VERSION);
  expect(commands).toBeDefined();
  await openSaved(page, config, commands!, 'Due tonight');
  const ticket = await selectCustomer(page, 'd6-r1');
  const plan = ticket.locator('.decision-plan');
  await plan.locator(':scope > summary').click();
  await expect(plan.locator('.dayplan-free')).toContainText('With Yara:');
  await expect(plan.locator('.dayplan-free')).toContainText('Not finished today: it would miss tonight.');
  await expect(plan.locator('.dayplan-free')).not.toContainText('carries on tomorrow');
});

test('a news order is not blamed for an existing forecast miss', async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'm1' };
  let commands: Command[] = [];
  runPolicy(config, GHOSTS.hand, { onMorning: s => { if (s.day === 6) commands = [...s.commands]; } }, LEGACY_RULES_VERSION);
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  const news = state.news.find(n => n.day === state.day && n.choice === null)!;
  expect(news.card).toBe('streetParty');
  await openSaved(page, config, commands, 'Party risk');
  const card = page.locator('.news:not(.news-done)');
  const take = card.getByRole('button', { name: 'Add the order to the window', exact: true });
  await expect(take).toHaveAccessibleDescription(/This order would be on time\. Existing work would be late without it\./);
  await expect(card).not.toContainText('would make another launch late');
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `scratch/news-attribution-${info.project.name}.png` });
  await take.click();
  const ticket = page.locator('#ticket-d6-n');
  await expect(ticket.locator('[data-customer-heading]')).toBeFocused();
  await expect(page.locator('.news-done')).toContainText('Summer street party: not taken yet. Take it on its ticket before opening.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'forecast-truth'));
  expect(saved.commands).toEqual([...commands, { type: 'choose', newsId: news.id, option: 1 }]);
  const chosen = replay(config, saved.commands, LEGACY_RULES_VERSION);
  expect(chosen.errors).toEqual([]);
  expect(chosen.state.requests.find(r => r.id === 'd6-n')?.status).toBe('waiting');
});

test('a quick offer previews the kit bottleneck, changes live buyers and stays undoable', async ({ page }, info) => {
  await page.goto('/#play=main-street:panel-1');
  let comparison = await openComparison(page, true);
  const decision = comparison.locator('.quick-offer');
  await expect(decision).toContainText('4 would buy; 1 fit today in queue order if no redos');
  await expect(decision).toContainText('First kit: 4 hours once');
  await expect(decision).toContainText('Hand-made templates');
  await expect(decision).toContainText('110 cr/hour against 75 cr/hour to run');
  await expect(decision).toContainText('AI is a separate desk choice');
  await page.evaluate(() => document.fonts.ready);
  await decision.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/quick-offer-before-${info.project.name}.png` });
  let buyers = comparison.getByRole('list', { name: 'Neighbours who would buy' });
  const before = await buyers.allTextContents();
  await decision.getByRole('button', { name: 'Customise an offer', exact: true }).click();
  const workshop = page.getByRole('dialog', { name: 'Offer workshop' });
  await expect(workshop).toBeVisible();
  await workshop.getByRole('button', { name: 'Cancel', exact: true }).click();
  await decision.getByRole('button', { name: 'Put Launchlet on the window', exact: true }).click();
  await expect(comparison).not.toBeVisible();
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  await goPlace(page, 'Studio');
  await expect(page.locator('.sign-title', { hasText: 'Launchlet' })).toBeVisible();
  await goPlace(page, 'Window');
  comparison = await openComparison(page, true);
  buyers = comparison.getByRole('list', { name: 'Neighbours who would buy' });
  await expect(buyers).toContainText('Launchlet');
  expect(await buyers.allTextContents()).not.toEqual(before);
  await expect(comparison.locator('.quick-offer')).toHaveCount(0);
  await comparison.getByRole('button', { name: /^Return to / }).click();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Redesign Launchlet', exact: true }).click();
  await expect(workshop).toBeVisible();
  await workshop.getByRole('button', { name: 'Cancel', exact: true }).click();
  await goPlace(page, 'Window');
  comparison = await openComparison(page, true);
  buyers = comparison.getByRole('list', { name: 'Neighbours who would buy' });
  await buyers.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `scratch/quick-offer-after-${info.project.name}.png` });
  await comparison.getByRole('button', { name: /^Return to / }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await goPlace(page, 'Studio');
  await expect(page.locator('.sign-title', { hasText: 'Launchlet' })).toHaveCount(0);
  await goPlace(page, 'Window');
  comparison = await openComparison(page, true);
  const restoredDecision = comparison.locator('.quick-offer');
  await expect(restoredDecision).toContainText('4 would buy; 1 fit today in queue order if no redos');
  buyers = comparison.getByRole('list', { name: 'Neighbours who would buy' });
  expect(await buyers.allTextContents()).toEqual(before);
  await comparison.getByRole('button', { name: /^Return to / }).click();
});

test('the first template sale keeps focus on a visible buyer action', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'panel-1' };
  await page.goto('/#play=main-street:panel-1');
  const comparison = await openComparison(page, true);
  await comparison.getByRole('button', { name: 'Put Launchlet on the window', exact: true }).click();
  await expect(comparison).not.toBeVisible();
  await expect(page.locator('[data-customer-heading]')).toBeFocused();
  const kofi = await selectCustomer(page, 'd0-r2');
  const ticket = kofi;
  const take = ticket.getByRole('button', { name: 'Take at 300 cr', exact: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  const native = replay(config, saved);
  expect(native.errors).toEqual([]);
  const risky = !fits(forecast(native.state, 'd0-r2', { counter: true }));
  await take.click();
  if (risky) {
    const confirm = ticket.getByRole('button', { name: /^Yes, take at 300 cr/ });
    await expect(confirm).toBeFocused();
    await confirm.click();
  }
  await expect(page.locator('.reply-receipt')).toBeFocused();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  expect(after).toEqual([...saved, { type: 'accept', requestId: 'd0-r2', counter: true }]);
});

test('maker consequences stay beside the action and focus clears the day controls', async ({ page }, info) => {
  await page.goto('/#play=main-street:first-season');
  await selectCustomer(page, 'd0-r2');
  await expect(page.locator('[data-customer-heading]')).toHaveText('Finn');
  const choices = page.getByRole('group', { name: /^Who makes .*launch$/ }).first();
  await expect(choices).toBeVisible();
  await expect(choices).toContainText(/\d+% without redo/);
  await choices.getByRole('button', { name: 'Ada makes it', exact: true }).scrollIntoViewIfNeeded();
  const button = await choices.getByRole('button', { name: 'Ada makes it', exact: true }).boundingBox();
  const bar = await page.locator('.actionbar-row').boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(bar!.y);
  expect(bar!.height).toBeLessThanOrEqual(80);
  await page.screenshot({ path: `scratch/decisions-${info.project.name}.png` });
  await choices.getByRole('button', { name: 'Ada makes it', exact: true }).click();
  const ticket = page.locator('.focused-decision .ticket');
  const requestId = (await ticket.getAttribute('id'))!.replace('ticket-', '');
  const commandsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  const take = ticket.getByRole('button', { name: 'Take with Ada', exact: true });
  await expect(take).toBeVisible();
  await take.click();
  await expect(page.locator('.reply-receipt')).toBeFocused();
  const commandsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  expect(commandsAfter).toEqual([...commandsBefore, { type: 'accept', requestId, maker: 'h1' }]);
  await page.locator('.reply-receipt').getByRole('button', { name: /^Next customer/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commandsAfter);
  const comparison = await openComparison(page, true);
  await expect(comparison.locator('#outlook')).toContainText('if no redos or changes');
});

test('the offer price explains running costs and updates with the draft', async ({ page }) => {
  await page.goto('/#play=main-street:offer-price');
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: /^Redesign/ }).first().click();
  const workshop = page.getByRole('dialog', { name: 'Offer workshop' });
  const money = workshop.locator('.offer-money');
  await expect(money).toContainText('cover a day');
  await workshop.getByLabel('Price for the whole offer', { exact: true }).fill('100');
  await expect(money).toContainText('Below the break-even rate');
  await workshop.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(workshop).toHaveCount(0);
});

test('below-coverage pricing does not claim a loss on each extra sale', async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'panel-1' };
  const commands: Command[] = [340, 390].map(price => ({
    type: 'setMenu', offers: [PRESETS.bespoke, { ...PRESETS.launchlet, price }],
  }));
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  const repriced = applyCommand(state, { type: 'setMenu', offers: [PRESETS.bespoke, { ...PRESETS.launchlet, price: 300 }] });
  expect(repriced.error).toBeUndefined();
  const results = (['accept', 'decline'] as const).map(type => {
    const sale = applyCommand(repriced.state, { type, requestId: 'd0-r2' });
    expect(sale.error).toBeUndefined();
    const evening = applyCommand(sale.state, { type: 'runDay' });
    expect(evening.error).toBeUndefined();
    return summarize(evening.state);
  });
  expect(results.map(s => s.operatingResult)).toEqual([-620, -920]);
  expect(results.map(s => s.served)).toEqual([1, 0]);
  await openSaved(page, config, commands, 'Hourly coverage');
  const comparison = await openComparison(page, true);
  const warning = comparison.locator('.walkers > p').filter({ hasText: "per hour of people's time" });
  await expect(warning).toContainText('65 cr');
  await expect(warning).toContainText('75 cr');
  await expect(warning).toContainText('below the average hourly running cost');
  await expect(warning).not.toContainText('each sale would lose money');
  await warning.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `scratch/hourly-coverage-${info.project.name}.png` });
});

test('a tight multi-launch fit states redo risk without a whole-order probability', async ({ page }, info) => {
  const config = { scenarioId: 'main-street', seed: 'panel-1' };
  const offer = { name: 'Two simple launches', launches: 2, spacingDays: 2, turnaroundDays: 1, scope: 'simple' as const, style: 'custom' as const, price: 100 };
  const commands: Command[] = [{ type: 'setMenu', offers: [offer] }];
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  const request = state.requests.find(r => r.id === 'd0-r0')!;
  expect(request.castId).toBe('mara');
  await openSaved(page, config, commands, 'Redo risk');
  const ticket = await selectCustomer(page, 'd0-r0');
  await expect(ticket.locator('.fit')).toHaveText('Fits, with redo risk.');
  await expect(ticket.locator('.ticket-small > .risk')).toHaveText('Redos could make this or other work late, or leave it unfinished at closing.');
  await ticket.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../guidance-truth/redo-risk-${info.project.name}.png` });
  const take = ticket.getByRole('button', { name: /^Take it/ });
  await take.click();
  const confirm = ticket.getByRole('button', { name: /^Yes, take it/ });
  if (await confirm.count()) await confirm.click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'forecast-truth'));
  expect(saved.commands).toEqual([...commands, { type: 'accept', requestId: 'd0-r0' }]);
  const accepted = replay(config, saved.commands, LEGACY_RULES_VERSION);
  expect(accepted.errors).toEqual([]);
  expect(accepted.state.requests.find(r => r.id === 'd0-r0')?.status).toBe('accepted');
});

test('the late group excludes buyers who fit with an available named maker', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'batch-check-m-2' };
  const commands = runPolicy(config, GHOSTS.hand, undefined, LEGACY_RULES_VERSION).commands.slice(0, 98);
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  expect(takeableInTurn(state)).toEqual([]);
  for (const id of ['d8-r5', 'd8-r9']) {
    const request = state.requests.find((r) => r.id === id)!;
    expect(fits(forecast(state, id))).toBe(false);
    expect(makerChoices(state, request)?.find((m) => m.name === 'Tomas')?.fits).toBe(true);
  }
  const save = { v: 1, rules: LEGACY_RULES_VERSION, id: 'queue-maker-fit', label: 'Queue maker fit', savedAt: new Date().toISOString(), config, commands };
  await page.goto('/');
  await page.evaluate((save) => {
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Queue maker fit', exact: true }).click();
  const comparison = await openComparison(page, true);
  const buyers = comparison.getByRole('list', { name: 'Neighbours who would buy', exact: true });
  const raviRow = buyers.locator('[data-request-id="d8-r5"]');
  const eliRow = buyers.locator('[data-request-id="d8-r9"]');
  await expect(raviRow).toBeVisible();
  await expect(eliRow).toBeVisible();
  const late = comparison.locator('.late-fold');
  await expect(late.locator('summary')).toContainText('3 do not fit as things stand');
  await expect(late.locator('.roster-row')).toHaveCount(3);
  await expect(late.locator('[data-request-id="d8-r6"]')).toHaveCount(1);
  await expect(late.locator('[data-request-id="d8-r5"], [data-request-id="d8-r9"]')).toHaveCount(0);
  await expect(comparison.locator('.hours-budget')).toContainText('0 of the 5 buyers in queue order');
  await expect(comparison.locator('.hours-budget')).toContainText('Ravi and Eli each fit with a maker choice below');
  await expect(page.getByRole('button', { name: /^Take everyone who fits/ })).toHaveCount(0);
  await expect(raviRow).toContainText('Bespoke Launch · 900 cr · due Day 11');
  await comparison.getByRole('button', { name: /^Return to / }).click();
  const ravi = await selectCustomer(page, 'd8-r5');
  await expect(ravi.locator('.verdict-buy')).toContainText('due Day 11');
  await expect(ravi.locator('.fit, .risk')).toHaveCount(0);
  await expect(ravi).not.toContainText('Work:');
  await expect(ravi.locator('.decision-plan, .dayplan')).toHaveCount(0);
  await ravi.getByRole('button', { name: 'Tomas makes it', exact: true }).click();
  await ravi.getByRole('button', { name: 'Take with Tomas', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'queue-maker-fit'));
  expect(saved.commands).toEqual([...commands, { type: 'accept', requestId: 'd8-r5', maker: 'h2' }]);
  const receipt = page.locator('.reply-receipt');
  await expect(receipt).toContainText('Sold:');
  await expect(receipt).toBeFocused();
  await receipt.getByRole('button', { name: /^Next customer/ }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!).find((s: { id: string }) => s.id === 'queue-maker-fit'))).commands).toEqual(saved.commands);
  const eli = await selectCustomer(page, 'd8-r9');
  await expect(eli.getByRole('button', { name: 'Tomas makes it', exact: true })).toHaveCount(0);
});

test('showing an ordinary buyer keeps free hours at the native baseline', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'batch-check-m-0' };
  const commands = runPolicy(config, GHOSTS.hand, undefined, LEGACY_RULES_VERSION).commands.slice(0, 37);
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  expect(forecast(state).atRisk).toEqual([]);
  expect(forecast(state, 'd3-r4').atRisk).toEqual(['c12-l1']);
  await openSaved(page, config, commands, 'Forecast baseline');
  let comparison = await openComparison(page, true);
  const free = comparison.locator('.queue-head .dayplan-free');
  const baseline = (await free.innerText()).split('With ')[0]!.trim();
  expect(baseline).toContain('Ada none');
  await comparison.getByRole('button', { name: /^Return to / }).click();
  const ticket = await selectCustomer(page, 'd3-r4');
  await expect(ticket.locator('.fit')).toHaveText('Makes an existing promise late.');
  await expect(ticket.locator('.risk').first()).toContainText('Taking this would make');
  const plan = ticket.locator('.decision-plan');
  await plan.locator(':scope > summary').click();
  const selectedPlan = plan.locator('.dayplan-free');
  await expect(selectedPlan).toContainText('With ');
  expect((await selectedPlan.innerText()).split('With ')[0]!.trim()).toBe(baseline);
  const commandsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);
  await plan.locator(':scope > summary').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commandsBefore);
  comparison = await openComparison(page, true);
  expect((await comparison.locator('.queue-head .dayplan-free').innerText()).trim()).toBe(baseline);
});

test('existing missed promises are not attributed to a new buyer with no additional misses', async ({ page }) => {
  const config = { scenarioId: 'main-street', seed: 'batch-check-m-0' };
  const accept = (requestId: string): Command => ({ type: 'accept', requestId });
  const decline = (requestId: string): Command => ({ type: 'decline', requestId });
  // Retained All/BL/invest/cheapest opening, then the ordinary hand-made continuation, prefix 60.
  const commands: Command[] = [
    { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] },
    { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }, { type: 'hire' }, { type: 'buy', item: 'library' },
    ...['d0-r0', 'd0-r2', 'd0-r3', 'd0-r4', 'd0-r1'].map(accept), { type: 'runDay', calls: true },
    ...['d1-r0', 'd1-r1', 'd1-r2', 'd1-r3', 'd1-r5', 'd1-r6'].map(accept), decline('d1-r7'), decline('d1-r4'),
    { type: 'runDay', calls: true }, { type: 'choose', newsId: 'n2', option: 1 },
    ...['d2-r0', 'd2-r1', 'd2-r4', 'd2-r5', 'd2-r6', 'd2-r8', 'd2-r9'].map(accept),
    ...['d2-r2', 'd2-r3', 'd2-r7'].map(decline), { type: 'runDay', calls: true }, { type: 'answer', option: 'late' },
    { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } }, { type: 'choose', newsId: 'n3', option: 2 },
    ...['d3-r0', 'd3-r1', 'd3-r2', 'd3-r3'].map(accept), decline('d3-r4'), accept('d3-r5'),
    ...['d3-r6', 'd3-r7', 'd3-r8'].map(decline), { type: 'runDay', calls: true }, { type: 'answer', option: 'cut' },
    { type: 'choose', newsId: 'n4', option: 1 }, accept('d4-r0'), { type: 'overtime' }, accept('d4-r1'), accept('d4-r2'),
    ...['d4-r3', 'd4-r4', 'd4-r5', 'd4-r6', 'd4-r7', 'd4-r8', 'd4-r9'].map(decline),
    accept('d4-r10'), accept('d4-n'), { type: 'runDay', calls: true },
  ];
  const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
  expect(errors).toEqual([]);
  const baseline = forecast(state);
  const after = forecast(state, 'd5-r9');
  expect(baseline.atRisk).toEqual(['c27-l1', 'c28-l1']);
  expect(after).toEqual({ atRisk: baseline.atRisk, newAtRisk: [], newAfterSeason: [], existingAfterSeason: [] });
  expect(fits(after)).toBe(false);
  expect(forecast(state, 'd5-r0').newAtRisk).toEqual(['c29-l1']);
  await openSaved(page, config, commands, 'Existing misses');
  const native = structuredClone(state);
  for (const j of native.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
  simulateDay(native, { forecast: true });
  const inToday = native.resources.filter((r) => r.kind === 'human' && r.shiftMinutes > (state.resources.find((s) => s.id === r.id)?.shiftMinutes ?? 0)).map((r) => r.name);
  expect(inToday).toEqual(['Ada', 'Noor', 'Remi']);
  const comparison = await openComparison(page, true);
  await expect(comparison.locator('.dayplan-name')).toHaveText(inToday);
  await expect(comparison.locator('.queue-head')).toContainText('Already late without taking anyone else, even without redos or changes:');
  const redoText = (await comparison.locator('.exposure').filter({ hasText: 'Riding on no redo:' }).allTextContents()).join(' ');
  for (const id of baseline.atRisk) {
    const name = castName(state.jobs.find((j) => j.id === id)!.castId);
    expect(redoText).not.toContain(name);
  }
  const late = comparison.locator('.late-fold');
  await expect(late.locator('summary')).toContainText('do not fit as things stand');
  if (await late.getAttribute('open') === null) await late.locator('summary').click();
  await comparison.getByRole('button', { name: /^Return to / }).click();
  const yara = await selectCustomer(page, 'd5-r9');
  await expect(yara.locator('.fit')).toHaveText('Existing promises already late.');
  await expect(yara).toContainText('No additional misses if no redos or changes.');
  await expect(yara).toContainText('Already late without this order:');
  await expect(yara).not.toContainText('Taking this would make');
  await expect(yara).not.toContainText('Fits, but');
  await expect(yara).not.toContainText('Work:');
  const ownLate = await selectCustomer(page, 'd5-r0');
  await expect(ownLate.locator('.fit')).toHaveText('Late.');
  await expect(ownLate).toContainText('This order would be late, even without redos or changes.');
  await expect(ownLate).toContainText('Already late without this order:');
});

for (const completed of [true, false]) {
  test(`a selected finish at the shift boundary ${completed ? 'is delivered only with native completion' : 'still carries when unfinished'}`, async ({ page }) => {
    const config = { scenarioId: 'main-street', seed: 'batch-check-m-0' };
    const commands: Command[] = [
      ...runPolicy(config, GHOSTS.hand, undefined, LEGACY_RULES_VERSION).commands.slice(0, 32),
      { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }, { type: 'choose', newsId: 'n3', option: 2 },
      ...['d3-r0', 'd3-r1', 'd3-r2', 'd3-r4', 'd3-r6', ...(!completed ? ['d3-r7'] : [])].map((requestId): Command => ({ type: 'accept', requestId })),
    ];
    const { state, errors } = replay(config, commands, LEGACY_RULES_VERSION);
    expect(errors).toEqual([]);
    const command = { type: 'accept' as const, requestId: 'd3-r3' };
    const accepted = applyCommand(state, command);
    expect(accepted.error).toBeUndefined();
    const jobId = accepted.state.contracts.at(-1)!.jobIds[0]!;
    const native = structuredClone(accepted.state);
    for (const j of native.jobs) if (j.stage !== 'rework') j.reworkFlag = false;
    simulateDay(native, { forecast: true });
    const done = native.events.slice(accepted.state.events.length).find((e) => e.jobId === jobId && e.type === 'task_done' && e.stage === 'finish');
    expect(done !== undefined).toBe(completed);
    if (completed) expect(done!.minute).toBe(1800);
    else expect(native.jobs.find((j) => j.id === jobId)).toMatchObject({ stage: 'finish', remaining: 15, assignee: 'h1', deliveredAt: null });
    expect(dayPlan(state, command.requestId)!.blocks.find((b) => b.jobId === jobId && b.stage === 'finish')).toMatchObject({ resourceId: 'h1', to: 360, completed });
    await openSaved(page, config, commands, completed ? 'Completed at closing' : 'Unfinished at closing');
    const ticket = await selectCustomer(page, 'd3-r3');
    const plan = ticket.locator('.decision-plan');
    await plan.locator(':scope > summary').click();
    const summary = plan.locator('.dayplan-free');
    if (completed) {
      await expect(summary).toContainText('Out at 3:00pm.');
      await expect(summary).not.toContainText('Not finished today');
    } else {
      await expect(summary).toContainText('Not finished today: it carries on tomorrow.');
      await expect(summary).not.toContainText('Out at');
    }
  });
}
