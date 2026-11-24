import { expect, test } from '@playwright/test';
import { axe } from './design-pack-helpers';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('the promise and proof survive a reload and the other edition replays from the same morning', async ({ page }, info) => {
  const phone = info.project.name.endsWith('phone');
  const miniature = info.project.name === 'desktop';
  if (phone) await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(studioView => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView, motion: 'reduce', sound: false }));
  }, miniature ? 'miniature' : 'illustrated');
  const press = (name: string) => page.getByRole('button', { name, exact: true }).press('Enter');
  const printAndOpen = async () => {
    if (miniature) {
      const world = page.locator('.first-order-world');
      await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
      await expect(world).toHaveAttribute('data-fallback', 'false');
    }
    await press('Run the press');
    await press('Lift Clem’s print');
    await press('Hang it in Clem’s window');
    await press('Open the next morning');
  };
  const keptHeading = phone ? 'Yara is back' : 'Yara’s place is empty';
  const brokenHeading = phone ? 'Yara’s place is empty' : 'Yara is back';
  const promiseName = phone ? /keep a place for your order/ : /put the room on the poster/;
  const carriedProof = page.locator('.first-order-morning-print > .designed-artwork__print');

  await page.goto('/?opening=first-order');
  await press('Meet Clem at the jazz bar');
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('lantern.first-order.v1') ?? '{}').step)).toBe('design');
  const ordinaryDraft = await page.evaluate(() => sessionStorage.getItem('lantern.first-order.v1'));
  await page.goto('/');
  await page.getByRole('link', { name: 'Play Two Mornings on Main Street' }).click();
  await expect(page).toHaveURL(/opening=promise$/);
  await expect(page.getByText(/before tonight’s first set/)).toBeVisible();
  await press('Meet Clem at the jazz bar');
  await expect(page.getByRole('button', { name: 'Book for 900 cr' })).toBeDisabled();
  await expect(page.getByText(/^Promised by Day/)).toHaveCount(0);
  await expect(page.getByText(/My sister kept the very first ticket/)).toBeVisible();
  await page.getByText('Say it in your own words', { exact: true }).click();
  const words = page.getByRole('textbox', { name: 'What would you say?' });
  await words.fill('If I finish this, I’ll save a place for Yara tomorrow.');
  await press('Read my promise');
  await expect(page.getByText(/couldn’t pick out one clear promise/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm this promise' })).toHaveCount(0);
  const line = phone ? 'I’ll reserve tomorrow’s last slot for Yara.' : 'I’ll show Clem’s old room on tonight’s print.';
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url() + (request.postData() ?? '')));
  await words.fill(line);
  await press('Read my promise');
  await expect(page.getByText('Do you mean', { exact: false })).toBeVisible();
  await expect(page.getByRole('radio', { name: promiseName })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Book for 900 cr' })).toBeDisabled();
  await press('Confirm this promise');
  await expect(page.getByRole('radio', { name: promiseName })).toBeChecked();
  if (!phone) await page.getByRole('radio', { name: /The musicians/ }).check();
  await page.getByText('Add a headline', { exact: true }).click();
  await page.getByRole('textbox', { name: 'A line of your own' }).fill('Before the first set');
  await page.getByRole('button', { name: 'Poppy & cream' }).click();
  await axe(page, '.first-order');
  await page.screenshot({ path: info.outputPath('promise-before-booking.png') });
  await press('Book for 900 cr');
  expect(await page.evaluate(() => sessionStorage.getItem('lantern.first-order-promise.v1'))).not.toContain('I’ll');
  await page.reload();
  await expect(page.getByText(promiseName)).toBeVisible();
  await printAndOpen();
  await expect(page.getByRole('heading', { name: brokenHeading })).toBeFocused();
  await expect(page.getByText('You broke your promise.')).toBeVisible();
  await expect(carriedProof).toHaveAccessibleName(/Before the first set/);
  await axe(page, '.first-order');
  await page.screenshot({ path: info.outputPath('promise-broken.png') });

  await page.reload();
  await expect(page.getByRole('heading', { name: brokenHeading })).toBeVisible();
  await press('Replay the other edition');
  await expect(page.getByRole('heading', { name: 'Ready for the press' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: phone ? 'Replaying: The musicians' : 'Replaying: The room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change the proof' })).toHaveCount(0);
  await expect(page.getByText(promiseName)).toBeVisible();
  await printAndOpen();
  await expect(page.getByRole('heading', { name: keptHeading })).toBeFocused();
  await expect(page.getByText('You kept your promise.')).toBeVisible();
  await expect(page.getByText(phone ? /the shy one wanted an encore/ : /ticket against the print/)).toBeVisible();
  await expect(carriedProof).toHaveAccessibleName(/Before the first set/);
  await expect(carriedProof).toHaveAttribute('data-palette', 'poppy');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('lantern.first-order.v1'))).toBe(ordinaryDraft);
  await axe(page, '.first-order');
  await page.screenshot({ path: info.outputPath('promise-kept.png') });

  await press('Continue into the studio');
  await expect(page).toHaveTitle('Day 2 of 12, Main Street - Lantern Works');
  await expect(page).toHaveURL(url => !url.searchParams.has('opening'));
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]);
  expect(requests.every(request => !request.includes(line) && !request.includes(encodeURIComponent(line)))).toBe(true);
  expect(save).toMatchObject({
    label: 'A promise: Main Street', rules: 'lantern-7.2.0', config: { opening: 'clem-first-order' },
    commands: [expect.objectContaining({ type: 'accept', intention: phone ? 'clem-band' : 'clem-room' }), { type: 'runDay' }],
  });
});
