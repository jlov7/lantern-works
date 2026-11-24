import { describe, expect, it } from 'vitest';
import { pressFrame, pressPose, pullProgress, pullVelocity, shouldCommit, trackPx, worldTrackPx } from './pressPull';

describe('the first-order pull', () => {
  it('uses the same thresholds for all accepted events', () => {
    expect(pullProgress(0, 120)).toBe(0);
    expect(pullProgress(-10, 120)).toBe(0);
    expect(pullProgress(240, 120)).toBe(1);
    expect(shouldCommit(.72, 0)).toBe(true);
    expect(shouldCommit(.5, 1)).toBe(true);
    expect(shouldCommit(.5, .5)).toBe(false);
    expect(shouldCommit(.44, 20)).toBe(false);
  });
  it('uses the height of the current projected track', () => {
    expect(trackPx(150)).toBe(120);
    expect(worldTrackPx(172)).toBe(155);
    expect(worldTrackPx(392)).toBe(260);
  });
  it('moves to contact, releases and reveals the same ink', () => {
    expect(pressPose(1, 'bite', 1)).toEqual({ platenY: 1.13, wheelTurn: -Math.PI / 2, inkOpacity: 0 });
    expect(pressPose(0, 'release', 1).platenY).toBe(1.42);
    expect(pressPose(0, 'release', 1).inkOpacity).toBe(1);
    expect(pressFrame({ pull: .8, commitAt: 100, springAt: null, reduced: true }, 219).platenY).toBe(1.13);
    expect(pressFrame({ pull: .8, commitAt: 100, springAt: null, reduced: true }, 220).inkOpacity).toBe(1);
    expect(pressFrame({ pull: .5, commitAt: null, springAt: 100, reduced: false }, 320).platenY).toBe(1.42);
  });
  it('ignores movement from before the flick window', () => {
    expect(pullVelocity([{ y: 0, at: 0 }, { y: 45, at: 300 }, { y: 55, at: 320 }])).toBe(.5);
    expect(pullVelocity([{ y: 0, at: 0 }, { y: 120, at: 90 }])).toBe(0);
  });
});
