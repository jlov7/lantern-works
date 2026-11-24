import { describe, expect, it } from 'vitest';
import { signaturePose, signatureTargets, type Shot } from './signatureCamera';

describe('first order framing', () => {
  it.each([
    [361, 160, 203, 'choose', 4.53], [350, 110, 237, 'choose', 3.77],
    [492, 324, 237, 'choose', 7.62], [808, 532, 384, 'choose', 7.72],
    [361, 233, 361, 'press', 4.70], [350, 226, 350, 'press', 4.70],
    [492, 324, 492, 'press', 4.70], [808, 532, 808, 'press', 4.70],
    [361, 233, 361, 'street', 6.58], [808, 532, 808, 'street', 6.58],
    [361, 90, 361, 'choose', 3.77], [350, 72, 350, 'choose', 3.77],
  ] as const)('%s × %s at %s available, %s', (width, height, availWidth, shot, distance) => {
    const stage = { width, height, availWidth };
    const pose = signaturePose(shot, stage);
    expect(Math.hypot(...pose.position.map((value, index) => value - pose.target[index]!))).toBeCloseTo(distance, 1);
    const targets = signatureTargets(shot satisfies Shot, pose, stage);
    expect(targets).toHaveLength(shot === 'choose' ? 2 : shot === 'press' ? 1 : 0);
    for (const box of targets) {
      expect(box.w).toBeGreaterThanOrEqual(44);
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(availWidth);
      expect(box.y + box.h).toBeLessThanOrEqual(height);
    }
    if (targets.length === 2) {
      const [a, b] = targets;
      expect(a!.x + a!.w).toBeLessThanOrEqual(b!.x);
      expect(b!.x + b!.w / 2 - a!.x - a!.w / 2).toBeGreaterThanOrEqual(48);
    }
  });
});
