import { expect, test } from '@playwright/test';
import frozen from '../src/engine/fixtures/legacy-5.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import { reactionTo, windowRequests, workFor } from '../src/engine/selectors';
import type { Command } from '../src/engine/types';
import { credits, dayLabel } from '../src/ui/format';

const tape = frozen.tapes.find(tape => tape.id === 'native/main-busy-courtyard')!;
const commands = tape.commands.slice(0, 62) as Command[];
const state = replay(tape.config, commands, frozen.rules).state;
const save = { v: 1, id: 'late-planning', label: 'Late planning', savedAt: '2026-10-26T00:00:00Z', rules: frozen.rules, config: tape.config, commands };

test('late-season roster uses the matching worker plan and comparison does no main-thread dry runs', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const planning = { held: false, release: [] as (() => void)[] };
    Object.assign(window, { planningCheck: planning });
    window.Worker = class extends Original {
      override postMessage(message: unknown) {
        if ('selected' in (message as object)) {
          if (planning.held) planning.release.push(() => super.postMessage(message));
          else setTimeout(() => super.postMessage(message), 400);
        }
        else super.postMessage(message);
      }
    };
    const clone = window.structuredClone.bind(window);
    Object.assign(window, { mainClones: 0 });
    window.structuredClone = (...args) => {
      (window as unknown as { mainClones: number }).mainClones++;
      return clone(...args);
    };
  });
  await page.goto('/');
  await page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('lantern.runs.v1', JSON.stringify([save]));
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
  }, save);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Late planning', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Checking the studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Compare \/ All neighbours/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Day controls' }).locator('.btn-open')).toBeDisabled();
  const compare = page.getByRole('button', { name: /^Compare \/ All neighbours/ });
  await expect(compare).toBeVisible();
  const buyer = windowRequests(state).find(request => request.status === 'waiting' && reactionTo(state, request).kind === 'buy')!;
  const reaction = reactionTo(state, buyer);
  if (reaction.kind !== 'buy') throw new Error('Fixture buyer changed');
  const work = workFor(state, buyer.id)!;
  const expected = `${reaction.offer.name} · ${credits(reaction.price)} · due ${work.firstDue === state.day ? 'tonight' : dayLabel(work.firstDue)}`;
  await expect(page.locator(`.roster-peek [data-request-id="${buyer.id}"]`)).toContainText(expected);
  await page.evaluate(() => { (window as unknown as { mainClones: number }).mainClones = 0; });
  await compare.click();
  const dialog = page.getByRole('dialog', { name: 'Compare all neighbours' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(`[data-request-id="${buyer.id}"]`)).toContainText(expected);
  expect(await page.evaluate(() => (window as unknown as { mainClones: number }).mainClones)).toBe(0);
  await dialog.locator('[data-request-id]:not([aria-current="true"])').first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Checking the studio' })).toBeVisible();
  await expect(compare).toHaveCount(0);
  await expect(compare).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual(commands);
  await compare.click();
  await dialog.locator('.compare-options > summary').click();
  await page.evaluate(() => { (window as unknown as { planningCheck: { held: boolean } }).planningCheck.held = true; });
  await dialog.getByRole('radio', { name: 'Careful', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Compare all neighbours' })).toBeFocused();
  await expect(dialog.getByRole('status')).toContainText('Checking the studio');
  await expect(dialog.locator('[data-request-id]')).toHaveCount(0);
  await page.evaluate(() => {
    const check = (window as unknown as { planningCheck: { held: boolean; release: (() => void)[] } }).planningCheck;
    check.held = false;
    for (const release of check.release.splice(0)) release();
  });
  await expect(dialog.getByRole('radio', { name: 'Careful', exact: true })).toBeChecked();
  await expect(dialog.locator('.compare-options')).toHaveAttribute('open');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual([...commands, { type: 'pace', pace: 'careful' }]);
});


test('editing a proof keeps keyboard focus while approval waits for its matching plan', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const planning = { held: false, release: [] as (() => void)[] };
    Object.assign(window, { proofPlanningCheck: planning });
    window.Worker = class extends Original {
      override postMessage(message: unknown) {
        if ('selected' in (message as object) && planning.held) planning.release.push(() => super.postMessage(message));
        else super.postMessage(message);
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true }).click();
  const first = page.locator('.first-proof');
  await first.locator('summary').click();
  const line = first.getByRole('textbox');
  await line.focus();
  await page.evaluate(() => { (window as unknown as { proofPlanningCheck: { held: boolean } }).proofPlanningCheck.held = true; });
  await page.keyboard.type('Stay for the last note');
  await expect(line).toHaveValue('Stay for the last note');
  await expect(line).toBeFocused();
  await expect(line).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Updating the quote' })).toBeVisible();
  const approve = page.locator('.ticket-actions .btn-take');
  await expect(approve).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Day controls' }).locator('.btn-open')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands)).toEqual([]);
  await page.evaluate(() => {
    const planning = (window as unknown as { proofPlanningCheck: { held: boolean; release: (() => void)[] } }).proofPlanningCheck;
    planning.held = false;
    for (const release of planning.release.splice(0)) release();
  });
  await expect(page.getByRole('status').filter({ hasText: 'Updating the quote' })).toHaveCount(0);
  await expect(line).toBeFocused();
  await expect(line).toHaveValue('Stay for the last note');
  await expect(approve).toBeEnabled();
  await approve.click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands.at(-1))).toMatchObject({ type: 'accept', design: { pieces: [{ headline: 'Stay for the last note' }] } });
});
