import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import observed from '../../../test-fixtures/replays/ordinary-loop.json' with { type: 'json' };
import { applyCommand, createRun, replay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { Command } from '../../engine/types';
import { summarize } from '../../engine/selectors';
import { nightResult } from '../../engine/projects';
import { gazette, midweek } from './gazette';

describe('the season gazette', () => {
  const s = runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand, {}, LEGACY_RULES_VERSION);
  const g = gazette(s, [{ label: 'Old Lantern', served: 3 }, { label: 'Bright Lantern', served: 999 }]);

  it('heads the page with the season the player actually had', () => {
    expect(g.masthead).toBe('The Main Street Gazette');
    expect(g.headline).toContain(`${summarize(s).served} neighbours served`);
  });

  it('leads with a story order only if it was delivered', () => {
    expect(g.lead).not.toBeNull();
    const party = s.contracts.find((c) => c.offer.name === 'Summer street party');
    if (g.lead!.startsWith('The summer street party')) expect(party).toBeDefined();
  });

  it('prints a letter only from a regular served twice or more, and corrections that match the misses', () => {
    if (g.letter) expect(g.letter).toMatch(/^Letters\. ".+" \w+, .+\.$/);
    const missed = summarize(s).missed;
    if (missed > 0) expect(g.corrections).toContain(`It missed ${missed}.`);
    else expect(g.corrections).toContain('kept every promise');
  });

  it('does not call every promise kept when the literal season closes with a refund', () => {
    const result = replay(observed.config, observed.commands as Command[], LEGACY_RULES_VERSION);
    expect(result.errors).toEqual([]);
    const sum = summarize(result.state);
    expect(sum).toMatchObject({ served: 37, missed: 0, refundedAtClose: 1, promisesKept: 1 });
    const paper = gazette(result.state, null);
    expect(paper.headline).not.toContain('every promise kept');
    expect(paper.corrections).not.toContain('kept every promise');
    expect(paper.corrections).toContain('1 unfinished launch was refunded');
  });

  it('does not call handover refunds season-closing refunds', () => {
    const commands = observed.commands.map(c => c.type === 'choose' && c.newsId === 'n11' ? { ...c, option: 1 } : c) as Command[];
    const result = replay(observed.config, commands, LEGACY_RULES_VERSION);
    expect(result.errors).toEqual([]);
    expect(summarize(result.state)).toMatchObject({ missed: 0, refundedAtClose: 3, promisesKept: 1 });
    const paper = gazette(result.state, null);
    expect(paper.headline).not.toContain('every promise kept');
    expect(paper.corrections).toBe('Corrections: 3 unfinished launches were refunded.');
  });

  it('counts the season in its own numbers', () => {
    const sum = summarize(s);
    expect(g.numbers).toContain(`${sum.delivered} launches out of the door, ${sum.served} neighbours served`);
  });

  it('places the studio among its rivals from their real numbers', () => {
    expect(g.rivals).toBe('Across the street, Bright Lantern led with 999 served. Lantern Works finished ahead of Old Lantern.');
    expect(gazette(s, null).rivals).toBeNull();
  });
});

describe('the midweek edition', () => {
  let mid: ReturnType<typeof runPolicy> | null = null;
  runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand, { onMorning: (x) => void (x.day === 6 && (mid = x)) }, LEGACY_RULES_VERSION);
  const s = mid!;
  const g = midweek(s, [{ label: 'Old Lantern', served: 0 }]);

  it('reports the first half from the morning it comes out', () => {
    expect(g.masthead).toBe('The Main Street Gazette, midweek');
    expect(g.headline).toBe(`Halfway on Main Street: Lantern Works has served ${summarize(s).served} neighbours`);
    expect(g.rivals).toContain('no studio served more');
  });

  it('retains the street party rumour for legacy runs until its card has come up', () => {
    const shown = s.news.some((n) => n.card === 'streetParty');
    expect([g.lead, g.second].some((x) => x?.startsWith('Rumour'))).toBe(!shown);
  });

  it('uses the current calendar fact instead of teasing the removed street party card', () => {
    let quiet = createRun({ scenarioId: 'main-street', seed: 'midweek-calendar' });
    while (quiet.day < 6) {
      for (const news of quiet.news.filter((n) => n.day === quiet.day && n.choice === null)) quiet = applyCommand(quiet, { type: 'choose', newsId: news.id, option: 0 }).state;
      quiet = applyCommand(quiet, { type: 'runDay' }).state;
    }
    const edition = midweek(quiet, null);
    const calendar = nightResult(quiet).calendar;
    expect(edition.lead).toBe(`${calendar.name} is on Day ${calendar.day + 1}. The studio can book it from Day ${calendar.opens + 1} to Day ${calendar.closes + 1}, with help from completed milestone commissions.`);
  });
});
