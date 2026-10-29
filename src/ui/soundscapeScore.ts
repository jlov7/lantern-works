export type SoundscapeScene = 'window' | 'design' | 'work' | 'evening' | 'gathering';
export interface SoundscapeState {
  scene: SoundscapeScene;
  attention?: boolean;
  /** A commission or relationship the player has actually earned. */
  relationship?: boolean;
}
export interface ScoreNote {
  at: number;
  duration: number;
  midi: number;
  gain: number;
  material?: true;
}
export interface SoundscapePhrase { notes: ScoreNote[]; duration: number; rest: number }

export const SOUNDSCAPE_GAIN = 0.32;
export const MAX_SOUNDSCAPE_VOICES = 10;
export const MAX_NOTE_GAIN = 0.045;
export const ATTENTION_GAIN = 0.3;

// Four-bar miniatures. The second phrase answers the first before returning home.
const chords = {
  window: [[50, 57, 65], [46, 57, 62], [53, 60, 67], [48, 55, 64]],
  design: [[50, 57, 64], [55, 62, 65], [46, 53, 62], [50, 57, 65]],
  work: [[50, 57, 65], [53, 60, 69], [48, 55, 64], [50, 57, 65]],
  evening: [[46, 53, 62], [53, 60, 64], [48, 55, 62], [50, 57, 65]],
  gathering: [[53, 60, 69], [46, 53, 65], [48, 55, 64], [53, 60, 67]],
} as const;
const melody = [[62, 69, 65, 64], [62, 65, 69, 67], [69, 72, 67, 65], [64, 67, 64, 62]] as const;
const answer = [[65, 69, 72, 69], [65, 62, 60, 62], [67, 69, 65, 64], [64, 62, 57, 62]] as const;

/** Deterministic score; phrase number changes its answer and orchestration, never its bounds. */
export function composePhrase(state: SoundscapeState, phraseNumber = 0): SoundscapePhrase {
  const beat = 60 / ({ window: 70, design: 78, work: 82, evening: 64, gathering: 76 }[state.scene]);
  const notes: ScoreNote[] = [];
  const tune = phraseNumber % 2 ? answer : melody;
  const register = state.scene === 'evening' ? -12 : 0;
  const sparse = state.scene === 'window' || state.scene === 'evening';
  for (let bar = 0; bar < 4; bar++) {
    const at = bar * 4 * beat;
    chords[state.scene][bar]!.forEach((midi, i) => notes.push({ at: at + i * 0.07, midi, duration: beat * 2.7, gain: 0.024 }));
    tune[bar]!.forEach((midi, i) => {
      if (sparse && i === 1) return;
      notes.push({ at: at + (i + 0.25) * beat, midi: midi + register, duration: beat * (i === 3 ? 0.65 : 0.7), gain: 0.04 });
    });
    // A soft paper movement, or distant street wash. Every texture ends within the phrase.
    if (bar === 0 || bar === 2) notes.push({ at: at + beat * 1.4, midi: state.scene === 'window' ? 42 : 70, duration: beat * 1.1, gain: state.scene === 'window' ? 0.016 : 0.009, material: true });
  }
  // The same D-A-F turn returns as an answering voice after earned shared work.
  if (state.relationship) [74, 81, 77, 76].forEach((midi, i) => notes.push({ at: (8.5 + i * 1.6) * beat, midi, duration: beat * 0.8, gain: 0.018 }));
  return { notes: notes.sort((a, b) => a.at - b.at), duration: beat * 16, rest: sparse ? 5 : 3 };
}
