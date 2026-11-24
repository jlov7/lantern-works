import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

it('limits attempted pulses to once in 100 ms and sends the two durations', async () => {
  let time = 0;
  const vibrate = vi.fn();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('navigator', { maxTouchPoints: 1, userActivation: { isActive: true }, vibrate });
  const { haptic } = await import('./haptics');
  haptic('tick');
  time = 99;
  haptic('thud');
  time = 100;
  haptic('thud');
  expect(vibrate.mock.calls).toEqual([[8], [18]]);
});

it('leaves desktop and expired activation silent', async () => {
  const vibrate = vi.fn();
  const platform = { maxTouchPoints: 0, userActivation: { isActive: true }, vibrate };
  vi.stubGlobal('navigator', platform);
  const { haptic } = await import('./haptics');
  haptic('tick');
  platform.maxTouchPoints = 1;
  platform.userActivation.isActive = false;
  haptic('thud');
  expect(vibrate).not.toHaveBeenCalled();
});
