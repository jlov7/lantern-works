export function renderedFontPx(printWidthPx: number, fontUnits: number): number {
  return fontUnits * printWidthPx / 100;
}

export function minPrintWidthFor(fontUnits: number, minPx = 9): number {
  return Math.ceil(minPx * 100 / fontUnits);
}
