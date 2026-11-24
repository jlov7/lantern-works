import type { Camera, PerspectiveCamera } from 'three';
import { EASE } from '../motion';
import { CAMERA_MS, signaturePose } from '../game/signatureCamera';
import { COMMIT_MS, pressEase } from '../game/pressPull';
import type { FirstOrderStage } from '../game/firstOrderScene';
import { signatureTime, type SignatureState } from '../game/signatureState';
import type { Vec3 } from '../game/signatureTargets';
import type { Pose, Stage } from '../game/worldProjection';

export function signatureSize(width: number, height: number, overlayWidth: number): Stage {
  return { width, height, availWidth: Math.max(1, overlayWidth > 0 ? width - overlayWidth - 12 : width) };
}

function blend(from: Vec3, to: Vec3, t: number): Vec3 {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

const fits = new WeakMap<Camera, { key: string; to: Pose; from?: Pose }>();
export function renderSignatureCamera(camera: Camera, stage: FirstOrderStage, size: Stage, state?: SignatureState) {
  if (!('isPerspectiveCamera' in camera) || !size.width || !size.height) return false;
  const perspective = camera as PerspectiveCamera;
  const now = signatureTime();
  const move = state?.move;
  const elapsed = move ? (move.pausedAt ?? now) - move.at : CAMERA_MS;
  const moving = !!move && !state?.reduced && elapsed < CAMERA_MS;
  const shot = move?.to ?? stage.shot;
  const key = [size.width, size.height, size.availWidth, shot, stage.selected, stage.compactRead, move?.from].join('/');
  let fit = fits.get(camera);
  if (fit?.key !== key) {
    const pose = (view: typeof shot) => signaturePose(view, view === 'choose' ? size : { ...size, availWidth: size.width }, stage.selected, stage.compactRead);
    fit = { key, to: pose(shot), from: move ? pose(move.from) : undefined };
    fits.set(camera, fit);
  }
  const { to, from } = fit;
  let { position, target, viewShiftPx } = to;
  if (moving && from) {
    const t = pressEase(Math.max(0, elapsed / CAMERA_MS), ...EASE.out);
    position = blend(from.position, to.position, t);
    target = blend(from.target, to.target, t);
    viewShiftPx = from.viewShiftPx + (to.viewShiftPx - from.viewShiftPx) * t;
  }
  if (stage.shot === 'press' && state && !state.reduced && !moving) {
    if (state.commitAt === null && state.pull > 0) position = blend(position, target, .02 * state.pull);
    const bite = state.commitAt === null ? -1 : now - state.commitAt - COMMIT_MS.bite;
    if (bite >= 0 && bite <= 80) position = [position[0], position[1] - .012 * Math.sin(bite / 80 * Math.PI), position[2]];
  }
  camera.position.set(...position);
  camera.lookAt(...target);
  if (viewShiftPx > 0) {
    if (!perspective.view?.enabled || perspective.view.offsetX !== viewShiftPx
      || perspective.view.width !== size.width || perspective.view.height !== size.height) {
      perspective.setViewOffset(size.width, size.height, viewShiftPx, 0, size.width, size.height);
    }
  } else if (perspective.view?.enabled) perspective.clearViewOffset();
  return moving && move.pausedAt === undefined;
}
