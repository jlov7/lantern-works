import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import ts from 'typescript';

// Exercise the actual Web Audio implementation without adding a test-only route to the game.
function moduleUrl(file: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) code = code.replaceAll(`'${specifier}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const scoreUrl = moduleUrl('soundscapeScore.ts');
const runtimeUrl = moduleUrl('soundscape.ts', { './soundscapeScore': scoreUrl });
const cuesUrl = moduleUrl('sound.ts');
// Chromium trace snapshots activate the page through their injected script, before the test makes a gesture.
test.use({ trace: 'off' });

test('all studio arrangements render finite, quiet audio with a silent tail', async ({ page }) => {
  await page.goto('about:blank');
  const renders = await page.evaluate(async ({ scoreUrl, runtimeUrl }) => {
    const { composePhrase, SOUNDSCAPE_GAIN } = await import(scoreUrl);
    const { renderScoreNote } = await import(runtimeUrl);
    const results = [];
    for (const scene of ['window', 'design', 'work', 'evening', 'gathering']) {
      const phrase = composePhrase({ scene, relationship: true }, 1);
      const a = new OfflineAudioContext(1, Math.ceil((phrase.duration + 2) * 24000), 24000);
      const mix = a.createGain(); mix.gain.value = SOUNDSCAPE_GAIN * 0.6; mix.connect(a.destination);
      for (const note of phrase.notes) renderScoreNote(a, mix, note, note.at + 0.05);
      const buffer = await a.startRendering();
      const data = buffer.getChannelData(0);
      let peak = 0; let energy = 0; let tail = 0; let finite = true;
      for (let i = 0; i < data.length; i++) {
        const value = data[i]!;
        peak = Math.max(peak, Math.abs(value)); energy += value * value;
        if (i > data.length - 24000) tail = Math.max(tail, Math.abs(value));
        if (!Number.isFinite(value)) finite = false;
      }
      results.push({ scene, peak, rms: Math.sqrt(energy / data.length), tail, finite });
    }
    return results;
  }, { scoreUrl, runtimeUrl });
  expect(renders).toHaveLength(5);
  for (const result of renders) {
    expect(result.finite, result.scene).toBe(true);
    expect(result.peak, result.scene).toBeGreaterThan(0.001);
    expect(result.peak, result.scene).toBeLessThan(0.1);
    expect(result.rms, result.scene).toBeGreaterThan(0.0002);
    expect(result.tail, result.scene).toBe(0);
  }
});

test('real audio requires a gesture, stays bounded and releases its graph on stop', async ({ page }) => {
  await page.goto('about:blank');
  // Playwright's page.evaluate marks evaluation as a user gesture. CDP can explicitly withhold it.
  const cdp = await page.context().newCDPSession(page);
  const withoutGesture = await cdp.send('Runtime.evaluate', {
    expression: `import(${JSON.stringify(cuesUrl)}).then(cues => ({ active: navigator.userActivation.isActive, blocked: cues.unlockAudioFromGesture() === null }))`,
    awaitPromise: true, returnByValue: true, userGesture: false,
  });
  expect(withoutGesture.result.value).toEqual({ active: false, blocked: true });
  await cdp.detach();
  await page.evaluate(({ cuesUrl, runtimeUrl }) => {
    const button = document.createElement('button'); button.textContent = 'Start soundscape check'; button.id = 'soundscape-check';
    button.onclick = async () => {
      const cues = await import(cuesUrl);
      const { createSoundscape } = await import(runtimeUrl);
      const bus = cues.unlockAudioFromGesture();
      if (!bus) throw new Error('Trusted click did not unlock audio');
      const handle = createSoundscape({ scene: 'design', relationship: true });
      handle.start(bus);
      Object.assign(window, { soundscapeCheck: { handle, bus } });
    };
    document.body.append(button);
  }, { cuesUrl, runtimeUrl });
  await page.locator('#soundscape-check').click();
  await expect.poll(() => page.evaluate(() => {
    const check = (window as unknown as { soundscapeCheck?: { handle: { snapshot: () => { running: boolean } } } }).soundscapeCheck;
    return check?.handle.snapshot().running;
  })).toBe(true);
  const result = await page.evaluate(async () => {
    const { handle, bus } = (window as unknown as { soundscapeCheck: { handle: { stop: () => void; start: (bus: unknown) => void; snapshot: () => { running: boolean; voices: number } }; bus: { a: AudioContext } } }).soundscapeCheck;
    const started = handle.snapshot();
    handle.stop();
    const stopped = handle.snapshot();
    handle.start(bus);
    const restarted = handle.snapshot();
    handle.stop();
    await bus.a.close();
    return { started, stopped, restarted, final: handle.snapshot() };
  });
  expect(result.started.voices).toBeGreaterThan(0);
  expect(result.started.voices).toBeLessThanOrEqual(10);
  expect(result.stopped.running).toBe(false);
  expect(result.stopped.voices).toBe(0);
  expect(result.restarted.running).toBe(true);
  expect(result.final.voices).toBe(0);
});

test('the optional local study starts on the enabling click and cleans up on disable and hiding', async ({ page }) => {
  test.skip(!process.env.SOUNDSCAPE_STUDY, 'The local study is served by Vite dev, outside the shipped game.');
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const check = { contexts: 0, active: 0 };
    Object.assign(window, { soundscapeStudyCheck: check });
    window.AudioContext = class extends Original {
      constructor() { super(); check.contexts++; }
      createOscillator() {
        const source = super.createOscillator();
        const start = source.start.bind(source);
        source.start = (at?: number) => { check.active++; start(at); };
        source.addEventListener('ended', () => { check.active--; });
        return source;
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (at?: number, offset?: number, duration?: number) => { check.active++; start(at, offset, duration); };
        source.addEventListener('ended', () => { check.active--; });
        return source;
      }
    };
  });
  await page.goto('/soundscape-study.html');
  const active = () => page.evaluate(() => (window as unknown as { soundscapeStudyCheck: { active: number } }).soundscapeStudyCheck.active);
  expect(await page.evaluate(() => (window as unknown as { soundscapeStudyCheck: { contexts: number } }).soundscapeStudyCheck.contexts)).toBe(0);
  await page.getByRole('checkbox', { name: 'Sound', exact: true }).check();
  await expect.poll(active).toBeGreaterThan(0);
  await page.getByRole('checkbox', { name: 'Sound', exact: true }).uncheck();
  await expect.poll(active).toBe(0);
  await page.waitForTimeout(750);
  expect(await active()).toBe(0);
  await page.getByRole('checkbox', { name: 'Sound', exact: true }).check();
  await expect.poll(active).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(active).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(750);
  expect(await active()).toBe(0);
  await page.getByRole('heading', { name: 'Music from the studio' }).click();
  await expect.poll(active).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close study' }).click();
  await expect.poll(active).toBe(0);
  await page.waitForTimeout(750);
  expect(await active()).toBe(0);
});
