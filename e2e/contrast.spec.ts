// Text contrast against what is actually painted behind the text. axe leaves most of these "incomplete"
// because the body is a gradient, so this records each text element's colour, hides all text, screenshots
// the page, and composites the text colour over the real background pixels under each line of text.
// Checks WCAG 1.4.3: 4.5:1, or 3:1 for large text. The worst 5% of pixels decides, so anti-aliased edges
// of borders or icons inside a text box do not cause false failures.
import { expect, test, type Page } from '@playwright/test';

const STREET = '/#play=main-street:e2e-1';

interface Failure {
  text: string;
  /** Class of the element, or of its nearest classed ancestor. */
  where: string;
  ratio: number;
  needed: number;
}

/** Tags every visible element that owns text under `scope` and records its colour and threshold. */
async function tagTextElements(page: Page, scope: string): Promise<number> {
  return page.evaluate((scopeSelector) => {
    const root = document.querySelector(scopeSelector);
    if (!root) throw new Error(`no ${scopeSelector}`);
    const info: { fg: number[]; needed: number; text: string; where: string }[] = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      if (!own.length || el.closest('[aria-hidden="true"], :disabled, svg, canvas, option')) continue;
      let folded = false;
      for (let parent: Element | null = el.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches('details:not([open])') && !parent.querySelector(':scope > summary')?.contains(el)) { folded = true; break; }
      }
      if (folded) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.clipPath === 'inset(50%)') continue;
      let opacity = 1;
      for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      if (opacity === 0) continue;
      const p = cs.color.match(/rgba?\(([^)]+)\)/)![1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      el.setAttribute('data-contrast', String(info.length));
      info.push({ fg: [p[0]!, p[1]!, p[2]!, (p[3] ?? 1) * opacity], needed: large ? 3 : 4.5, text: own.map((n) => n.textContent!.trim()).join(' ').slice(0, 40), where: el.closest('[class]')?.className.toString() ?? '' });
    }
    (window as unknown as { __contrast: typeof info }).__contrast = info;
    return info.length;
  }, scope);
}

