import { VIEW_H, VIEW_W } from './iso';

/** During playback the phone shows the whole working studio, from briefing to the parcel rack. */
export function phoneView(width: number, played: boolean, pan: number) {
  const w = played ? 656 : Math.max(340, Math.min(520, width * 1.07));
  const h = w * 0.74;
  const x = Math.max(0, Math.min(VIEW_W - w, (played ? 280 : 20) + pan));
  const y = Math.max(0, Math.min(VIEW_H - h, Math.max(30, 352 - h) + (x - 20) * 0.27));
  return { x, y, w, h };
}
