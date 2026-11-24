import { describe, expect, it } from 'vitest';
import { framingTransform, STAGE } from './windowFraming';

describe('Clem’s storefront framing', () => {
  it('uses the whole photograph from the street', () => {
    expect(framingTransform('street')).toEqual({ scale: 1, txPct: 0, tyPct: 0 });
  });

  it('recreates the original window crop and registration', () => {
    const frame = framingTransform('window');
    const frameHeight = 1 / STAGE.frameAspect;
    expect(frame.scale).toBe(2.23);
    expect(frame.txPct).toBe(-111);
    expect(Math.abs(frame.tyPct - (-.32 * frameHeight * STAGE.imgAspect * 100))).toBeLessThan(.2);
    expect(frame.scale * STAGE.print.left + frame.txPct / 100).toBeCloseTo(.525, 3);
    expect(frame.scale * STAGE.print.width).toBeCloseTo(.13, 3);
  });

  it('centres a reading print 34% of the frame width at 22% of the height', () => {
    const frame = framingTransform('read');
    const print = STAGE.print;
    const scale = .34 / print.width;
    const txPct = (.5 - scale * (print.left + print.width / 2)) * 100;
    const tyPct = (.22 * STAGE.imgAspect / STAGE.frameAspect - scale * print.top) * 100;
    expect(Math.abs(frame.scale - scale)).toBeLessThan(.2);
    expect(Math.abs(frame.txPct - txPct)).toBeLessThan(.2);
    expect(Math.abs(frame.tyPct - tyPct)).toBeLessThan(.2);
  });
});
