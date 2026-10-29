import { LEGACY_RULES_VERSION } from '../src/engine/versions';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goPlace } from './workspace-helpers';
import { replay } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';
import { encodeShare } from '../src/ui/persist';
import { frameAt } from '../src/ui/timeline';
import { FINISH_BENCH, P, RACK } from '../src/ui/world/iso';
import { placeHumans } from '../src/ui/world/place';
import { portfolioAt } from '../src/ui/game/portfolio';

const payload = JSON.parse(readFileSync('test-fixtures/replays/production-day.json', 'utf8')) as { config: RunConfig; commands: Command[] };
const commands = payload.commands.slice(0, 49);
const before = replay(payload.config, commands, LEGACY_RULES_VERSION);
const after = replay(payload.config, [...commands, { type: 'runDay', calls: true }], LEGACY_RULES_VERSION);

test.setTimeout(30_000);

async function openMorning(page: Page, config: RunConfig, prefix: Command[], reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.goto(`/#s=${await encodeShare(config, prefix, 'Production view regression', LEGACY_RULES_VERSION)}`);
  await goPlace(page, 'Work');
  const world = page.locator('.work-place svg.lw-world');
  await expect(world).toBeVisible();
  await page.waitForTimeout(450);
  await page.clock.install({ time: new Date('2026-10-24T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-24T10:00:01Z'));
  return world;
}

async function expectProduction(page: Page) {
  const world = page.locator('.work-place svg.lw-world');
  const phone = (await world.evaluate((el) => el.getBoundingClientRect().width)) < 640;
  await expect(world).toHaveAttribute('viewBox', phone ? '280 75 656 485' : '0 0 960 560');
}

test('the actual redo and finishing work are visible without panning the phone miniature', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(before.errors).toEqual([]);
  expect(after.errors).toEqual([]);
  const frame = frameAt(before.state, after.state, before.state.minute + 223);
  expect(frame.folders.find((f) => f.jobId === 'c7-l1')?.stage).toBe('rework');
  const ada = placeHumans(frame).find((p) => p.worker.name === 'Ada')!;
  expect(ada.worker.station).toBe('finish');
  const hash = await encodeShare(payload.config, commands, 'Production view regression', LEGACY_RULES_VERSION);
  await page.goto(`/#s=${hash}`);
  await goPlace(page, 'Work');
  const world = page.locator('.work-place svg.lw-world');
  await expect(world).toBeVisible();
  // Let the ordinary route transition finish before installing a paused test clock.
  await page.waitForTimeout(450);
  await page.clock.install({ time: new Date('2026-10-24T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-24T10:00:01Z'));
  await page.getByRole('button', { name: /^Open the shop for Day 6/ }).click();
  await expect(page.locator('.playbar')).toBeVisible();
  await page.clock.runFor(3720);
  await expect(page.locator('.daylog')).toContainText("Oscar's launch didn't pass finishing");
  const [ax, ay] = P(ada.x, ada.y);
  const points = [
    [ax - 12, ay - 55], [ax + 12, ay + 4],
    P(FINISH_BENCH.x, FINISH_BENCH.y + FINISH_BENCH.d, FINISH_BENCH.h),
    P(FINISH_BENCH.x + FINISH_BENCH.w, FINISH_BENCH.y, FINISH_BENCH.h),
    P(RACK.x + RACK.w, RACK.y, RACK.top),
  ];
  const visibility = await world.evaluate((svg, points) => {
    const element = svg as SVGSVGElement;
    const rect = element.getBoundingClientRect();
    const matrix = element.getScreenCTM()!;
    return points.map(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y, inside: point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom };
    });
  }, points);
  await page.screenshot({ path: `scratch/phone-production-view/redo-${info.project.name}.png` });
  await world.screenshot({ path: `scratch/phone-production-view/redo-${info.project.name}-world.png` });
  expect(visibility.every((p) => p.inside), JSON.stringify(visibility)).toBe(true);
});

for (const [day, index] of [[5, 30], [6, 49], [7, 59]] as const) {
  test(`recorded Day ${day} keeps its workshop view through the evening and restores the morning on review`, async ({ page }, info) => {
    const prefix = payload.commands.slice(0, index);
    const native = replay(payload.config, [...prefix, { type: 'runDay', calls: true }], LEGACY_RULES_VERSION);
    expect(native.errors).toEqual([]);
    expect(native.state.call).toBeNull();
    const world = await openMorning(page, payload.config, prefix);
    const morning = await world.getAttribute('viewBox');
    const morningHeight = (await world.boundingBox())!.height;
    await page.getByRole('button', { name: new RegExp(`^Open the shop for Day ${day}`) }).click();
    await expectProduction(page);
    const productionHeight = (await world.boundingBox())!.height;
    if (info.project.name === 'phone') expect(productionHeight).toBeCloseTo(morningHeight, 0);
    await page.clock.runFor(2500);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const clock = await page.locator('.playbar .clock').textContent();
    await page.clock.runFor(1000);
    await expect(page.locator('.playbar .clock')).toHaveText(clock!);
    await expectProduction(page);
    if (info.project.name === 'phone') expect((await world.boundingBox())!.height).toBeCloseTo(productionHeight, 0);
    else await expect(world).toHaveAttribute('viewBox', '0 0 960 560');
    await world.screenshot({ path: `scratch/phone-production-view/day-${day}-${info.project.name}-world.png` });
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.clock.runFor(500);
    await expectProduction(page);
    await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
    await expect(page.locator('.evening')).toBeVisible();
    await expect(world).toHaveClass(/lw-closed/);
    await expectProduction(page);
    expect((await world.boundingBox())!.height).toBeCloseTo(morningHeight, 0);
    const delivered = native.state.events.filter((event) => event.day === day - 1 && event.type === 'delivered').length;
    await expect(page.locator('.evening-sentence')).toContainText(`delivered ${delivered} launches`);
    await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
    await goPlace(page, 'Work');
    await expect(world).not.toHaveClass(/lw-closed/);
    await expect(world).toHaveAttribute('viewBox', morning!);
  });
}

