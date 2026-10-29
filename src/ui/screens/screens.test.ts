import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { PRESETS } from '../../engine/rules';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { earnedStamps } from '../stamps';
import { endingDistribution } from './endings.check';
import { summarize } from '../../engine/selectors';
import { ENDING_IDS, epilogues, seasonEnding } from '../../engine/endings';
import { keyProblem } from './key';
import { lastPlayed, saveFacts } from './saves';
import { commandsByDay, dayEvents, dayMarks, SHARE_LIMIT, shareText } from './season';
import courtyard from '../../engine/fixtures/main-courtyard-5.0.0.json';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { Command } from '../../engine/types';

const URL = 'https://example.test/lantern/#play=main-street:e2e-1';

describe('endings (GD-21)', () => {
  it('has at least 12 endings and none covers more than 30% of a spread of managers, streets and seeds', () => {
    expect(ENDING_IDS.length).toBeGreaterThanOrEqual(12);
    const { total, rows } = endingDistribution(2);
    expect(total).toBeGreaterThan(60);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(r.share, r.title).toBeLessThanOrEqual(0.3);
  }, 60_000);

  it('a solvent season that lost money is named for it, not for growing', () => {
    const s = structuredClone(runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand));
    const loss = summarize(s).operatingResult + 500;
    s.journal.push({ day: s.day, minute: s.minute, kind: 'news', cash: -loss, unearned: 0, revenue: 0, ref: 'test', note: 'test cost' });
    s.cash -= loss;
    expect(s.cash).toBeGreaterThanOrEqual(0);
    expect(seasonEnding(s)).toMatchObject({ id: 'thin', line: 'The work went out, but costs ran ahead of it: the season closed 500 credits down.' });
  });

  it('names up to three regulars, most served first, and is the same on a replay', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: 'end1' }, GHOSTS.bright);
    const again = replay(s.config, s.commands).state;
    const e = epilogues(s);
    expect(e.length).toBeGreaterThan(0);
    expect(e.length).toBeLessThanOrEqual(3);
    expect(epilogues(again)).toEqual(e);
    expect(seasonEnding(again)).toEqual(seasonEnding(s));
    for (const x of e) expect(x.line).not.toMatch(/—/);
  });
});

describe('share text (GD-28)', () => {
  const s = runPolicy({ scenarioId: 'festival-week', seed: 'share1' }, GHOSTS.bright);

  it('fits in 280 characters with a twelve-mark day strip', () => {
    const t = shareText(s, URL);
    expect(t.length).toBeLessThanOrEqual(SHARE_LIMIT);
    expect(t.split('\n')[1]).toHaveLength(12);
    expect(t).toContain(URL);
  });

  it('is identical across replays of the same moves', () => {
    const a = replay(s.config, s.commands).state;
    const b = replay(s.config, s.commands).state;
    expect(shareText(a, URL)).toBe(shareText(s, URL));
    expect(shareText(b, URL)).toBe(shareText(a, URL));
  });

  it('marks a day with a missed promise as missed', () => {
    const greedy = runPolicy({ scenarioId: 'festival-week', seed: 'share1' }, { id: 'g', label: 'g', menu: [PRESETS.bespoke, PRESETS.club], staffing: { aiTier: 'solo', routing: 'all' }, accept: 'all' });
    const missedDays = new Set(greedy.events.filter((e) => e.type === 'missed').map((e) => e.day));
    expect(missedDays.size).toBeGreaterThan(0);
    dayMarks(greedy).forEach((m, d) => expect(m === 'missed').toBe(missedDays.has(d)));
  });
});

