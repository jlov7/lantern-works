// Small per-browser game-screen memory: the guided first day, and the evening a reload should show.
// Kept apart from persist.ts (saves and share links). Every read and write tolerates blocked storage.

const KEY_GUIDE = 'lantern.guide.v1';
const KEY_EVENING = 'lantern.evening.v1';

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the game works without it.
  }
}

/** 'seen' once the guide is finished or skipped; 'replay' when settings ask for it again. */
export const guideState = (): 'new' | 'seen' | 'replay' => {
  const v = get(KEY_GUIDE);
  return v === 'seen' || v === 'replay' ? v : 'new';
};
export const markGuideSeen = (): void => set(KEY_GUIDE, 'seen');
/** For a settings control: show the guided first day again on the next season opened. */
export const replayGuide = (): void => set(KEY_GUIDE, 'replay');

/** The evening a run last closed and the player has not moved on from yet, so a reload shows it again. */
export function eveningUnseen(runId: string): number | null {
  try {
    const v = JSON.parse(get(KEY_EVENING) ?? 'null') as { runId?: unknown; day?: unknown } | null;
    return v && v.runId === runId && typeof v.day === 'number' ? v.day : null;
  } catch {
    return null;
  }
}
export const markEvening = (runId: string, day: number): void => set(KEY_EVENING, JSON.stringify({ runId, day }));
export const clearEvening = (): void => set(KEY_EVENING, null);
