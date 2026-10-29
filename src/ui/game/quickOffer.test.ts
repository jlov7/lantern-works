import { describe, expect, it } from 'vitest';
import { PRESETS, RULES } from '../../engine/rules';
import { reactionTo, windowRequests } from '../../engine/selectors';
import { applyCommand, createRun } from '../../engine/sim';
import type { CompanyState, Request } from '../../engine/types';
import { quickOffer } from './quickOffer';

const morning = () => createRun({ scenarioId: 'main-street', seed: 'panel-1' });
const neighbour = (segment: Request['segment'], index: number): Request => ({ id: `test-${index}`, day: 0, index, castId: 'eli', segment, need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' });
const withRequests = (...requests: Request[]): CompanyState => ({ ...morning(), requests });

describe('a quick offer at the window', () => {
  it('previews interested buyers separately from those who fit, without selling or building the kit', () => {
    const s = morning();
    const before = structuredClone(s);
    const offer = quickOffer(s)!;
    expect(offer.today).toEqual({ buyers: 4, fit: 1, afterSeason: 0 });
    expect(offer.kitMinutes).toBe(240);
    expect(offer.minutesAfterKit).toBe(185);
    expect(offer.economicsAfterKit).toMatchObject({ earns: 110, costs: 75, cover: 3, minutes: 185 });
    expect(s).toEqual(before);
    const added = applyCommand(s, offer.command);
    expect(added.error).toBeUndefined();
    expect(windowRequests(added.state).filter((r) => {
      const x = reactionTo(added.state, r);
      return x.kind === 'buy' && x.offerIndex === 1;
    })).toHaveLength(4);
    expect(added.state.contracts).toEqual([]);
    expect(added.state.kit.status).toBe('none');
    expect(quickOffer(added.state)).toBeNull();
  });

  it('discloses a buyer swapping from 900 cr while counting only walkers as new buyers', () => {
    const s = withRequests(neighbour('small', 0), neighbour('moment', 1));
    expect(reactionTo(s, s.requests[1]!).kind).toBe('buy');
    const offer = quickOffer(s)!;
    expect(offer.newBuyers).toBe(1);
    expect(offer.reach).toMatchObject({ buyThis: 2, switched: 1 });
    expect(offer.command.offers.map((o) => o.price)).toEqual([900, 340]);
  });

  it('does not suggest a cheaper offer solely to switch an existing buyer', () => {
    expect(quickOffer(withRequests(neighbour('moment', 0)))).toBeNull();
  });

  it('respects answered tickets, a full window, duplicate names and the end of the season', () => {
    const s = morning();
    const locked = applyCommand(s, { type: 'decline', requestId: s.requests[0]!.id }).state;
    expect(quickOffer(locked)).toBeNull();
    expect(quickOffer({ ...s, menu: [PRESETS.bespoke, PRESETS.club] })).toBeNull();
    expect(quickOffer({ ...s, menu: [{ ...PRESETS.bespoke, name: 'Launchlet' }] })).toBeNull();
    expect(quickOffer({ ...s, finished: true })).toBeNull();
  });

  it('uses this morning and desk rather than a fixed opening-day suggestion', () => {
    const s = { ...withRequests(neighbour('small', 0)), day: 7 };
    expect(quickOffer(s)).toBeNull();
    s.requests[0]!.day = 7;
    expect(quickOffer(s)?.newBuyers).toBe(1);
    const ready = { ...s, kit: { ...s.kit, status: 'ready' as const } };
    expect(quickOffer(ready)?.kitMinutes).toBe(0);
    const ai = applyCommand(ready, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'simple' } }).state;
    expect(quickOffer(ai)?.minutesAfterKit).toBe(95);
    expect(quickOffer(ai)?.economicsAfterKit).toMatchObject({ earns: 215, costs: 95, cover: 4, minutes: 95 });
    const queued = { ...s, kit: { status: 'queued' as const, remaining: RULES.effort.kitSetup / 2, assignee: null } };
    expect(quickOffer(queued)?.kitMinutes).toBe(120);
  });

  it('does not count a fixed street offer as demand for Launchlet', () => {
    expect(quickOffer(withRequests({ ...neighbour('small', 0), offer: PRESETS.launchlet, source: 'news' }))).toBeNull();
  });
});
