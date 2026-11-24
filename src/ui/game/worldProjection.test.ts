import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { signaturePose, signatureTargets, type Shot } from './signatureCamera';
import { hitRect, hitTest, project, separate, type WorldTarget } from './worldProjection';

describe('projected hit regions', () => {
  const stage = { width: 492, height: 324, availWidth: 237 };
  it.each<Shot>(['choose', 'press', 'street', 'read'])('matches Three for %s with its view offset', shot => {
    const pose = signaturePose(shot, stage);
    const camera = new PerspectiveCamera(35, stage.width / stage.height, .1, 100);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.setViewOffset(stage.width, stage.height, pose.viewShiftPx, 0, stage.width, stage.height);
    camera.updateMatrixWorld();
    for (let i = 0; i < 50; i++) {
      const point = new Vector3(...pose.target).addScaledVector(new Vector3(Math.sin(137 * i), Math.cos(159 * i), Math.sin(401 * i)), .12);
      const projected = project(point.toArray(), pose, stage);
      const actual = point.project(camera);
      expect(projected.x).toBeCloseTo((actual.x + 1) * stage.width / 2, 5);
      expect(projected.y).toBeCloseTo((1 - actual.y) * stage.height / 2, 5);
    }
  });
  it('preserves the centre when growing a target and separates two overlapping ones', () => {
    expect(hitRect({ x: 12, y: 10, w: 32, h: 27 })).toEqual({ x: 6, y: 1.5, w: 44, h: 44 });
    expect(separate({ x: 0, y: 8, w: 44, h: 44 }, { x: 40, y: 8, w: 44, h: 44 }))
      .toEqual([{ x: 0, y: 8, w: 42, h: 44 }, { x: 42, y: 8, w: 42, h: 44 }]);
  });
  it('uses the last registered target when regions share an edge', () => {
    const rect = { x: 0, y: 0, w: 44, h: 44 };
    const targets: WorldTarget[] = [{ ...rect, id: 'bay:room', visual: rect }, { ...rect, id: 'bay:band', visual: rect }];
    expect(hitTest(targets, 44, 22)?.id).toBe('bay:band');
    expect(hitTest(targets, 45, 22)).toBeNull();
  });
});

describe('Clem’s reference bay framing', () => {
  it.each([
    [361, 160, 203, 71, 67, 108],
    [350, 110, 237, 59, 55, 89],
    [492, 324, 237, 84, 82, 129],
    [808, 532, 384, 135, 133, 209],
  ])('fits the %d px stage with its reference overlay', (width, height, availWidth, visualWidth, visualHeight, expectedGap) => {
    const stage = { width, height, availWidth };
    const targets = signatureTargets('choose', signaturePose('choose', stage), stage);
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.w).toBeGreaterThanOrEqual(44);
      expect(target.h).toBeGreaterThanOrEqual(44);
      expect(Math.abs(target.visual.w - visualWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(target.visual.h - visualHeight)).toBeLessThanOrEqual(2);
    }
    const gap = targets[1]!.x + targets[1]!.w / 2 - targets[0]!.x - targets[0]!.w / 2;
    expect(Math.abs(gap - expectedGap)).toBeLessThanOrEqual(2);
    expect(gap).toBeGreaterThanOrEqual(48);
  });
});
