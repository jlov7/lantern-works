// The season postcard: the end screen's miniature drawn onto paper with a postmark (street, date, seed) and the numbers.
// The SVG is cloned with its computed styles inlined, because an SVG drawn as an image cannot see the page's CSS.
import { RULES } from '../../engine/rules';

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'stop-color',
  'stop-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'transform',
  'transform-origin',
  'visibility',
  'display',
  'mix-blend-mode',
  'filter',
] as const;

/** A standalone copy of a live SVG: full view, every computed style written onto the element, no animation. */
export function standaloneSvg(src: SVGSVGElement, width: number, height: number, viewBox: string): string {
  const clone = src.cloneNode(true) as SVGSVGElement;
  const from = [src, ...src.querySelectorAll('*')];
  const to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const target = to[i] as SVGElement | undefined;
    if (!target) return;
    const cs = getComputedStyle(el);
    const parts: string[] = [];
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== 'none' && v !== 'normal') parts.push(`${p}:${v}`);
      else if (p === 'display' && v === 'none') parts.push('display:none');
    }
    parts.push('animation:none', 'transition:none');
    target.setAttribute('style', parts.join(';'));
    target.removeAttribute('class');
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', viewBox);
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error('The picture took too long to load.')), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('The picture could not be drawn.')); };
    img.src = source;
  });
}

