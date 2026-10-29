import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WalkReason } from '../../engine/demand';
import { PRESETS, RULES } from '../../engine/rules';
import { applyCommand, createRun } from '../../engine/sim';
import { frameAt, type NeighbourFrame, type WorkerFrame, type WorldFrame } from '../timeline';
import { AI_DESKS, BRIEF_TABLE, FINISH_BENCH, MAKE_DESKS, P, SPOTS, STREET, TRAY } from './iso';
import { lightAt, luminance } from './light';
import { describeFrame, LEAVE_BY, moodLabel, placeHumans, placeNeighbours, SERVED_SHOWN, staffRoute } from './place';

function frame(neighbours: NeighbourFrame[], o: Partial<WorldFrame> = {}): WorldFrame {
  return { day: 0, minute: 0, offset: 0, clock: '9:00am', peopleOnShift: true, outage: false, workers: [], folders: [], packagesToday: [], packagesTotal: 0, missedToday: [], kit: 'none', menu: [], neighbours, ...o };
}
const crowd = (moods: NeighbourFrame['mood'][]): NeighbourFrame[] => moods.map((mood, i) => ({ requestId: `r${i}`, castId: 'mara', segment: 'small', mood }));

describe('time of day', () => {
  it('the sky at 5pm is much darker than the pale 9am sky', () => {
    const am = lightAt(0);
    const pm = lightAt(480);
    for (const k of ['skyTop', 'skyMid'] as const) expect(luminance(pm[k])).toBeLessThan(luminance(am[k]) * 0.75);
  });

  it('street lamps stay off until 3:30pm and are on by 4pm', () => {
    for (let m = 0; m < 390; m += 5) expect(lightAt(m).lamps).toBe(0);
    expect(lightAt(420).lamps).toBe(1);
  });
});

describe('neighbours on the street', () => {
  it('describes a real mentoring appointment as a lesson instead of customer briefing', () => {
    const workers: WorkerFrame[] = ['Ada', 'Noor'].map((name, i) => ({ id: i ? 'j1' : 'h1', name, kind: 'human', station: 'brief', jobId: null, working: true, retired: false, mentoring: 'proofing' }));
    const text = describeFrame(frame([], { workers }));
    expect(text).toContain('Ada mentoring in proofing');
    expect(text).toContain('Noor mentoring in proofing');
    expect(text).not.toContain('briefing');
    expect(describeFrame(frame([], { workers: workers.map(w => ({ ...w, mentoring: 'templates' })) }))).toContain('mentoring in template making');
  });
  it('walk-aways have all left the street 90 minutes after opening', () => {
    const f = frame(crowd(Array.from({ length: 11 }, () => 'leaving' as const)), { played: true });
    expect(placeNeighbours({ ...f, offset: 10 }).filter((p) => p.n.mood === 'leaving').length).toBeGreaterThan(0);
    expect(LEAVE_BY).toBeLessThanOrEqual(90);
    for (const offset of [LEAVE_BY, 90, 200]) expect(placeNeighbours({ ...f, offset })).toHaveLength(0);
  });

  it('at most four served neighbours wait by the door, and none stands on a lamp post', () => {
    const f = frame(crowd(Array.from({ length: 11 }, () => 'served' as const)));
    const shown = placeNeighbours(f).filter((p) => !p.gone);
    expect(shown).toHaveLength(SERVED_SHOWN);
    for (const p of [...shown, ...placeNeighbours(frame(crowd(Array.from({ length: 18 }, () => 'waiting' as const))))]) {
      const [sx, sy] = P(p.x, p.y);
      for (const [lx, ly] of STREET.lamps) {
        const [bx, by] = P(lx, ly);
        const overlapX = Math.abs(sx - bx) < 14;
        const overlapY = sy - 50 < by && sy > by - 131;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('each objection has its own glyph, and the accessible name says the mood in words', () => {
    const reasons: WalkReason[] = ['price', 'slow', 'scope', 'care', 'lost', 'empty'];
    const f = frame([{ requestId: 'b', castId: 'mara', segment: 'small', mood: 'buying' }, ...reasons.map((reason, i) => ({ requestId: `w${i}`, castId: 'mara', segment: 'small' as const, mood: 'waiting' as const, reason }))]);
    const glyphs = placeNeighbours(f).map((p) => p.bubble);
    expect(new Set(glyphs).size).toBe(7);
    expect(glyphs[0]).toBe('coin');
    for (const n of [...f.neighbours, ...crowd(['served', 'leaving', 'declined'])]) expect(moodLabel(n)).toMatch(/would buy|won't buy|order taken|walking away/);
  });

  it('calls an accepted request an order taken before anything is delivered', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'x' });
    s.menu = [{ ...PRESETS.bespoke, price: 500 }];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    const result = applyCommand(s, { type: 'accept', requestId: 'x' });
    expect(result.error).toBeUndefined();
    s = result.state;
    const f = frameAt(s, s, s.minute);
    expect(s.jobs.every((j) => j.status !== 'delivered')).toBe(true);
    expect(moodLabel(f.neighbours[0]!)).toBe('order taken');
    expect(describeFrame(f)).toContain('1 order taken');
    expect(describeFrame(f)).toContain('no parcels delivered yet');
    expect(describeFrame(f)).not.toContain('served');
    expect(describeFrame(frame(crowd(['served', 'served'])))).toContain('2 orders taken');
  });

  it('the description counts walk-aways still in view, then says they walked away', () => {
    const f = frame(crowd(['leaving', 'served']), { played: true });
    expect(describeFrame({ ...f, offset: 5 })).toMatch(/1 walking away/);
    expect(describeFrame({ ...f, offset: 200, clock: '12:20pm' })).toMatch(/1 walked away/);
    expect(describeFrame({ ...f, offset: 480, clock: '5:00pm' })).toMatch(/Closed/);
  });
});

describe('staff walk the aisle, not through the furniture', () => {
  const tables = [BRIEF_TABLE, TRAY, ...MAKE_DESKS, ...AI_DESKS, FINISH_BENCH];
  const inside = ([x, y]: readonly [number, number]) => tables.some((t) => x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.d);
  it('every route between two spots stays clear of every table', () => {
    const spots = [...SPOTS.idle, ...SPOTS.brief, ...SPOTS.kit, ...SPOTS.make, ...SPOTS.finish, [153, 220] as const];
    for (const a of spots) {
      for (const b of spots) {
        const r = staffRoute(a, b);
        for (let i = 1; i < r.length; i++) {
          for (let k = 0; k <= 20; k++) {
            const t = k / 20;
            expect(inside([r[i - 1]![0] + (r[i]![0] - r[i - 1]![0]) * t, r[i - 1]![1] + (r[i]![1] - r[i - 1]![1]) * t])).toBe(false);
          }
        }
      }
    }
  });
});

describe('beats for one-off moments', () => {
  it('every delivery and miss of the day becomes a beat at its minute', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'x' });
    s.menu = [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }];
    s.requests = [{ id: 'x', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    s = applyCommand(s, { type: 'accept', requestId: 'x' }).state;
    const after = applyCommand(s, { type: 'runDay' }).state;
    const end = frameAt(s, after, s.minute + RULES.minutesPerDay);
    expect(end.beats?.filter((b) => b.kind === 'missed').map((b) => b.jobId)).toEqual(end.missedToday);
    expect(end.played).toBe(true);
    expect(frameAt(s, s, s.minute).played).toBe(false);

    let d = createRun({ scenarioId: 'festival-week', seed: 'preview' });
    d = applyCommand(d, { type: 'setMenu', offers: [PRESETS.club, PRESETS.launchlet] }).state;
    for (const r of d.requests.filter((q) => q.status === 'waiting')) d = applyCommand(d, { type: 'accept', requestId: r.id }).state;
    const done = applyCommand(d, { type: 'runDay' }).state;
    const close = frameAt(d, done, d.minute + RULES.minutesPerDay);
    expect(close.beats?.filter((b) => b.kind === 'delivered').map((b) => b.jobId)).toEqual(close.packagesToday);
  });
});

