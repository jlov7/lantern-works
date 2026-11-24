import type { Box, Vec3 } from './signatureTargets';

export type Stage = { width: number; height: number; availWidth: number };
export type Pose = { position: Vec3; target: Vec3; fov: 35; viewShiftPx: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type TargetId = 'bay:room' | 'bay:band' | 'press';
export type WorldTarget = Rect & { id: TargetId; visual: Rect };

const field = Math.tan(35 * Math.PI / 360);
function minus(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function unit(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function project(point: Vec3, pose: Pose, stage: Stage) {
  const forward = unit(minus(pose.target, pose.position));
  const side = unit(cross(forward, [0, 1, 0]));
  const up = cross(side, forward);
  const fromCamera = minus(point, pose.position);
  const depth = dot(forward, fromCamera);
  const scale = stage.height / (2 * field * depth);
  return {
    x: stage.width / 2 + dot(side, fromCamera) * scale - pose.viewShiftPx,
    y: stage.height / 2 - dot(up, fromCamera) * scale,
    depth,
  };
}
export function boxCorners({ min, max }: Box): Vec3[] {
  return [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => [x, y, z] as const)));
}
export function projectBox(box: Box, pose: Pose, stage: Stage): Rect {
  const points = boxCorners(box).map(point => project(point, pose, stage));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function hitRect(visual: Rect, minPx = 44): Rect {
  const w = Math.max(minPx, visual.w);
  const h = Math.max(minPx, visual.h);
  return { x: visual.x - (w - visual.w) / 2, y: visual.y - (h - visual.h) / 2, w, h };
}
export function separate(a: Rect, b: Rect): [Rect, Rect] {
  if (a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y) return [a, b];
  const aCentre = a.x + a.w / 2;
  const bCentre = b.x + b.w / 2;
  const split = (aCentre + bCentre) / 2;
  const left = (rect: Rect) => ({ ...rect, w: Math.min(rect.w, split - rect.x) });
  const right = (rect: Rect) => {
    const x = Math.max(rect.x, split);
    return { ...rect, x, w: rect.x + rect.w - x };
  };
  return aCentre <= bCentre ? [left(a), right(b)] : [right(a), left(b)];
}
export function fitShot(points: readonly Vec3[], target: Vec3, direction: Vec3, stage: Stage, margin: number): Pose {
  const dir = unit(direction);
  const viewShiftPx = (stage.width - stage.availWidth) / 2;
  const poseAt = (distance: number): Pose => ({
    position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    target, fov: 35, viewShiftPx,
  });
  const horizontal = stage.availWidth * margin;
  const vertical = stage.height * margin;
  let lo = 1;
  let hi = 20;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const pose = poseAt(mid);
    const fits = points.every(point => {
      const { x, y, depth } = project(point, pose, stage);
      return depth > .1 && x >= horizontal && x <= stage.availWidth - horizontal && y >= vertical && y <= stage.height - vertical;
    });
    if (fits) hi = mid;
    else lo = mid;
  }
  return poseAt(hi);
}
export function hitTest(targets: readonly WorldTarget[], x: number, y: number): WorldTarget | null {
  return targets.findLast(target => x >= target.x && x <= target.x + target.w && y >= target.y && y <= target.y + target.h) ?? null;
}
