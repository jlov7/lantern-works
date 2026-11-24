import { describe, expect, it } from 'vitest';
import { fillFraction } from './fill';

describe('fillFraction', () => {
  it('returns the portion of available space', () => {
    expect(fillFraction(0, 8)).toBe(0);
    expect(fillFraction(2, 8)).toBe(0.25);
    expect(fillFraction(8, 8)).toBe(1);
  });

  it('clamps fills beyond either end and handles missing capacity', () => {
    expect(fillFraction(-2, 8)).toBe(0);
    expect(fillFraction(10, 8)).toBe(1);
    expect(fillFraction(2, 0)).toBe(0);
    expect(fillFraction(2, -8)).toBe(0);
  });
});
