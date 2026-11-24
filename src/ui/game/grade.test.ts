import { describe, expect, it } from 'vitest';
import { meanHue } from './grade';

describe('meanHue', () => {
  it('averages across the red seam of the hue wheel', () => {
    expect(meanHue([[255, 17, 0], [255, 0, 17]])).toBeCloseTo(0);
  });

  it('ignores greys and weights chromatic pixels equally', () => {
    expect(meanHue([[128, 128, 128], [0, 30, 30], [0, 0, 255]])).toBeCloseTo(210);
  });

  it('has no direction for greys or equally opposed hues', () => {
    expect(meanHue([[128, 128, 128]])).toBeNaN();
    expect(meanHue([[255, 0, 0], [0, 255, 255]])).toBeNaN();
  });
});
