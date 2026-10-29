import type { AudioBus } from './sound';
import { ATTENTION_GAIN, composePhrase, MAX_NOTE_GAIN, MAX_SOUNDSCAPE_VOICES, SOUNDSCAPE_GAIN, type ScoreNote, type SoundscapeState } from './soundscapeScore';

export type { SoundscapeState, SoundscapeScene } from './soundscapeScore';
const LOOKAHEAD = 0.6;
export const SCHEDULER_MS = 250;

interface Voice { stop: () => void }

/** Also used by the offline render check. All envelopes and sources have a finite end. */
export function renderScoreNote(a: BaseAudioContext, out: AudioNode, note: ScoreNote, at: number, ended: () => void = () => {}): Voice {
  const gain = a.createGain();
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = note.material ? (note.midi < 50 ? 430 : 1800) : 1500;
  filter.Q.value = 0.35;
  let source: AudioScheduledSourceNode;
  if (note.material) {
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * note.duration), a.sampleRate);
    const data = buffer.getChannelData(0);
    // Seeded noise makes offline checks repeatable without external recordings.
    let seed = 9127;
    for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741824 - 1; }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    source = noise;
  } else {
    const oscillator = a.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
    source = oscillator;
  }
  const level = Math.min(MAX_NOTE_GAIN, Math.max(0, note.gain));
  const attack = note.material ? 0.12 : 0.012;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.32), at + note.duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
  gain.gain.linearRampToValueAtTime(0, at + note.duration + 0.04);
  source.connect(filter).connect(gain).connect(out);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    source.disconnect(); filter.disconnect(); gain.disconnect(); ended();
  };
  source.onended = release;
  source.start(at);
  source.stop(at + note.duration + 0.05);
  return { stop: () => { if (!released) { try { source.stop(); } catch { /* An ended source is already silent. */ } release(); } } };
}

export interface SoundscapeHandle {
  /** The hook supplies a bus unlocked by the player's gesture. Idempotent while running. */
  start: (bus: AudioBus) => void;
  update: (state: SoundscapeState) => void;
  stop: () => void;
  snapshot: () => { running: boolean; voices: number; scheduled: number };
}

export function createSoundscape(initial: SoundscapeState): SoundscapeHandle {
  let state = initial;
  let bus: AudioBus | null = null;
  let mix: GainNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let phraseNumber = 0;
  let phrase = composePhrase(state);
  let phraseAt = 0;
  let cursor = 0;
  let generation = 0;
  const voices = new Set<Voice>();

  const stop = () => {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const voice of voices) voice.stop();
    voices.clear();
    mix?.disconnect();
    mix = null;
    bus = null;
    cursor = 0;
  };
  const tick = () => {
    if (!bus || !mix) return;
    const { a } = bus;
    // Suspended tabs and interrupted devices must not keep a silent scheduler alive.
    if (a.state !== 'running') { stop(); return; }
    const horizon = a.currentTime + LOOKAHEAD;
    // A stalled page advances once to a fresh phrase, never catches up missed notes.
    if (a.currentTime > phraseAt + phrase.duration + phrase.rest) {
      phrase = composePhrase(state, ++phraseNumber); phraseAt = a.currentTime + 0.1; cursor = 0;
    }
    while (cursor < phrase.notes.length && phraseAt + phrase.notes[cursor]!.at <= horizon) {
      const note = phrase.notes[cursor++]!;
      const at = phraseAt + note.at;
      if (at < a.currentTime || voices.size >= MAX_SOUNDSCAPE_VOICES) continue;
      let voice: Voice;
      voice = renderScoreNote(a, mix, note, at, () => voices.delete(voice));
      voices.add(voice);
    }
    timer = setTimeout(tick, SCHEDULER_MS);
  };
  return {
    start: (unlocked) => {
      if (bus) return;
      const started = ++generation;
      // resume() can settle after the gesture; no timer starts before it succeeds.
      const begin = () => {
        if (generation !== started || bus !== unlocked) return;
        if (unlocked.a.state !== 'running') { stop(); return; }
        mix = unlocked.a.createGain();
        mix.gain.value = SOUNDSCAPE_GAIN * (state.attention ? ATTENTION_GAIN : 1);
        mix.connect(unlocked.out);
        phraseNumber = 0; phrase = composePhrase(state); cursor = 0;
        phraseAt = unlocked.a.currentTime + 0.1;
        tick();
      };
      bus = unlocked;
      if (unlocked.a.state === 'running') begin();
      else void unlocked.a.resume().then(begin).catch(() => { if (generation === started) stop(); });
    },
    update: (next) => {
      const changedScene = state.scene !== next.scene || state.relationship !== next.relationship;
      state = next;
      if (bus && mix) {
        const now = bus.a.currentTime;
        mix.gain.cancelScheduledValues(now);
        mix.gain.setTargetAtTime(SOUNDSCAPE_GAIN * (state.attention ? ATTENTION_GAIN : 1), now, 0.12);
        if (changedScene) {
          // Finish the handful of already sounding notes, then enter the new room.
          phrase = composePhrase(state, ++phraseNumber); phraseAt = now + LOOKAHEAD + 0.2; cursor = 0;
        }
      }
    },
    stop,
    snapshot: () => ({ running: bus !== null, voices: voices.size, scheduled: cursor }),
  };
}
