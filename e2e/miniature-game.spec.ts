import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { applyCommand, createRun, replay } from '../src/engine/sim';
import { buildContinuation } from '../src/engine/continuation';
import type { Command, RunConfig } from '../src/engine/types';
import { frameAt } from '../src/ui/timeline';
import { goPlace } from './workspace-helpers';

test.use({ serviceWorkers: 'block' });
const tape = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as { rules: string; config: RunConfig; commands: Command[] };
const commands: Command[] = [];
let morning = createRun(tape.config, tape.rules);
for (const command of tape.commands) {
  if (command.type === 'runDay' && morning.day === 2) break;
  const next = applyCommand(morning, command);
  if (next.error) throw new Error(next.error);
  morning = next.state; commands.push(command);
}
const room = (page: Page) => page.locator('.work-place .miniature-world');
const saved = (page: Page): Promise<Command[]> => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0].commands);

async function load(page: Page, source = tape, prefix = commands) {
  await page.goto('/');
  await page.evaluate(({ tape, commands }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ speed: .5, sound: false, motion: 'full' }));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...tape, commands, v: 1, id: 'miniature', label: 'Miniature studio', savedAt: '2026-10-27T04:00:00Z' }]));
  }, { tape: source, commands: prefix });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Miniature studio', exact: true }).click();
  await goPlace(page, 'Work');
}

async function ready(page: Page) {
  await expect(room(page)).toBeVisible();
  await expect(room(page)).not.toHaveAttribute('data-renderer-choice', 'checking');
  const tryMiniature = page.getByRole('button', { name: 'Try miniature room', exact: true });
  if (await tryMiniature.isVisible()) await tryMiniature.click();
  await expect(room(page)).toHaveAttribute('data-rendered', 'true', { timeout: 15_000 });
  await expect(room(page)).toHaveAttribute('data-fallback', 'false');
  await expect(page.locator('.miniature-art-sources[data-art-ready=true]')).toHaveCount(1);
  await expect(page.locator('canvas[data-miniature-renderer]')).toBeVisible();
}

async function settings(page: Page) {
  const more = page.locator('.topbar-more summary');
  if (await more.isVisible() && !(await more.evaluate(summary => (summary.parentElement as HTMLDetailsElement).open))) await more.click();
  await page.getByRole('button', { name: /^Settings/ }).click();
  return page.getByRole('dialog', { name: 'Settings', exact: true });
}

test('the real studio is readable at 320, 390 and 1280, and every queued print can be inspected', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await load(page); await ready(page);
  const expected = frameAt(morning, morning, morning.minute).folders.map(folder => folder.jobId).sort();
  expect(await page.locator('button[data-inspect-job]').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-inspect-job')!).sort())).toEqual(expected);
  const job = morning.jobs.find(job => morning.contracts.find(contract => contract.id === job.contractId)?.project?.id === 'clem-ten')!;
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const camera = page.getByRole('button', { name: 'The studio', exact: true });
    await camera.focus(); await page.keyboard.press('Enter');
    await expect(room(page)).toHaveAttribute('data-view', 'studio');
    const stage = page.locator('.miniature-world__stage');
    expect(await stage.evaluate(element => getComputedStyle(element).touchAction)).toBe('pan-y');
    await stage.dispatchEvent('pointerdown', { clientX: 130, clientY: 170, isPrimary: true, button: 0 });
    await stage.dispatchEvent('pointermove', { clientX: 131, clientY: 240, isPrimary: true, button: 0 });
    await stage.dispatchEvent('pointerup', { isPrimary: true, button: 0 });
    await expect(room(page)).toHaveAttribute('data-camera-pan', '0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await stage.screenshot({ path: info.outputPath(`studio-${width}.png`) });
    const inspect = page.locator(`button[data-inspect-job="${job.id}"]`);
    await inspect.focus(); await page.keyboard.press('Enter');
    const inspection = page.getByRole('region', { name: 'Current work inspection', exact: true });
    await expect(inspection).toBeFocused();
    await expect(inspection.locator('.designed-artwork__print')).toBeVisible();
    const proof = morning.contracts.find(contract => contract.id === job.contractId)!.project!.proof!;
    await expect(inspection.locator('.designed-artwork__print')).toHaveAttribute('data-layout', proof.design.pieces[0]!.layout);
    await expect(inspection.locator('.designed-artwork__print')).toHaveAttribute('data-palette', proof.design.pieces[0]!.palette);
    expect((await new AxeBuilder({ page }).include('.miniature-world').analyze()).violations).toEqual([]);
    await inspection.screenshot({ path: info.outputPath(`inspection-${width}.png`) });
    await page.getByRole('button', { name: 'Close print', exact: true }).click();
    await expect(inspect).toBeFocused();
  }
  expect(await saved(page)).toEqual(commands);
  expect(errors).toEqual([]);
});

