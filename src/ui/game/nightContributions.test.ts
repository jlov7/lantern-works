import { describe, expect, it } from 'vitest';
import { projectQuote, projectRecords } from '../../engine/projects';
import { replay } from '../../engine/sim';
import type { Command, ProjectTerms } from '../../engine/types';
import observed from './fixtures/ordinary-news-slot.json';
import { nightContributions } from './nightContributions';

const terms = (approach: 'courtyard' | 'trail'): ProjectTerms => ({ id: 'lantern-night', approach, materials: 0, contributors: ['clem-ten', 'mara-regular', 'hugo-handover'] });

describe('earlier commissions in the frozen night quote', () => {
  it('explains the actual archive and quiet portrait contributions without claiming a workshop host', () => {
    const run = replay(observed.config, [...observed.commands, ...observed.nightQuoteContinuation] as Command[], observed.rules);
    expect(run.errors).toEqual([]);
    const quote = projectQuote(run.state, 'lantern-night', 'courtyard')!;
    expect(quote.profiles[0]!.finish).toBe(60);
    expect(quote.project.materials).toBe(100);
    expect(nightContributions(quote.project, projectRecords(run.state))).toEqual([
      { name: 'Clem', detail: 'Clem’s archive cuts courtyard finishing by 60 min.' },
      { name: 'Hugo', detail: 'Hugo contributes his portrait, without opening the workshop.' },
    ]);
  });

  it('shows matching earned discounts and host choices for a trail', () => {
    expect(nightContributions(terms('trail'), [
      { id: 'clem-ten', approach: 'new-band', earned: true },
      { id: 'mara-regular', approach: 'weekly-rhythm', earned: true },
      { id: 'hugo-handover', approach: 'open-bench', earned: true },
    ])).toEqual([
      { name: 'Clem', detail: 'Clem’s programme design cuts briefing by 15 min per launch.' },
      { name: 'Mara', detail: 'Mara’s completed bakery series cuts materials by 100 cr.' },
      { name: 'Hugo', detail: 'Hugo’s apprentice workshop is available to host.' },
    ]);
  });

  it('does not apply the other approach’s discount or a benefit outside the frozen contributors', () => {
    const courtyard = terms('courtyard');
    courtyard.contributors = ['clem-ten'];
    const result = nightContributions(courtyard, [
      { id: 'clem-ten', approach: 'new-band', earned: true },
      { id: 'mara-regular', approach: 'weekly-rhythm', earned: true },
    ]);
    expect(result).toEqual([{ name: 'Clem', detail: 'Clem can host, with the completed band poster.' }]);
    expect(JSON.stringify(result)).not.toMatch(/15 min|100 cr/);
    expect(nightContributions(terms('trail'), [{ id: 'clem-ten', approach: 'first-night', earned: true }])[0]!.detail).not.toContain('60 min');
  });

  it('does not show unfinished help or attach night benefits to an ordinary milestone quote', () => {
    expect(nightContributions(terms('courtyard'), [{ id: 'hugo-handover', approach: 'quiet-sendoff', earned: false }])).toEqual([]);
    expect(nightContributions({ ...terms('courtyard'), id: 'clem-ten', approach: 'first-night' }, [{ id: 'hugo-handover', approach: 'quiet-sendoff', earned: true }])).toEqual([]);
  });
  it('reads frozen career facts instead of reusing the old approach bonuses', () => {
    const records = [
      { id: 'clem-ten' as const, approach: 'first-night' as const, earned: true, contribution: { host: true, materialsReduction: 0, trailBriefReduction: 0, courtyardFinishReduction: 0 } },
      { id: 'mara-regular' as const, approach: 'market-debut' as const, earned: true, contribution: { host: true, materialsReduction: 100, trailBriefReduction: 0, courtyardFinishReduction: 0 } },
      { id: 'hugo-handover' as const, approach: 'quiet-sendoff' as const, earned: true, contribution: { host: false, materialsReduction: 0, trailBriefReduction: 0, courtyardFinishReduction: 0 } },
    ];
    const result = nightContributions(terms('courtyard'), records);
    expect(result.map(item => item.detail)).toEqual([
      'Clem can host.',
      'Mara can host; gathering materials cost 100 cr less.',
      'Hugo contributes the finished work without hosting.',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/60 min|archive cuts|market banner/);
    expect(nightContributions({ ...terms('trail'), contributors: ['clem-ten'] }, [{ ...records[0]!, earned: false }])).toEqual([]);
  });
  it('describes each frozen reduction only for the gathering that uses it', () => {
    const records = [{ id: 'clem-ten' as const, approach: 'new-band' as const, earned: true, contribution: { host: true, materialsReduction: 0, trailBriefReduction: 15, courtyardFinishReduction: 0 } }];
    expect(nightContributions(terms('trail'), records)[0]!.detail).toContain('each trail briefing takes 15 fewer minutes');
    expect(nightContributions(terms('courtyard'), records)[0]!.detail).toBe('Clem can host.');
  });

});
