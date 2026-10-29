import { describe, expect, it } from 'vitest';
import { regularLine } from './regulars';

describe('what a regular says', () => {
  it('talks about the last launch on a second visit and counts the visits after that', () => {
    expect(regularLine('small', 1, 0)).toMatch(/last one/);
    expect(regularLine('rush', 2, 0)).toBe('Third time. You are the only studio I call in a panic now.');
    expect(regularLine('careful', 4, 3)).toMatch(/^5th time\. /);
  });
});
