import { afterEach, describe, expect, it, vi } from 'vitest';
import { MASTER_GAIN, MAX_VOICES, sounds, unlockAudioFromGesture, type AudioBus } from './sound';
import { createSoundscape, SCHEDULER_MS } from './soundscape';
import { ATTENTION_GAIN, composePhrase, MAX_NOTE_GAIN, MAX_SOUNDSCAPE_VOICES, SOUNDSCAPE_GAIN, type SoundscapeScene } from './soundscapeScore';

class Param {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn();
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param();
  onended: (() => void) | null = null;
  connect = vi.fn((node: Node) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn((at?: number) => { if (at === undefined) this.onended?.(); });
}
class Context {
  state = 'running'; currentTime = 0; sampleRate = 8000;
  nodes: Node[] = [];
  sources: Node[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  createGain = () => { const node = new Node(); this.nodes.push(node); return node; };
  createBiquadFilter = this.createGain;
  createOscillator = () => { const node = this.createGain(); this.sources.push(node); return node; };
  createBufferSource = this.createOscillator;
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
}
const scenes: SoundscapeScene[] = ['window', 'design', 'work', 'evening', 'gathering'];
function setup() {
  vi.useFakeTimers();
  const context = new Context();
  const bus = { a: context, out: new Node() } as unknown as AudioBus;
  const handle = createSoundscape({ scene: 'work' });
  return { context, bus, handle };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the studio score', () => {
  it('writes finite phrases with changing harmony, an answering melody and a bounded earned motif', () => {
    for (const scene of scenes) {
      const first = composePhrase({ scene });
      expect(first).toEqual(composePhrase({ scene }));
      expect(first.duration).toBeGreaterThan(11);
      expect(first.duration).toBeLessThan(16);
      expect(first.notes.length).toBeLessThan(36);
      expect(first.notes.every(note => note.at >= 0 && note.at + note.duration <= first.duration && note.gain <= MAX_NOTE_GAIN)).toBe(true);
      expect(new Set(first.notes.filter(note => !note.material).map(note => note.midi)).size).toBeGreaterThan(7);
      expect(composePhrase({ scene }, 1).notes).not.toEqual(first.notes);
      expect(composePhrase({ scene, relationship: true }).notes.length).toBe(first.notes.length + 4);
    }
    expect(new Set(scenes.map(scene => JSON.stringify(composePhrase({ scene })))) .size).toBe(scenes.length);
  });

  it('retains linear peak headroom even with every cue and soundscape voice at its largest gain', () => {
    // Largest cue is stamp's 0.12. Triangle/sine/noise sources are each bounded by 1.
    expect(MASTER_GAIN * (MAX_VOICES * 0.12 + MAX_SOUNDSCAPE_VOICES * MAX_NOTE_GAIN * SOUNDSCAPE_GAIN)).toBeLessThan(0.7);
  });
});

describe('soundscape lifetime', () => {
  it('creates no scheduler or nodes until started and stops every voice and timer', () => {
    const { context, bus, handle } = setup();
    handle.update({ scene: 'design' });
    expect(context.nodes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    handle.start(bus);
    handle.start(bus);
    expect(vi.getTimerCount()).toBe(1);
    expect(handle.snapshot().voices).toBeGreaterThan(0);
    handle.stop();
    expect(handle.snapshot()).toEqual({ running: false, voices: 0, scheduled: 0 });
    expect(vi.getTimerCount()).toBe(0);
    expect(context.nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    const created = context.nodes.length;
    vi.advanceTimersByTime(60_000);
    expect(context.nodes).toHaveLength(created);
  });

  it('ducks attention immediately, bounds voices and drops missed notes after a stalled page', () => {
    const { context, bus, handle } = setup();
    handle.start(bus);
    handle.update({ scene: 'work', attention: true });
    expect(context.nodes[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(SOUNDSCAPE_GAIN * ATTENTION_GAIN, 0, 0.12);
    for (let i = 1; i < 80; i++) {
      context.currentTime = i * 0.25;
      vi.advanceTimersByTime(SCHEDULER_MS);
      expect(handle.snapshot().voices).toBeLessThanOrEqual(MAX_SOUNDSCAPE_VOICES);
    }
    context.sources.forEach(source => source.onended?.());
    context.currentTime = 600;
    const before = context.sources.length;
    vi.advanceTimersByTime(SCHEDULER_MS);
    expect(context.sources.length - before).toBeLessThanOrEqual(4);
    expect(vi.getTimerCount()).toBe(1);
    context.state = 'suspended';
    vi.advanceTimersByTime(SCHEDULER_MS);
    expect(handle.snapshot().running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a pending resume resurrect stopped playback or duplicate a restart', async () => {
    const { context, bus, handle } = setup();
    context.state = 'suspended';
    const resumes: (() => void)[] = [];
    context.resume.mockImplementation(() => new Promise<void>(resolve => { resumes.push(() => { context.state = 'running'; resolve(); }); }));
    handle.start(bus);
    handle.stop();
    handle.start(bus);
    resumes.forEach(resume => resume());
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    handle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('declines unavailable audio and calls outside a user gesture', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(unlockAudioFromGesture()).toBeNull();
    const constructor = vi.fn();
    vi.stubGlobal('AudioContext', constructor);
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    expect(unlockAudioFromGesture()).toBeNull();
    sounds.open();
    expect(constructor).not.toHaveBeenCalled();
  });
});
