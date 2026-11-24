import { DUR } from '../motion';
import { BAYS, BAY_BOX, PRESS_BOX, type Bay, type Vec3 } from './signatureTargets';
import { boxCorners, fitShot, hitRect, projectBox, separate, type Pose, type Stage, type WorldTarget } from './worldProjection';

export type Shot = 'choose' | 'press' | 'street' | 'read';
const choose = boxCorners({ min: [-1.15, 1.15, 6.03], max: [1.95, 3.15, 6.03] });
const street = [
  ...boxCorners({ min: [-1.35, .2, 6.05], max: [2.25, 3.2, 6.05] }),
  ...boxCorners({ min: [-.65, .05, 4.3], max: [1.51, 1.75, 4.3] }),
];
const press = boxCorners({ min: [PRESS_BOX.min[0], .5, PRESS_BOX.min[2]], max: [PRESS_BOX.max[0], 2, PRESS_BOX.max[2]] });
const posterDirection: Vec3 = [0, .18, -.984];
export const CAMERA_MS = DUR.moment;
export function signaturePose(shot: Shot, stage: Stage, bay: Bay = 'room', compactRead = stage.width <= 700): Pose {
  if (shot === 'choose') return fitShot(choose, [.4, 2.1, 6.03], [0, .30, -.954], stage, .04);
  if (shot === 'street') return fitShot(street, [.45, 1.55, 5.4], [0, .5, -.866], stage, .04);
  if (shot === 'press') return fitShot(press, [1.49, 1.25, -2.2], [.62, .55, .56], stage, .05);
  const target = BAYS[bay].centre;
  const fraction = compactRead ? .62 : .50;
  const distance = .72 / (2 * fraction * Math.tan(35 * Math.PI / 360));
  const scaled = distance / Math.hypot(...posterDirection);
  return {
    position: [target[0], target[1] + posterDirection[1] * scaled, target[2] + posterDirection[2] * scaled],
    target, fov: 35, viewShiftPx: (stage.width - stage.availWidth) / 2,
  };
}

export function signatureTargets(shot: Shot, pose: Pose, stage: Stage, other?: Bay): WorldTarget[] {
  const fit = (target: WorldTarget) => target.w >= 44 && target.h >= 44
    && target.x >= 0 && target.y >= 0 && target.x + target.w <= stage.availWidth && target.y + target.h <= stage.height;
  if (shot === 'street' && other) {
    const visual = projectBox(BAY_BOX(other), pose, stage);
    const target: WorldTarget = { id: `bay:${other}`, visual, ...hitRect(visual) };
    return fit(target) ? [target] : [];
  }
  if (shot !== 'choose' && shot !== 'press') return [];
  if (shot === 'press') {
    const visual = projectBox(PRESS_BOX, pose, stage);
    const target: WorldTarget = { id: 'press', visual, ...hitRect(visual) };
    return fit(target) ? [target] : [];
  }
  const room = projectBox(BAY_BOX('room'), pose, stage);
  const band = projectBox(BAY_BOX('band'), pose, stage);
  if (Math.abs(room.x + room.w / 2 - band.x - band.w / 2) < 48) return [];
  const [a, b] = separate(hitRect(room), hitRect(band));
  const targets: WorldTarget[] = [{ id: 'bay:room', visual: room, ...a }, { id: 'bay:band', visual: band, ...b }];
  return targets.every(fit) ? targets : [];
}
