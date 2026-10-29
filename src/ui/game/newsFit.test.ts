import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { forecast } from '../../engine/selectors';
import { applyCommand, replay } from '../../engine/sim';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import type { CompanyState, News } from '../../engine/types';
import { orderFit } from './newsFit';

function morning(seed: string, route: 'hand' | 'bright', day: number): { state: CompanyState; news: News } {
  const config = { scenarioId: 'main-street', seed };
  let state: CompanyState | undefined;
  runPolicy(config, GHOSTS[route], { onMorning: s => { if (s.day === day) state = structuredClone(s); } }, LEGACY_RULES_VERSION);
  expect(state).toBeDefined();
  expect(replay(config, state!.commands, LEGACY_RULES_VERSION)).toEqual({ state, errors: [] });
  return { state: state!, news: state!.news.find(n => n.day === day && n.choice === null)! };
}

function previews(state: CompanyState, news: News) {
  const chosen = applyCommand(state, { type: 'choose', newsId: news.id, option: 1 });
  expect(chosen.error).toBeUndefined();
  const request = chosen.state.requests.find(r => r.status === 'waiting' && !state.requests.some(old => old.id === r.id))!;
  return { baseline: forecast(chosen.state), withOrder: forecast(chosen.state, request.id) };
}

describe('news-order risk attribution', () => {
  it('does not blame the party for a promise already forecast to miss without it', () => {
    const { state, news } = morning('m1', 'hand', 6);
    expect(news.card).toBe('streetParty');
    const before = structuredClone(state);
    const { baseline, withOrder } = previews(state, news);
    expect(baseline.atRisk.length).toBeGreaterThan(0);
    expect(withOrder.atRisk).toEqual(baseline.atRisk);
    expect(withOrder.newAtRisk).toEqual([]);
    expect(withOrder.newAfterSeason).toEqual([]);
    expect(orderFit(state, news, 1)).toBe('This order would be on time. Existing work would be late without it.');
    expect(orderFit(state, news, 0)).toBeNull();
    expect(state).toEqual(before);
  });

  it('still warns when the added order really makes another promise late', () => {
    const { state, news } = morning('m3', 'bright', 5);
    expect(news.card).toBe('hugoRetires');
    const { baseline, withOrder } = previews(state, news);
    expect(withOrder.atRisk.some(id => !baseline.atRisk.includes(id))).toBe(true);
    expect(withOrder.newAtRisk).toEqual([]);
    expect(orderFit(state, news, 1)).toBe('It fits, but would make another launch late.');
  });

  it('keeps an offered order that cannot meet its own deadline marked late', () => {
    const { state, news } = morning('m3', 'hand', 5);
    expect(news.card).toBe('eliExtended');
    expect(previews(state, news).withOrder.newAtRisk.length).toBeGreaterThan(0);
    expect(orderFit(state, news, 1)).toBe('As things stand it would be late: it needs more hours.');
  });
});
