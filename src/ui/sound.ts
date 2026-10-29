// Original, synthesised UI sounds. Off by default; only ever started from a user gesture. No audio files.
// Cues and the soundscape share headroom and a gentle compressor.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let voices = 0;
let lastDelivered = -Infinity;
export const MASTER_GAIN = 0.6;

export interface AudioBus { a: AudioContext; out: AudioNode }

/** Most cues sounding at once; extra cues are dropped rather than queued. */
export const MAX_VOICES = 8;
/** Deliveries landing together chime at most once per this many milliseconds. */
export const DELIVERED_GAP_MS = 120;

function audio(): AudioBus | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) return null;
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return { a: ctx, out: master! };
}

/** Call synchronously inside a trusted gesture. Merely mounting a screen never creates audio. */
export function unlockAudioFromGesture(): AudioBus | null {
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) return null;
  try { return audio(); } catch { return null; }
}

/** Small random detune so repeated cues don't sound mechanical. */
const vary = (f: number, cents = 30) => f * 2 ** (((Math.random() * 2 - 1) * cents) / 1200);

function claim(): boolean {
  if (voices >= MAX_VOICES) return false;
  voices++;
  return true;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the tone. */
  to?: number;
}

function tone(freq: number, at: number, dur: number, { type = 'sine', gain = 0.06, to }: ToneOpts = {}): void {
  const g0 = audio();
  if (!g0 || !claim()) return;
  const { a, out } = g0;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  const t = a.currentTime + at;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A burst of filtered noise: paper, pen and the body of a stamp. */
function hiss(at: number, dur: number, { freq = 2000, q = 1, gain = 0.05, sweepTo, type = 'bandpass' }: { freq?: number; q?: number; gain?: number; sweepTo?: number; type?: BiquadFilterType } = {}): void {
  const g0 = audio();
  if (!g0 || !claim()) return;
  const { a, out } = g0;
  if (!noise) {
    noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t = a.currentTime + at;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.onended = () => { voices--; src.disconnect(); f.disconnect(); g.disconnect(); };
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.05);
}

export const sounds = {
  /** The day opens: three rising notes. */
  open: () => {
    tone(523, 0, 0.25, { gain: 0.05 });
    tone(659, 0.09, 0.25, { gain: 0.05 });
    tone(784, 0.18, 0.4, { gain: 0.05 });
  },
  /** A parcel reaches the rack. Debounced so a burst of deliveries is one chime, not a pile-up. */
  delivered: () => {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (now - lastDelivered < DELIVERED_GAP_MS) return;
    lastDelivered = now;
    const f = vary(880, 25);
    tone(f, 0, 0.35, { gain: 0.07 });
    tone(f * 1.5, 0.07, 0.4, { gain: 0.045 });
  },
  /** A promise missed: two falling tones. */
  missed: () => {
    tone(vary(330, 15), 0, 0.28, { type: 'triangle', gain: 0.09 });
    tone(vary(247, 15), 0.24, 0.5, { type: 'triangle', gain: 0.09 });
  },
  /** Taking a neighbour on: a quick pen scratch. */
  take: () => {
    hiss(0, 0.07, { freq: vary(3200, 80), q: 4, gain: 0.05, sweepTo: 4200 });
    hiss(0.09, 0.09, { freq: vary(2600, 80), q: 4, gain: 0.045, sweepTo: 3600 });
  },
  /** Turning someone away: a soft paper shuffle. */
  decline: () => hiss(0, 0.2, { freq: vary(1400, 60), q: 0.7, gain: 0.05, sweepTo: 700, type: 'lowpass' }),
  /** Accepting with a stamp: a low thunk. */
  stamp: () => {
    tone(vary(140, 20), 0, 0.16, { gain: 0.12, to: 60 });
    hiss(0, 0.05, { freq: 900, q: 0.8, gain: 0.05, type: 'lowpass' });
  },
  /** Money in: a bright tick. */
  coin: () => {
    const f = vary(2400, 40);
    tone(f, 0, 0.06, { gain: 0.04 });
    tone(f * 1.34, 0.045, 0.12, { gain: 0.035 });
  },
  /** The template kit is ready: a rising arpeggio. */
  kit: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(vary(f, 10), i * 0.07, 0.28, { type: 'triangle', gain: 0.045 }));
  },
  /** A medal at the season's end: a short fanfare. */
  medal: () => {
    tone(392, 0, 0.18, { type: 'triangle', gain: 0.06 });
    tone(523, 0.14, 0.18, { type: 'triangle', gain: 0.06 });
    tone(659, 0.28, 0.5, { type: 'triangle', gain: 0.06 });
    tone(784, 0.28, 0.6, { gain: 0.035 });
  },
};

export type SoundCue = keyof typeof sounds;