async function contrastFailures(page: Page, scope: string): Promise<Failure[]> {
  // Rival results and fonts can move lines between the screenshot and the pixel measurement.
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText('Street race: working out the other studios...', { exact: true })).toHaveCount(0, { timeout: 15_000 });
  // Cards rise in with a short fade: measure only once every animation has finished.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const total = await tagTextElements(page, scope);
  await page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' });
  const results = new Map<number, Failure | null>();
  const shoot = async (): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const layout = await page.locator('[data-contrast]').evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect();
        return [element.getAttribute('data-contrast'), r.x, r.y, r.width, r.height];
      }));
      const png = (await page.screenshot({ scale: 'css' })).toString('base64');
      const measured = await page.evaluate(
        async ({ png, done, layout }) => {
          const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bmp, 0, 0);
          const elements = [...document.querySelectorAll('[data-contrast]')];
          const currentLayout = elements.map(element => {
            const r = element.getBoundingClientRect();
            return [element.getAttribute('data-contrast'), r.x, r.y, r.width, r.height];
          });
          // A lazy scene or focus scroll can move text after the screenshot was taken.
          if (JSON.stringify(currentLayout) !== JSON.stringify(layout)) return null;
          const lum = (r: number, g: number, b: number) => {
            const ch = (v: number) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
          };
          const info = (window as unknown as { __contrast: { fg: number[]; needed: number; text: string; where: string }[] }).__contrast;
          // The text is on top if the hit is the element, inside it, around it, or shares its label or button.
          const covers = (el: Element, hit: Element | null) => !!hit && (el.contains(hit) || hit.contains(el) || (!!el.closest('label, button') && el.closest('label, button') === hit.closest('label, button')));
          // The action bar's fade (a pseudo-element, so elementFromPoint misses it) shades text scrolling under it.
          const bar = document.querySelector('.actionbar-row');
          const dock = document.querySelector('.actionbar');
          const floor = bar ? bar.getBoundingClientRect().top - parseFloat(getComputedStyle(bar, '::before').height || '0') : innerHeight;
          const out: [number, { text: string; where: string; ratio: number; needed: number } | null][] = [];
          for (const el of elements) {
            const i = Number(el.getAttribute('data-contrast'));
            if (done.includes(i)) continue;
            const rects = [...el.childNodes]
              .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())
              .flatMap((n) => {
                const r = document.createRange();
                r.selectNodeContents(n);
                return [...r.getClientRects()];
              })
              .filter((r) => r.width >= 1 && r.height >= 1);
            if (!rects.length) {
              out.push([i, null]);
              continue;
            }
            // Measure only when every line is on screen and not covered, even partly, by a sticky bar or its frame:
            // 35%, 50% and 65% of the way down each line (inside the glyphs, not the line box), at its start, middle
            // and end, must all hit the text.
            const clear = (r: DOMRect) =>
              [0.35, 0.5, 0.65].every((ky) => [0.05, 0.5, 0.95].every((kx) => covers(el, document.elementFromPoint(r.left + r.width * kx, r.top + r.height * ky))));
            const visible = rects.every((r) => r.top >= 0 && r.bottom <= (dock?.contains(el) ? innerHeight : floor) && r.left >= 0 && r.right <= innerWidth && clear(r));
            if (!visible) continue;
            const { fg, needed, text, where } = info[i]!;
            const ratios: number[] = [];
            for (const r of rects) {
              const data = ctx.getImageData(Math.floor(r.left), Math.floor(r.top), Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height))).data;
              for (let p = 0; p < data.length; p += 4) {
                const [br, bg, bb] = [data[p]!, data[p + 1]!, data[p + 2]!];
                const a = fg[3]!;
                const t = lum(fg[0]! * a + br * (1 - a), fg[1]! * a + bg * (1 - a), fg[2]! * a + bb * (1 - a));
                const b = lum(br, bg, bb);
                ratios.push((Math.max(t, b) + 0.05) / (Math.min(t, b) + 0.05));
              }
            }
            ratios.sort((x, y) => x - y);
            const ratio = ratios[Math.floor(ratios.length * 0.05)]!;
            out.push([i, ratio < needed ? { text, where, ratio: Math.round(ratio * 100) / 100, needed } : null]);
          }
          return out;
        },
        { png, done: [...results.keys()], layout },
      );
      if (measured === null) continue;
      for (const [i, f] of measured) results.set(i, f);
      return;
    }
    throw new Error('Layout moved during three consecutive contrast captures');
  };
  const unmeasured = () => page.evaluate((done) => [...document.querySelectorAll('[data-contrast]')].map((e) => Number(e.getAttribute('data-contrast'))).filter((i) => !done.includes(i)), [...results.keys()]);

  // Sweep down the page in half-screen steps, then bring anything still unmeasured (sideways scrollers) into view.
  const { height, scrollHeight } = await page.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight }));
  for (let y = 0; results.size < total && y < scrollHeight; y += Math.floor(height / 2)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await shoot();
  }
  for (const i of await unmeasured()) {
    if (results.has(i)) continue;
    await page.evaluate((n) => document.querySelector(`[data-contrast="${n}"]`)!.scrollIntoView({ block: 'center', inline: 'center' }), i);
    await shoot();
  }
  const missing = await page.evaluate((left) => left.map((i) => document.querySelector(`[data-contrast="${i}"]`)!.outerHTML.slice(0, 160)), await unmeasured());
  expect(missing, 'every text element was measured on screen').toEqual([]);
  return [...results.values()].filter((f): f is Failure => f !== null);
}

async function openDay(page: Page) {
  const option = page.locator('.news:not(.news-done) .news-option').first();
  if (await option.count()) await option.click();
  const down = page.locator('.hagglers').getByRole('button', { name: 'Turn down' });
  while (await down.count()) await down.first().click();
  await page.getByRole('button', { name: /^Open the shop for Day/ }).click();
  await expect(page.locator('.evening')).toBeVisible();
  // The next morning's planner changes the dock height when it settles.
  await expect(page.getByRole('button', { name: "Review tomorrow's window", exact: true })).toBeEnabled();
  await expect(page.locator('.miniature-world')).toBeVisible();
  await expect(page.locator('.miniature-world')).not.toHaveAttribute('data-renderer-choice', 'checking');
  const tryMiniature = page.getByRole('button', { name: 'Try miniature room', exact: true });
  if (await tryMiniature.isVisible()) await tryMiniature.click();
  await expect(page.locator('.work-place .miniature-world')).toHaveAttribute('data-rendered', 'true', { timeout: 15_000 });
}

test('title screen text meets contrast minimums', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
  expect(await contrastFailures(page, 'body')).toEqual([]);
});

test('morning game screen text meets contrast minimums', async ({ page }) => {
  await page.goto(STREET);
  await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
  expect(await contrastFailures(page, 'body')).toEqual([]);
});

test('evening screen text meets contrast minimums', async ({ page }) => {
  await page.goto(STREET);
  await openDay(page);
  expect(await contrastFailures(page, 'body')).toEqual([]);
});
