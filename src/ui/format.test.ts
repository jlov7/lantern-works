import { expect, it } from 'vitest';
import { pct } from './format';

it('does not round a below-threshold reliability into medal eligibility', () => {
  expect(pct(26 / 29)).toBe('89.6%');
  expect(pct(0.899999)).toBe('89.9%');
  expect(pct(0.9 - Number.EPSILON)).toBe('89.9%');
  expect(pct(0.9)).toBe('90%');
  expect(pct(0.90001)).toBe('90%');
  expect(pct(1)).toBe('100%');
  expect(pct(null)).toBe('n/a');
});
