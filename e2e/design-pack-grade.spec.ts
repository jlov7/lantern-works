import { expect, test, type Locator, type Page } from '@playwright/test';
import { PALETTES } from '../src/engine/design';
import { meanHue } from '../src/ui/game/grade';
import { assertFrameBudget, axe, frameDeltas, shot, VIEWPORTS } from './design-pack-helpers';

test.describe.configure({ mode: 'default' });
test.use({
  serviceWorkers: 'block',
  launchOptions: process.platform === 'darwin' ? { args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] } : {},
});
test.beforeEach(({ browserName }, info) => test.skip(browserName !== 'chromium' || info.project.name !== 'desktop', 'Chromium viewports set per case'));

const ticket = 'LW-010';
const variants = { iphone: 'midnight', ipad: 'linen', desktop: 'poppy' } as const;
type Color = [number, number, number];
const channel = (byte: number) => {
  const value = byte / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
};
const linearRgb = ([r, g, b]: Color) => [channel(r), channel(g), channel(b)] as const;
const luminance = ([r, g, b]: ReturnType<typeof linearRgb>) => .2126 * r + .7152 * g + .0722 * b;

async function decode(page: Page, png: Buffer) {
  return page.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    image.close();
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  }, png.toString('base64'));
}

async function samplePlate(page: Page, plate: Locator, foreground: string) {
  await plate.scrollIntoViewIfNeeded();
  const bounds = (await plate.boundingBox())!;
  const masks = await plate.locator(foreground).evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const raster = await decode(page, await plate.screenshot({ scale: 'css' }));
  const top: Color[] = [];
  let light = 0;
  let pixels = 0;
  for (let y = 2; y < raster.height - 2; y++) {
    for (let x = 2; x < raster.width - 2; x++) {
      if (masks.some(box => bounds.x + x >= box.x && bounds.x + x < box.x + box.width &&
        bounds.y + y >= box.y && bounds.y + y < box.y + box.height)) continue;
      const index = (y * raster.width + x) * 4;
      const rgb: Color = [raster.rgba[index]!, raster.rgba[index + 1]!, raster.rgba[index + 2]!];
      light += luminance(linearRgb(rgb));
      pixels++;
      if (y < raster.height * .20) top.push(rgb);
    }
  }
  expect(pixels, 'Pixels of the plate outside the print and controls').toBeGreaterThan(0);
  const hue = meanHue(top);
  expect(Number.isFinite(hue), 'The top band has a mean hue').toBe(true);
  return { hue, luminance: light / pixels };
}

function withoutGrade(page: Page) {
  return page.addStyleTag({ content: `
    :is(.first-order-street, .clem-bench, .clem-window, .clem-window__stage)::after { content: none !important; }
    .first-order .clem-bench::before { filter: none !important; }
  ` });
}

async function compareGrade(page: Page, plate: Locator, foreground: string) {
  const original = await withoutGrade(page);
  const baseline = await samplePlate(page, plate, foreground);
  await original.evaluate(style => style.parentNode?.removeChild(style));
  return { baseline, graded: await samplePlate(page, plate, foreground) };
}

function spread(hues: number[]) {
  return Math.max(...hues.flatMap(a => hues.map(b => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)))));
}

