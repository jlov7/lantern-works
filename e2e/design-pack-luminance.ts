import { inflateSync } from 'node:zlib';

type PrintableRect = { x: number; y: number; w: number; h: number };

function paeth(a: number, b: number, c: number) {
  const prediction = a + b - c;
  const da = Math.abs(prediction - a);
  const db = Math.abs(prediction - b);
  const dc = Math.abs(prediction - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

/** Read the non-interlaced RGB(A) PNGs produced by Playwright. */
export function readScreenshot(png: Buffer) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Expected a PNG screenshot');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colour = png[25];
  if (png[24] !== 8 || png[28] !== 0 || (colour !== 2 && colour !== 6)) throw new Error('Expected a non-interlaced, 8-bit RGB(A) PNG');
  const channels = colour === 6 ? 4 : 3;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const tag = png.toString('ascii', offset + 4, offset + 8);
    if (tag === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    if (tag === 'IEND') break;
    offset += length + 12;
  }
  const bytes = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (bytes.length !== height * (stride + 1)) throw new Error('Unexpected PNG raster length');
  const pixels = Buffer.alloc(height * stride);
  let last = Buffer.alloc(stride);
  let row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1);
    const filter = bytes[offset]!;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels]! : 0;
      const b = last[i]!;
      const c = i >= channels ? last[i - channels]! : 0;
      const decoder = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      row[i] = (bytes[offset + i + 1]! + decoder) & 255;
    }
    row.copy(pixels, y * stride);
    [row, last] = [last, row];
  }
  return { width, height, channels, pixels };
}

export function meanLuminance(png: Buffer, rect: PrintableRect) {
  const { width, height, channels, pixels } = readScreenshot(png);
  const left = Math.max(0, Math.floor(rect.x));
  const right = Math.min(width, Math.ceil(rect.x + rect.w));
  const top = Math.max(0, Math.floor(rect.y));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.h));
  if (right <= left || bottom <= top) throw new Error('The sample rectangle missed the image');
  let sum = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const at = (y * width + x) * channels;
    sum += (.2126 * pixels[at]! + .7152 * pixels[at + 1]! + .0722 * pixels[at + 2]!) / 255;
  }
  return sum / ((right - left) * (bottom - top));
}

export function changedPixels(a: ReturnType<typeof readScreenshot>, b: ReturnType<typeof readScreenshot>, rect?: PrintableRect) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('The screenshots must use the same dimensions');
  const left = rect ? Math.max(0, Math.floor(rect.x)) : 0;
  const right = rect ? Math.min(a.width, Math.ceil(rect.x + rect.w)) : a.width;
  const top = rect ? Math.max(0, Math.floor(rect.y)) : 0;
  const bottom = rect ? Math.min(a.height, Math.ceil(rect.y + rect.h)) : a.height;
  if (right <= left || bottom <= top) throw new Error('The sample rectangle missed the image');
  let changed = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const pixel = y * a.width + x;
    const before = pixel * a.channels;
    const after = pixel * b.channels;
    if (a.pixels[before] !== b.pixels[after] ||
        a.pixels[before + 1] !== b.pixels[after + 1] ||
        a.pixels[before + 2] !== b.pixels[after + 2]) changed++;
  }
  return changed / ((right - left) * (bottom - top));
}
