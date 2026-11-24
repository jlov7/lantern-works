import { DUR, EASE } from '../motion';
import { PLATEN, WHEEL } from './signatureTargets';

export const PULL = {
  trackRatio: .68,
  minTrackPx: 120,
  commitAt: .72,
  flickVelocity: .9,
  flickMinProgress: .45,
  tapSlopPx: 6,
} as const;
export const COMMIT_MS = { bite: DUR.fast, hold: 90, release: DUR.slow, peelAt: 380 } as const;
export const BEAT_MS = { move: DUR.moment, walk: 1600, stagger: 180, settle: 110 } as const;
export const PRESS_MS = COMMIT_MS.bite + COMMIT_MS.hold + COMMIT_MS.release;
export const SPRING_MS = DUR.base;
export const REDUCED_BEAT_MS = 1400;

function clamp(progress: number) {
  return Math.max(0, Math.min(1, progress));
}
export function pullProgress(dyPx: number, track: number) {
  return clamp(dyPx / track);
}
export function shouldCommit(progress: number, velocityPxPerMs: number) {
  return progress >= PULL.commitAt || (progress >= PULL.flickMinProgress && velocityPxPerMs >= PULL.flickVelocity);
}
export function trackPx(benchHeight: number) {
  return Math.max(PULL.minTrackPx, Math.round(benchHeight * PULL.trackRatio));
}
export function worldTrackPx(pressHitHeight: number) {
  return Math.min(260, Math.max(PULL.minTrackPx, Math.round(pressHitHeight * .9)));
}
export function pressPose(progress: number, phase: 'drag' | 'bite' | 'release', t01: number) {
  const t = clamp(t01);
  const offset = .85 * clamp(progress);
  const pull = phase === 'drag' ? offset : phase === 'bite' ? offset + (1 - offset) * t : 1 - t;
  return {
    platenY: PLATEN.restY + (PLATEN.contactY - PLATEN.restY) * pull,
    wheelTurn: WHEEL.pulledTurn * pull,
    inkOpacity: phase === 'release' ? t : 0,
  };
}
export type PullSample = { y: number; at: number };
export function pullVelocity(samples: readonly PullSample[]) {
  const last = samples.at(-1);
  if (!last) return 0;
  const earlier = samples.find(sample => sample.at >= last.at - 80 && sample.at < last.at);
  return earlier ? (last.y - earlier.y) / (last.at - earlier.at) : 0;
}

export function pressFrame(state: { pull: number; commitAt: number | null; springAt: number | null; reduced: boolean }, now: number) {
  const { pull, commitAt, springAt, reduced } = state;
  if (commitAt !== null) {
    const elapsed = Math.max(0, now - commitAt);
    if (reduced) return elapsed < COMMIT_MS.bite
      ? { ...pressPose(1, 'bite', 1), animating: true }
      : { ...pressPose(0, 'release', 1), animating: false };
    const releaseAt = COMMIT_MS.bite + COMMIT_MS.hold;
    if (elapsed < releaseAt) {
      const fraction = Math.min(1, elapsed / COMMIT_MS.bite);
      return { ...pressPose(pull, 'bite', pressEase(fraction, ...EASE.in)), animating: true };
    }
    const fraction = clamp((elapsed - releaseAt) / COMMIT_MS.release);
    return { ...pressPose(0, 'release', pressEase(fraction, ...EASE.out)), animating: elapsed < PRESS_MS };
  }
  const fraction = springAt === null ? 0 : reduced ? 1 : clamp((now - springAt) / SPRING_MS);
  return { ...pressPose(pull * (1 - pressEase(fraction, ...EASE.out)), 'drag', 0), animating: springAt !== null && fraction < 1 };
}

export function pressEase(fraction: number, x1: number, y1: number, x2: number, y2: number) {
  if (fraction <= 0 || fraction >= 1) return clamp(fraction);
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2;
    if (curve(t, x1, x2) < fraction) lo = t;
    else hi = t;
  }
  return curve((lo + hi) / 2, y1, y2);
}
