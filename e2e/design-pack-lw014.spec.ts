import { expect, test, type Page } from '@playwright/test';
import { replay } from '../src/engine/sim';
import { firstOrderMorning } from '../src/ui/game/firstOrder';
import { encodeShare } from '../src/ui/persist';
import { openDayTwo } from './day-two-helpers';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { selectCustomer, takeFocused } from './workspace-helpers';

test.use({ reducedMotion: 'no-preference', serviceWorkers: 'block' });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'viewport is set per case'));

async function expectYaraInTheRoster(page: Page) {
  await page.getByRole('button', { name: /^See all \d+ neighbours$/ }).press('Enter');
  await expect(page.getByRole('dialog').getByText('Yara', { exact: true })).toBeVisible();
}

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`the musicians edition keeps an actual next-morning order on ${viewport}`, async ({ page }, info) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await page.addInitScript(() => {
      localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'illustrated', motion: 'reduce', sound: false }));
    });
    const press = (name: string) => page.getByRole('button', { name, exact: true }).press('Enter');
    await page.goto('/?opening=first-order');
    await press('Meet Clem at the jazz bar');
    await expect(page.getByText(/holds her order for the next morning/)).toHaveCount(0);
    await press('Book for 900 cr');
    await press('Run the press');
    await press('Lift Clem’s print');
    await press('Hang it in Clem’s window');
    await press('Compare the other edition');

    const compare = page.locator('.first-order-comparison');
    await expect(compare.getByRole('heading')).toBeFocused();
    const room = compare.locator('figure').filter({ hasText: 'The room' }).first();
    const band = compare.locator('figure').filter({ hasText: 'The musicians' }).first();
    await expect(room.getByText('Yara left without booking.', { exact: true })).toBeVisible();
    await expect(band.getByText('Yara holds her order for the next morning.', { exact: true })).toBeVisible();
    await expect(compare.getByText('Finn and Sam left without booking either way.', { exact: true })).toBeVisible();
    await expect(compare.getByText('Same takings either way.', { exact: true })).toBeVisible();
    await compare.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await shot(page, 'LW-014', `LW-014-${viewport}-compare`);
    await axe(page, '.first-order');
    if (viewport === 'iphone') {
      const frames = await frameDeltas(page, async () => undefined, 1000);
      await info.attach('edition-consequence-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Hang the other edition', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Hung at 1:48pm', { exact: true })).toBeVisible();
    await expect(page.getByText('Yara holds her order for the next morning.', { exact: true })).toBeVisible();
    await press('Open the next morning');
    await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
    await expectYaraInTheRoster(page);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]);
    expect(save).toMatchObject({
      rules: 'lantern-7.2.0',
      config: { opening: 'clem-first-order' },
      commands: [expect.objectContaining({ type: 'accept', intention: 'clem-band' }), { type: 'runDay' }],
    });
    await page.reload();
    await press('Continue the season');
    await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
    await expectYaraInTheRoster(page);
  });
}

test('planning the rest of the morning leaves Yara available and names only two fitting walkouts', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.goto('/?opening=first-order');
  await page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true }).press('Enter');
  await page.getByRole('radio', { name: /^The musicians/ }).check();
  await page.getByRole('button', { name: 'Book for 900 cr', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Plan the rest of the morning', exact: true }).press('Enter');
  await expect(page).toHaveTitle('Day 1 of 12, Main Street - Lantern Works');
  await expect(page.getByRole('region', { name: 'Day controls' })
    .getByRole('button', { name: /turning away 2 buyers who fit/ })).toBeVisible();
  await expectYaraInTheRoster(page);
});

test('the room edition keeps the original six-neighbour queue', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDayTwo(page, 'room');
  await expect(page.locator('.window-bridge')).toHaveText('6 neighbours are waiting. One more job fits today.');
  const roster = page.getByRole('list', { name: 'Customer roster', includeHidden: true });
  await expect(roster.locator('strong')).toHaveText(['Mara', 'Amara', 'Yusuf', 'Tobias', 'Ines', 'Kofi']);
});

test('a marked challenge preserves the musicians’ consequence at the counter', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { config, rulesVersion } = firstOrderMorning;
  const start = await encodeShare(config, [], 'Clem’s first order', rulesVersion);
  await page.goto(`/#start=${start}`);
  await expect(page).toHaveTitle('Day 1 of 12, Main Street - Lantern Works');
  await page.locator('.first-proof').getByRole('button', { name: 'Put the musicians first', exact: true }).click();
  const clem = firstOrderMorning.requests.find(request => request.castId === 'clem')!;
  await selectCustomer(page, clem.id);
  await takeFocused(page);
  await page.getByRole('button', { name: /Open the shop for Day 1/ }).click();
  await page.locator('.evening').waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]);
  expect(saved).toMatchObject({ config, rules: rulesVersion });
  expect(saved.commands).toEqual([expect.objectContaining({ type: 'accept', intention: 'clem-band' }), { type: 'runDay', calls: true }]);
  const played = replay(saved.config, saved.commands, saved.rules);
  expect(played.errors).toEqual([]);
  expect(played.state.requests.find(request => request.castId === 'yara' && request.day === 1)?.status).toBe('waiting');
  const history = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  await page.goto(`/#s=${await encodeShare(saved.config, saved.commands, 'Clem', saved.rules)}`);
  await expect(page.getByRole('button', { name: 'Save a copy and continue', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(history);
});
