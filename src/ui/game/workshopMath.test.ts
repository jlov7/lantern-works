import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../engine/rules';
import { applyCommand, createRun } from '../../engine/sim';
import { offerEconomics, offerRates, reachOf } from './workshopMath';

const morning = () => createRun({ scenarioId: 'main-street', seed: 'offer-economics' });

it('discloses a buyer switching from the sole 900 cr offer to the added 340 cr offer', () => {
  const s = morning();
  s.requests = [{ id: 'switch', day: 0, index: 0, castId: 'eli', segment: 'moment', need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
  expect(reachOf(s, PRESETS.launchlet, 1)).toMatchObject({ buyThis: 1, switched: 1 });
  expect(reachOf(s, PRESETS.launchlet, 0)).toMatchObject({ buyThis: 1, switched: 0 });
});

describe('offer economics before a sale', () => {
  it('flags a cheap simple offer below break-even even when rounded hourly rates look equal', () => {
    const s = morning();
    const cheap = offerEconomics(s, PRESETS.launchlet)!;
    const bespoke = offerEconomics(s, PRESETS.bespoke)!;
    expect(cheap.earns).toBe(cheap.costs);
    expect(cheap.under).toBe(true);
    expect(bespoke.earns).toBeGreaterThan(bespoke.costs);
    expect(bespoke.cover).toBe(2);
    expect(bespoke.minutes).toBe(315);
  });

  it('counts delivered launches, rather than the up-front price of a multi-launch order', () => {
    const offer = { ...PRESETS.bespoke, launches: 4, price: 900 };
    expect(offerEconomics(morning(), offer)!.cover).toBe(5);
  });

  it('includes the extra wages and hours when overtime is booked', () => {
    const s = applyCommand(morning(), { type: 'overtime' }).state;
    const money = offerEconomics(s, PRESETS.bespoke)!;
    expect(money.costs).toBe(75);
    expect(money.cover).toBe(2);
    expect(offerRates(s)!.costs).toBe(money.costs);
  });

  it('responds to the AI desk while leaving the run and its future luck untouched', () => {
    const s = applyCommand(morning(), { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'simple' } }).state;
    const before = structuredClone(s);
    const ai = offerEconomics(s, PRESETS.bespoke)!;
    expect(ai.minutes).toBe(135);
    expect(ai.costs).toBe(95);
    expect(ai.earns).toBe(400);
    expect(s).toEqual(before);
  });
});
