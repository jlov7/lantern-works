import { unlockAudioFromGesture } from './sound';
import { loadPrefs } from './persist';

type CueBus = { a: BaseAudioContext; out: AudioNode };

let voices = 0;
const MAX_PRESS_VOICES = 3;
let noise: AudioBuffer | undefined;

function shapedNoise({ a, out }: CueBus, at: number, duration: number, filter: BiquadFilterType, from: number, to: number, q: number, peak: number) {
  if (voices >= MAX_PRESS_VOICES) return;
  voices++;
  if (!noise || noise.sampleRate !== a.sampleRate) {
    noise = a.createBuffer(1, Math.ceil(a.sampleRate * .18), a.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = a.createBufferSource();
  const tone = a.createBiquadFilter();
  const gain = a.createGain();
  source.buffer = noise;
  tone.type = filter;
  tone.Q.value = q;
  tone.frequency.setValueAtTime(from, at);
  if (to !== from) tone.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + .006);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(tone).connect(gain).connect(out);
  source.onended = () => { voices--; source.disconnect(); tone.disconnect(); gain.disconnect(); };
  source.start(at);
  source.stop(at + duration);
}

function biteTone({ a, out }: CueBus, at: number) {
  if (voices >= MAX_PRESS_VOICES) return;
  voices++;
  const oscillator = a.createOscillator();
  const gain = a.createGain();
  oscillator.frequency.setValueAtTime(120, at);
  oscillator.frequency.exponentialRampToValueAtTime(55, at + .14);
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.linearRampToValueAtTime(.1, at + .007);
  gain.gain.exponentialRampToValueAtTime(.0001, at + .14);
  oscillator.connect(gain).connect(out);
  oscillator.onended = () => { voices--; oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(at);
  oscillator.stop(at + .14);
}

/** Schedule both cues while browser activation is available. */
export function pressAudioFromGesture(trusted: boolean) {
  return trusted && loadPrefs().sound ? unlockAudioFromGesture() : null;
}

export function playPressSounds(bus: CueBus | null) {
  if (!bus) return;
  const now = bus.a.currentTime;
  shapedNoise(bus, now + .12, .06, 'lowpass', 700, 700, 1, .1);
  biteTone(bus, now + .12);
  shapedNoise(bus, now + .38, .18, 'bandpass', 2400, 1200, .9, .04);
}
