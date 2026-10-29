// The playback clock lives outside React state, so only the parts that show the time re-render each frame.
import { useSyncExternalStore } from 'react';
import { RULES } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';

const DAY = RULES.minutesPerDay;

export interface ClockState {
  /** Absolute simulated minute being shown. */
  t: number;
  done: boolean;
  paused: boolean;
  /** Waiting at a call. */
  held: boolean;
}

export class Clock {
  readonly start: number;
  readonly end: number;
  private s: ClockState;
  /** A minute the clock cannot pass until released: a call in the middle of the day. */
  private hold: number | null = null;
  private listeners = new Set<() => void>();

  constructor(start: number, done: boolean) {
    this.start = start;
    this.end = start + DAY;
    this.s = { t: done ? this.end : start, done, paused: false, held: false };
  }

  get = (): ClockState => this.s;

  /** Stop at this minute (a call) until released. */
  holdAt(minute: number | null): void {
    this.hold = minute;
    this.set({});
  }
  release(): void {
    this.hold = null;
    this.set({ paused: false });
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(next: Partial<ClockState>): void {
    const s = { ...this.s, ...next };
    s.t = Math.max(this.start, Math.min(this.hold ?? this.end, this.end, s.t));
    s.done = s.t >= this.end;
    s.held = this.hold !== null && s.t >= this.hold;
    if (s.t === this.s.t && s.done === this.s.done && s.paused === this.s.paused && s.held === this.s.held) return;
    this.s = s;
    for (const fn of this.listeners) fn();
  }

  advance(minutes: number): void {
    if (!this.s.done && !this.s.paused) this.set({ t: this.s.t + minutes });
  }
  pause(paused: boolean): void {
    this.set({ paused });
  }
  skip(): void {
    this.set({ t: this.end, paused: false });
  }
  /** Step to the next whole hour, staying paused (for players who turn motion off). */
  stepHour(): void {
    const offset = this.s.t - this.start;
    this.set({ t: this.start + (Math.floor(offset / 60) + 1) * 60, paused: true });
  }
  /** Rewind to the morning, paused, to walk the day hour by hour. */
  rewind(): void {
    this.set({ t: this.start, paused: true });
  }
}

export interface Playback {
  before: CompanyState;
  after: CompanyState;
  clock: Clock;
}

const IDLE: ClockState = { t: -1, done: false, paused: false, held: false };
const noop = () => () => {};

/** Subscribe to one derived value of the clock; re-renders only when it changes. */
export function useClock<T>(clock: Clock | null, pick: (s: ClockState) => T): T {
  return useSyncExternalStore(clock ? clock.subscribe : noop, () => pick(clock ? clock.get() : IDLE));
}
