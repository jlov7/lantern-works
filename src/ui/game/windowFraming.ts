export type WindowFraming = 'street' | 'window' | 'read';

export const STAGE = { imgAspect: 1440 / 811, frameAspect: 1.46, print: { left: .7332, top: .3930, width: .0583 } } as const;

// The frame is .685W tall and the image is .5625W tall. The old crop
// translates by -1.11W and -.32 of the frame height. The reading crop
// puts a .34W print at horizontal centre and .22 of the frame height.
const framing = {
  street: { scale: 1, txPct: 0, tyPct: 0 },
  window: { scale: 2.23, txPct: -111, tyPct: -38.9 },
  read: { scale: 5.83, txPct: -394.5, tyPct: -202.4 },
} as const;

export function framingTransform(view: WindowFraming) {
  return framing[view];
}