/** SVG images cannot fetch nested images. Embed bundled artwork before drawing it. */
async function svgImage(markup: string): Promise<HTMLImageElement> {
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  await Promise.all([...document.querySelectorAll('image')].map(async image => {
    const href = image.getAttribute('href');
    if (!href || href.startsWith('data:')) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) throw new Error('The artwork has an external image.');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('The artwork image could not be loaded.');
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('The artwork image could not be read.'));
      reader.readAsDataURL(blob);
    });
    image.setAttribute('href', data);
  }));
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(document))}`);
}

/** Freeze one selected place before image loading yields to another player action. */
function captureNeighbourhood(scene: HTMLElement) {
  const rect = scene.getBoundingClientRect();
  const background = getComputedStyle(scene).backgroundImage;
  const url = /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
  if (!url || !rect.width || !rect.height) throw new Error('The scene has no picture.');
  const boxFor = (element: Element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left - rect.left, y: box.top - rect.top, width: box.width, height: box.height };
  };
  const print = scene.querySelector<HTMLElement>('.neighbourhood-print');
  const artwork = print?.querySelector<SVGSVGElement>('svg');
  const printBox = print ? boxFor(print) : null;
  const credits = scene.parentElement?.querySelector('.neighbourhood-credits');
  const names = [...credits?.querySelectorAll('li') ?? []].map(person => person.textContent?.trim() ?? '').filter(Boolean);
  const credit = names.length ? `${credits?.querySelector('p')?.textContent}: ${new Intl.ListFormat('en-GB').format(names)}.` : null;
  return {
    url, width: rect.width, height: rect.height,
    print: printBox && artwork ? { ...printBox, markup: standaloneSvg(artwork, printBox.width - 14, printBox.height - 14, artwork.getAttribute('viewBox') ?? '0 0 420 560') } : null,
    credit,
  };
}

async function drawNeighbourhood(g: CanvasRenderingContext2D, scene: ReturnType<typeof captureNeighbourhood>, x: number, y: number, width: number, height: number) {
  const image = await loadImage(scene.url);
  g.save();
  try {
    g.beginPath(); g.rect(x, y, width, height); g.clip();
    g.translate(x, y); g.scale(width / scene.width, height / scene.height);
    const scale = Math.max(scene.width / image.naturalWidth, scene.height / image.naturalHeight);
    g.drawImage(image, (scene.width - image.naturalWidth * scale) / 2, (scene.height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    const shade = g.createLinearGradient(0, 0, scene.width, 0);
    shade.addColorStop(0, '#20291ed6'); shade.addColorStop(.58, '#18261f26'); shade.addColorStop(1, '#1a211b50');
    g.fillStyle = shade; g.fillRect(0, 0, scene.width, scene.height);
    if (scene.print) {
      const box = scene.print;
      const art = await svgImage(box.markup);
      g.fillStyle = '#efdfbf'; g.shadowColor = '#17160c99'; g.shadowBlur = 12; g.shadowOffsetY = 5;
      g.fillRect(box.x, box.y, box.width, box.height);
      g.shadowColor = 'transparent';
      g.drawImage(art, box.x + 7, box.y + 7, box.width - 14, box.height - 14);
    }
  } finally { g.restore(); }
  if (scene.credit) {
    g.fillStyle = '#1d2b21ef';
    g.fillRect(x, y + height - 48, width, 48);
    g.fillStyle = '#fff3d8';
    g.font = '22px "Atkinson Hyperlegible", sans-serif';
    g.fillText(scene.credit, x + 22, y + height - 16, width - 44);
  }
}

export interface PostcardText {
  street: string;
  seed: string;
  title: string;
  line: string;
  medal: string;
  stats: [string, string][];
  date: Date;
  rules?: string;
}

/** Reads a colour token from the page so the canvas uses the same palette as the CSS. */
const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function paragraph(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, leading: number): number {
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      g.fillText(line, x, y);
      y += leading;
      line = word;
    } else line = next;
  }
  if (line) g.fillText(line, x, y);
  return y;
}

export async function drawPostcard(world: SVGSVGElement | HTMLElement | null, t: PostcardText): Promise<HTMLCanvasElement> {
  const picture = world instanceof SVGSVGElement ? standaloneSvg(world, 960, 560, world.getAttribute('viewBox') ?? '0 0 960 560') : world ? captureNeighbourhood(world) : null;
  await document.fonts.ready;
  const W = 1500;
  const H = 1000;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const paper = token('--paper');
  const shade = token('--paper-shade');
  const ink = token('--ink');
  const inkSoft = token('--ink-soft');
  const brick = token('--brick');
  const lamp = token('--lamp');
  const serif = '"Young Serif", Georgia, serif';
  const sans = '"Atkinson Hyperlegible", system-ui, sans-serif';

  // Paper with a deckled shade at the edge.
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = shade;
  g.lineWidth = 28;
  g.strokeRect(14, 14, W - 28, H - 28);

  // The miniature, framed like a photograph.
  const px = 60;
  const py = 60;
  const pw = 960;
  const ph = 560;
  g.fillStyle = ink;
  g.fillRect(px - 8, py - 8, pw + 16, ph + 16);
  try {
    if (!picture) throw new Error('The scene is not ready.');
    if (typeof picture === 'string') g.drawImage(await svgImage(picture), px, py, pw, ph);
    else await drawNeighbourhood(g, picture, px, py, pw, ph);
  } catch {
    g.fillStyle = ink;
    g.fillRect(px, py, pw, ph);
    g.fillStyle = paper;
    g.font = `28px ${sans}`;
    g.fillText('The picture could not be included.', px + 45, py + ph / 2);
  }

  // Title and line under the picture.
  g.fillStyle = ink;
  g.font = `52px ${serif}`;
  const titleBottom = paragraph(g, t.title, px, py + ph + 78, pw, 62);
  g.font = `28px ${sans}`;
  g.fillStyle = inkSoft;
  paragraph(g, t.line, px, titleBottom + 50, pw, 36);
  g.font = `24px ${sans}`;
  g.fillText(`Lantern Works. A fictional street. Rules ${t.rules ?? RULES.version}.`, px, H - 60);

  // Right column: medal and numbers.
  const rx = px + pw + 60;
  g.strokeStyle = shade;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(rx - 30, py + 220);
  g.lineTo(rx - 30, H - 70);
  g.stroke();
  g.fillStyle = ink;
  g.font = `34px ${serif}`;
  paragraph(g, t.medal, rx, py + 290, W - rx - 60, 40);
  t.stats.forEach(([k, v], i) => {
    g.fillStyle = ink;
    g.font = `48px ${serif}`;
    g.fillText(v, rx, py + 380 + i * 110);
    g.fillStyle = inkSoft;
    g.font = `24px ${sans}`;
    g.fillText(k, rx, py + 412 + i * 110);
  });

  // Postmark: two rings, street and date around a seed, with wavy cancel lines.
  const cx = W - 190;
  const cy = 170;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.18);
  g.strokeStyle = brick;
  g.fillStyle = brick;
  g.globalAlpha = 0.85;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, 0, 105, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 78, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.font = `17px ${serif}`;
  g.fillText(t.street.toUpperCase().slice(0, 18), 0, -18);
  g.font = `20px ${sans}`;
  g.fillText(t.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 0, 14);
  g.font = `16px ${sans}`;
  g.fillText(`SEED ${t.seed.toUpperCase().slice(0, 14)}`, 0, 42);
  g.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    for (let x = -330; x <= -120; x += 6) g.lineTo(x, i * 22 + Math.sin(x / 14) * 6);
    g.stroke();
  }
  g.restore();

  // A stamp in the corner, lamp-coloured, with a lantern.
  g.save();
  g.translate(W - 420, 70);
  g.fillStyle = lamp;
  g.fillRect(0, 0, 120, 150);
  g.strokeStyle = ink;
  g.lineWidth = 3;
  g.setLineDash([6, 5]);
  g.strokeRect(6, 6, 108, 138);
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(45, 45);
  g.lineTo(75, 45);
  g.moveTo(60, 32);
  g.lineTo(60, 45);
  g.moveTo(40, 52);
  g.lineTo(80, 52);
  g.lineTo(84, 104);
  g.lineTo(36, 104);
  g.closePath();
  g.moveTo(48, 118);
  g.lineTo(72, 118);
  g.stroke();
  g.restore();
  return c;
}