describe('sound', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('caps voices at eight and chimes deliveries at most once per 120ms', async () => {
    vi.useFakeTimers();
    let started = 0;
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect: (n: unknown) => n, gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: '', buffer: null, start: () => started++, onended: null as (() => void) | null, disconnect() {}, stop(at = 0) { setTimeout(() => this.onended?.(), at * 1000); } });
    class FakeContext {
      state = 'running';
      currentTime = 0;
      sampleRate = 8000;
      destination = node();
      createOscillator = node;
      createGain = node;
      createBiquadFilter = node;
      createBufferSource = node;
      createDynamicsCompressor = node;
      createBuffer = () => ({ getChannelData: () => new Float32Array(10) });
      resume() {}
    }
    vi.stubGlobal('AudioContext', FakeContext);
    const { sounds, MAX_VOICES } = await import('../sound');
    for (let i = 0; i < 10; i++) sounds.kit();
    expect(started).toBe(MAX_VOICES);
    vi.advanceTimersByTime(2000);
    started = 0;
    vi.stubGlobal('performance', { now: () => 1000 });
    sounds.delivered();
    sounds.delivered();
    expect(started).toBe(2);
    vi.stubGlobal('performance', { now: () => 1130 });
    sounds.delivered();
    expect(started).toBe(4);
  });
});

describe('a bigger or smaller studio', () => {
  const person = (id: string, station: WorkerFrame['station']): WorkerFrame => ({ id, name: id, kind: 'human', station, jobId: null, working: true, retired: false });
  it('places zero to four people, each on a spot of their own at every station', () => {
    expect(placeHumans(frame([], { workers: [] }))).toHaveLength(0);
    for (const station of ['idle', 'brief', 'kit', 'make', 'finish'] as const) {
      const placed = placeHumans(frame([], { workers: ['h1', 'h2', 'j1', 't3'].map((id) => person(id, station)) }));
      expect(new Set(placed.map((p) => `${p.x},${p.y}`)).size).toBe(4);
      expect(placed.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    }
  });
});
