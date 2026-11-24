import { expect, it } from 'vitest';
import { clockLabel } from './timeline';

it('labels the two real first-order delivery minutes on the workday clock', () => {
  expect(clockLabel(333)).toBe('2:33pm');
  expect(clockLabel(288)).toBe('1:48pm');
});
