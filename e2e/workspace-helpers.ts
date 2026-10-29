import { expect, type Page } from '@playwright/test';

export async function goPlace(page: Page, place: 'Window' | 'Work' | 'Studio') {
  // The focused drawing table returns to the window before offering the wider studio navigation.
  const leaveDesk = page.getByRole('button', { name: 'Back to the window', exact: true });
  if (await leaveDesk.isVisible()) await leaveDesk.click();
  await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: place, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: place, exact: true })).toHaveAttribute('aria-current', 'page');
}

export async function selectCustomer(page: Page, requestId: string) {
  await goPlace(page, 'Window');
  const ticket = page.locator(`#ticket-${requestId}`);
  if (!(await ticket.isVisible())) {
    await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
    await page.getByRole('dialog', { name: 'Compare all neighbours' }).locator(`[data-request-id="${requestId}"]`).click();
  }
  await expect(ticket).toBeVisible();
  return ticket;
}

export async function takeFocused(page: Page, maker?: string) {
  const ticket = page.locator('.focused-decision .ticket');
  await expect(ticket).toBeVisible();
  const choice = maker ? ticket.getByRole('button', { name: `${maker} makes it`, exact: true }) : ticket.locator('.btn-maker:enabled').first();
  if (await choice.count()) {
    await choice.click();
    await ticket.getByRole('button', { name: /^Take with / }).click();
  } else await ticket.getByRole('button', { name: /^(Take it|Take at)/ }).click();
}

export async function reviewWindow(page: Page) {
  const review = page.getByRole('button', { name: "Review tomorrow's window", exact: true });
  if (await review.isVisible()) await review.click();
  else await goPlace(page, 'Window');
}

export async function openComparison(page: Page, options = false) {
  await reviewWindow(page);
  await page.getByRole('button', { name: /^Compare \/ All neighbours/ }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare all neighbours' });
  if (options) await comparison.locator('.compare-options > summary').click();
  return comparison;
}

/** The real comparison shortcut, with one deliberate first sale before it unlocks. */
export async function takeAllFitting(page: Page) {
  for (let reply = 0; reply < 30; reply++) {
    const comparison = await openComparison(page);
    const bulk = comparison.getByRole('button', { name: /^Take everyone who fits/ });
    if (await bulk.count()) { await bulk.click(); continue; }
    const row = comparison.locator('.roster-row').filter({ has: comparison.locator('.roster-fit', { hasText: /^Fits (on its own|with)/ }) }).first();
    if (!(await row.count())) { await comparison.getByRole('button', { name: /^Return to / }).click(); return; }
    await row.click();
    await takeFocused(page);
  }
  throw new Error('The morning did not settle after 30 replies');
}
