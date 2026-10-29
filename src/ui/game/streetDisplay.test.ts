import { describe, expect, it } from 'vitest';
import { buildContinuation, deliveredPieces } from '../../engine/continuation';
import recorded from '../../engine/fixtures/main-courtyard-5.0.0.json';
import { projectBrief } from '../../engine/projects';
import { applyCommand, createRun } from '../../engine/sim';
import type { Command } from '../../engine/types';
import { RULES } from '../../engine/rules';
import { nightStudy } from '../portfolio/study';
import { streetDisplayAt } from './streetDisplay';
import careful from '../../engine/fixtures/heartfelt-careful.json';
import courtyard from './fixtures/heartfelt-courtyard.json';
import { replay } from '../../engine/sim';

describe('the delivered neighbourhood', () => {
  it('keeps a neighbour’s first print after three other deliveries and preserves the place when new work arrives', () => {
    const result = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules);
    expect(result.errors).toEqual([]);
    const jobs = result.state.jobs.filter(job => job.deliveredAt !== null).sort((a, b) => a.deliveredAt! - b.deliveredAt!);
    const first = jobs[0]!;
    const fourth = jobs[3]!;
    expect(first.castId).toBe('clem');
    expect(new Set(jobs.slice(0, 4).map(job => job.castId)).size).toBe(4);
    const earlier = streetDisplayAt(result.state, fourth.deliveredAt!).locations;
    expect(earlier).toHaveLength(4);
    expect(earlier.find(place => place.castId === 'clem')).toMatchObject({ id: first.id, placeId: 'clem' });
    const next = jobs.find(job => job.castId === 'clem' && job.id !== first.id)!;
    const later = streetDisplayAt(result.state, next.deliveredAt!).locations;
    expect(later.find(place => place.castId === 'clem')).toMatchObject({ id: next.id, placeId: 'clem' });
    expect(later.map(place => place.placeId)).toEqual(earlier.map(place => place.placeId));
  });

  it('keeps earlier work and its credit identical before later estrangement is visible', () => {
    const complete = replay(careful.config, careful.commands as Command[], careful.rules);
    expect(complete.errors).toEqual([]);
    expect(complete.state.lostCast).toEqual(expect.arrayContaining(['hugo', 'clem']));
    let prefix = createRun(careful.config, careful.rules);
    for (const command of careful.commands as Command[]) {
      const next = applyCommand(prefix, command);
      expect(next.error).toBeUndefined();
      prefix = next.state;
      if (prefix.minute === 1920 && !prefix.call) break;
    }
    expect(prefix.lostCast).not.toContain('hugo');
    expect(prefix.lostCast).not.toContain('clem');
    const visible = (state: typeof prefix) => streetDisplayAt(state, 1920).locations.map(({ id, castId, contributors, work }) => ({ id, castId, contributors, proof: work?.brief.proof }));
    expect(visible(complete.state)).toEqual(visible(prefix));
    const event = streetDisplayAt(complete.state).locations.find(p => p.work?.brief.project?.id === 'lantern-night')!;
    expect(event.contributors?.toSorted()).toEqual(['clem', 'hugo']);
  });

  it('shows the exact frozen proof only once its delivery reaches playback', () => {
    const s = nightStudy('main-street', 'courtyard');
    const contract = s.contracts.find(c => c.project?.id === 'lantern-night')!;
    const job = s.jobs.find(j => j.contractId === contract.id)!;
    expect(streetDisplayAt(s, job.deliveredAt! - 1).locations.some(p => p.id === job.id)).toBe(false);
    const ready = streetDisplayAt(s, job.deliveredAt!);
    expect(ready.mode).toBe('studio');
    const work = ready.locations.find(p => p.id === job.id)!.work!;
    expect(work.brief.proof).toEqual(contract.project!.proof);
    const gathered = streetDisplayAt(s, RULES.days * RULES.minutesPerDay);
    expect(gathered.mode).toBe('courtyard');
    const programme = gathered.locations.find(p => p.id === job.id)!;
    expect(programme.place).toBe('Lantern Night');
    expect(programme.contributors?.toSorted()).toEqual([...new Set(gathered.locations.filter(p => p.work?.brief.project?.id !== 'lantern-night').map(p => p.castId))].sort());
    expect(ready.locations.find(p => p.id === job.id)!.contributors).toBeUndefined();
  });

  it('keeps partial work out of completed gathering scenes', () => {
    const partial = streetDisplayAt(nightStudy('festival-week', 'partial'));
    expect(partial.mode).toBe('unfinished');
    expect(partial.eventName).toContain('unfinished');
    expect(partial.locations.filter(p => p.work?.brief.project?.id === 'lantern-night')).toHaveLength(2);
    expect(partial.locations.every(p => p.work?.deliveredAt !== null)).toBe(true);
  });

  it('does not present Hugo’s quiet keepsake as a public workshop', () => {
    const display = streetDisplayAt(nightStudy('main-street', 'courtyard'));
    const keepsake = display.locations.find(location => location.work?.brief.project?.approach === 'quiet-sendoff');
    expect(keepsake).toMatchObject({ castId: 'hugo', place: 'Hugo’s keepsake', privateKeepsake: true });
  });

  it('uses distinct completed trail and open-studios settings', () => {
    expect(streetDisplayAt(nightStudy('main-street', 'trail')).mode).toBe('trail');
    expect(streetDisplayAt(nightStudy('bespoke-rush', 'trail')).mode).toBe('open-studios');
  });

  it('labels an inherited composition as earlier work before any new delivery', () => {
    const parent = nightStudy('main-street', 'courtyard');
    const piece = deliveredPieces(parent).find(p => p.castId === 'clem')!;
    const next = createRun(buildContinuation(parent, [piece.id]));
    const display = streetDisplayAt(next);
    expect(display.mode).toBe('studio');
    expect(display.locations).toHaveLength(1);
    expect(display.locations[0]).toMatchObject({ title: piece.title, line: expect.stringContaining('Kept from Season 1'), carried: { design: piece.design, copy: piece.copy } });
    expect(display.locations[0]!.work).toBeUndefined();
  });

  it('replaces an earlier commission on the street when that customer receives newer work', () => {
    let state = createRun(recorded.config);
    for (const command of recorded.commands as Command[]) {
      const authored = command.type === 'acceptProject' ? { ...command, design: projectBrief(state, command.projectId, command.approach).defaultDesign } : command;
      const result = applyCommand(state, authored);
      expect(result.error).toBeUndefined();
      state = result.state;
    }
    const delivered = state.jobs.filter(j => j.castId === 'clem' && j.deliveredAt !== null).sort((a, b) => a.deliveredAt! - b.deliveredAt!);
    const later = delivered[2]!;
    const atDelivery = streetDisplayAt(state, later.deliveredAt!);
    expect(atDelivery.mode).toBe('studio');
    expect(atDelivery.locations.find(p => p.castId === 'clem')!.id).toBe(later.id);
    expect(streetDisplayAt(state, later.deliveredAt! - 1).locations.find(p => p.castId === 'clem')!.id).toBe(delivered[1]!.id);
  });
});
