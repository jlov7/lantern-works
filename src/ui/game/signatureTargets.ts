export type Vec3 = readonly [number, number, number];
export type Box = { min: Vec3; max: Vec3 };
export type Bay = 'room' | 'band';

export const CLEM_FRONT = { position: [0.45, 0, 6.5] as Vec3, rotationY: Math.PI };
export const BAYS = {
  room: { centre: [1.40, 1.85, 6.03] as Vec3, size: [1.20, 1.30] },
  band: { centre: [-0.50, 1.85, 6.03] as Vec3, size: [1.20, 1.30] },
} as const;
export const BAY_BOX = (id: Bay): Box => ({
  min: [BAYS[id].centre[0] - .6, 1.2, 6.0],
  max: [BAYS[id].centre[0] + .6, 2.5, 6.0],
});
export const PRESS_ORIGIN: Vec3 = [1.45, 0, -2.2];
export const PRESS_BOX: Box = { min: [0.62, 0.52, -2.85], max: [2.36, 1.72, -1.60] };
export const PLATEN = { local: [0, 1.18, -0.12] as Vec3, restY: 1.42, contactY: 1.13 } as const;
export const WHEEL = { local: [0.84, 1.12, -0.05] as Vec3, radius: 0.6, pulledTurn: -Math.PI / 2 } as const;
export const QUEUE_Z = 4.3;
export const LEAVE_MS = 1600;
export const SIGNATURE_SHADOWS = false;
const EXIT_TURN = -Math.PI / 2;

export function leaverPose(index: number, time: number, reduced: boolean, bay?: Bay): { at: Vec3; turn: number; visible: boolean } {
  const x = bay ? BAYS[bay].centre[0] : -.65 + index * .72;
  const lane = bay ? 5.05 : 4.75;
  if (time <= 0) return { at: [x, 0, QUEUE_Z], turn: 0, visible: true };
  if (reduced) return { at: [x, 0, QUEUE_Z], turn: Math.PI, visible: time < 1200 };
  if (time <= 300) {
    const fraction = time / 300;
    return { at: [x, 0, QUEUE_Z + (lane - QUEUE_Z) * fraction], turn: EXIT_TURN * fraction, visible: true };
  }
  const fraction = Math.min(1, (time - 300) / (LEAVE_MS - 300));
  const ease = fraction * fraction * (3 - 2 * fraction);
  return { at: [x + (4.60 - x) * ease, 0, lane], turn: EXIT_TURN, visible: time <= LEAVE_MS };
}
