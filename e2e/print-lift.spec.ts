import { expect, test, type Page } from '@playwright/test';
import career from '../src/engine/fixtures/career-7.0.0.json' with { type: 'json' };
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

const opening = career.routes.find(route => route.id === 'prosperous')!.seasons[0]!;
const config = opening.config as RunConfig;
const morning = opening.commands.slice(0, 27) as Command[];
const delivered = replay(config, [...morning, { type: 'runDay', calls: true }], career.rules);
const clem = delivered.state.contracts.find(contract => contract.project?.id === 'clem-ten')!;
const design = clem.project!.proof!.design.pieces[0]!;
const copy = clem.project!.proof!.pieces[0]!.copy;
test.use({ hasTouch: true });

async function openClemEvening(page: Page, motion: 'full' | 'reduce') {
  await page.goto('/');
  await page.evaluate(({ config, commands, rules, motion }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ speed: .5, sound: false, motion }));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ v: 1, id: 'clem-reveal', label: 'Clem reveal', savedAt: '2026-11-21T12:00:00Z', rules, config, commands }]));
  }, { config, commands: morning, rules: career.rules, motion });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Clem reveal', exact: true }).click();
  await page.getByRole('button', { name: /^Open .*Day 3/ }).click();
  const skip = page.getByRole('button', { name: 'Skip to evening', exact: true });
  if (await skip.isVisible()) await skip.click();
  const call = page.getByRole('alertdialog', { name: /^A call at/ });
  if (await call.count()) await call.getByRole('button', { name: 'Leave it', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible();
  const lift = page.locator('.print-lift');
  await expect(lift).toBeVisible();
  return lift;
}

test('Clem lifts the exact approved print with a key and a drag', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const lift = await openClemEvening(page, 'full');
  const sheet = lift.locator('.print-lift__sheet');
  const approved = sheet.locator('svg[data-layout]');
  const master = await sheet.locator('symbol').getAttribute('id');
  const bands = await sheet.locator('svg.print-lift__slice').evaluateAll(nodes => nodes.map(node => {
    const svg = node as SVGSVGElement;
    return { top: svg.style.top, height: svg.getBoundingClientRect().height, crop: svg.parentElement!.getBoundingClientRect().height, artwork: svg.firstElementChild?.getAttribute('href') };
  }));
  expect(bands).toHaveLength(3);
  for (const [index, band] of bands.entries()) {
    expect(band.top).toBe(`${-index * 100}%`);
    expect(Math.abs(band.height - 3 * band.crop)).toBeLessThan(10);
    expect(band.artwork).toBe('#' + master);
  }
  await expect(approved).toHaveAttribute('data-layout', design.layout);
  await expect(approved).toHaveAttribute('data-palette', design.palette);
  for (const line of copy) await expect(approved).toContainText(line.text);
  const patternIds = await sheet.locator('pattern[id]').evaluateAll(elements => elements.map(element => element.id));
  expect(new Set(patternIds).size).toBe(patternIds.length);
  const before = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
  await lift.getByRole('button', { name: 'Lift Clem’s print', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(lift).toHaveAttribute('data-lifted', 'true');
  await expect(lift.getByRole('button', { name: 'Lay Clem’s print down', exact: true })).toHaveAccessibleDescription((await approved.getAttribute('aria-label'))!);
  await expect.poll(() => sheet.evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
  await lift.screenshot({ path: info.outputPath('lifted-desktop.png') });
  await page.keyboard.press('Space');
  await expect(lift).toHaveAttribute('data-lifted', 'false');
  const box = await sheet.boundingBox();
  await page.mouse.move(box!.x + box!.width / 3, box!.y + box!.height * .7);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 3, box!.y + box!.height * .7 + 20, { steps: 4 });
  await page.mouse.up();
  await expect(lift).toHaveAttribute('data-lifted', 'false');
  await page.mouse.move(box!.x + box!.width / 3, box!.y + box!.height * .7);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 3 + 120, box!.y + box!.height * .7, { steps: 8 });
  await expect(sheet).toHaveCSS('transition-duration', '0s');
  await page.mouse.up();
  await expect(lift).toHaveAttribute('data-lifted', 'true');
  expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(before);
  expect(errors).toEqual([]);
});

test('print remains readable at 390px with reduced motion and no WebGL', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type, ...args) {
      return ['webgl', 'webgl2', 'experimental-webgl'].includes(type) ? null : original.call(this, type, ...args);
    } as typeof original;
  });
  const lift = await openClemEvening(page, 'reduce');
  await expect(lift).toHaveAttribute('data-reduced-motion', 'true');
  await lift.getByRole('button', { name: 'Lift Clem’s print', exact: true }).click();
  await expect(lift).toHaveAttribute('data-lifted', 'true');
  await expect(lift.locator('.print-lift__sheet')).toHaveCSS('transition-duration', '0s');
  await expect(lift.locator('svg[data-layout]').first()).toHaveAttribute('data-palette', design.palette);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await lift.screenshot({ path: info.outputPath('lifted-phone-reduced.png') });
});

test('a horizontal touch pulls the paper while a vertical swipe scrolls the page', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Native touch dispatch uses the Chromium protocol.');
  await page.setViewportSize({ width: 390, height: 844 });
  const lift = await openClemEvening(page, 'full');
  await lift.scrollIntoViewIfNeeded();
  const control = lift.getByRole('button', { name: 'Lift Clem’s print', exact: true });
  await expect(control).toHaveCSS('touch-action', 'pan-y');
  const box = await lift.locator('.print-lift__sheet').boundingBox();
  const x = box!.x + box!.width / 3;
  const y = box!.y + box!.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', atX: number, atY: number) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(atX), y: Math.round(atY), id: 1 }],
  });
  await touch('touchStart', x, y);
  for (const offset of [12, 30, 60, 95, 125]) await touch('touchMove', x + offset, y);
  await touch('touchEnd', x + 125, y);
  await expect(lift).toHaveAttribute('data-lifted', 'true');
  await lift.screenshot({ path: info.outputPath('lifted-phone-touch.png') });
  await lift.getByRole('button', { name: 'Lay Clem’s print down', exact: true }).click();
  await expect(lift).toHaveAttribute('data-lifted', 'false');
  const before = await page.evaluate(() => scrollY);
  await touch('touchStart', x, y);
  for (const offset of [20, 50, 90, 140]) await touch('touchMove', x, y - offset);
  await touch('touchEnd', x, y - 140);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(lift).toHaveAttribute('data-lifted', 'false');
});

test('the flat sheet matches the complete approved artwork', async ({ page }) => {
  const lift = await openClemEvening(page, 'reduce');
  const sheet = lift.locator('.print-lift__sheet');
  await page.evaluate(() => document.fonts.ready);
  await sheet.evaluate(element => { element.style.transform = 'none'; });
  const actual = await sheet.screenshot();
  await sheet.evaluate(element => {
    const reference = element.querySelector('symbol svg')!.cloneNode(true) as SVGSVGElement;
    Object.assign(reference.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    element.querySelectorAll<SVGElement>('.print-lift__slice').forEach(slice => { slice.style.visibility = 'hidden'; });
    element.appendChild(reference);
  });
  const reference = await sheet.screenshot();
  const meanError = await page.evaluate(async images => {
    const [actual, reference] = await Promise.all(images.map(async png => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + png;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }));
    let total = 0;
    for (let i = 0; i < actual!.length; i++) total += Math.abs(actual![i]! - reference![i]!);
    return total / (actual!.length * .75 * 255);
  }, [actual.toString('base64'), reference.toString('base64')]);
  expect(meanError).toBeLessThan(.02);
});
