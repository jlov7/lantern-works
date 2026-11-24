import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Command, RunConfig } from '../src/engine/types';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';
import { goPlace } from './workspace-helpers';

const tape = JSON.parse(readFileSync('src/ui/game/fixtures/heartfelt-courtyard.json', 'utf8')) as { rules: string; config: RunConfig; commands: Command[] };
const dayStarts = tape.commands.flatMap((command, index) => command.type === 'runDay' ? [index] : []);
const commands = tape.commands.slice(0, dayStarts[2]!);

type RoomEvent = { type: string; ms?: number };
type PageLog = Window & { __lwRoomLog?: RoomEvent[] };
type WorkerTrace = { warmed: boolean; postWarmLinkChecks: number[] };
type ObservedWorker = typeof globalThis & { __lwShaderTrace: WorkerTrace };

test.use({
  serviceWorkers: 'block',
  // Use the displayed Metal room on macOS for the frame measurements.
  ...(process.platform === 'darwin' ? {
    channel: 'chromium',
    headless: false,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] },
  } : {}),
});

async function loadRoom(page: Page) {
  await page.goto('/');
  await page.evaluate(({ tape, commands }) => {
    localStorage.clear();
    localStorage.setItem('lantern.guide.v1', 'seen');
    localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season']));
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView: 'miniature', sound: false }));
    localStorage.setItem('lantern.runs.v1', JSON.stringify([{ ...tape, commands, v: 1, id: 'shader-warmup', label: 'Shader warmup', savedAt: '2026-10-27T04:00:00Z' }]));
  }, { tape, commands });
  await page.reload();
  await page.getByRole('button', { name: 'Continue Shader warmup', exact: true }).click();
  await goPlace(page, 'Work');
}

function trackShaderLinks() {
  const trace: WorkerTrace = { warmed: false, postWarmLinkChecks: [] };
  (globalThis as ObservedWorker).__lwShaderTrace = trace;
  const scope = globalThis as unknown as { postMessage: (message: { type?: string }, options?: StructuredSerializeOptions | Transferable[]) => void };
  const post = scope.postMessage;
  scope.postMessage = function (message, options) {
    if (message.type === 'warmed') trace.warmed = true;
    return post.call(scope, message, options);
  };
  const read = WebGL2RenderingContext.prototype.getProgramParameter;
  WebGL2RenderingContext.prototype.getProgramParameter = function (program, parameter) {
    const started = performance.now();
    const result = read.call(this, program, parameter);
    if (trace.warmed && parameter === this.LINK_STATUS) trace.postWarmLinkChecks.push(performance.now() - started);
    return result;
  };
}

test('the worker warms and commits the room before revealing it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport set per test');
  await page.addInitScript(() => {
    const log: RoomEvent[] = [];
    (window as PageLog).__lwRoomLog = log;
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('/room.worker-')) this.addEventListener('message', ({ data }) => {
          if (data.type === 'warmed' || data.type === 'painted') log.push({ type: data.type, ms: data.ms });
        });
      }
    };
  });
  await page.context().route('**/assets/room.worker-*.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `(${trackShaderLinks.toString()})();\n` + await response.text() });
  });

  for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
    await test.step(viewport, async () => {
      await page.setViewportSize(VIEWPORTS[viewport]);
      await loadRoom(page);
      const room = page.locator('.work-place .miniature-world');
      await expect(room).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
      await expect(room.locator('canvas')).toHaveAttribute('data-renderer-thread', 'worker');
      const log = await page.evaluate(() => (window as PageLog).__lwRoomLog ?? []);
      expect(log.map(entry => entry.type)).toEqual(['warmed', 'painted']);
      expect(log[0]!.ms).toBeGreaterThan(0);
      await expect.poll(async () => {
        const intended = (await room.locator('[data-print-key]').evaluateAll(items => items.map(item => item.getAttribute('data-print-key')))).sort();
        const actual = JSON.parse(await room.getAttribute('data-print-textures') ?? '[]').sort();
        return intended.length > 0 && JSON.stringify(intended) === JSON.stringify(actual);
      }).toBe(true);

      await page.getByRole('button', { name: 'The studio', exact: true }).press('Enter');
      await expect(room).toHaveAttribute('data-view', 'studio');
      const bench = page.getByRole('button', { name: 'On the bench', exact: true });
      await bench.focus();
      await expect(bench).toBeFocused();
      const frames = await frameDeltas(page, async () => {
        await page.keyboard.press('Enter');
        await expect(room).toHaveAttribute('data-view', 'work');
      });
      assertFrameBudget(frames);
      expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
      const worker = page.workers().find(item => item.url().includes('/room.worker-'))!;
      const { postWarmLinkChecks } = await worker.evaluate(() => (globalThis as ObservedWorker).__lwShaderTrace);
      expect(Math.max(0, ...postWarmLinkChecks)).toBeLessThanOrEqual(16.7);
      await info.attach(`${viewport}-room-warmup`, { body: JSON.stringify({ log, frames, postWarmLinkChecks }), contentType: 'application/json' });
      await shot(page, 'LW-015', `LW-015-${viewport}-studio-work`);
      await axe(page, '.miniature-world');
    });
  }
});

test('the main-thread renderer also warms before revealing the room', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'viewport added to the worker test');
  await page.addInitScript(() => { Reflect.deleteProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen'); });
  await loadRoom(page);
  const room = page.locator('.work-place .miniature-world');
  await expect(room).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
  const canvas = room.locator('canvas[data-miniature-renderer]');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).not.toHaveAttribute('data-renderer-thread', 'worker');
  expect(Number(await canvas.getAttribute('data-warmup-ms'))).toBeGreaterThan(0);
});
