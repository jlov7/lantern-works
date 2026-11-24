import type { Shot } from './signatureCamera';
import type { Bay } from './signatureTargets';

export type SignatureSurface = Bay | 'press';
export type SignatureState = {
  seq: number;
  reduced: boolean;
  hover: SignatureSurface | null;
  pressed: SignatureSurface | null;
  focus: Bay | null;
  pull: number;
  commitAt: number | null;
  springAt: number | null;
  idleAt: number | null;
  leaveAt: number | null;
  move: { from: Shot; to: Shot; at: number; pausedAt?: number } | null;
  hang: { key: string; at: number } | null;
};

export function initialSignature(reduced: boolean): SignatureState {
  return { seq: 0, reduced, hover: null, pressed: null, focus: null, pull: 0, commitAt: null, springAt: null, idleAt: null, leaveAt: null, move: null, hang: null };
}

export function signatureTime(): number {
  return performance.timeOrigin + performance.now();
}

/** Update the renderer at pointer rate without rerendering the opening screen. */
export function signatureChannel(reduced: boolean) {
  let value = initialSignature(reduced);
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    update(patch: Partial<Omit<SignatureState, 'seq'>>) {
      value = { ...value, ...patch, seq: value.seq + 1 };
      for (const changed of listeners) changed();
      return value;
    },
    listen(changed: () => void) {
      listeners.add(changed);
      return () => { listeners.delete(changed); };
    },
  };
}
export type SignatureChannel = ReturnType<typeof signatureChannel>;
