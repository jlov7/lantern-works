import { expect, test, type Page } from '@playwright/test';
import { ordinaryBrief } from '../src/engine/ordinary';
import { RULES } from '../src/engine/rules';
import { reactionTo } from '../src/engine/selectors';
import { applyCommand, createRun, replay, reservationBlocked } from '../src/engine/sim';
import type { Command, CompanyState } from '../src/engine/types';
import { goPlace, openComparison, selectCustomer, takeFocused } from './workspace-helpers';

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0] as { config: { scenarioId: string; seed: string }; rules: string; commands: Command[] });

async function editPrint(page: Page, line: string) {
  const proof = page.locator('.first-proof');
  await proof.getByRole('button', { name: 'Put the musicians first', exact: true }).click();
  await proof.getByRole('button', { name: 'River green', exact: true }).click();
  await proof.locator('summary').click();
  await proof.getByRole('textbox').fill(line);
}

test('bulk acceptance preserves a print edited before answering another customer', async ({ page }) => {
  await page.goto('/#play=main-street:first-season');
  await editPrint(page, 'A room for the last set');
  await selectCustomer(page, 'd0-r4');
  await takeFocused(page);
  const comparison = await openComparison(page);
  await comparison.getByRole('button', { name: /^Take everyone who fits/ }).click();
  const run = await saved(page);
  const result = replay(run.config, run.commands, run.rules);
  expect(result.errors).toEqual([]);
  expect(result.state.contracts.find(contract => contract.requestId === 'd0-r0')).toMatchObject({ intention: 'clem-band', proof: { design: { pieces: [{ palette: 'river', headline: 'A room for the last set' }] } } });
});

test('a named-price order shows and accepts the same edited print', async ({ page }) => {
  await page.goto('/#play=main-street:first-season');
  await editPrint(page, 'The door stays open');
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Redesign Bespoke Launch' }).click();
  const workshop = page.getByRole('dialog', { name: 'Offer workshop' });
  await workshop.getByLabel('Price for the whole offer').fill('1000');
  await workshop.getByRole('button', { name: 'Put on the window' }).click();
  await goPlace(page, 'Window');
  await expect(page.locator('.first-proof svg[data-palette]')).toHaveAttribute('data-palette', 'river');
  await expect(page.locator('.atelier-artwork svg[data-palette]')).toHaveAttribute('data-palette', 'river');
  await page.getByRole('button', { name: 'Take at 950 cr', exact: true }).click();
  const run = await saved(page);
  expect(run.commands.at(-1)).toMatchObject({ type: 'accept', counter: true, intention: 'clem-band', design: { pieces: [{ headline: 'The door stays open' }] } });
  expect(replay(run.config, run.commands, run.rules).errors).toEqual([]);
  await expect(page.locator('.atelier-artwork svg[data-palette]')).toHaveAttribute('data-palette', 'river');
});

test('reserving a returning neighbour freezes the edited print and Undo restores it', async ({ page }) => {
  let state = createRun({ scenarioId: 'main-street', seed: 'creative-promises' });
  const step = (command: Command) => { const result = applyCommand(state, command); expect(result.error).toBeUndefined(); state = result.state; };
  const request = state.requests.find(request => request.castId === 'clem')!;
  const reaction = reactionTo(state, request);
  if (reaction.kind !== 'buy') throw new Error('Clem must buy the fixture offer.');
  step({ type: 'accept', requestId: request.id, design: ordinaryBrief(request, reaction.offer)!.defaultDesign });
  while (state.day < 6) {
    for (const request of state.requests.filter(request => request.day === state.day && request.status === 'waiting')) step({ type: 'decline', requestId: request.id });
    step({ type: 'runDay' });
  }
  expect(reservationBlocked(state, 'd6-r4', 1)).toBeNull();
  await load(page, state);
  await selectCustomer(page, 'd6-r4');
  await editPrint(page, 'Thursday belongs to the band');
  await page.locator('.studio-slot > summary').click();
  await page.getByRole('button', { name: 'Reserve studio capacity for Day 8', exact: true }).click();
  let run = await saved(page);
  expect(run.commands.at(-1)).toMatchObject({ type: 'reserve', requestId: 'd6-r4', intention: 'clem-band', design: { pieces: [{ palette: 'river', headline: 'Thursday belongs to the band' }] } });
  const accepted = replay(run.config, run.commands, run.rules);
  expect(accepted.errors).toEqual([]);
  const proof = accepted.state.contracts.at(-1)!.proof;
  await page.getByRole('button', { name: 'Undo reply', exact: true }).click();
  await expect(page.locator('.first-proof input')).toHaveValue('Thursday belongs to the band');
  await page.locator('.studio-slot > summary').click();
  await page.getByRole('button', { name: 'Reserve studio capacity for Day 8', exact: true }).click();
  run = await saved(page);
  expect(replay(run.config, run.commands, run.rules).state.contracts.at(-1)!.proof).toEqual(proof);
});

async function load(page: Page, state: CompanyState) {
  await page.goto('/');
  await page.evaluate(save => { localStorage.setItem('lantern.guide.v1', 'seen'); localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season'])); localStorage.setItem('lantern.runs.v1', JSON.stringify([save])); }, { v: 1, rules: RULES.version, id: 'creative-intake', label: 'Creative intake', savedAt: new Date().toISOString(), config: state.config, commands: state.commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Creative intake', exact: true }).click();
}
