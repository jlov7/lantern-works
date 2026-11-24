/** Circular mean of HSL hues in degrees. Greys carry no hue. */
export function meanHue(rgb: number[][]): number {
  let cosine = 0;
  let sine = 0;
  for (const [r = 0, g = 0, b = 0] of rgb) {
    const max = Math.max(r, g, b);
    const range = max - Math.min(r, g, b);
    if (range === 0) continue;
    const sector = max === r ? (g - b) / range : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
    cosine += Math.cos(sector * Math.PI / 3);
    sine += Math.sin(sector * Math.PI / 3);
  }
  if (Math.hypot(cosine, sine) < 1e-9) return NaN;
  return (Math.atan2(sine, cosine) * 180 / Math.PI + 360) % 360;
}
