import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const VIEWPORTS = {
  iphone: { width: 393, height: 852 },
  ipad: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
  'duo-outer': { width: 382, height: 580 },
  'duo-split': { width: 669, height: 820 },
  'duo-inner': { width: 951, height: 585 },
  'ipad-landscape': { width: 1180, height: 820 },
} as const;

export async function shot(page: Page, ticket: string, name: string, captured?: Buffer) {
  const directory = `test-results/design-pack/${ticket}`;
  const path = `${directory}/${name}.png`;
  if (captured) {
    await mkdir(directory, { recursive: true });
    await writeFile(path, captured);
    return;
  }
  await page.screenshot({
    path,
    animations: name.endsWith('-mid') ? 'allow' : 'disabled',
    scale: 'css',
  });
}

type FrameTrace = { deltas: number[]; longFrames: number[] };
type FrameWindow = Window & { __lwFrames?: FrameTrace & { stop: () => FrameTrace } };

export async function frameDeltas(page: Page, run: () => Promise<void>, ms = 3000): Promise<FrameTrace> {
  await page.evaluate(() => {
    const host = window as FrameWindow;
    const deltas: number[] = [];
    const longFrames: number[] = [];
    let previous: number | undefined;
    let request = requestAnimationFrame(sample);

    function sample() {
      const now = performance.now();
      if (previous !== undefined) deltas.push(now - previous);
      previous = now;
      request = requestAnimationFrame(sample);
    }

    const canObserveLongFrames = typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame');
    const observer = canObserveLongFrames
      ? new PerformanceObserver(entries => longFrames.push(...entries.getEntries().map(entry => entry.duration)))
      : undefined;
    observer?.observe({ type: 'long-animation-frame', buffered: false });
    host.__lwFrames = {
      deltas,
      longFrames,
      stop: () => {
        cancelAnimationFrame(request);
        if (observer) {
          longFrames.push(...observer.takeRecords().map(entry => entry.duration));
          observer.disconnect();
        }
        delete host.__lwFrames;
        return { deltas, longFrames };
      },
    };
  });

  let trace: FrameTrace | undefined;
  try {
    await run();
    await page.waitForTimeout(ms);
  } finally {
    trace = await page.evaluate(() => (window as FrameWindow).__lwFrames?.stop());
  }
  if (!trace) throw new Error('Frame recording ended before it could be collected.');
  return trace;
}

export function assertFrameBudget({ deltas, longFrames }: FrameTrace) {
  expect(deltas.length, 'Frame samples collected').toBeGreaterThan(0);
  const slowFrames: number[] = [];
  let elapsed = 0;
  for (const delta of deltas) {
    elapsed += delta;
    if (delta > 20) slowFrames.push(elapsed);
  }
  const max = Math.max(...deltas);
  console.info('Frame budget', {
    max,
    over16_7: deltas.filter(delta => delta > 16.7).length,
    over20: slowFrames.length,
    over33: deltas.filter(delta => delta > 33).length,
    longFrames,
  });
  expect(max, 'Maximum frame delta (ms)').toBeLessThanOrEqual(33.4);
  const overBudget = slowFrames.some((end, index) => index >= 2 && end - slowFrames[index - 2]! <= 3000);
  expect(overBudget, 'More than two frames over 20 ms in a 3 s window').toBe(false);
}

export async function axe(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, `axe violations in ${include}`).toEqual([]);
  return results;
}
