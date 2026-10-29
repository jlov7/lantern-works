import { expect, test } from '@playwright/test';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { goPlace, takeFocused } from './workspace-helpers';

for (const action of ['receipt', 'expense'] as const) {
  test(`cash settles to the engine after reduced motion interrupts a ${action} roll`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (action === 'expense') await page.addInitScript(() => localStorage.setItem('lantern.stamps.v1', JSON.stringify(['first-season'])));
    await page.goto('/#play=main-street:financial-counters-earn-0');
    const cashButton = page.locator('.stat-cash');
    const visual = page.locator('.stat-cash strong .rolling > span').first();
    await expect(visual).toHaveText('3,000 cr');
    if (action === 'receipt') { await goPlace(page, 'Window'); await takeFocused(page); }
    else {
      await goPlace(page, 'Studio');
      await page.locator('#studio').getByRole('button', { name: 'Book a temp', exact: true }).click();
    }
    const target = action === 'receipt' ? 3900 : 2650;
    const observed = await page.waitForFunction(({ start, target }) => {
      const text = document.querySelector('.stat-cash strong .rolling > span')?.textContent ?? '';
      const shown = Number(text.replace(/[^0-9-]/g, ''));
      return shown > Math.min(start, target) && shown < Math.max(start, target) ? shown : null;
    }, { start: 3000, target }, { polling: 'raf', timeout: 2000 });
    const intermediate = await observed.jsonValue();
    expect(intermediate).toBeGreaterThan(Math.min(3000, target));
    expect(intermediate).toBeLessThan(Math.max(3000, target));
    await expect(cashButton).toHaveAttribute('aria-label', new RegExp(`^Cash ${target.toLocaleString('en-GB')} cr,`));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(visual).toHaveText(`${target.toLocaleString('en-GB')} cr`);
    await page.waitForTimeout(1100);
    await expect(visual).toHaveText(`${target.toLocaleString('en-GB')} cr`);
    await expect(cashButton).toHaveAttribute('aria-label', new RegExp(`^Cash ${target.toLocaleString('en-GB')} cr,`));
    const saved: { config: { scenarioId: string; seed: string }; commands: Command[] } = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]')[0]);
    const rebuilt = replay(saved.config, saved.commands);
    expect(rebuilt.errors).toEqual([]);
    expect(rebuilt.state.cash).toBe(target);
    expect(saved.commands.at(-1)?.type).toBe(action === 'receipt' ? 'accept' : 'temp');
  });
}