describe('rewind labels (UX-30)', () => {
  it('groups commands by morning and names news, hires and upgrades', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: 'end2' }, { ...GHOSTS.bright, plan: [{ day: 2, hire: true }, { day: 4, buy: ['checklist'] }] });
    expect(commandsByDay(s.commands)).toHaveLength(12);
    const ev = dayEvents(s);
    expect(ev).toHaveLength(12);
    const withNews = s.news.filter((n) => n.choice !== null).map((n) => n.day);
    for (const d of withNews) expect(ev[d]).toMatch(/^News: /);
    if (!withNews.includes(2)) expect(ev[2]).toBe('Hired Noor');
    if (!withNews.includes(4)) expect(ev[4]).toBe('Bought the checklist');
  });
});

describe('v3 stamps (VX-27)', () => {
  it('awards a hire, and beating Bright Lantern only when its result is known and lower', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: 'end3' }, { ...GHOSTS.bright, plan: [{ day: 1, hire: true }] });
    expect(earnedStamps(s)).toContain('first-hire');
    expect(earnedStamps(s)).not.toContain('beat-bright');
    expect(earnedStamps(s, { brightServed: 0 })).toContain('beat-bright');
    expect(earnedStamps(s, { brightServed: 999 })).not.toContain('beat-bright');
  });
});

describe('key check (UX-14)', () => {
  it('explains a missing prefix and accepts a plausible key', () => {
    expect(keyProblem('')).toMatch(/Paste/);
    expect(keyProblem('sk-proj-abcdefghijklmnopqrstuvwxyz0123')).toMatch(/start with "sk-ant-"/);
    expect(keyProblem('sk-ant-short')).toMatch(/too short/);
    expect(keyProblem('  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ')).toBeNull();
  });
});

describe('last played', () => {
  it('reads as today, yesterday or a date', () => {
    const now = new Date(2026, 9, 11, 12);
    expect(lastPlayed(new Date(2026, 9, 11, 9).toISOString(), now)).toBe('today');
    expect(lastPlayed(new Date(2026, 9, 10, 9).toISOString(), now)).toBe('yesterday');
    expect(lastPlayed(new Date(2026, 8, 1, 9).toISOString(), now)).toBe('on 1 Sep');
    expect(lastPlayed('nonsense', now)).toBe('some time ago');
  });
});

describe('saved progress', () => {
  const config = { scenarioId: 'main-street', seed: 'save-phase-2' };
  const season = runPolicy(config, { ...GHOSTS.hand, calls: true });
  const facts = (commands: typeof season.commands) => saveFacts({ v: 1, rules: season.rulesVersion, id: 'phase', label: 'Phase', savedAt: '2026-10-22T00:00:00Z', config, commands });

  it('labels an unopened season and a completed season from their replayed phase', () => {
    expect(facts([])).toMatchObject({ progress: 'Day 1 morning', finished: false });
    expect(facts(season.commands)).toMatchObject({ progress: 'Finished', finished: true });
  });

  it('identifies a completed studio by its earned ending and preserves the older medal summary', () => {
    const save = { v: 1 as const, id: 'courtyard', label: 'First season: Main Street', savedAt: '2026-10-26T00:00:00Z', ...courtyard, commands: courtyard.commands as Command[] };
    expect(saveFacts(save)).toMatchObject({ ending: 'A courtyard full of your work', served: 26, finished: true });
    expect(saveFacts({ ...save, commands: [] })).toMatchObject({ ending: null, finished: false });
    const legacy = runPolicy(config, GHOSTS.hand, {}, LEGACY_RULES_VERSION);
    expect(saveFacts({ ...save, rules: LEGACY_RULES_VERSION, config, commands: legacy.commands })).toMatchObject({ ending: null, finished: true });
  });

  it('keeps an interrupted day current, including a call on the final day', () => {
    let s = createRun(config);
    const calls: number[] = [];
    for (const command of season.commands) {
      s = applyCommand(s, command).state;
      if (command.type !== 'runDay' || !s.call) continue;
      calls.push(s.day);
      expect(facts(s.commands)).toMatchObject({ progress: `Day ${s.day + 1}, call waiting`, finished: false });
    }
    expect(calls.length).toBeGreaterThan(1);
    expect(calls).toContain(11);
  });
});