test('the illustrated preference persists and switching views preserves the command tape', async ({ page }) => {
  await load(page); await ready(page);
  await (await settings(page)).getByRole('radio', { name: 'Illustrated studio', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  expect(await saved(page)).toEqual(commands);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Miniature studio', exact: true }).click();
  await goPlace(page, 'Work');
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await (await settings(page)).getByRole('radio', { name: 'Miniature room', exact: true }).check();
  await page.keyboard.press('Escape'); await ready(page);
  expect(await saved(page)).toEqual(commands);
});

for (const failure of ['WebGL', 'MiniatureWorld', 'MiniatureCanvas']) test(`${failure} failure leaves the real illustrated game playable`, async ({ page }) => {
  if (failure === 'WebGL') await page.addInitScript({ content: `const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return ['webgl', 'webgl2', 'experimental-webgl'].includes(type) ? null : original.call(this, type, ...args); };` });
  else await page.route(`**/assets/${failure}-*.js`, route => route.abort());
  await load(page);
  const tryMiniature = page.getByRole('button', { name: 'Try miniature room', exact: true });
  if (failure !== 'MiniatureWorld') {
    await expect(room(page)).toBeVisible();
    await expect(room(page)).not.toHaveAttribute('data-renderer-choice', 'checking');
    if (await tryMiniature.isVisible()) await tryMiniature.click();
    await expect(tryMiniature).toHaveCount(0);
  }
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await goPlace(page, 'Window');
  await expect(page.getByRole('heading', { name: 'At the window', exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(commands);
});

test('lost graphics remain illustrated across workspace navigation', async ({ page }) => {
  await load(page); await ready(page);
  await page.locator('canvas[data-miniature-renderer]').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(room(page)).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('.miniature-fallback .lw-world')).toBeVisible();
  await goPlace(page, 'Window'); await goPlace(page, 'Work');
  await expect(room(page)).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('.miniature-fallback .lw-world')).toBeVisible();
  expect(await saved(page)).toEqual(commands);
});

test('inspecting pauses a real day and unchanged artwork stays bound through its deliveries', async ({ page }) => {
  await load(page); await ready(page);
  const result = applyCommand(morning, { type: 'runDay', calls: true });
  expect(result.error).toBeUndefined(); expect(result.state.call).toBeNull();
  await page.getByRole('button', { name: /^Open .*Day 3/ }).click();
  await page.locator('button[data-inspect-job]').first().click();
  await expect(room(page)).toHaveAttribute('data-playback-running', 'false');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close print', exact: true }).click();
  await ready(page);
  await room(page).evaluate(element => {
    const history: string[][] = [JSON.parse(element.getAttribute('data-print-textures')!)];
    (window as unknown as { textureHistory: string[][] }).textureHistory = history;
    new MutationObserver(() => history.push(JSON.parse(element.getAttribute('data-print-textures')!))).observe(element, { attributes: true, attributeFilter: ['data-print-textures'] });
  });
  for (let step = 0; step < 8 && await page.getByRole('button', { name: 'Next hour', exact: true }).count(); step++) await page.getByRole('button', { name: 'Next hour', exact: true }).click();
  await expect(page.locator('.evening')).toBeVisible(); await ready(page);
  const history = await page.evaluate(() => (window as unknown as { textureHistory: string[][] }).textureHistory);
  expect(history.length).toBeGreaterThan(1);
  const unchanged = history[0]!.filter(key => history.at(-1)!.includes(key));
  expect(unchanged.length).toBeGreaterThan(0);
  for (const frame of history) for (const key of unchanged) expect(frame).toContain(key);
  const actual = await saved(page);
  expect(actual).toEqual([...commands, { type: 'runDay', calls: true }]);
  expect(replay(tape.config, actual, tape.rules).errors).toEqual([]);
});

test('active work opens close while keeping the full room a player choice', async ({ page }, info) => {
  await load(page); await ready(page);
  await page.getByRole('button', { name: /^Open .*Day 3/ }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(room(page)).toHaveAttribute('data-view', 'work');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.miniature-world__stage').screenshot({ path: info.outputPath(`active-bench-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'The studio', exact: true }).click();
  await page.getByRole('button', { name: 'Next hour', exact: true }).click();
  await expect(room(page)).toHaveAttribute('data-view', 'studio');
  await page.getByRole('button', { name: 'On the bench', exact: true }).click();
  await page.locator('button[data-inspect-job]').first().click();
  await expect(page.getByRole('region', { name: 'Current work inspection', exact: true })).toBeFocused();
});

test('the close camera retains lighting without compiling a new shader variant', async ({ page }, info) => {
  await page.addInitScript(() => {
    const state = { programs: 0, variants: new Set<string>() };
    (window as unknown as { cameraPrograms: typeof state }).cameraPrograms = state;
    const create = WebGL2RenderingContext.prototype.createProgram;
    WebGL2RenderingContext.prototype.createProgram = function () { state.programs++; return create.call(this); };
    const link = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (program) {
      link.call(this, program);
      const sources = this.getAttachedShaders(program)!.map(shader => [this.getShaderParameter(shader, this.SHADER_TYPE), this.getShaderSource(shader)]).sort((a, b) => Number(a[0]) - Number(b[0]));
      state.variants.add(JSON.stringify(sources));
    };
  });
  await load(page); await ready(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('.work-place .miniature-world')!;
    const expected = [...root.querySelectorAll('[data-print-key]')].map(element => element.getAttribute('data-print-key')).sort();
    const committed = JSON.parse(root.getAttribute('data-print-textures') ?? '[]').sort();
    return JSON.stringify(committed) === JSON.stringify(expected);
  })).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const count = () => page.evaluate(() => {
    const state = (window as unknown as { cameraPrograms: { programs: number; variants: Set<string> } }).cameraPrograms;
    return { programs: state.programs, variants: state.variants.size };
  });
  const before = await count();
  expect(before.variants).toBeGreaterThan(0);
  const observations = [];
  for (const [name, view] of [['On the bench', 'work'], ['The studio', 'studio']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(room(page)).toHaveAttribute('data-view', view!);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const after = await count(); observations.push({ view, ...after, newPrograms: after.programs - before.programs, newVariants: after.variants - before.variants });
    // Three can warm an identical depth shader under another cache key after its initial shadow pass.
    expect(after.variants).toBe(before.variants);
  }
  await info.attach('camera-shader-check', { body: JSON.stringify({ cpuSlowdown: 4, before, observations }), contentType: 'application/json' });
  await cdp.detach();
});

test('a continuing studio keeps its actual print and shows Tomas and Noor learning from it', async ({ page }, info) => {
  const parent = replay(tape.config, tape.commands, tape.rules);
  expect(parent.errors).toEqual([]);
  const config = buildContinuation(parent.state, ['c5-l1']);
  const carried = config.continuation!.pieces[0]!;
  const prefix: Command[] = [{ type: 'hire' }, { type: 'preparePattern', sourceId: carried.id }];
  await load(page, { ...tape, config, commands: prefix }, prefix); await ready(page);
  expect(JSON.parse(await room(page).getAttribute('data-print-textures') ?? '[]')).toContain(`keepsake:${carried.id}`);
  await page.getByRole('button', { name: /^Open .*Day 1/ }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect the pattern', exact: true }).click();
  await expect(room(page)).toHaveAttribute('data-playback-running', 'false');
  const inspection = page.getByRole('region', { name: 'Current work inspection', exact: true });
  await expect(inspection).toBeFocused();
  await expect(inspection).toHaveAttribute('data-pattern-source', carried.id);
  await expect(inspection).toContainText('Tomas · preparing a studio pattern');
  const art = inspection.locator('.designed-artwork__print');
  await expect(art).toHaveAttribute('data-layout', carried.design.layout);
  await expect(art).toHaveAttribute('data-palette', carried.design.palette);
  for (const copy of carried.copy) expect(await art.getAttribute('aria-label')).toContain(copy.text);
  await inspection.screenshot({ path: info.outputPath('preparing-pattern.png') });
  await page.getByRole('button', { name: 'Close print', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect the pattern', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Skip to evening', exact: true }).click();
  await expect(page.locator('.miniature-world__status')).not.toContainText('preparing a studio pattern');
  await page.getByRole('button', { name: "Review tomorrow's window", exact: true }).click();
  await goPlace(page, 'Studio');
  await page.getByRole('button', { name: 'Teach this pattern to Noor', exact: true }).click();
  await page.getByRole('button', { name: /^Open .*Day 2/ }).click();
  await ready(page);
  await expect(room(page)).toHaveAttribute('data-playback-running', 'false');
  await expect(page.locator('.miniature-world__time')).toContainText('9:00am');
  await page.getByRole('button', { name: 'Inspect the pattern', exact: true }).click();
  await expect(inspection).toContainText('Tomas and Noor · a studio pattern lesson');
  await expect(inspection).toHaveAttribute('data-pattern-source', carried.id);
  expect((await new AxeBuilder({ page }).include('.miniature-world').analyze()).violations).toEqual([]);
  await inspection.screenshot({ path: info.outputPath('teaching-pattern.png') });
  expect(replay(config, await saved(page), tape.rules).errors).toEqual([]);
});

test('the software-rendering recommendation offers a persistent player choice', async ({ page }) => {
  await page.addInitScript(() => {
    const getParameter = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      return parameter === 0x9246 ? 'ANGLE SwiftShader Device' : getParameter.call(this, parameter);
    };
  });
  await load(page);
  await expect(room(page)).toHaveAttribute('data-renderer-choice', 'illustrated');
  await expect(room(page)).toContainText('Keep the illustrated studio for a lighter view.');
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  await ready(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Miniature studio', exact: true }).click();
  await goPlace(page, 'Work'); await ready(page);
  await page.getByRole('button', { name: 'Use illustrated studio', exact: true }).click();
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Miniature studio', exact: true }).click();
  await goPlace(page, 'Work');
  await expect(page.locator('.work-place .lw-world')).toBeVisible();
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  expect(await saved(page)).toEqual(commands);
});

test('returning to Work retains one dormant renderer and its artwork resources', async ({ page }) => {
  await load(page); await ready(page);
  await page.waitForTimeout(300);
  const canvas = await page.locator('canvas[data-miniature-renderer]').elementHandle();
  const metrics = async () => JSON.parse(await room(page).getAttribute('data-renderer-metrics') ?? '{}') as { frames: number; geometries: number; textures: number };
  const initial = await metrics();
  for (let visit = 0; visit < 3; visit++) {
    await goPlace(page, 'Window');
    await expect(room(page)).toHaveAttribute('data-visible', 'false');
    await page.waitForTimeout(200);
    const hidden = await metrics();
    await page.waitForTimeout(300);
    expect((await metrics()).frames).toBe(hidden.frames);
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
    await goPlace(page, 'Work');
    await expect(page.locator('canvas[data-miniature-renderer]')).toBeVisible();
    expect(await page.locator('canvas[data-miniature-renderer]').evaluate((element, original) => element === original, canvas)).toBe(true);
    await page.waitForTimeout(200);
    expect((await metrics()).geometries).toBe(initial.geometries);
    expect((await metrics()).textures).toBe(initial.textures);
  }
  expect(await saved(page)).toEqual(commands);
  await page.getByRole('button', { name: 'Lantern Works: back to the street map', exact: true }).click();
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  await expect.poll(() => canvas!.evaluate(element => (element as HTMLCanvasElement).getContext('webgl2')?.isContextLost())).toBe(true);
});

test('unrelated settings preserve automatic software fallback and explicit view changes apply immediately', async ({ page }) => {
  await page.addInitScript(() => {
    const getParameter = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      return parameter === 0x9246 ? 'ANGLE SwiftShader Device' : getParameter.call(this, parameter);
    };
  });
  await load(page);
  await expect(room(page)).toHaveAttribute('data-renderer-choice', 'illustrated');
  const dialog = await settings(page);
  await expect(dialog.getByRole('radio', { name: 'Automatic', exact: true })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Sound', exact: true }).check();
  await dialog.getByRole('radio', { name: 'Reduce motion', exact: true }).check();
  await dialog.getByRole('radio', { name: '2x', exact: true }).check();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.prefs.v1')!))).not.toHaveProperty('studioView');
  await expect(room(page)).toHaveAttribute('data-renderer-choice', 'illustrated');
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Miniature studio', exact: true }).click();
  await goPlace(page, 'Work');
  await expect(room(page)).toHaveAttribute('data-renderer-choice', 'illustrated');
  await (await settings(page)).getByRole('radio', { name: 'Miniature room', exact: true }).check();
  await page.keyboard.press('Escape'); await ready(page);
  await (await settings(page)).getByRole('radio', { name: 'Automatic', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(room(page)).toHaveAttribute('data-renderer-choice', 'illustrated');
  await expect(page.locator('canvas[data-miniature-renderer]')).toHaveCount(0);
  expect(await saved(page)).toEqual(commands);
});