function lab(color: Color) {
  const [r, g, b] = linearRgb(color);
  const f = (value: number) => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const x = f((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
  const y = f(.2126729 * r + .7151522 * g + .0721750 * b);
  const z = f((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as const;
}

async function checkPaper(page: Page, print: Locator, palette: typeof variants[keyof typeof variants]) {
  const original = await withoutGrade(page);
  const baseline = await decode(page, await print.screenshot({ scale: 'css' }));
  await original.evaluate(style => style.parentNode?.removeChild(style));
  const raster = await decode(page, await print.screenshot({ scale: 'css' }));
  expect([raster.width, raster.height]).toEqual([baseline.width, baseline.height]);
  const expected = PALETTES[palette].paper.match(/[a-f\d]{2}/g)!.map(byte => Number.parseInt(byte, 16)) as Color;
  for (let y = Math.floor(raster.height * .3); y < raster.height * .7; y++) {
    for (let x = Math.floor(raster.width * .3); x < raster.width * .7; x++) {
      const index = (y * raster.width + x) * 4;
      if (raster.rgba[index] !== baseline.rgba[index] || raster.rgba[index + 1] !== baseline.rgba[index + 1] ||
        raster.rgba[index + 2] !== baseline.rgba[index + 2]) throw new Error('The grade changed a centre pixel of the print');
    }
  }
  // The room edition prints its motif in the centre. Its right-hand paper margin crosses the same centreline.
  const x = Math.floor(raster.width * .85);
  const y = Math.floor(raster.height * .5);
  const index = (y * raster.width + x) * 4;
  const [lightness, a, b] = lab(expected);
  const [l2, a2, b2] = lab([raster.rgba[index]!, raster.rgba[index + 1]!, raster.rgba[index + 2]!]);
  const deltaE = Math.hypot(l2 - lightness, a2 - a, b2 - b);
  console.info(JSON.stringify({ step: await page.locator('.first-order').getAttribute('data-step'), palette, deltaE }));
  expect.soft(deltaE, `Paper centreline within ΔE 3 of ${PALETTES[palette].paper}`).toBeLessThanOrEqual(3);
}

async function benchLoaded(bench: Locator) {
  await bench.evaluate(async element => {
    const source = getComputedStyle(element, '::before').backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    if (!source) throw new Error('Bench plate is missing');
    const image = new Image();
    image.src = source;
    await image.decode();
  });
}

async function opening(page: Page, view: 'illustrated' | 'miniature') {
  await page.addInitScript(studioView => {
    localStorage.setItem('lantern.prefs.v1', JSON.stringify({ studioView, motion: 'reduce', sound: false }));
  }, view);
  await page.goto('/?opening=first-order');
  await page.evaluate(() => document.fonts.ready);
}

async function activate(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).press('Enter');
}

for (const viewport of ['iphone', 'ipad', 'desktop'] as const) {
  test(`grade leaves the print outside the colour layer on ${viewport}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[viewport]);
    await opening(page, 'illustrated');
    const street = page.locator('.first-order-street');
    const bench = page.locator('.clem-bench');
    const window = page.locator('.clem-window');
    const measure = viewport === 'iphone';
    const palette = variants[viewport];

    await street.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    const streetColors = measure ? await compareGrade(page, street, 'figcaption') : undefined;
    await shot(page, ticket, `${ticket}-${viewport}-street`);
    await axe(page, '.first-order');
    const meet = page.getByRole('button', { name: 'Meet Clem at the jazz bar', exact: true });
    await page.locator('.first-order-sound input').press('Tab');
    await expect(meet).toBeFocused();
    await expect(meet).toHaveCSS('outline-width', '2px');
    await meet.press('Enter');

    await benchLoaded(bench);
    await activate(page, PALETTES[palette].name);
    const benchColors = measure ? await compareGrade(page, bench, '.clem-proof') : undefined;
    await checkPaper(page, bench.locator('.clem-proof svg.designed-artwork__print'), palette);
    await shot(page, ticket, `${ticket}-${viewport}-design`);
    await axe(page, '.first-order');

    await activate(page, 'Book for 900 cr');
    await activate(page, 'Run the press');
    await checkPaper(page, page.locator('.print-lift__sheet'), palette);
    await axe(page, '.first-order');
    await activate(page, 'Lift Clem’s print');
    await activate(page, 'Hang it in Clem’s window');
    await expect(window).toHaveAttribute('data-backdrop', 'ready');
    const windowColors = measure ? await compareGrade(page, window, '.clem-window-print') : undefined;
    await checkPaper(page, window.locator('.clem-window-print > svg.designed-artwork__print'), palette);
    await shot(page, ticket, `${ticket}-${viewport}-window-end`);
    await axe(page, '.first-order');

    if (streetColors && benchColors && windowColors) {
      const samples = [streetColors, benchColors, windowColors];
      const baseline = spread(samples.map(sample => sample.baseline.hue));
      const graded = spread(samples.map(sample => sample.graded.hue));
      const reduction = 1 - graded / baseline;
      const luminanceChanges = samples.map(sample => sample.graded.luminance / sample.baseline.luminance - 1);
      console.info(JSON.stringify({ samples, baseline, graded, reduction, luminanceChanges }));
      expect(reduction, 'Reduction in the largest circular separation between top-band hues').toBeGreaterThanOrEqual(.30);
      for (const change of luminanceChanges) expect(Math.abs(change), 'Change in plate luminance').toBeLessThanOrEqual(.08);
    }
  });
}

test('the static grade holds the frame budget', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await opening(page, 'illustrated');
  await activate(page, 'Meet Clem at the jazz bar');
  await expect(page.locator('.clem-bench .clem-proof')).toBeVisible();
  const frames = await frameDeltas(page, async () => {}, 1000);
  assertFrameBudget(frames);
  expect(Math.max(...frames.deltas)).toBeLessThanOrEqual(33);
});

test('the miniature keeps its own morning light on iPhone', async ({ page, browser }) => {
  await page.setViewportSize(VIEWPORTS.iphone);
  await opening(page, 'illustrated');
  await activate(page, 'Meet Clem at the jazz bar');
  await benchLoaded(page.locator('.clem-bench'));
  await page.locator('.first-order-client img').evaluate((image: HTMLImageElement) => image.decode());
  const plate = await page.screenshot({ scale: 'css' });
  const miniature = await browser.newPage({ viewport: VIEWPORTS.iphone, serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    await opening(miniature, 'miniature');
    await activate(miniature, 'Meet Clem at the jazz bar');
    const world = miniature.locator('.first-order-world');
    await expect(world).toHaveAttribute('data-world-ready', 'true', { timeout: 20_000 });
    await expect(world).toHaveAttribute('data-world-painted', 'true');
    expect(await world.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
    const painted = await miniature.screenshot({ scale: 'css' });
    const compared = await page.evaluate(async images => {
      const bitmaps = await Promise.all(images.map(async encoded => {
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      }));
      const [before, after] = bitmaps;
      const canvas = document.createElement('canvas');
      canvas.width = before!.width + after!.width;
      canvas.height = before!.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(before!, 0, 0);
      context.drawImage(after!, before!.width, 0);
      for (const bitmap of bitmaps) bitmap.close();
      return canvas.toDataURL('image/png').split(',')[1]!;
    }, [painted.toString('base64'), plate.toString('base64')]);
    await shot(page, ticket, `${ticket}-iphone-world-vs-plate`, Buffer.from(compared, 'base64'));
  } finally {
    await miniature.close();
  }
});
