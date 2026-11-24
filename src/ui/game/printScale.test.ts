import { describe, expect, it } from 'vitest';
import { minPrintWidthFor, renderedFontPx } from './printScale';

describe('square print scale', () => {
  it('converts the artwork font units to CSS pixels', () => {
    expect(renderedFontPx(208, 2.8)).toBeCloseTo(5.824);
    expect(renderedFontPx(324, 2.8)).toBeCloseTo(9.072);
  });

  it('rounds the width up to meet the required size', () => {
    expect(minPrintWidthFor(3)).toBe(300);
    expect(minPrintWidthFor(3, 7)).toBe(234);
  });
});
