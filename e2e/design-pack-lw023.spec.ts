import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import ts from 'typescript';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.use({ trace: 'off' });

function moduleUrl(file: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

test('the real bite and peel render below minus six dBFS with the studio mix', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one offline audio renderer');
  await page.goto('about:blank');
  const sound = moduleUrl('sound.ts');
  const inertPrefs = 'data:text/javascript,export const loadPrefs = () => ({ sound: false });';
  const cues = moduleUrl('pressSounds.ts', { './sound': sound, './persist': inertPrefs });
  const measured = await page.evaluate(async ({ sound, cues }) => {
    const { MASTER_GAIN } = await import(sound);
    const { playPressSounds } = await import(cues);
    const rate = 24_000;
    const a = new OfflineAudioContext(1, rate, rate);
    const master = a.createGain();
    master.gain.value = MASTER_GAIN;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = .003;
    comp.release.value = .2;
    master.connect(comp).connect(a.destination);
    playPressSounds({ a, out: master });
    const data = (await a.startRendering()).getChannelData(0);
    const peak = (start: number, end: number) => data.slice(start * rate, end * rate)
      .reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
    return { bite: peak(.12, .32), peel: peak(.38, .65), tail: peak(.75, 1) };
  }, { sound, cues });
  console.info('Press cue render peaks', measured);
  expect(measured.bite).toBeGreaterThan(0.001);
  expect(measured.bite).toBeLessThanOrEqual(.5);
  expect(measured.peel).toBeGreaterThan(0.001);
  expect(measured.peel).toBeLessThanOrEqual(.5);
  expect(measured.tail).toBe(0);
});

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`the opening offers sound without autoplay on ${viewport}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'viewport set per case');
    await page.setViewportSize(VIEWPORTS[viewport]);
    await page.addInitScript(() => {
      const NativeAudioContext = window.AudioContext;
      Object.assign(window, { audioCreated: 0 });
      window.AudioContext = class extends NativeAudioContext {
        constructor() {
          super();
          (window as unknown as { audioCreated: number }).audioCreated++;
        }
      };
    });
    await page.goto('/?opening=first-order');
    const sound = page.getByLabel('Sound', { exact: true });
    const count = () => page.evaluate(() => (window as unknown as { audioCreated: number }).audioCreated);
    await expect(sound).not.toBeChecked();
    await expect(sound).toHaveAttribute('switch', '');
    expect(await count()).toBe(0);
    await axe(page, '.first-order');
    await shot(page, 'LW-023', `LW-023-${viewport}-street-sound-off`);

    await page.getByRole('link', { name: 'Lantern Works', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(sound).toBeFocused();
    expect(await count()).toBe(0);
    expect(await sound.evaluate(input => getComputedStyle(input).outlineWidth)).toBe('2px');
    expect((await page.locator('.first-order-sound').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Space');
    await expect(sound).toBeChecked();
    expect(await count()).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.prefs.v1') ?? '{}').sound)).toBe(true);
    const { deltas, longFrames } = await frameDeltas(page, async () => {}, 1000);
    assertFrameBudget({ deltas, longFrames });
    expect(Math.max(...deltas)).toBeLessThanOrEqual(33);
    await axe(page, '.first-order');
    await shot(page, 'LW-023', `LW-023-${viewport}-street-sound-on`);
    await page.reload();
    await expect(sound).toBeChecked();
    expect(await count()).toBe(0);
  });
}

test('the sound offer is absent without Web Audio', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: undefined }); });
  await page.goto('/?opening=first-order');
  await expect(page.getByRole('button', { name: 'Meet Clem at the jazz bar' })).toBeVisible();
  await expect(page.getByText('Sound', { exact: true })).toHaveCount(0);
});