test('manual phone drags use the current scale and cannot carry across opening, evening or rewind', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const world = await openMorning(page, payload.config, commands);
  const morning = await world.getAttribute('viewBox');
  const box = (await world.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 3 });
  await page.mouse.up();
  expect(await world.getAttribute('viewBox')).not.toBe(morning);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.getByRole('button', { name: /^Open the shop for Day 6/ }).focus();
  await page.keyboard.press('Enter');
  await expectProduction(page);
  await page.mouse.move(x + 30, y);
  await expectProduction(page);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 3 });
  await page.mouse.up();
  const panX = Number((await world.getAttribute('viewBox'))!.split(' ')[0]);
  const playingWidth = (await world.boundingBox())!.width;
  expect(panX).toBe(playingWidth < 640 ? Math.round(280 - (30 * 656) / playingWidth) : 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(world).toHaveClass(/lw-closed/);
  await expectProduction(page);
  await page.mouse.move(x + 30, y);
  await expectProduction(page);
  await page.mouse.up();
  await page.locator('.evening details summary').click();
  await page.getByRole('button', { name: 'Step through the day hour by hour', exact: true }).click();
  await expectProduction(page);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`an actual held call keeps production framed with motion ${reducedMotion}`, async ({ page }, info) => {
    const saved = JSON.parse(readFileSync('test-fixtures/replays/first-session.json', 'utf8')) as { config: RunConfig; commands: Command[] };
    const prefix = saved.commands.slice(0, 8);
    const native = replay(saved.config, [...prefix, { type: 'runDay', calls: true }], LEGACY_RULES_VERSION);
    expect(native.errors).toEqual([]);
    expect(native.state.call?.jobId).toBe('c3-l1');
    const world = await openMorning(page, saved.config, prefix, reducedMotion);
    await page.getByRole('button', { name: /^Open the shop for Day 2/ }).click();
    if (reducedMotion === 'no-preference') await page.clock.runFor(6000);
    const call = page.getByRole('alertdialog', { name: /^A call at/ });
    await expect(call).toBeVisible();
    await expectProduction(page);
    const clock = await page.locator('.playbar .clock').textContent();
    await page.clock.runFor(1500);
    await expect(page.locator('.playbar .clock')).toHaveText(clock!);
    await expectProduction(page);
    await world.screenshot({ path: `scratch/phone-production-view/call-${reducedMotion}-${info.project.name}-world.png` });
    await call.getByRole('button', { name: /^Everyone stays until 5pm/ }).click();
    await expect(call).toHaveCount(0);
    if (reducedMotion === 'no-preference') {
      await expectProduction(page);
      await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
    }
    await expect(page.locator('.evening')).toBeVisible();
  });
}

test('reduced-motion hour stepping keeps the workshop until tomorrow is reviewed', async ({ page }, info) => {
  const world = await openMorning(page, payload.config, commands, 'reduce');
  const morning = await world.getAttribute('viewBox');
  await page.getByRole('button', { name: /^Open the shop for Day 6/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  await expect(world).toHaveClass(/lw-closed/);
  await expectProduction(page);
  await page.locator('.evening details summary').click();
  await page.getByRole('button', { name: 'Step through the day hour by hour', exact: true }).click();
  await expectProduction(page);
  for (let hour = 0; hour < 4; hour++) await page.getByRole('button', { name: 'Next hour', exact: true }).click();
  await expect(page.locator('.daylog')).toContainText("Oscar's launch didn't pass finishing");
  await expect(page.locator('.work-place .portfolio-count')).toContainText(`${portfolioAt(after.state, before.state.minute + 240).length} launches`);
  await expectProduction(page);
  await world.screenshot({ path: `scratch/phone-production-view/reduced-${info.project.name}-world.png` });
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(world).toHaveClass(/lw-closed/);
  await expectProduction(page);
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Work');
  await expect(world).not.toHaveClass(/lw-closed/);
  await expect(world).toHaveAttribute('viewBox', morning!);
});
